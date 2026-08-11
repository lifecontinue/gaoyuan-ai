"""SQLite 状态库：去重与增量同步的事实来源。

去重分三层，逐层收紧：
  1. 文章身份去重 —— 以永久链接里的 sn 短码为主键，天然唯一，改标题也不会重复搬运。
  2. 内容指纹去重 —— 正文 HTML 的 sha1，未变则跳过重写，避免制造无意义的文件改动。
  3. 图片内容去重 —— 图片二进制的 sha1，同一张图在多篇文章里复用只存一份。
"""

from __future__ import annotations

import sqlite3
import time
from contextlib import closing
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
    sn            TEXT PRIMARY KEY,   -- 文章唯一短码（永久链接 /s/<sn>），身份主键
    url           TEXT NOT NULL,
    title         TEXT,
    author        TEXT,
    digest        TEXT,
    publish_ts    INTEGER,            -- 发布时间戳
    update_ts     INTEGER,            -- 后台记录的最后修改时间
    content_hash  TEXT,               -- 正文 HTML 的 sha1
    slug          TEXT,
    md_path       TEXT,               -- 相对 site_root 的 Markdown 路径
    categories    TEXT,               -- JSON 数组字符串
    tags          TEXT,               -- JSON 数组字符串
    cover_local   TEXT,
    source_url    TEXT,               -- 公众号「阅读原文」链接
    image_count   INTEGER DEFAULT 0,
    word_count    INTEGER DEFAULT 0,
    status        TEXT DEFAULT 'ok',  -- ok | archived | failed | gone
    error         TEXT,
    first_seen    INTEGER,
    last_synced   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_articles_publish ON articles(publish_ts DESC);
CREATE INDEX IF NOT EXISTS idx_articles_status  ON articles(status);

