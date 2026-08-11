"""配置加载与校验。

所有相对路径都以 config.yaml 所在目录为基准解析，输出路径以 site_root 为基准。
"""

from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


class ConfigError(Exception):
    """配置缺失或非法。"""


DEFAULTS: dict[str, Any] = {
    "account": {"name": "", "biz": ""},
    "auth": {"token": "", "cookie": "", "cookie_file": "secrets/cookie.txt"},
    "fetch": {
        "channel": "mp_backend",
        "page_size": 20,
        "max_pages": 0,
        "since": "",
        "link_list_file": "links.txt",
    },
    "network": {
        "min_delay": 2.5,
        "max_delay": 5.0,
        "timeout": 30,
        "max_retries": 3,
        "cooldown_on_freq_limit": 600,
        "proxy": "",
        "user_agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
    },
    "media": {
        "download": True,
        "concurrency": 4,
        "max_bytes": 20 * 1024 * 1024,
        "download_cover": True,
        "rich_media": "placeholder",
    },
    "output": {
        "site_root": "",
        "markdown_dir": "content/posts",
        "image_dir": "assets/img/posts",
        "index_json": "assets/js/data/posts.json",
        "image_url_prefix": "assets/img/posts",
        "markdown_url_prefix": "content/posts",
        "slug_style": "date-title",
        "ascii_slug": False,
    },
    "taxonomy": {
        "use_album_as_category": True,
        "default_category": "未分类",
        "keyword_rules": {},
        "extra_tags": [],
    },
    "sync": {
        "state_db": "state.db",
        "rewrite_on_content_change": True,
        "keep_removed": True,
    },
}


def _deep_merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        elif value is not None:
            out[key] = value
    return out


@dataclass
class Config:
    raw: dict[str, Any]
    config_path: Path
    base_dir: Path = field(init=False)

    def __post_init__(self) -> None:
        self.base_dir = self.config_path.parent

    # —— 分组访问 ——
    @property
    def account(self) -> dict:
        return self.raw["account"]

    @property
    def auth(self) -> dict:
        return self.raw["auth"]

    @property
    def fetch(self) -> dict:
        return self.raw["fetch"]

    @property
    def network(self) -> dict:
        return self.raw["network"]

    @property
    def media(self) -> dict:
        return self.raw["media"]

    @property
    def output(self) -> dict:
        return self.raw["output"]

    @property
    def taxonomy(self) -> dict:
        return self.raw["taxonomy"]

    @property
    def sync(self) -> dict:
        return self.raw["sync"]

    # —— 路径解析 ——
    def local_path(self, relative: str) -> Path:
        """相对 config.yaml 所在目录解析。"""
        p = Path(relative)
        return p if p.is_absolute() else (self.base_dir / p)

    @property
    def site_root(self) -> Path:
        root = self.output.get("site_root") or ""
        if not root:
            raise ConfigError("output.site_root 未配置，请填写个人网站根目录的绝对路径。")
        return Path(root)

    def site_path(self, relative: str) -> Path:
        p = Path(relative)
        return p if p.is_absolute() else (self.site_root / p)

    @property
    def markdown_dir(self) -> Path:
        return self.site_path(self.output["markdown_dir"])

    @property
    def image_dir(self) -> Path:
        return self.site_path(self.output["image_dir"])

    @property
    def index_json(self) -> Path:
        return self.site_path(self.output["index_json"])

    @property
    def state_db(self) -> Path:
        return self.local_path(self.sync["state_db"])

    # —— 登录态 ——
    def resolve_cookie(self) -> str:
        cookie = (self.auth.get("cookie") or "").strip()
        if cookie:
            return cookie
        cookie_file = self.auth.get("cookie_file")
        if cookie_file:
            path = self.local_path(cookie_file)
            if path.exists():
                return path.read_text(encoding="utf-8").strip()
        return ""

    @property
    def since_ts(self) -> int | None:
        raw = (self.fetch.get("since") or "").strip()
        if not raw:
            return None
        try:
            day = _dt.datetime.strptime(raw, "%Y-%m-%d")
        except ValueError as exc:
            raise ConfigError(f"fetch.since 格式应为 YYYY-MM-DD，当前为 {raw!r}") from exc
        return int(day.timestamp())

    # —— 校验 ——
    def validate_for_fetch(self) -> None:
        """采集前的强校验，尽早失败而不是跑一半才报错。"""
        problems: list[str] = []
        channel = self.fetch.get("channel")
        if channel not in {"mp_backend", "link_list"}:
            problems.append(f"fetch.channel 只能是 mp_backend 或 link_list，当前为 {channel!r}")

        if channel == "mp_backend":
            if not str(self.auth.get("token") or "").strip():
                problems.append("auth.token 为空 —— 请填公众号后台地址栏里的 token=xxxxxxx")
            if not self.resolve_cookie():
                problems.append(
                    "登录 Cookie 为空 —— 请填 auth.cookie，或把 Cookie 写进 "
                    f"{self.auth.get('cookie_file')!r} 文件"
                )
        else:
            link_file = self.local_path(self.fetch["link_list_file"])
            if not link_file.exists():
                problems.append(f"link_list 通道需要链接清单文件，未找到：{link_file}")

        if not self.output.get("site_root"):
            problems.append("output.site_root 未配置")
        elif not self.site_root.exists():
            problems.append(f"output.site_root 指向的目录不存在：{self.site_root}")

        if self.output.get("slug_style") not in {"date-title", "title", "sn"}:
            problems.append("output.slug_style 只能是 date-title / title / sn")

        if self.media.get("rich_media") not in {"placeholder", "drop"}:
            problems.append("media.rich_media 只能是 placeholder 或 drop")

        # 触发一次解析，让格式错误提前暴露
        self.since_ts

        if problems:
            raise ConfigError("配置校验未通过：\n  - " + "\n  - ".join(problems))


def load_config(path: str | Path) -> Config:
    path = Path(path)
    if not path.exists():
        raise ConfigError(
            f"找不到配置文件 {path}。请先复制 config.example.yaml 为 config.yaml 并填写。"
        )
    with path.open("r", encoding="utf-8") as fh:
        user_cfg = yaml.safe_load(fh) or {}
    if not isinstance(user_cfg, dict):
        raise ConfigError("配置文件内容不是合法的 YAML 映射结构。")
    return Config(raw=_deep_merge(DEFAULTS, user_cfg), config_path=path.resolve())
