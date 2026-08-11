"""命令行入口。

子命令一览：
  check     校验配置 + 验证登录态，跑正式任务前先过这一关
  list      只列出后台能看到的文章，不下载任何东西
  sync      主命令：增量同步（列表 → 正文 → 图片 → Markdown → 索引）
  build     不联网，仅根据现有状态库重新生成 posts.json
  stats     查看已同步的家底
  retry     重试此前失败的文章
"""

from __future__ import annotations

import argparse
import datetime as _dt
import logging
import sys
from pathlib import Path

from .config import ConfigError, load_config
from .http import Fetcher, FetchError, SessionExpired
from .pipeline import build_source, run_sync
from .state import State

DEFAULT_CONFIG = Path(__file__).resolve().parent.parent / "config.yaml"


def setup_logging(verbose: bool = False) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s  %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stdout,
    )
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def _fmt_ts(ts: int | None) -> str:
    return _dt.datetime.fromtimestamp(ts).strftime("%Y-%m-%d") if ts else "—"


def _fmt_size(num: int) -> str:
    value = float(num or 0)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024:
            return f"{value:.1f}{unit}"
        value /= 1024
    return f"{value:.1f}TB"


# --------------------------------------------------------------------- 子命令
def cmd_check(cfg, args) -> int:
    print("配置文件：", cfg.config_path)
    try:
        cfg.validate_for_fetch()
    except ConfigError as exc:
        print(f"\n[x] {exc}")
        return 1
    print("[v] 配置校验通过")
    print(f"    采集通道 : {cfg.fetch['channel']}")
    print(f"    站点根目录: {cfg.site_root}")
    print(f"    Markdown : {cfg.markdown_dir}")
    print(f"    图片目录 : {cfg.image_dir}")
    print(f"    索引文件 : {cfg.index_json}")

    fetcher = Fetcher(cfg.network, cookie=cfg.resolve_cookie())
    try:
        source = build_source(cfg, fetcher)
        info = source.check_login()
        print(f"\n[v] 登录态有效（接口：{info['channel']}）")
        print(f"    后台可见内容总数：{info['total_count']}")
        return 0
    except SessionExpired as exc:
        print(f"\n[x] 登录态失效：{exc}")
        print("    请重新登录 mp.weixin.qq.com，更新 auth.token 与 Cookie。")
        return 1
    except FetchError as exc:
        print(f"\n[x] 接口访问失败：{exc}")
        return 1
    finally:
        fetcher.close()


def cmd_list(cfg, args) -> int:
    print("正在拉取后台文章列表（不下载任何内容）…\n")
    stats = run_sync(cfg, list_only=True)
    print(f"\n共列出 {stats.listed} 篇。")
    if stats.interrupted_reason:
        print(f"提前结束：{stats.interrupted_reason}")
        return 1
    return 0


def cmd_sync(cfg, args) -> int:
    mode = "全量重抓" if args.force else "增量同步"
    print(f"开始{mode}（Ctrl+C 可随时安全中断，进度不会丢失）\n")
    stats = run_sync(cfg, force=args.force, limit=args.limit, dry_run=args.dry_run)

    print("\n" + "=" * 52)
    print(f"  列出        {stats.listed:>5}")
    print(f"  新增        {stats.added:>5}")
    print(f"  更新        {stats.updated:>5}")
    print(f"  无变化      {stats.unchanged:>5}")
    print(f"  按日期跳过  {stats.skipped:>5}")
    print(f"  已失效      {stats.gone:>5}")
    print(f"  失败        {stats.failed:>5}")
    if stats.media:
        m = stats.media
        print(f"  图片        下载 {m.get('downloaded', 0)} / 复用 {m.get('reused', 0)} "
              f"/ 跳过 {m.get('skipped', 0)} / 失败 {m.get('failed', 0)}")
    print("=" * 52)

    if stats.interrupted_reason:
        print(f"\n[!] 本轮提前结束：{stats.interrupted_reason}")
        print("    已完成的部分已保存，稍后直接重跑 sync 会从缺口继续。")
        return 1
    if stats.failed:
        print("\n[!] 有文章抓取失败，可用 `retry` 子命令单独重试。")
    return 0


