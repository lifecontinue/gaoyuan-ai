"""落盘层：Markdown 文件 + 前端消费的 posts.json 索引。

分类与标签的保留策略（按可信度从高到低）：
  1. 公众号「合集」名 —— 微信原生唯一的结构化分组，直接当分类
  2. 文章话题标签（#标签）—— 直接当标签
  3. 配置里的关键词规则 —— 对没有合集归属的文章做兜底归类
"""

from __future__ import annotations

import datetime as _dt
import json
import logging
import re
import unicodedata
from pathlib import Path

import yaml

from .article import Article

log = logging.getLogger("wxmigrate.export")

_UNSAFE = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
_SPACES = re.compile(r"[\s\u3000]+")
_DASHES = re.compile(r"-{2,}")


def make_slug(article: Article, style: str = "date-title", ascii_only: bool = False) -> str:
    """生成文件名。中文默认保留 —— 可读性远比 URL 好看重要。"""
    title = _UNSAFE.sub("", article.title or "").strip()
    title = _SPACES.sub("-", title).strip("-")
    if ascii_only:
        normalized = unicodedata.normalize("NFKD", title)
        title = "".join(c for c in normalized if ord(c) < 128)
        title = re.sub(r"[^A-Za-z0-9\-]+", "-", title).strip("-")
    title = _DASHES.sub("-", title)[:60].strip("-")

    if style == "sn" or not title:
        return article.sn
    if style == "title":
        return title
    date = "unknown"
    if article.publish_ts:
        date = _dt.datetime.fromtimestamp(article.publish_ts).strftime("%Y-%m-%d")
    return f"{date}-{title}" if title else f"{date}-{article.sn}"


def resolve_taxonomy(article: Article, cfg) -> tuple[list[str], list[str]]:
    """确定文章的分类与标签。"""
    tax = cfg.taxonomy
    categories: list[str] = []
    if tax.get("use_album_as_category", True) and article.albums:
        categories = list(dict.fromkeys(article.albums))

    tags: list[str] = list(article.topics)

    # 关键词规则：只看标题和正文开头，避免全文扫描带来的误伤
    probe = f"{article.title}\n{article.content_text[:500]}".lower()
    for tag_name, keywords in (tax.get("keyword_rules") or {}).items():
        if any(str(kw).lower() in probe for kw in (keywords or [])):
            if tag_name not in tags:
                tags.append(tag_name)

    for extra in tax.get("extra_tags") or []:
        if extra not in tags:
            tags.append(extra)

    if not categories:
        # 没有合集时，用第一个命中的标签兜底当分类，再不行才用默认值
        categories = [tags[0]] if tags else [tax.get("default_category", "未分类")]

    return categories, tags


def build_front_matter(article: Article, slug: str, categories: list[str],
                       tags: list[str], cover_url: str, cfg) -> str:
    date_str = ""
    if article.publish_ts:
        date_str = _dt.datetime.fromtimestamp(article.publish_ts).isoformat(timespec="seconds")

    data = {
        "title": article.title,
        "slug": slug,
        "date": date_str,
        "author": article.author or cfg.account.get("name", ""),
        "account": article.account or cfg.account.get("name", ""),
        "summary": article.digest,
        "categories": categories,
        "tags": tags,
        "cover": cover_url,
        "original": article.is_original,
        "word_count": article.word_count,
        "wechat_url": article.url,
        "source_url": article.source_url,
        "wechat_sn": article.sn,
        "imported_at": _dt.datetime.now().isoformat(timespec="seconds"),
    }
    dumped = yaml.safe_dump(data, allow_unicode=True, sort_keys=False,
                            default_flow_style=False, width=1000)
    return f"---\n{dumped}---\n\n"


class Exporter:
    def __init__(self, cfg) -> None:
        self.cfg = cfg
        self.markdown_dir: Path = cfg.markdown_dir
        self.markdown_dir.mkdir(parents=True, exist_ok=True)

    def write_markdown(self, article: Article, slug: str, body_md: str,
                       categories: list[str], tags: list[str],
                       cover_url: str) -> tuple[str, bool]:
        """写入 Markdown，返回 (相对 site_root 的路径, 内容是否发生变化)。"""
        front = build_front_matter(article, slug, categories, tags, cover_url, self.cfg)
        full = front + body_md
        dest = self.markdown_dir / f"{slug}.md"

        changed = True
        if dest.exists():
            old = dest.read_text(encoding="utf-8")
            # 比对时剔除 imported_at，否则每次跑都会显示"变了"
            strip = lambda s: re.sub(r"^imported_at:.*$", "", s, flags=re.M)
            changed = strip(old) != strip(full)

        if changed:
            dest.write_text(full, encoding="utf-8")
        return dest.relative_to(self.cfg.site_root).as_posix(), changed

    def write_index(self, state) -> Path:
        """生成前端消费的 posts.json —— 只放元数据，正文由前端按需 fetch。"""
        keep_removed = self.cfg.sync.get("keep_removed", True)
        rows = state.all_articles(status=None)
        md_prefix = self.cfg.output["markdown_url_prefix"].strip("/")

        posts = []
        for row in rows:
            if row["status"] == "failed":
                continue
            if row["status"] == "archived" and not keep_removed:
                continue
            if not row["md_path"]:
                continue
            posts.append({
                "id": row["sn"],
                "title": row["title"],
                "slug": row["slug"],
                "date": (
                    _dt.datetime.fromtimestamp(row["publish_ts"]).strftime("%Y-%m-%d")
                    if row["publish_ts"] else ""
                ),
                "timestamp": row["publish_ts"],
                "summary": row["digest"] or "",
                "author": row["author"] or "",
                "categories": json.loads(row["categories"] or "[]"),
                "tags": json.loads(row["tags"] or "[]"),
                "cover": row["cover_local"] or "",
                "wordCount": row["word_count"] or 0,
                "imageCount": row["image_count"] or 0,
                "markdown": f"{md_prefix}/{row['slug']}.md",
                "wechatUrl": row["url"],
                "sourceUrl": row["source_url"] or "",
                "archived": row["status"] == "archived",
            })

        posts.sort(key=lambda p: p["timestamp"] or 0, reverse=True)

        categories: dict[str, int] = {}
        tags: dict[str, int] = {}
        for post in posts:
            for c in post["categories"]:
                categories[c] = categories.get(c, 0) + 1
            for t in post["tags"]:
                tags[t] = tags.get(t, 0) + 1

        index = {
            "generatedAt": _dt.datetime.now().isoformat(timespec="seconds"),
            "account": self.cfg.account.get("name", ""),
            "total": len(posts),
            "categories": [
                {"name": k, "count": v}
                for k, v in sorted(categories.items(), key=lambda kv: -kv[1])
            ],
            "tags": [
                {"name": k, "count": v}
                for k, v in sorted(tags.items(), key=lambda kv: -kv[1])
            ],
            "posts": posts,
        }

        dest: Path = self.cfg.index_json
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(
            json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return dest
