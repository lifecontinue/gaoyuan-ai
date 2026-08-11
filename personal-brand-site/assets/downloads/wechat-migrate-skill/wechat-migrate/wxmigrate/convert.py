"""正文 HTML → Markdown。

公众号编辑器产出的 HTML 有几个顽疾，直接丢给转换器会得到一坨垃圾：
  · 每段文字裹在三四层带内联样式的 <section> 里
  · 大量 <p><br></p> 充当行距
  · 图片挂在 data-src 上
  · 音频/视频是自定义标签（mpvoice / iframe.video_iframe），Markdown 里没有对应物
所以先做一轮结构化清洗，再交给 markdownify，最后再洗一遍空行。
"""

from __future__ import annotations

import re

from bs4 import BeautifulSoup, NavigableString, Tag
from markdownify import MarkdownConverter

# 纯装饰性、不承载信息的元素
_DROP_TAGS = ("script", "style", "svg", "noscript", "canvas", "ins")


class WeChatMarkdownConverter(MarkdownConverter):
    """针对微信正文微调的转换器。"""

    def convert_img(self, el, text, parent_tags=None):
        """图片一律独占一段，避免和上下文粘连成一行。"""
        src = el.get("src") or ""
        alt = (el.get("alt") or "").replace("\n", " ").strip()
        if not src:
            return ""
        return f"\n\n![{alt}]({src})\n\n"

    def convert_hN(self, n, el, text, parent_tags=None):
        """正文标题整体降一级。

        文章标题（H1）由站点前端渲染，正文里再出现 H1 会造成两个 H1，
        对 SEO 和无障碍大纲都不友好，所以正文 h1→##、h2→### 依次下沉。
        """
        text = (text or "").strip()
        if not text:
            return ""
        return f"\n\n{'#' * min(n + 1, 6)} {text}\n\n"


def _preprocess(soup: BeautifulSoup, image_map: dict[str, str],
                rich_media_mode: str = "placeholder") -> BeautifulSoup:
    """把微信 HTML 洗成结构干净、可直接转换的形态。"""

    for tag in soup.find_all(_DROP_TAGS):
        tag.decompose()

    # —— 图片：真实地址提到 src，并替换成本地化后的路径 ——
    for img in soup.find_all("img"):
        src = (img.get("data-src") or img.get("data-original")
               or img.get("data-backsrc") or img.get("src") or "").strip()
        if src.startswith("//"):
            src = "https:" + src
        local = image_map.get(src)
        if local:
            img["src"] = local
        elif src.startswith("http"):
            img["src"] = src
        else:
            img.decompose()
            continue
        for attr in list(img.attrs):
            if attr not in ("src", "alt"):
                del img[attr]

    # —— 音频 / 视频：Markdown 没有对应语法，转成显式占位 ——
    for voice in soup.find_all("mpvoice"):
        name = voice.get("name") or "语音消息"
        if rich_media_mode == "drop":
            voice.decompose()
            continue
        marker = soup.new_tag("p")
        marker.string = f"[音频] {name}（原文含语音，请前往公众号原文收听）"
        voice.replace_with(marker)

    for frame in soup.find_all("iframe"):
        src = frame.get("data-src") or frame.get("src") or ""
        if rich_media_mode == "drop" or not src:
            frame.decompose()
            continue
        marker = soup.new_tag("p")
        marker.string = f"[视频] 原文含嵌入视频：{src}"
        frame.replace_with(marker)

    # —— 微信小程序卡片 / 公众号名片：无法迁移，直接移除 ——
    for tag in soup.find_all(["mp-common-mpaudio", "mp-miniprogram", "mp-common-profile"]):
        tag.decompose()

    # —— 去掉全部内联样式与自定义属性，避免污染转换结果 ——
    for tag in soup.find_all(True):
        for attr in ("style", "class", "data-tools", "data-id", "data-role",
                     "data-width", "powered-by", "data-brushtype", "data-darkmode-color",
                     "data-darkmode-bgcolor", "data-darkmode-original-color",
                     "data-darkmode-original-bgcolor", "data-style", "data-pm-slice"):
            if attr in tag.attrs:
                del tag[attr]

    # —— 展平 section：只有当它不含块级子元素时才降级为段落 ——
    block_tags = {"p", "div", "section", "ul", "ol", "table", "blockquote",
                  "h1", "h2", "h3", "h4", "h5", "h6", "pre", "figure"}
    for section in soup.find_all("section"):
        has_block_child = any(
            isinstance(c, Tag) and c.name in block_tags for c in section.children
        )
        if has_block_child:
            section.unwrap()
        else:
            section.name = "p"

    # —— 清掉只含空白或 <br> 的空段落 ——
    for p in soup.find_all(["p", "div"]):
        if p.find(["img", "table", "iframe", "video", "a"]):
            continue
        if not p.get_text(strip=True):
            p.decompose()

    # —— <br> 转成真正的换行，避免转换后粘成一行 ——
    for br in soup.find_all("br"):
        br.replace_with(NavigableString("\n"))

    return soup


_MULTI_BLANK = re.compile(r"\n{3,}")
_TRAILING_SPACE = re.compile(r"[ \t]+$", re.M)
_ESCAPED_PUNCT = re.compile(r"\\([*_`\[\]()#+\-.!])")


def _postprocess(md: str) -> str:
    md = _TRAILING_SPACE.sub("", md)
    md = _MULTI_BLANK.sub("\n\n", md)
    # markdownify 会把中文段落里的标点也转义，读起来很脏，还原掉
    md = _ESCAPED_PUNCT.sub(r"\1", md)
    # 中文全角空格常被用作缩进，统一去掉行首的
    md = re.sub(r"^[　\u00a0]+", "", md, flags=re.M)
    return md.strip() + "\n"


def html_to_markdown(content_html: str, image_map: dict[str, str] | None = None,
                     rich_media_mode: str = "placeholder") -> str:
    soup = BeautifulSoup(content_html, "lxml")
    soup = _preprocess(soup, image_map or {}, rich_media_mode)
    converter = WeChatMarkdownConverter(
        heading_style="ATX",
        bullets="-",
        strong_em_symbol="*",
        code_language="",
        escape_asterisks=False,
        escape_underscores=False,
        newline_style="BACKSLASH",
    )
    return _postprocess(converter.convert_soup(soup))
