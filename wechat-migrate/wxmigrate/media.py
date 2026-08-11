"""图片等媒体资源的下载与本地化。

三个必须处理好的点：
  1. 防盗链 —— mmbiz.qpic.cn 校验 Referer，必须带 mp.weixin.qq.com，否则拿到一张裂图。
  2. 懒加载 —— 正文里图片真实地址在 data-src 上，src 往往是占位符。
  3. 去重     —— 同一张图在多篇文章里反复出现很常见，按二进制 sha1 全局去重，只存一份。

线程安全说明：
  图片下载用线程池并发，但 SQLite 状态库的连接在主线程创建（check_same_thread=True），
  因此 worker 线程**绝不接触数据库**：它只负责把图片字节下载下来返回给主线程，
  由主线程统一做「去重判断 + 落盘 + 写状态库」。同时每个 worker 线程持有独立的
  requests.Session（thread-local），避免并发复用同一个 Session 带来的隐患。
"""

from __future__ import annotations

import hashlib
import logging
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests

from .http import Fetcher
from .state import State

log = logging.getLogger("wxmigrate.media")

IMG_HEADERS = {
    "Referer": "https://mp.weixin.qq.com/",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
}

# 文件魔数 → 扩展名，Content-Type 不可靠时的最后一道判断
_MAGIC = [
    (b"\xff\xd8\xff", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"GIF87a", "gif"),
    (b"GIF89a", "gif"),
    (b"RIFF", "webp"),
    (b"BM", "bmp"),
]

_CT_MAP = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/gif": "gif", "image/webp": "webp", "image/bmp": "bmp",
    "image/svg+xml": "svg",
}

_FMT_MAP = {"jpeg": "jpg", "jpg": "jpg", "png": "png", "gif": "gif",
            "webp": "webp", "other": "jpg"}


def guess_ext(url: str, content_type: str, blob: bytes) -> str:
    """按 URL 参数 → Content-Type → 魔数的顺序判断扩展名。"""
    fmt = parse_qs(urlparse(url).query).get("wx_fmt", [""])[0].lower()
    if fmt in _FMT_MAP:
        return _FMT_MAP[fmt]
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct in _CT_MAP:
        return _CT_MAP[ct]
    for magic, ext in _MAGIC:
        if blob.startswith(magic):
            return ext
    suffix = Path(urlparse(url).path).suffix.lstrip(".").lower()
    return suffix if suffix in {"jpg", "jpeg", "png", "gif", "webp"} else "jpg"


