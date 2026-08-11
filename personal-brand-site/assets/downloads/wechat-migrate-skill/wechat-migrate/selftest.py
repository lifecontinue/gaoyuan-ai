#!/usr/bin/env python
"""离线自检：不联网，用一份仿真的公众号页面跑通解析 → 转换 → 落盘 → 索引全链路。

跑这个脚本可以在没有登录态的情况下确认：管线本身是通的，环境依赖装全了。
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from wxmigrate.article import ArticleParser  # noqa: E402
from wxmigrate.config import Config, DEFAULTS, _deep_merge  # noqa: E402
from wxmigrate.convert import html_to_markdown  # noqa: E402
from wxmigrate.exporter import Exporter, make_slug, resolve_taxonomy  # noqa: E402
from wxmigrate.sources.base import ArticleStub, extract_sn, normalize_url  # noqa: E402
from wxmigrate.state import State  # noqa: E402

# 一份高度仿真的公众号页面：内联 JS 变量、多层 section 嵌套、data-src 懒加载图、
# 空段落、mpvoice 语音、话题标签 —— 真实页面的坑基本都在这儿了。
FAKE_PAGE = """<!DOCTYPE html><html><head>
<meta property="og:title" content="OG 标题" />
<meta property="og:description" content="这是文章摘要，用于列表展示。" />
<meta property="og:image" content="https://mmbiz.qpic.cn/cover_abc/640?wx_fmt=jpeg" />
<script>
  var msg_title = 'AI 产品经理的第一性原理';
  var ct = "1722931200";
  var author = "高源";
  var nickname = "Yuan Gao 的 AI 书房";
  var msg_source_url = 'https://gaoyuan-ai.xyz/writing';
  var msg_cdn_url = "https://mmbiz.qpic.cn/cover_abc/640?wx_fmt=jpeg";
  var appmsg_album_infos = [{"album_id":"1","title":"AI 产品方法论"},
                            {"album_id":"2","title":"深度长文"}];
</script></head><body>
<h1 class="rich_media_title" id="activity-name">AI 产品经理的第一性原理</h1>
<div id="js_content">
  <section style="margin:0"><section data-role="paragraph" style="color:#333">
    <p style="text-align:justify">做 AI 产品这几年，我越来越确信一件事：<strong>模型能力不是产品能力</strong>。</p>
  </section></section>
  <p><br></p>
  <section><p>　　先说结论，再讲过程。</p></section>
  <h2>一、指标不是拿来汇报的</h2>
  <p>很多团队把 <em>北极星指标</em> 当成汇报材料，这是本末倒置。</p>
  <img data-src="https://mmbiz.qpic.cn/pic_001/640?wx_fmt=png" data-w="1080"
       data-type="png" style="width:100%" alt="指标分层示意" />
  <p><br></p>
  <ul><li>L1 是体验指标</li><li>L2 是模型指标</li><li>L3 是业务指标</li></ul>
  <blockquote><p>能被度量的，才能被改进。</p></blockquote>
  <h2>二、Human-in-the-loop 不是妥协</h2>
  <p>人机协同的价值在于<span style="color:red">兜底</span>，而不是省成本。</p>
  <img data-src="https://mmbiz.qpic.cn/pic_002/640?wx_fmt=jpeg" alt="" />
  <mpvoice name="配套语音讲解" voice_encode_fileid="MzI=" ></mpvoice>
  <pre><code>metrics = {"csat": 4.6, "resolution_rate": 0.82}</code></pre>
  <p>更多讨论见 <a href="https://gaoyuan-ai.xyz">我的个人站</a>。</p>
  <section><p></p></section>
