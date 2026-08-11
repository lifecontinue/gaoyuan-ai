"""同步管线编排：列表 → 增量判定 → 正文 → 图片 → Markdown → 索引。

设计上的两个坚持：
  · 断点安全 —— 每篇文章处理完立刻落库，任何时候中断（频控、断网、Ctrl+C）
    已完成的部分都不会丢，下次跑自动从缺口继续。
  · 少发请求 —— 增量判定发生在「详情页请求之前」，已同步过的文章连页面都不会去碰。
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field

from bs4 import BeautifulSoup

from .article import ArticleParser
from .config import Config
from .convert import html_to_markdown
from .exporter import Exporter, make_slug, resolve_taxonomy
from .http import ArticleGone, Fetcher, FetchError, RateLimited, SessionExpired
from .media import MediaDownloader, collect_image_urls
from .sources import LinkListSource, MpBackendSource
from .state import State

log = logging.getLogger("wxmigrate.pipeline")


@dataclass
class SyncStats:
    listed: int = 0
    added: int = 0
    updated: int = 0
    unchanged: int = 0
    skipped: int = 0
    failed: int = 0
    gone: int = 0
    media: dict = field(default_factory=dict)
    interrupted_reason: str = ""

    def as_dict(self) -> dict:
        return {
            "listed": self.listed, "added": self.added, "updated": self.updated,
            "unchanged": self.unchanged, "skipped": self.skipped,
            "failed": self.failed, "gone": self.gone,
        }


def build_source(cfg: Config, fetcher: Fetcher):
    channel = cfg.fetch["channel"]
    if channel == "mp_backend":
        return MpBackendSource(
            fetcher, token=cfg.auth["token"],
            page_size=cfg.fetch["page_size"], max_pages=cfg.fetch["max_pages"],
        )
    return LinkListSource(cfg.local_path(cfg.fetch["link_list_file"]))


def run_sync(cfg: Config, *, force: bool = False, limit: int = 0,
             dry_run: bool = False, list_only: bool = False) -> SyncStats:
    cfg.validate_for_fetch()

    fetcher = Fetcher(cfg.network, cookie=cfg.resolve_cookie())
    state = State(cfg.state_db)
    source = build_source(cfg, fetcher)
    parser = ArticleParser(fetcher)
    media = MediaDownloader(fetcher, state, cfg)
    exporter = Exporter(cfg)

    stats = SyncStats()
    since_ts = cfg.since_ts
    seen_sns: set[str] = set()
    run_id = state.start_run(source.name) if not dry_run else 0
    listing_complete = False

    try:
        for stub in source.iter_articles():
            if not stub.sn:
                continue
            stats.listed += 1
            seen_sns.add(stub.sn)

            if since_ts and stub.publish_ts and stub.publish_ts < since_ts:
                stats.skipped += 1
                continue

            if list_only:
                when = (
                    time.strftime("%Y-%m-%d", time.localtime(stub.publish_ts))
                    if stub.publish_ts else "????-??-??"
                )
                print(f"  [{when}] {stub.title or '(无标题)'}  →  {stub.url}")
                continue

            if not state.needs_sync(stub.sn, stub.update_ts, force=force):
                stats.unchanged += 1
                log.debug("跳过已同步：%s", stub.title[:40])
                continue

            if dry_run:
                stats.added += 1
                log.info("[dry-run] 将同步：%s", stub.title[:60])
                continue

            action = _sync_one(stub, parser, media, exporter, state, cfg, stats)
            if action:
                log.info("[%s] %s", action, (stub.title or stub.sn)[:60])

            if limit and (stats.added + stats.updated) >= limit:
                log.info("已达 --limit %d，本轮提前结束", limit)
                break
        else:
            listing_complete = True

    except SessionExpired as exc:
        stats.interrupted_reason = f"登录态失效：{exc}"
        log.error("%s", exc)
    except RateLimited as exc:
        stats.interrupted_reason = f"频率限制：{exc}"
        log.error("%s", exc)
    except KeyboardInterrupt:
        stats.interrupted_reason = "用户中断（Ctrl+C）"
        log.warning("收到中断信号，正在保存进度…")
    finally:
        stats.media = dict(media.stats)
        if not dry_run and not list_only:
            # 只有完整跑完列表、且是全量通道时，才敢判定「后台已删除」
            if (listing_complete and not stats.interrupted_reason
                    and not limit and source.name == "mp_backend"
                    and cfg.sync.get("keep_removed", True) and seen_sns):
                archived = state.archive_missing(seen_sns)
                if archived:
                    log.info("有 %d 篇文章已从后台消失，标记为 archived", archived)
            index_path = exporter.write_index(state)
            log.info("索引已写入：%s", index_path)
            state.finish_run(run_id, stats.as_dict(), stats.interrupted_reason)
        state.close()
        fetcher.close()

    return stats


def _sync_one(stub, parser: ArticleParser, media: MediaDownloader,
              exporter: Exporter, state: State, cfg: Config,
              stats: SyncStats) -> str | None:
    """处理单篇文章。异常在这里被吃掉并记账，不让一篇坏文章中断整轮同步。"""
    try:
        article = parser.fetch(stub)
    except ArticleGone as exc:
        log.warning("文章已失效：%s —— %s", (stub.title or stub.sn)[:40], exc)
        state.mark_failed(stub.sn, stub.url, f"gone: {exc}")
        stats.gone += 1
        return None
    except (RateLimited, SessionExpired):
        raise
    except (FetchError, Exception) as exc:
        log.warning("抓取失败：%s —— %s", (stub.title or stub.sn)[:40], exc)
        state.mark_failed(stub.sn, stub.url, str(exc))
        stats.failed += 1
        return None

    slug = make_slug(article, cfg.output["slug_style"], cfg.output["ascii_slug"])
    categories, tags = resolve_taxonomy(article, cfg)

    # 图片本地化：正文图 + 封面图一起下
    soup = BeautifulSoup(article.content_html, "lxml")
    image_urls = collect_image_urls(soup)
    all_urls = list(image_urls)
    if cfg.media.get("download_cover", True) and article.cover:
        all_urls.append(article.cover)

    image_map = media.localize(all_urls, slug)
    cover_url = image_map.get(article.cover, article.cover or "")

    body_md = html_to_markdown(
        article.content_html, image_map, cfg.media.get("rich_media", "placeholder")
    )

    md_path, changed = exporter.write_markdown(
        article, slug, body_md, categories, tags, cover_url
    )
    if not changed and not cfg.sync.get("rewrite_on_content_change", True):
        stats.unchanged += 1
        return None

    action = state.upsert_article({
        "sn": article.sn,
        "url": article.url,
        "title": article.title,
        "author": article.author,
        "digest": article.digest,
        "publish_ts": article.publish_ts,
        "update_ts": article.update_ts,
        "content_hash": article.content_hash,
        "slug": slug,
        "md_path": md_path,
        "categories": json.dumps(categories, ensure_ascii=False),
        "tags": json.dumps(tags, ensure_ascii=False),
        "cover_local": cover_url,
        "source_url": article.source_url,
        "image_count": len(image_urls),
        "word_count": article.word_count,
        "status": "ok",
        "error": None,
    })

    if action == "added":
        stats.added += 1
    elif action == "updated":
        stats.updated += 1
    else:
        stats.unchanged += 1
    return action