CREATE TABLE IF NOT EXISTS media (
    src_url    TEXT PRIMARY KEY,      -- mmbiz 原始 URL
    sha1       TEXT NOT NULL,         -- 图片二进制指纹
    local_path TEXT NOT NULL,         -- 相对 site_root
    url_path   TEXT NOT NULL,         -- 站点内可访问的相对 URL
    bytes      INTEGER,
    fetched_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_media_sha1 ON media(sha1);

CREATE TABLE IF NOT EXISTS runs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER,
    ended_at   INTEGER,
    channel    TEXT,
    listed     INTEGER DEFAULT 0,
    added      INTEGER DEFAULT 0,
    updated    INTEGER DEFAULT 0,
    skipped    INTEGER DEFAULT 0,
    failed     INTEGER DEFAULT 0,
    note       TEXT
);
"""


class State:
    def __init__(self, db_path: Path) -> None:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self.path = db_path
        self.conn = sqlite3.connect(str(db_path))
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    # ------------------------------------------------------------------ 文章
    def get_article(self, sn: str) -> sqlite3.Row | None:
        cur = self.conn.execute("SELECT * FROM articles WHERE sn = ?", (sn,))
        return cur.fetchone()

    def has_article(self, sn: str) -> bool:
        return self.get_article(sn) is not None

    def needs_sync(self, sn: str, update_ts: int | None, force: bool = False) -> bool:
        """判断一篇文章是否需要（重新）抓取正文。

        这是增量同步的核心判据：已存在、状态正常、且后台未标记更新过的，直接跳过，
        连详情页请求都不会发出——既省时间又降低触发频控的概率。
        """
        if force:
            return True
        row = self.get_article(sn)
        if row is None:
            return True
        if row["status"] in ("failed", "gone"):
            return True
        if update_ts and row["update_ts"] and update_ts > row["update_ts"]:
            return True
        return False

    def upsert_article(self, data: dict[str, Any]) -> str:
        """写入或更新一篇文章，返回动作：added / updated / unchanged。"""
        now = int(time.time())
        existing = self.get_article(data["sn"])
        action = "added" if existing is None else "updated"
        if existing is not None and existing["content_hash"] == data.get("content_hash"):
            action = "unchanged"

        payload = {
            "sn": data["sn"],
            "url": data.get("url", ""),
            "title": data.get("title", ""),
            "author": data.get("author", ""),
            "digest": data.get("digest", ""),
            "publish_ts": data.get("publish_ts"),
            "update_ts": data.get("update_ts"),
            "content_hash": data.get("content_hash"),
            "slug": data.get("slug"),
            "md_path": data.get("md_path"),
            "categories": data.get("categories"),
            "tags": data.get("tags"),
            "cover_local": data.get("cover_local"),
            "source_url": data.get("source_url"),
            "image_count": data.get("image_count", 0),
            "word_count": data.get("word_count", 0),
            "status": data.get("status", "ok"),
            "error": data.get("error"),
            "first_seen": existing["first_seen"] if existing else now,
            "last_synced": now,
        }
        cols = ", ".join(payload)
        placeholders = ", ".join(f":{k}" for k in payload)
        self.conn.execute(
            f"INSERT INTO articles ({cols}) VALUES ({placeholders}) "
            f"ON CONFLICT(sn) DO UPDATE SET "
            + ", ".join(f"{k}=excluded.{k}" for k in payload if k not in ("sn", "first_seen")),
            payload,
        )
        self.conn.commit()
        return action

    def mark_failed(self, sn: str, url: str, error: str) -> None:
        now = int(time.time())
        self.conn.execute(
            "INSERT INTO articles (sn, url, status, error, first_seen, last_synced) "
            "VALUES (?, ?, 'failed', ?, ?, ?) "
            "ON CONFLICT(sn) DO UPDATE SET status='failed', error=excluded.error, "
            "last_synced=excluded.last_synced",
            (sn, url, error[:500], now, now),
        )
        self.conn.commit()

    def all_articles(self, status: str | None = "ok") -> list[sqlite3.Row]:
        if status:
            cur = self.conn.execute(
                "SELECT * FROM articles WHERE status = ? ORDER BY publish_ts DESC", (status,)
            )
        else:
            cur = self.conn.execute("SELECT * FROM articles ORDER BY publish_ts DESC")
        return cur.fetchall()

    def known_sns(self) -> set[str]:
        cur = self.conn.execute("SELECT sn FROM articles")
        return {r["sn"] for r in cur.fetchall()}

    def archive_missing(self, seen_sns: set[str]) -> int:
        """后台列表里已经消失的文章标记为 archived（通常是被删除或转私密）。"""
        if not seen_sns:
            return 0
        placeholders = ", ".join("?" * len(seen_sns))
        cur = self.conn.execute(
            f"UPDATE articles SET status='archived' "
            f"WHERE status='ok' AND sn NOT IN ({placeholders})",
            tuple(seen_sns),
        )
        self.conn.commit()
        return cur.rowcount

    # ------------------------------------------------------------------ 图片
    def get_media_by_url(self, src_url: str) -> sqlite3.Row | None:
        cur = self.conn.execute("SELECT * FROM media WHERE src_url = ?", (src_url,))
        return cur.fetchone()

    def get_media_by_sha1(self, sha1: str) -> sqlite3.Row | None:
        cur = self.conn.execute("SELECT * FROM media WHERE sha1 = ? LIMIT 1", (sha1,))
        return cur.fetchone()

    def put_media(self, src_url: str, sha1: str, local_path: str,
                  url_path: str, size: int) -> None:
        self.conn.execute(
            "INSERT INTO media (src_url, sha1, local_path, url_path, bytes, fetched_at) "
            "VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(src_url) DO UPDATE SET sha1=excluded.sha1, "
            "local_path=excluded.local_path, url_path=excluded.url_path, bytes=excluded.bytes",
            (src_url, sha1, local_path, url_path, size, int(time.time())),
        )
        self.conn.commit()

    # ------------------------------------------------------------------ 运行
    def start_run(self, channel: str) -> int:
        cur = self.conn.execute(
            "INSERT INTO runs (started_at, channel) VALUES (?, ?)",
            (int(time.time()), channel),
        )
        self.conn.commit()
        return int(cur.lastrowid or 0)

    def finish_run(self, run_id: int, stats: dict[str, int], note: str = "") -> None:
        self.conn.execute(
            "UPDATE runs SET ended_at=?, listed=?, added=?, updated=?, skipped=?, "
            "failed=?, note=? WHERE id=?",
            (
                int(time.time()), stats.get("listed", 0), stats.get("added", 0),
                stats.get("updated", 0), stats.get("skipped", 0),
                stats.get("failed", 0), note, run_id,
            ),
        )
        self.conn.commit()

    def summary(self) -> dict[str, Any]:
        with closing(self.conn.cursor()) as cur:
            cur.execute("SELECT status, COUNT(*) c FROM articles GROUP BY status")
            by_status = {r["status"]: r["c"] for r in cur.fetchall()}
            cur.execute("SELECT COUNT(*) c, COALESCE(SUM(bytes),0) b FROM media")
            m = cur.fetchone()
            cur.execute(
                "SELECT MIN(publish_ts) a, MAX(publish_ts) b FROM articles WHERE status='ok'"
            )
            span = cur.fetchone()
            cur.execute("SELECT * FROM runs ORDER BY id DESC LIMIT 1")
            last = cur.fetchone()
        return {
            "by_status": by_status,
            "total": sum(by_status.values()),
            "media_count": m["c"],
            "media_bytes": m["b"],
            "earliest": span["a"],
            "latest": span["b"],
            "last_run": dict(last) if last else None,
        }

    def close(self) -> None:
        self.conn.close()