</div>
<div id="js_tags"><span class="js_tag_name">#AI产品</span><span class="js_tag_name">#方法论</span></div>
</body></html>"""

GONE_PAGE = """<html><body><div class="weui-msg">
<h4 class="weui-msg__title">该内容已被发布者删除</h4></div></body></html>"""

PASS, FAIL = "[v]", "[x]"
failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    print(f"  {PASS if condition else FAIL} {label}" + (f"  {detail}" if detail else ""))
    if not condition:
        failures.append(label)


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="wxmigrate-selftest-"))
    site_root = tmp / "site"
    (site_root / "content/posts").mkdir(parents=True)
    (site_root / "assets/js/data").mkdir(parents=True)

    cfg = Config(
        raw=_deep_merge(DEFAULTS, {
            "account": {"name": "Yuan Gao 的 AI 书房"},
            "output": {"site_root": str(site_root)},
            "taxonomy": {"keyword_rules": {"AI产品": ["AI", "大模型"],
                                           "产品方法论": ["北极星", "指标"]}},
        }),
        config_path=tmp / "config.yaml",
    )

    print("\n[1] 链接解析与身份去重")
    u1 = "https://mp.weixin.qq.com/s/AbCdEf-123_x"
    u2 = "http://mp.weixin.qq.com/s?__biz=MzI5&mid=2247&idx=1&sn=deadbeef&chksm=xx&scene=27"
    check("路径式链接取 sn", extract_sn(u1) == "AbCdEf-123_x", extract_sn(u1))
    check("查询式链接取 sn", extract_sn(u2) == "deadbeef", extract_sn(u2))
    check("链接归一化去掉会话参数", "scene" not in normalize_url(u2), normalize_url(u2))
    check("同一文章不同来源 sn 一致",
          extract_sn(u2) == extract_sn(normalize_url(u2)))

    print("\n[2] 正文解析")
    parser = ArticleParser(fetcher=None)  # 解析不需要网络
    stub = ArticleStub(sn="AbCdEf-123_x", url=u1)
    art = parser.parse(FAKE_PAGE, stub)
    check("标题", art.title == "AI 产品经理的第一性原理", art.title)
    check("发布时间戳", art.publish_ts == 1722931200, str(art.publish_ts))
    check("作者", art.author == "高源", art.author)
    check("公众号名", art.account == "Yuan Gao 的 AI 书房", art.account)
    check("原文外链", art.source_url == "https://gaoyuan-ai.xyz/writing", art.source_url)
    check("摘要", art.digest.startswith("这是文章摘要"), art.digest[:20])
    check("合集→分类（2 个）", art.albums == ["AI 产品方法论", "深度长文"], str(art.albums))
    check("话题标签（去 #）", art.topics == ["AI产品", "方法论"], str(art.topics))
    check("正文字数统计", art.word_count > 80, str(art.word_count))
    check("内容指纹稳定", art.content_hash == parser.parse(FAKE_PAGE, stub).content_hash)

    print("\n[3] 失效文章识别")
    try:
        parser.parse(GONE_PAGE, stub)
        check("已删除文章抛 ArticleGone", False)
    except Exception as exc:
        check("已删除文章抛 ArticleGone", type(exc).__name__ == "ArticleGone",
              type(exc).__name__)

    print("\n[4] Markdown 转换")
    image_map = {
        "https://mmbiz.qpic.cn/pic_001/640?wx_fmt=png": "assets/img/posts/demo/001-aaa.png",
        "https://mmbiz.qpic.cn/pic_002/640?wx_fmt=jpeg": "assets/img/posts/demo/002-bbb.jpg",
    }
    md = html_to_markdown(art.content_html, image_map)
    check("标题降级为 ###", "### 一、指标不是拿来汇报的" in md)
    check("加粗保留", "**模型能力不是产品能力**" in md)
    check("图片指向本地路径", "![指标分层示意](assets/img/posts/demo/001-aaa.png)" in md)
    check("第二张图也本地化", "002-bbb.jpg" in md)
    check("mmbiz 原链已清除", "mmbiz.qpic.cn" not in md)
    check("列表转换", "- L1 是体验指标" in md)
    check("引用块转换", "> 能被度量的，才能被改进。" in md)
    check("代码块保留", "resolution_rate" in md)
    check("链接保留", "[我的个人站](https://gaoyuan-ai.xyz)" in md)
    check("语音转占位", "[音频] 配套语音讲解" in md)
    check("无三连空行", "\n\n\n" not in md)
    check("中文标点未被转义", "\\。" not in md and "\\，" not in md)
    check("行首全角缩进已清理", "　　先说结论" not in md)

    print("\n[5] slug 与分类归属")
    slug = make_slug(art, "date-title")
    check("date-title 形态", slug.startswith("2024-08-06") or slug.startswith("2024-08-07"), slug)
    check("slug 不含非法字符", not set(slug) & set('\\/:*?"<>|'), slug)
    check("sn 形态", make_slug(art, "sn") == art.sn)
    cats, tags = resolve_taxonomy(art, cfg)
    check("合集优先当分类", cats == ["AI 产品方法论", "深度长文"], str(cats))
    check("话题标签已并入", "AI产品" in tags and "方法论" in tags, str(tags))
    check("关键词规则命中", "产品方法论" in tags, str(tags))

    print("\n[6] 落盘与增量判定")
    exporter = Exporter(cfg)
    md_path, changed1 = exporter.write_markdown(art, slug, md, cats, tags, "cover.jpg")
    check("首次写入 changed=True", changed1)
    _, changed2 = exporter.write_markdown(art, slug, md, cats, tags, "cover.jpg")
    check("内容未变 changed=False（不制造无谓改动）", not changed2)
    written = (site_root / md_path).read_text(encoding="utf-8")
    check("front-matter 完整", written.startswith("---\n") and "wechat_sn:" in written)
    check("YAML 中文未被转义", "title: AI 产品经理的第一性原理" in written)

    state = State(cfg.state_db)
    payload = {
        "sn": art.sn, "url": art.url, "title": art.title, "author": art.author,
        "digest": art.digest, "publish_ts": art.publish_ts, "update_ts": art.update_ts,
        "content_hash": art.content_hash, "slug": slug, "md_path": md_path,
        "categories": json.dumps(cats, ensure_ascii=False),
        "tags": json.dumps(tags, ensure_ascii=False),
        "cover_local": "cover.jpg", "source_url": art.source_url,
        "image_count": 2, "word_count": art.word_count, "status": "ok",
    }
    check("首次入库 action=added", state.upsert_article(payload) == "added")
    check("同内容再入库 action=unchanged", state.upsert_article(payload) == "unchanged")
    check("已同步则跳过详情请求", not state.needs_sync(art.sn, art.update_ts))
    check("后台更新时间变新则重抓", state.needs_sync(art.sn, art.update_ts + 100))
    check("--force 强制重抓", state.needs_sync(art.sn, art.update_ts, force=True))
    check("未知文章必抓", state.needs_sync("brand-new-sn", None))

    state.put_media("https://mmbiz.qpic.cn/pic_001/640?wx_fmt=png", "sha1aaa",
                    "assets/img/posts/demo/001-aaa.png",
                    "assets/img/posts/demo/001-aaa.png", 20480)
    check("图片按内容指纹可复用", state.get_media_by_sha1("sha1aaa") is not None)
    check("图片按 URL 可命中",
          state.get_media_by_url("https://mmbiz.qpic.cn/pic_001/640?wx_fmt=png") is not None)

    print("\n[7] 前端索引生成")
    index_path = exporter.write_index(state)
    index = json.loads(index_path.read_text(encoding="utf-8"))
    check("索引文件已生成", index_path.exists(), str(index_path.name))
    check("文章条目数", index["total"] == 1, str(index["total"]))
    post = index["posts"][0]
    check("含 markdown 相对路径", post["markdown"] == f"content/posts/{slug}.md",
          post["markdown"])
    check("分类聚合", [c["name"] for c in index["categories"]] == ["AI 产品方法论", "深度长文"])
    check("标签聚合带计数", index["tags"][0]["count"] == 1)
    check("保留公众号原链", post["wechatUrl"] == u1)

    state.close()
    shutil.rmtree(tmp, ignore_errors=True)

    print("\n" + "=" * 54)
    if failures:
        print(f"{FAIL} 自检未通过，失败 {len(failures)} 项：")
        for f in failures:
            print(f"    · {f}")
        return 1
    print(f"{PASS} 全部自检通过 —— 管线可用，环境依赖完整。")
    print("=" * 54)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
