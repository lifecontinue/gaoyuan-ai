"""公众号后台登录态采集器。

适用于未认证个人订阅号 —— 这类账号申请不到素材管理 API，官方 freepublish 接口用不了，
但你本人在后台是能看到全部已群发内容的。本采集器做的就是复用你自己浏览器里的登录态，
调用后台自己在用的那个列表接口，逐页把「已发表内容」拉全。

只读、只访问你自己的账号数据、严格限速，不绕过任何鉴权。

接口有新旧两套，脚本按顺序自动降级：
  1. /cgi-bin/appmsgpublish  —— 新版「已发表内容」，返回真正群发过的图文
  2. /cgi-bin/appmsg         —— 旧版素材库列表，作为兜底（可能含未群发的草稿）
"""

from __future__ import annotations

import json
import logging
from typing import Iterator

from ..http import Fetcher, FetchError, SessionExpired
from .base import ArticleStub, extract_sn, normalize_url

log = logging.getLogger("wxmigrate.source.mp")

BASE = "https://mp.weixin.qq.com"
PUBLISH_API = f"{BASE}/cgi-bin/appmsgpublish"
APPMSG_API = f"{BASE}/cgi-bin/appmsg"
HOME_API = f"{BASE}/cgi-bin/home"


class MpBackendSource:
    name = "mp_backend"

    def __init__(self, fetcher: Fetcher, token: str, page_size: int = 20,
                 max_pages: int = 0) -> None:
        self.fetcher = fetcher
        self.token = str(token).strip()
        self.page_size = min(max(int(page_size), 1), 20)
        self.max_pages = int(max_pages or 0)

    # ------------------------------------------------------------- 登录态自检
    def check_login(self) -> dict:
        """跑正式采集前先探一次，确认 token 与 Cookie 匹配且未过期。"""
        data = self.fetcher.get_json(
            PUBLISH_API,
            params={
                "sub": "list", "search_field": "null", "begin": 0, "count": 1,
                "query": "", "type": "101_1", "free_publish_type": 1,
                "sub_action": "list_ex", "token": self.token,
                "lang": "zh_CN", "f": "json", "ajax": 1,
            },
        )
        page = self._parse_publish_page(data)
        return {
            "ok": True,
            "total_count": page.get("total_count", 0),
            "channel": "appmsgpublish",
        }

    # ----------------------------------------------------------------- 列表
    def iter_articles(self) -> Iterator[ArticleStub]:
        """逐页产出文章摘要。优先新版接口，失败则降级到旧版。"""
        try:
            yield from self._iter_publish()
        except SessionExpired:
            raise
        except FetchError as exc:
            log.warning("新版已发表接口不可用（%s），降级到旧版素材接口", exc)
            yield from self._iter_appmsg()

    # —— 新版：已发表内容 ——
    def _iter_publish(self) -> Iterator[ArticleStub]:
        begin, page_no, total = 0, 0, None
        while True:
            page_no += 1
            if self.max_pages and page_no > self.max_pages:
                log.info("已达 max_pages=%d 上限，停止翻页", self.max_pages)
                return

            data = self.fetcher.get_json(
                PUBLISH_API,
                params={
                    "sub": "list", "search_field": "null", "begin": begin,
                    "count": self.page_size, "query": "", "type": "101_1",
                    "free_publish_type": 1, "sub_action": "list_ex",
                    "token": self.token, "lang": "zh_CN", "f": "json", "ajax": 1,
                },
            )
            page = self._parse_publish_page(data)
            if total is None:
                total = page.get("total_count", 0)
                log.info("后台「已发表内容」共 %s 条群发记录", total)

            publish_list = page.get("publish_list") or []
            if not publish_list:
                return

            emitted = 0
            for item in publish_list:
                info_raw = item.get("publish_info")
                if not info_raw:
                    continue
                try:
                    info = json.loads(info_raw) if isinstance(info_raw, str) else info_raw
                except json.JSONDecodeError:
                    log.warning("跳过一条无法解析的 publish_info")
                    continue
                # 一次群发可能含多条图文（头条 + 次条），全部展开
                for msg in info.get("appmsgex") or []:
                    stub = self._stub_from_appmsg(msg)
                    if stub:
                        emitted += 1
                        yield stub

            log.info("第 %d 页：%d 条群发记录，展开 %d 篇图文", page_no, len(publish_list), emitted)
            begin += self.page_size
            if total and begin >= total:
                return

    # —— 旧版：素材库列表 ——
    def _iter_appmsg(self) -> Iterator[ArticleStub]:
        begin, page_no, total = 0, 0, None
        while True:
            page_no += 1
            if self.max_pages and page_no > self.max_pages:
                return
            data = self.fetcher.get_json(
                APPMSG_API,
                params={
                    "action": "list_ex", "begin": begin, "count": self.page_size,
                    "fakeid": "", "type": 9, "query": "", "token": self.token,
                    "lang": "zh_CN", "f": "json", "ajax": 1,
                },
            )
            if total is None:
                total = data.get("app_msg_cnt", 0)
                log.info("旧版素材库共 %s 条", total)
            items = data.get("app_msg_list") or []
            if not items:
                return
            for msg in items:
                stub = self._stub_from_appmsg(msg)
                if stub:
                    yield stub
            log.info("第 %d 页：%d 篇", page_no, len(items))
            begin += self.page_size
            if total and begin >= total:
                return

    # ---------------------------------------------------------------- 工具
    @staticmethod
    def _parse_publish_page(data: dict) -> dict:
        raw = data.get("publish_page")
        if raw is None:
            raise FetchError("响应中缺少 publish_page 字段，接口结构可能已变更")
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except json.JSONDecodeError as exc:
                raise FetchError(f"publish_page 不是合法 JSON：{exc}") from exc
        return raw

    @staticmethod
    def _stub_from_appmsg(msg: dict) -> ArticleStub | None:
        link = normalize_url(msg.get("link") or msg.get("content_url") or "")
        if not link:
            return None
        albums: list[str] = []
        for album in msg.get("appmsg_album_infos") or []:
            title = (album.get("title") or "").strip()
            if title:
                albums.append(title)
        return ArticleStub(
            sn=extract_sn(link),
            url=link,
            title=(msg.get("title") or "").strip(),
            digest=(msg.get("digest") or "").strip(),
            cover=msg.get("cover") or "",
            publish_ts=msg.get("create_time") or msg.get("update_time"),
            update_ts=msg.get("update_time") or msg.get("create_time"),
            albums=albums,
            itemidx=int(msg.get("itemidx") or 1),
        )