class MediaDownloader:
    def __init__(self, fetcher: Fetcher, state: State, cfg) -> None:
        self.fetcher = fetcher
        self.state = state
        self.cfg = cfg
        self.image_dir = cfg.image_dir
        self.url_prefix = cfg.output["image_url_prefix"].strip("/")
        self.site_root = cfg.site_root
        self.max_bytes = int(cfg.media.get("max_bytes", 20 * 1024 * 1024))
        self.concurrency = max(1, int(cfg.media.get("concurrency", 4)))
        self.enabled = bool(cfg.media.get("download", True))
        self.stats = {"downloaded": 0, "reused": 0, "failed": 0, "skipped": 0}

        net = cfg.network
        self.timeout = int(net.get("timeout", 30))
        # 给每个 worker 线程准备独立 Session 所需的凭证（只读快照，不共享 Session 对象）
        self._cookie = fetcher.session.headers.get("Cookie", "")
        self._ua = net.get("user_agent", "")
        self._proxy = (net.get("proxy") or "").strip()
        self._tls = threading.local()

    # ------------------------------------------------------------------ 线程
    def _worker_session(self) -> requests.Session:
        """每个 worker 线程一个独立 Session，避免并发复用同一 Session。"""
        s = getattr(self._tls, "session", None)
        if s is None:
            s = requests.Session()
            s.headers.update({
                "User-Agent": self._ua,
                "Referer": "https://mp.weixin.qq.com/",
            })
            if self._cookie:
                s.headers["Cookie"] = self._cookie
            if self._proxy:
                s.proxies = {"http": self._proxy, "https": self._proxy}
            self._tls.session = s
        return s

    # ------------------------------------------------------------------ 主流程
    def localize(self, urls: list[str], slug: str) -> dict[str, str]:
        """批量本地化，返回 {原始URL: 站点内相对URL}。失败的条目不会出现在结果里。

        本方法运行在**主线程**，所有状态库读写都在这里完成；并发仅发生在
        _download_one 的图片字节下载阶段，worker 不碰数据库。
        """
        if not self.enabled:
            return {}
        unique = list(dict.fromkeys(u for u in urls if u))
        if not unique:
            return {}

        mapping: dict[str, str] = {}
        pending: list[str] = []

        # 第一层去重：这个 URL 以前下过，直接复用
        for url in unique:
            row = self.state.get_media_by_url(url)
            if row and (self.site_root / row["local_path"]).exists():
                mapping[url] = row["url_path"]
                self.stats["reused"] += 1
            else:
                pending.append(url)

        if pending:
            target_dir = self.image_dir / slug
            target_dir.mkdir(parents=True, exist_ok=True)
            with ThreadPoolExecutor(max_workers=self.concurrency) as pool:
                results = list(pool.map(self._download_one, pending))
            index = 0
            for url, result in zip(pending, results):
                if not result:
                    continue
                _, blob, ext = result
                # 第二层去重：内容指纹命中则不再落盘，跨文章共用同一份文件
                sha1 = hashlib.sha1(blob).hexdigest()
                existing = self.state.get_media_by_sha1(sha1)
                if existing and (self.site_root / existing["local_path"]).exists():
                    # 记录本 URL 指向已存在的共享文件
                    self.state.put_media(url, sha1, existing["local_path"],
                                         existing["url_path"], len(blob))
                    mapping[url] = existing["url_path"]
                    self.stats["reused"] += 1
                    continue
                index += 1
                filename = f"{index:03d}-{sha1[:10]}.{ext}"
                dest = target_dir / filename
                dest.write_bytes(blob)
                local_path = dest.relative_to(self.site_root).as_posix()
                url_path = f"{self.url_prefix}/{slug}/{filename}"
                self.state.put_media(url, sha1, local_path, url_path, len(blob))
                mapping[url] = url_path
                self.stats["downloaded"] += 1
        return mapping

    def _download_one(self, url: str) -> tuple[str, bytes, str] | None:
        """worker 线程专用：只下载图片字节并返回 (url, blob, ext)，不碰数据库。"""
        try:
            resp = self._worker_session().get(
                url, headers=IMG_HEADERS, timeout=self.timeout, stream=True
            )
            if resp.status_code != 200:
                log.warning("图片 HTTP %s：%s", resp.status_code, url[:90])
                self.stats["failed"] += 1
                return None

            declared = int(resp.headers.get("Content-Length") or 0)
            if declared and declared > self.max_bytes:
                log.info("图片超过体积上限（%.1fMB），跳过：%s",
                         declared / 1048576, url[:90])
                self.stats["skipped"] += 1
                return None

            chunks, total = [], 0
            for chunk in resp.iter_content(65536):
                chunks.append(chunk)
                total += len(chunk)
                if total > self.max_bytes:
                    log.info("图片流式下载超限，中止：%s", url[:90])
                    self.stats["skipped"] += 1
                    return None
            blob = b"".join(chunks)
            if len(blob) < 128:
                self.stats["failed"] += 1
                return None

            ext = guess_ext(url, resp.headers.get("Content-Type", ""), blob)
            return (url, blob, ext)

        except Exception as exc:  # 单张图失败不该拖垮整篇文章
            log.warning("图片下载失败 %s —— %s", url[:90], exc)
            self.stats["failed"] += 1
            return None


def collect_image_urls(soup) -> list[str]:
    """从正文中收集所有真实图片地址（优先 data-src，兼容懒加载）。"""
    urls: list[str] = []
    for img in soup.find_all("img"):
        src = (img.get("data-src") or img.get("data-original")
               or img.get("data-backsrc") or img.get("src") or "")
        src = src.strip()
        if src.startswith("//"):
            src = "https:" + src
        if src.startswith("http") and src not in urls:
            urls.append(src)
    # 背景图形式的插图
    for node in soup.find_all(style=True):
        for match in re.findall(r'url\(["\']?(https?://[^)"\']+)', node["style"]):
            if match not in urls:
                urls.append(match)
    return urls
