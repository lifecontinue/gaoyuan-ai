"""统一的 HTTP 会话层：限速、重试、登录态失效与频率限制识别。

微信对后台接口的频率控制很敏感，这一层的存在就是为了不把账号搞进小黑屋：
每次请求之间强制随机停顿，命中频率限制直接抛出专用异常让上层冷却或退出。
"""

from __future__ import annotations

import logging
import random
import threading
import time
from typing import Any

import requests

log = logging.getLogger("wxmigrate.http")


class FetchError(Exception):
    """一般性网络/解析失败。"""


class SessionExpired(FetchError):
    """公众号后台登录态失效，需要重新抓 Cookie 和 token。"""


class RateLimited(FetchError):
    """命中微信频率控制。"""


class ArticleGone(FetchError):
    """文章已被删除、被举报或转为私密。"""


# 微信后台接口返回码
RET_OK = 0
RET_INVALID_SESSION = 200003
RET_FREQ_LIMIT = 200013
RET_SYS_BUSY = 200002


class Fetcher:
    """带节流的请求器。所有出站请求都必须经过它。"""

    def __init__(self, cfg_network: dict, cookie: str = "") -> None:
        self.min_delay = float(cfg_network.get("min_delay", 2.5))
        self.max_delay = float(cfg_network.get("max_delay", 5.0))
        self.timeout = int(cfg_network.get("timeout", 30))
        self.max_retries = int(cfg_network.get("max_retries", 3))
        self.cooldown = int(cfg_network.get("cooldown_on_freq_limit", 600))

        self._lock = threading.Lock()
        self._last_request_at = 0.0

        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": cfg_network.get("user_agent", ""),
                "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                "Referer": "https://mp.weixin.qq.com/",
            }
        )
        if cookie:
            self.session.headers["Cookie"] = cookie
        proxy = (cfg_network.get("proxy") or "").strip()
        if proxy:
            self.session.proxies = {"http": proxy, "https": proxy}

    # —— 节流 ——
    def _throttle(self) -> None:
        with self._lock:
            elapsed = time.monotonic() - self._last_request_at
            wait = random.uniform(self.min_delay, self.max_delay) - elapsed
            if wait > 0:
                time.sleep(wait)
            self._last_request_at = time.monotonic()

    def get(self, url: str, *, params: dict | None = None,
            headers: dict | None = None, throttle: bool = True,
            stream: bool = False) -> requests.Response:
        """带指数退避重试的 GET。网络层错误重试，业务层错误交给调用方判断。"""
        last_exc: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            if throttle:
                self._throttle()
            try:
                resp = self.session.get(
                    url, params=params, headers=headers,
                    timeout=self.timeout, stream=stream,
                )
                if resp.status_code == 429:
                    raise RateLimited(f"HTTP 429 Too Many Requests: {url}")
                if resp.status_code >= 500:
                    raise FetchError(f"HTTP {resp.status_code}: {url}")
                return resp
            except RateLimited:
                raise
            except (requests.RequestException, FetchError) as exc:
                last_exc = exc
                backoff = min(2 ** attempt + random.uniform(0, 1.5), 60)
                log.warning("请求失败（第 %d/%d 次）：%s —— %.1fs 后重试",
                            attempt, self.max_retries, exc, backoff)
                if attempt < self.max_retries:
                    time.sleep(backoff)
        raise FetchError(f"重试 {self.max_retries} 次后仍失败：{url} —— {last_exc}")

    def get_json(self, url: str, *, params: dict | None = None) -> dict[str, Any]:
        """请求后台 JSON 接口，并把微信的业务返回码翻译成异常。"""
        headers = {
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/javascript, */*; q=0.01",
        }
        resp = self.get(url, params=params, headers=headers)

        try:
            data = resp.json()
        except ValueError:
            snippet = resp.text[:200].replace("\n", " ")
            if "登录" in resp.text or "login" in resp.url:
                raise SessionExpired(
                    "接口返回了登录页而不是 JSON，登录态已失效。请重新抓取 Cookie 与 token。"
                ) from None
            raise FetchError(f"接口返回的不是合法 JSON：{snippet}") from None

        base = data.get("base_resp") or {}
        ret = base.get("ret", RET_OK)
        err = base.get("err_msg", "")

        if ret == RET_INVALID_SESSION or err == "invalid session":
            raise SessionExpired(
                "登录态失效（ret=200003）。请重新登录公众号后台，更新 auth.token 与 Cookie。"
            )
        if ret == RET_FREQ_LIMIT or err == "freq control":
            raise RateLimited(
                f"命中微信频率控制（ret=200013）。建议冷却 {self.cooldown // 60} 分钟后再跑，"
                "或调大 network.min_delay。已同步的进度不会丢失。"
            )
        if ret not in (RET_OK, None):
            raise FetchError(f"后台接口返回错误 ret={ret} err_msg={err!r}")
        return data

    def close(self) -> None:
        self.session.close()