def cmd_build(cfg, args) -> int:
    from .exporter import Exporter

    state = State(cfg.state_db)
    dest = Exporter(cfg).write_index(state)
    total = len(state.all_articles(status=None))
    state.close()
    print(f"[v] 已根据本地状态库重新生成索引：{dest}（{total} 条记录）")
    return 0


def cmd_stats(cfg, args) -> int:
    state = State(cfg.state_db)
    s = state.summary()
    state.close()

    if not s["total"]:
        print("状态库还是空的，先跑一次 `sync` 吧。")
        return 0

    print(f"文章总数      {s['total']}")
    for status, count in sorted(s["by_status"].items()):
        label = {"ok": "正常", "archived": "已归档", "failed": "失败", "gone": "已失效"}
        print(f"  · {label.get(status, status):<10}{count}")
    print(f"时间跨度      {_fmt_ts(s['earliest'])}  →  {_fmt_ts(s['latest'])}")
    print(f"本地图片      {s['media_count']} 张，共 {_fmt_size(s['media_bytes'])}")

    last = s["last_run"]
    if last:
        print(
            f"\n最近一次同步  {_dt.datetime.fromtimestamp(last['started_at']):%Y-%m-%d %H:%M}"
            f"（{last['channel']}）"
        )
        print(f"  新增 {last['added']} / 更新 {last['updated']} / 失败 {last['failed']}")
        if last["note"]:
            print(f"  备注：{last['note']}")
    return 0


def cmd_retry(cfg, args) -> int:
    state = State(cfg.state_db)
    failed = state.all_articles(status="failed")
    state.close()
    if not failed:
        print("没有失败记录，无需重试。")
        return 0
    print(f"发现 {len(failed)} 篇失败文章，将强制重抓：\n")
    for row in failed:
        print(f"  · {row['title'] or row['sn']}  —— {(row['error'] or '')[:60]}")
    print()
    stats = run_sync(cfg, force=True)
    print(f"\n重试完成：成功 {stats.added + stats.updated}，仍失败 {stats.failed}")
    return 0 if not stats.failed else 1


# ----------------------------------------------------------------------- 入口
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="wxmigrate",
        description="把微信公众号文章批量导出并迁移到个人网站",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="典型流程：  check  →  list  →  sync --limit 3  →  sync",
    )
    p.add_argument("-c", "--config", default=str(DEFAULT_CONFIG),
                   help="配置文件路径（默认 ./config.yaml）")
    p.add_argument("-v", "--verbose", action="store_true", help="输出调试日志")

    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("check", help="校验配置并验证登录态").set_defaults(func=cmd_check)
    sub.add_parser("list", help="仅列出后台文章，不下载").set_defaults(func=cmd_list)

    s = sub.add_parser("sync", help="增量同步文章到个人网站")
    s.add_argument("--force", action="store_true", help="忽略增量判定，全部重抓")
    s.add_argument("--limit", type=int, default=0, help="本轮最多处理多少篇（0=不限）")
    s.add_argument("--dry-run", action="store_true", help="只报告将要做什么，不写任何文件")
    s.set_defaults(func=cmd_sync)

    sub.add_parser("build", help="不联网，重新生成 posts.json").set_defaults(func=cmd_build)
    sub.add_parser("stats", help="查看同步统计").set_defaults(func=cmd_stats)
    sub.add_parser("retry", help="重试此前失败的文章").set_defaults(func=cmd_retry)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    setup_logging(args.verbose)
    try:
        cfg = load_config(args.config)
    except ConfigError as exc:
        print(f"[x] {exc}")
        return 1
    try:
        return args.func(cfg, args)
    except ConfigError as exc:
        print(f"[x] 配置错误：{exc}")
        return 1
    except KeyboardInterrupt:
        print("\n已中断。")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
