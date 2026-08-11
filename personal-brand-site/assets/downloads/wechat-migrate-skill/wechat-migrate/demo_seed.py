#!/usr/bin/env python
"""端到端演示：用一篇仿真文章走完整导出链路，往站点里写入一条样例数据。

目的有二：
  1. 集成验证 —— 证明 exporter / state / 索引 与站点目录结构真的对得上；
  2. 让你在还没配登录态时就能先看到 /writing 页面长什么样。

样例文章 slug 以 "demo-" 开头，清理时执行：python demo_seed.py --clean
真实同步（python run.py sync）会重新生成 posts.json，样例不会污染正式数据。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from wxmigrate.article import ArticleParser
from wxmigrate.config import DEFAULTS, Config, _deep_merge
from wxmigrate.convert import html_to_markdown
from wxmigrate.exporter import Exporter, resolve_taxonomy
from wxmigrate.sources.base import ArticleStub
from wxmigrate.state import State

SITE_ROOT = Path("D:/forster children/personal-brand-site")
DEMO_SLUG = "demo-迁移管线验证样例"

DEMO_HTML = """<html><head>
<meta property="og:description" content="这是一篇由 wechat-migrate 生成的样例文章，用来验证从公众号到个人站点的完整链路。" />
<script>
  var msg_title = '从公众号到个人站点：一条内容管线是怎么跑通的';
  var ct = "1754524800";
  var author = "gaoyuan";
  var nickname = "Yuan Gao 的 AI 书房";
  var msg_source_url = 'https://gaoyuan-ai.xyz';
  var appmsg_album_infos = [{"album_id":"1","title":"AI 产品方法论"}];
</script></head><body>
<div id="js_content">
  <section><p>这篇文章不是抓来的，是 <strong>wechat-migrate</strong> 自己生成的一条样例记录。
  它走的是和真实文章完全相同的代码路径：解析元信息、转换正文、生成 front-matter、写入索引。
  所以你现在看到的排版效果，就是迁移之后真实文章的样子。</p></section>
  <p><br></p>
  <h2>管线做了什么</h2>
  <p>整条链路拆成五步，每一步都可以单独重跑：</p>
  <ul>
    <li><strong>列表</strong> —— 复用你自己的后台登录态，翻页拿到全部已发表图文</li>
    <li><strong>增量判定</strong> —— 已同步过的文章连详情页都不会去请求</li>
    <li><strong>正文</strong> —— 解析标题、时间、作者、原文链接、合集与话题标签</li>
    <li><strong>媒体</strong> —— 图片按内容指纹去重后本地化，跨文章复用同一份文件</li>
    <li><strong>落盘</strong> —— 生成带 front-matter 的 Markdown，并刷新前端索引</li>
  </ul>
  <blockquote><p>能被增量同步的内容，才谈得上长期维护。</p></blockquote>
  <h2>为什么是 Markdown</h2>
  <p>公众号的 HTML 是一次性的：层层嵌套的 <code>section</code>、写死的内联样式、
  挂在 <code>data-src</code> 上的懒加载图片。这些东西搬到自己的站点上没有任何价值。
  转成 Markdown 之后，内容和呈现才真正分开 —— 换主题、换框架、换 CMS，正文都不用动。</p>
  <h3>关于图片</h3>
  <p>微信图床有防盗链，直接引用原链在自己的域名下会变成裂图。所以图片必须本地化，
  这也是整条管线里最容易被低估的一步。</p>
  <p>更多内容见 <a href="https://gaoyuan-ai.xyz">个人主页</a>。</p>
</div>
<div id="js_tags"><span class="js_tag_name">内容迁移</span><span class="js_tag_name">工程实践</span></div>
</body></html>"""


def build_cfg() -> Config:
    return Config(
        raw=_deep_merge(DEFAULTS, {
            "account": {"name": "Yuan Gao 的 AI 书房"},
            "output": {"site_root": str(SITE_ROOT)},
            "taxonomy": {"keyword_rules": {
                "AI产品": ["AI", "大模型", "模型"],
                "工程实践": ["管线", "增量", "Markdown"],
            }},
        }),
        config_path=Path(__file__).resolve().parent / "config.yaml",
    )


def seed() -> int:
    cfg = build_cfg()
    if not SITE_ROOT.exists():
        print(f"[x] 站点目录不存在：{SITE_ROOT}")
        return 1

    stub = ArticleStub(sn="demo-sn-0001", url="https://mp.weixin.qq.com/s/demo-sn-0001")
    article = ArticleParser(fetcher=None).parse(DEMO_HTML, stub)

    categories, tags = resolve_taxonomy(article, cfg)
    body_md = html_to_markdown(article.content_html, {})

    exporter = Exporter(cfg)
    md_path, _ = exporter.write_markdown(article, DEMO_SLUG, body_md, categories, tags, "")

    state = State(cfg.state_db)
    state.upsert_article({
        "sn": article.sn, "url": article.url, "title": article.title,
        "author": article.author, "digest": article.digest,
        "publish_ts": article.publish_ts, "update_ts": article.update_ts,
        "content_hash": article.content_hash, "slug": DEMO_SLUG, "md_path": md_path,
        "categories": json.dumps(categories, ensure_ascii=False),
        "tags": json.dumps(tags, ensure_ascii=False),
        "cover_local": "", "source_url": article.source_url,
        "image_count": 0, "word_count": article.word_count, "status": "ok",
    })
    index_path = exporter.write_index(state)
    state.close()

    print("[v] 样例文章已写入站点")
    print(f"    Markdown : {SITE_ROOT / md_path}")
    print(f"    索引     : {index_path}")
    print(f"    分类     : {categories}")
    print(f"    标签     : {tags}")
    print(f"    字数     : {article.word_count}")
    print("\n预览：在 personal-brand-site 目录起个静态服务器，打开 /writing.html")
    return 0


def clean() -> int:
    cfg = build_cfg()
    md = cfg.markdown_dir / f"{DEMO_SLUG}.md"
    if md.exists():
        md.unlink()
        print(f"[v] 已删除 {md}")
    if cfg.state_db.exists():
        state = State(cfg.state_db)
        state.conn.execute("DELETE FROM articles WHERE sn LIKE 'demo-%'")
        state.conn.commit()
        Exporter(cfg).write_index(state)
        state.close()
        print("[v] 已从状态库与索引中移除样例记录")
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="写入/清理演示样例文章")
    p.add_argument("--clean", action="store_true", help="清理样例数据")
    args = p.parse_args()
    raise SystemExit(clean() if args.clean else seed())
