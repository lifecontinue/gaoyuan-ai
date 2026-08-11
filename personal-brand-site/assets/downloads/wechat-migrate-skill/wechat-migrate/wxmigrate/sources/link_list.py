"""链接清单采集器 —— 不需要登录态的兜底通道。

用途：
  1. 后台登录态拿不到时，手上有一批文章永久链接也能照样迁移；
  2. 只想补几篇特定文章，不想跑全量；
  3. 后台已删除、但你自己留了链接的老文章。

文件格式：每行一个链接，支持 # 开头的注释行和空行。
也支持「链接<TAB>分类名」的两列写法，用来手工指定分类。
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterator

from .base import ArticleStub

log = logging.getLogger("wxmigrate.source.links")


class LinkListSource:
    name = "link_list"

    def __init__(self, path: Path) -> None:
        self.path = Path(path)

    def check_login(self) -> dict:
        count = sum(1 for _ in self._raw_lines())
        return {"ok": True, "total_count": count, "channel": "link_list"}

    def _raw_lines(self) -> Iterator[str]:
        if not self.path.exists():
            return
        for line in self.path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                yield line

    def iter_articles(self) -> Iterator[ArticleStub]:
        seen: set[str] = set()
        for line in self._raw_lines():
            parts = [p.strip() for p in line.replace("\t", "|").split("|") if p.strip()]
            url = parts[0]
            if not url.startswith("http"):
                log.warning("跳过非法行：%s", line[:80])
                continue
            stub = ArticleStub.from_url(url)
            if stub.sn in seen:
                continue
            seen.add(stub.sn)
            if len(parts) > 1:
                stub.albums = parts[1:]
            yield stub
        log.info("链接清单共载入 %d 篇去重后的文章", len(seen))
