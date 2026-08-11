/* md-render.js — 零依赖 Markdown 渲染器
 *
 * 只覆盖公众号文章会用到的语法子集，换来的是：不引入任何第三方库、
 * 不需要 bundler、和站点现有的纯 ES Modules 架构一致。
 *
 * 安全性：先对全文做 HTML 转义，再生成标签。所以原文里的任何 HTML/脚本
 * 都会被当作纯文本显示，天然免疫 XSS —— 迁移来的内容不必无条件信任。
 */

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

/** 只允许安全协议，挡掉 javascript: 之类的链接 */
function safeUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '#';
  // XSS prevention: block dangerous URI schemes.
  // Allow http(s), mailto, tel, absolute paths, relative paths (assets/...), and fragments.
  if (/^\s*(javascript|vbscript|data):/i.test(trimmed)) return '#';
  return trimmed;
}

/* ------------------------------------------------------------------ front-matter */

/**
 * 拆出 YAML front-matter。这里只做浅层解析（字符串、布尔、数字、行内数组），
 * 因为导出端产出的结构是固定的，不需要完整 YAML 解析器。
 */
export function parseFrontMatter(raw) {
  const text = String(raw).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { meta: {}, body: text };

  const meta = {};
  let currentKey = null;

  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;

    // 多行数组的续行：  - item
    const listItem = /^\s+-\s+(.*)$/.exec(line);
    if (listItem && currentKey) {
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
      meta[currentKey].push(unquote(listItem[1]));
      continue;
    }

    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    currentKey = kv[1];
    const rawValue = kv[2].trim();

    if (rawValue === '') { meta[currentKey] = []; continue; }
    if (rawValue === '[]') { meta[currentKey] = []; continue; }
    if (/^\[.*\]$/.test(rawValue)) {
      meta[currentKey] = rawValue.slice(1, -1).split(',')
        .map((s) => unquote(s)).filter(Boolean);
      continue;
    }
    if (rawValue === 'true' || rawValue === 'false') {
      meta[currentKey] = rawValue === 'true'; continue;
    }
    if (/^-?\d+(\.\d+)?$/.test(rawValue)) { meta[currentKey] = Number(rawValue); continue; }
    meta[currentKey] = unquote(rawValue);
  }

  return { meta, body: text.slice(match[0].length) };
}

function unquote(value) {
  const v = String(value).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/* ---------------------------------------------------------------------- inline */

const CODE_TOKEN = '\u0000CODE';

function renderInline(text) {
  const codeSpans = [];
  let s = escapeHtml(text);

  // 行内代码先抽出来占位，避免内部的 * _ 被当成强调语法
  s = s.replace(/`([^`\n]+)`/g, (_, code) => {
    codeSpans.push(code);
    return `${CODE_TOKEN}${codeSpans.length - 1}\u0000`;
  });

  // 图片必须在链接之前处理，否则 ![]() 会被当成 []()
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
    (_, alt, src) => `<img src="${safeUrl(src)}" alt="${alt}" loading="lazy" decoding="async" />`);

  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, label, href) => {
    const url = safeUrl(href);
    const external = /^https?:\/\//i.test(url);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${url}"${attrs}>${label}</a>`;
  });

  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

  // markdownify 用行尾反斜杠表示硬换行
  s = s.replace(/\\$/gm, '<br />');

  return s.replace(new RegExp(`${CODE_TOKEN}(\\d+)\\u0000`, 'g'),
    (_, i) => `<code>${codeSpans[Number(i)]}</code>`);
}

/* ----------------------------------------------------------------------- block */

const RE_FENCE = /^\s*```(\w*)\s*$/;
const RE_HEADING = /^(#{1,6})\s+(.*)$/;
const RE_HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const RE_QUOTE = /^\s*>\s?(.*)$/;
const RE_UL = /^\s*[-*+]\s+(.*)$/;
const RE_OL = /^\s*(\d+)[.)]\s+(.*)$/;
const RE_TABLE_SEP = /^\s*\|?[\s:-]*\|[\s|:-]*$/;
const RE_LONE_IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

export function renderMarkdown(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    // 围栏代码块
    const fence = RE_FENCE.exec(line);
    if (fence) {
      const lang = fence[1] ? ` class="language-${escapeHtml(fence[1])}"` : '';
      const buf = [];
      i += 1;
      while (i < lines.length && !RE_FENCE.test(lines[i])) { buf.push(lines[i]); i += 1; }
      i += 1; // 吃掉收尾的 ```
      out.push(`<pre><code${lang}>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    if (RE_HR.test(line)) { out.push('<hr />'); i += 1; continue; }

    const heading = RE_HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = renderInline(heading[2].trim());
      const id = slugifyHeading(heading[2]);
      out.push(`<h${level} id="${id}">${text}</h${level}>`);
      i += 1;
      continue;
    }

    // 独占一行的图片 → figure + 图注，阅读体验比裸 img 好得多
    const loneImage = RE_LONE_IMAGE.exec(line.trim());
    if (loneImage) {
      const alt = escapeHtml(loneImage[1]);
      const caption = alt ? `<figcaption>${alt}</figcaption>` : '';
      out.push(
        `<figure class="post-figure">` +
        `<img src="${safeUrl(loneImage[2])}" alt="${alt}" loading="lazy" decoding="async" />` +
        `${caption}</figure>`
      );
      i += 1;
      continue;
    }

    if (RE_QUOTE.test(line)) {
      const buf = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) {
        buf.push(RE_QUOTE.exec(lines[i])[1]);
        i += 1;
      }
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }

    // 表格：| a | b |  +  |---|---|
    if (line.includes('|') && i + 1 < lines.length && RE_TABLE_SEP.test(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      out.push(
        '<div class="post-table-wrap"><table><thead><tr>' +
        header.map((c) => `<th>${renderInline(c)}</th>`).join('') +
        '</tr></thead><tbody>' +
        rows.map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`).join('') +
        '</tbody></table></div>'
      );
      continue;
    }

    if (RE_UL.test(line) || RE_OL.test(line)) {
      const ordered = RE_OL.test(line);
      const items = [];
      while (i < lines.length) {
        const m = ordered ? RE_OL.exec(lines[i]) : RE_UL.exec(lines[i]);
        if (!m) break;
        items.push(renderInline((ordered ? m[2] : m[1]).trim()));
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${t}</li>`).join('')}</${tag}>`);
      continue;
    }

    // 段落：吃到下一个空行或下一个块级起始
    const para = [];
    while (i < lines.length && lines[i].trim()
      && !RE_FENCE.test(lines[i]) && !RE_HEADING.test(lines[i])
      && !RE_HR.test(lines[i]) && !RE_QUOTE.test(lines[i])
      && !RE_UL.test(lines[i]) && !RE_OL.test(lines[i])
      && !RE_LONE_IMAGE.test(lines[i].trim())) {
      para.push(lines[i]);
      i += 1;
    }
    if (para.length) out.push(`<p>${renderInline(para.join('\n'))}</p>`);
  }

  return out.join('\n');
}

function splitRow(line) {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

function slugifyHeading(text) {
  return 'h-' + String(text).trim().toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/** 从渲染后的正文里提取 h2/h3，供文章页生成目录 */
export function extractOutline(html) {
  const outline = [];
  const re = /<h([23])\s+id="([^"]+)">([\s\S]*?)<\/h[23]>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    outline.push({
      level: Number(m[1]),
      id: m[2],
      text: m[3].replace(/<[^>]+>/g, '').trim(),
    });
  }
  return outline;
}
