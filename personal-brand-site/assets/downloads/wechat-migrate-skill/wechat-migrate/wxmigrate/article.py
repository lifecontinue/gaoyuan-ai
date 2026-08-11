"""单篇文章正文抓取与元信息解析。

微信文章页把关键元数据塞在一堆内联 JS 变量里（var ct = "1690..." 之类），
DOM 结构反而多变。所以这里采取「先啃 JS 变量、再退回 DOM 选择器」的双轨策略，
任何一路拿到就算数，最大化在页面改版下的存活率。
"""

from __future__ import annotations

import hashlib
import html as _html
import json
import logging
import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup

from .http import ArticleGone, Fetcher, FetchError
from .sources.base import ArticleStub

log = logging.getLogger("wxmigrate.article")


def _js_var(pattern: str, text: str) -> str:
    """抓取形如 var xxx = "yyy"; 的内联变量值，并做 HTML 实体反转义。"""
    m = re.search(pattern, text)
    if not m:
        return ""
    val = m.group(1).strip()
    val = _html.unescape(val)
    return val.replace("\\x26", "&").replace("\\/", "/").replace("\\", "")


# 页面已失效的几种典型文案
_GONE_MARKERS = (
    "该内容已被发布者删除",
    "此内容因违规无法查看",
    "该公众号已迁移",
    "内容已被发布者删除",
    "此内容发送失败无法查看",
    "该内容已被投诉",
    "参数错误",
)


@dataclass
class Article:
    """一篇完整文章：元信息 + 已清洗的正文 HTML。"""

    sn: str
    url: str
    title: str = ""
    author: str = ""
    account: str = ""
    digest: str = ""
    publish_ts: int | None = None
    update_ts: int | None = None
    source_url: str = ""          # 公众号「阅读原文」指向的外链
    cover: str = ""
    is_original: bool = False
    albums: list[str] = field(default_factory=list)   # 合集 → 分类
    topics: list[str] = field(default_factory=list)   # 话题标签
    content_html: str = ""
    content_text: str = ""

    @property
    def content_hash(self) -> str:
        return hashlib.sha1(self.content_html.encode("utf-8")).hexdigest()

    @property
    def word_count(self) -> int:
        return len(re.sub(r"\s+", "", self.content_text))


class ArticleParser:
    def __init__(self, fetcher: Fetcher) -> None:
        self.fetcher = fetcher

    def fetch(self, stub: ArticleStub) -> Article:
        resp = self.fetcher.get(stub.url)
        resp.encoding = resp.apparent_encoding or "utf-8"
        return self.parse(resp.text, stub)

    def parse(self, raw_html: str, stub: ArticleStub) -> Article:
        # 先判死：失效页也返回 200，只能靠文案识别
        head = raw_html[:6000]
        if any(marker in raw_html for marker in _GONE_MARKERS) and "js_content" not in raw_html:
            reason = next((m for m in _GONE_MARKERS if m in raw_html), "内容不可访问")
            raise ArticleGone(reason)
        if "请在微信客户端打开" in head and "js_content" not in raw_html:
            raise FetchError("页面要求在微信客户端内打开，登录态或 UA 可能有问题")

        soup = BeautifulSoup(raw_html, "lxml")
        content = soup.select_one("#js_content") or soup.select_one("div.rich_media_content")
        if content is None:
            raise ArticleGone("页面中找不到正文容器（#js_content），文章可能已失效")

        art = Article(sn=stub.sn, url=stub.url)

        # —— 标题 ——
        art.title = (
            _js_var(r'var\s+msg_title\s*=\s*[\'"](.*?)[\'"]\s*(?:\.html\(\))?\s*;', raw_html)
            or self._dom_text(soup, "#activity-name, h1.rich_media_title, .rich_media_title")
            or self._meta(soup, "og:title")
            or stub.title
        )

        # —— 时间 ——
        ts = _js_var(r'var\s+(?:ct|create_time)\s*=\s*["\']?(\d{9,13})', raw_html)
        if ts:
            value = int(ts)
            art.publish_ts = value // 1000 if value > 10_000_000_000 else value
        else:
            art.publish_ts = stub.publish_ts
        art.update_ts = stub.update_ts or art.publish_ts

        # —— 作者与账号 ——
        art.author = (
            _js_var(r'var\s+author\s*=\s*[\'"](.*?)[\'"]\s*;', raw_html)
            or self._dom_text(soup, "#js_author_name, .rich_media_meta_text.rich_media_meta_nickname")
        )
        art.account = (
            _js_var(r'var\s+nickname\s*=\s*[\'"](.*?)[\'"]\s*;', raw_html)
            or self._dom_text(soup, "#js_name, .profile_nickname")
        )

        # —— 原文外链 ——
        art.source_url = _js_var(r'var\s+msg_source_url\s*=\s*[\'"](.*?)[\'"]\s*;', raw_html)

        # —— 封面 ——
        art.cover = (
            _js_var(r'var\s+(?:msg_cdn_url|cdn_url)\s*=\s*[\'"](.*?)[\'"]\s*;', raw_html)
            or self._meta(soup, "og:image")
            or stub.cover
        )

        art.digest = (
            _js_var(r'var\s+msg_desc\s*=\s*[\'"](.*?)[\'"]\s*;', raw_html)
            or self._meta(soup, "og:description")
            or stub.digest
        )
        art.is_original = "原创" in head or bool(soup.select_one("#copyright_logo"))

        # —— 分类与标签 ——
        art.albums = self._parse_albums(raw_html, soup) or list(stub.albums)
        art.topics = self._parse_topics(soup)

        art.content_html = str(content)
        art.content_text = content.get_text("\n", strip=True)
        return art

    # ------------------------------------------------------------------ 辅助
    @staticmethod
    def _dom_text(soup: BeautifulSoup, selector: str) -> str:
        node = soup.select_one(selector)
        return node.get_text(strip=True) if node else ""

    @staticmethod
    def _meta(soup: BeautifulSoup, prop: str) -> str:
        node = soup.find("meta", attrs={"property": prop}) or soup.find(
            "meta", attrs={"name": prop}
        )
        if node:
            content = node.get("content")
            if content:
                return _html.unescape(str(content)).strip()
        return ""

    @staticmethod
    def _parse_albums(raw_html: str, soup: BeautifulSoup) -> list[str]:
        """提取「合集」名 —— 微信原生唯一的结构化分组，最适合当分类。"""
        names: list[str] = []
        m = re.search(
            r'var\s+(?:appmsg_album_infos|albumInfos?)\s*=\s*(\[.*?\])\s*;',
            raw_html, re.S,
        )
        if m:
            try:
                for item in json.loads(_html.unescape(m.group(1))):
                    title = (item.get("title") or item.get("album_name") or "").strip()
                    if title and title not in names:
                        names.append(title)
            except (json.JSONDecodeError, AttributeError, TypeError):
                log.debug("合集 JSON 解析失败，退回 DOM 提取")
        if not names:
            for node in soup.select(
                ".album__title, .album_read_card__title, .js_album_title, .album-name"
            ):
                title = node.get_text(strip=True)
                if title and title not in names:
                    names.append(title)
        return names

    @staticmethod
    def _parse_topics(soup: BeautifulSoup) -> list[str]:
        """提取文章话题标签（#标签 形式）。"""
        topics: list[str] = []
        for node in soup.select(
            "#js_tags .js_tag_name, .article-tag__item, #js_article_tags a, .js_tag_list a"
        ):
            text = node.get_text(strip=True).lstrip("#").strip()
            if text and text not in topics:
                topics.append(text)
        return topics
