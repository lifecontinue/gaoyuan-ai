/**
 * editorial-renderer.js — Rich Editorial Article Rendering System
 *
 * Takes raw Markdown + post metadata → semantically-classified editorial HTML + TOC.
 * Designed to be reusable: feed it any WeChat-exported markdown article, and it
 * produces a structured, visually-rich editorial layout without per-article hacks.
 *
 * Pipeline:  raw md → parseFrontMatter → renderMarkdown → split into sections →
 *            classify blocks → wrap in editorial components → extract TOC.
 */

import { parseFrontMatter, renderMarkdown, extractOutline } from './md-render.js';

/* ------------------------------------------------------------------ classifiers */

/** Block-level tag classification from rendered HTML. Returns type for styling. */
function classifyBlock(blockHtml) {
  const tagMatch = /^<(\w+)/.exec(blockHtml);
  const tag = tagMatch ? tagMatch[1].toLowerCase() : '';

  // Image-only blocks (figure, or a <p> wrapping just an <img>) have no text
  // after tag-stripping — detect them BEFORE the empty-text guard, otherwise
  // they'd be dropped as 'empty' and all article images would vanish.
  if (tag === 'figure' || /<img\b/i.test(blockHtml)) return 'image';

  const stripped = blockHtml.replace(/<[^>]+>/g, '').trim();
  if (!stripped) return 'empty';

  // Structural tags
  if (tag === 'ul' || tag === 'ol') {
    if (hasMetricPattern(stripped)) return 'metric-list';
    if (hasWarningPattern(stripped)) return 'risk-list';
    return 'list';
  }
  if (tag === 'blockquote') return 'pullquote';
  if (tag === 'pre') return 'code';

  // Paragraph-level semantics
  if (tag === 'p') {
    if (hasMetricPattern(stripped)) return 'metric';
    if (hasComparisonPattern(stripped)) return 'comparison';
    if (hasWarningPattern(stripped)) return 'warning';
    if (hasQuotePattern(stripped)) return 'pullquote';
    return 'paragraph';
  }

  return 'other';
}

function hasMetricPattern(text) {
  // Percentage, NPS, arrow ranges (316h → 116h), decrease indicators, standalone numbers with %, or number+unit
  return /(\d+\s*%)|(NPS)|(\d+h?\s*[→>]\s*\d+h?)|([↓↑]\s*\d+%)/.test(text);
}

function hasComparisonPattern(text) {
  // Lists or paragraphs that compare before/after states
  return text.includes('→') || text.includes('→') || text.includes('vs');
}

function hasWarningPattern(text) {
  return /(PII|数据质量|暴露|decline|下降|absent|缺席|失败|threatens|never|仍然|不足)/i.test(text);
}

