"""列表来源的公共数据结构与工具。"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from urllib.parse import parse_qs, urlparse

_SN_PATH = re.compile(r"/s/([A-Za-z0-9_\-]+)")


def extract_sn(url: str) -> str:
    """从文章链接里取出唯一短码，作为文章的身份主键。

    微信有两种永久链接形态：
      https://mp.weixin.qq.com/s/AbCdEf123          -> sn 在路径里
      https://mp.weixin.qq.com/s?__biz=..&mid=..&idx=1&sn=abc123&chksm=..
    两种都要能识别；都取不到时退化为 biz|mid|idx 的哈希，仍然保证稳定唯一。
    """
    if not url:
        return ""
    parsed = urlparse(url)
    m = _SN_PATH.search(parsed.path)
    if m:
        return m.group(1)
    qs = parse_qs(parsed.query)
    if "sn" in qs and qs["sn"][0]:
        return qs["sn"][0]
    biz = qs.get("__biz", [""])[0]
    mid = qs.get("mid", [""])[0]
    idx = qs.get("idx", [""])[0]
    if biz or mid:
        raw = f"{biz}|{mid}|{idx}"
        return "h" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]
    return "h" + hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


def normalize_url(url: str) -> str:
    """去掉链接里的会话性参数，让同一篇文章在不同来源下得到一致的 URL。"""
    if not url:
        return ""
    url = url.replace("&amp;", "&").strip()
    if url.startswith("http://"):
        url = "https://" + url[len("http://"):]
    parsed = urlparse(url)
    if "/s/" in parsed.path:
        return f"https://mp.weixin.qq.com{parsed.path}"
    qs = parse_qs(parsed.query)
    keep = {k: v[0] for k, v in qs.items() if k in ("__biz", "mid", "idx", "sn", "chksm")}
    if keep:
        query = "&".join(f"{k}={v}" for k, v in keep.items())
        return f"https://mp.weixin.qq.com/s?{query}"
    return url


@dataclass
class ArticleStub:
    """列表阶段拿到的文章摘要信息，还没有正文。"""

    sn: str
    url: str
    title: str = ""
    digest: str = ""
    cover: str = ""
    publish_ts: int | None = None
    update_ts: int | None = None
    albums: list[str] = field(default_factory=list)  # 公众号「合集」名，作为分类
    itemidx: int = 1

    @classmethod
    def from_url(cls, url: str) -> "ArticleStub":
        u = normalize_url(url)
        return cls(sn=extract_sn(u), url=u)