function hasQuotePattern(text) {
  const s = text.trim();
  // Standalone emphatic statement: relatively short, impactful
  if (s.length < 15 || s.length > 280) return false;
  // Starts or ends with quote marks, or has "workflow / organization / decision" pattern
  if (/^[""'「]/.test(s) || /[」"'"']$/.test(s)) return true;
  if (/(workflow|organization|decision)/i.test(s) && s.length < 120) return true;
  return false;
}

/** Detect if a list should be treated as structured capability list */
function isCapabilityList(text) {
  return /^(Students|Action|Key|Risk|Tutor|Payment|\d{2,}\s+)/im.test(text);
}

/* ------------------------------------------------------------------ section parser */

function splitIntoSections(html) {
  const sections = [];
  // Find all h1/h2/h3 with IDs
  const re = /<h([123])[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/gi;
  const tags = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    tags.push({
      level: Number(m[1]),
      id: m[2],
      title: m[3].replace(/<[^>]+>/g, '').trim(),
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  if (tags.length === 0) {
    // Prose-only article (no headings): keep the whole body so nothing is dropped.
    return [{ heading: null, number: 0, body: html }];
  }

  for (let i = 0; i < tags.length; i++) {
    const current = tags[i];
    const next = tags[i + 1];
    const bodyStart = current.end;
    const bodyEnd = next ? next.start : html.length;
    const body = html.slice(bodyStart, bodyEnd).trim();
    sections.push({ heading: current, number: 0, body });
  }

  return sections;
}

/** Split body HTML into individual blocks (p, ul, ol, figure, blockquote, pre) */
function splitBlocks(bodyHtml) {
  const blocks = [];
  const re = /<(p|ul|ol|blockquote|figure|pre|div class="post-table-wrap")\b[\s\S]*?<\/\1>|<(p|ul|ol|blockquote|figure|pre|div)\b[\s\S]*?<\/\2>/gi;
  let pos = 0;
  let bm;
  while ((bm = re.exec(bodyHtml)) !== null) {
    // capture stray text between blocks
    if (bm.index > pos) {
      const stray = bodyHtml.slice(pos, bm.index).trim();
      if (stray) blocks.push(stray);
    }
    blocks.push(bm[0]);
    pos = bm.index + bm[0].length;
  }
  if (pos < bodyHtml.length) {
    const tail = bodyHtml.slice(pos).trim();
    if (tail) blocks.push(tail);
  }
  return blocks;
}

/* ------------------------------------------------------------------ builders */

function buildHeadingHtml(heading, number) {
  const level = heading.level;
  const id = heading.id;
  const text = heading.title;
  if (level === 1) {
    return `<h1 class="ed-h1" id="${id}">${text}</h1>`;
  }
  if (level === 2) {
    const num = String(number).padStart(2, '0');
    return `<h2 class="ed-h2" id="${id}"><span class="ed-h2__num">${num}</span><span class="ed-h2__text">${text}</span></h2>`;
  }
  // h3
  return `<h3 class="ed-h3" id="${id}">${text}</h3>`;
}

function buildMetricBlock(html) {
  // Wrap metric paragraphs/items in a metrics row
  return `<div class="ed-metrics">${html}</div>`;
}

function buildPullQuote(html) {
  const text = html.replace(/<[^>]+>/g, '').trim();
  return `<blockquote class="ed-pullquote"><p>${text}</p></blockquote>`;
}

function buildComparison(html) {
  return `<div class="ed-compare">${html}</div>`;
}

function buildWarning(html) {
  return `<div class="ed-callout ed-callout--warn">${html}</div>`;
}

function buildRiskList(html) {
  return `<div class="ed-risk-list">${html}</div>`;
}

function buildCapabilityList(html) {
  return `<div class="ed-capability-list">${html}</div>`;
}

function buildImageFigure(html) {
  // Add lightbox trigger and editorial caption styling
  // Extract img tag and any existing figcaption
  const imgMatch = /<img\s[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*\/?>/.exec(html);
  if (!imgMatch) return html;
  const src = imgMatch[1];
  const alt = imgMatch[2] || '';
  const figMatch = /<figcaption>([\s\S]*?)<\/figcaption>/.exec(html);
  const caption = figMatch ? figMatch[1] : '';
  return `<figure class="ed-figure">
  <div class="ed-figure__img" data-lightbox="${src}">
    <img src="${src}" alt="${alt}" loading="lazy" decoding="async" />
    <span class="ed-figure__zoom" aria-hidden="true">+</span>
  </div>
  ${caption ? `<figcaption class="ed-figure__caption">${caption}</figcaption>` : ''}
</figure>`;
}

/* ------------------------------------------------------------------ pre-process */

/**
 * Many WeChat articles use plain-text "N、标题" as section markers instead of
 * markdown `## Title`.  Convert these into proper h2 headings before rendering
 * so the semantic pipeline can detect sections, build TOC, and auto-number.
 *
 * Match: line that starts with a digit, then 、, followed by short text (heading).
 * Only applies to standalone lines (preceded by blank line or start of text).
 */
function preprocessSectionHeadings(bodyMd) {
  const CN_NUM = '一二三四五六七八九十零百千';
  // Convert a candidate title line to an h2 unless it is implausibly long.
  const toH2 = (prefix, marker, title, suffix) => {
    const trimmed = title.trim();
    if (trimmed.length > 80) return `${prefix}${marker}${title}${suffix}`;
    return `${prefix}## ${trimmed}${suffix}`;
  };

  let result = bodyMd;

  // Pattern A: "N、标题" — Arabic numeral + Chinese enumeration comma
  result = result.replace(/(^|\n\n)(\d+)、(.+?)(\n)/g, (_, p, n, t, s) => toH2(p, `${n}、`, t, s));

  // Pattern B: "N.标题" — Arabic numeral + dot, CJK title (e.g. "7.写在最后")
  result = result.replace(/(^|\n\n)(\d+)\.(\p{Script=Han}.+?)(\n)/gmu, (_, p, n, t, s) => toH2(p, `${n}.`, t, s));

  // Pattern C: "一、标题" … "十、标题" — Chinese numeral + enumeration comma
  result = result.replace(new RegExp(`(^|\\n\\n)([${CN_NUM}]+)、(.+?)(\\n)`, 'g'), (_, p, n, t, s) => toH2(p, `${n}、`, t, s));

  // Pattern D: "（一）标题" … "（十）标题" — parenthesized Chinese numeral
  result = result.replace(new RegExp(`(^|\\n\\n)（([${CN_NUM}]+)）(.+?)(\\n)`, 'g'), (_, p, n, t, s) => toH2(p, `（${n}）`, t, s));

  return result;
}

/* ------------------------------------------------------------------ main render */

export function renderEditorial(rawMarkdown, postMeta) {
  const { meta, body: rawBody } = parseFrontMatter(rawMarkdown);

  // Pre-process: convert "N、标题" into "## 标题" for semantic section detection
  const body = preprocessSectionHeadings(rawBody);

  const html = renderMarkdown(body);
  const outline = extractOutline(html);
  const sections = splitIntoSections(html);

  // Auto-number h2 sections
  let h2Index = 0;
  const parts = [];

  for (const section of sections) {
    const heading = section.heading;

    // Always wrap content so the generic prose styles (.ed-section ...) apply
    // uniformly — including prose-only articles that have no heading at all.
    parts.push('<section class="ed-section">');

    if (heading && heading.level === 2) {
      h2Index++;
      section.number = h2Index;
      parts.push(buildHeadingHtml(heading, h2Index));
    } else if (heading) {
      parts.push(buildHeadingHtml(heading, 0));
    }

    if (section.body) {
      const blocks = splitBlocks(section.body);
      let isFirstPara = true;

      for (const block of blocks) {
        const type = classifyBlock(block);

        switch (type) {
          case 'empty':
            break;

          case 'paragraph': {
            // Strip outer <p> tags so we can re-wrap with editorial class
            const inner = block.replace(/^<p>/, '').replace(/<\/p>\s*$/, '');
            const cls = isFirstPara ? 'ed-lead' : 'ed-p';
            parts.push(`<p class="${cls}">${inner}</p>`);
            isFirstPara = false;
            break;
          }

          case 'metric':
            parts.push(buildMetricBlock(block));
            isFirstPara = false;
            break;

          case 'pullquote':
            parts.push(buildPullQuote(block));
            break;

          case 'comparison':
            parts.push(buildComparison(block));
            break;

          case 'warning':
            parts.push(buildWarning(block));
            break;

          case 'risk-list':
            parts.push(buildRiskList(block));
            break;

          case 'image':
            parts.push(buildImageFigure(block));
            break;

          case 'list': {
            const stripped = block.replace(/<[^>]+>/g, '');
            if (isCapabilityList(stripped)) {
              parts.push(buildCapabilityList(block));
            } else {
              parts.push(block);
            }
            break;
          }

          case 'code':
          case 'other':
          default:
            parts.push(block);
            break;
        }
      }
    }

    parts.push('</section>');
  }

  // Build TOC from outline (h2 + h3 with IDs)
  const toc = outline.map(item => ({
    level: item.level,
    id: item.id,
    displayText: item.text,
  }));

  // Build hero metadata
  const hero = {
    title: meta.title || postMeta.title || '',
    date: meta.date || postMeta.date || '',
    author: meta.author || postMeta.author || 'Yuan Gao',
    summary: meta.summary || postMeta.summary || '',
    categories: meta.categories || postMeta.categories || [],
    tags: meta.tags || postMeta.tags || [],
    wordCount: meta.word_count || postMeta.wordCount || 0,
    cover: meta.cover || postMeta.cover || '',
  };

  return {
    html: parts.join('\n'),
    toc,
    hero,
    meta: { ...postMeta, ...meta },
  };
}
