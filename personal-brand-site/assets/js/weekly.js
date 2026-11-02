import { extractOutline, parseFrontMatter, renderMarkdown } from './md-render.js';

const listEl = document.querySelector('[data-weekly-list]');
const articleEl = document.querySelector('[data-weekly-article]');
const outlineEl = document.querySelector('[data-weekly-outline]');
const statusEl = document.querySelector('[data-weekly-status]');
const toastEl = document.querySelector('[data-toast]');
const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));

const catalogUrl = new URL('./data/weekly.json', import.meta.url);
const SAVE_KEY = 'gaoyuan-weekly-saved';

const state = {
  issues: [],
  filter: 'all',
  saved: loadSaved(),
  current: null,
  cache: new Map(),
};

function loadSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function persistSaved() {
  localStorage.setItem(SAVE_KEY, JSON.stringify([...state.saved]));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function setStatus(message) {
  statusEl.hidden = !message;
  statusEl.textContent = message || '';
}

let toastTimer = 0;
function toast(message) {
  toastEl.hidden = false;
  toastEl.textContent = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, 2200);
}

function issueUrl(slug) {
  return `#/${encodeURIComponent(slug)}`;
}

function currentSlug() {
  const raw = decodeURIComponent(location.hash.replace(/^#\//, ''));
  if (raw && state.issues.some((issue) => issue.slug === raw)) return raw;
  return state.issues[0] ? state.issues[0].slug : '';
}

function visibleIssues() {
  if (state.filter !== 'saved') return state.issues;
  return state.issues.filter((issue) => state.saved.has(issue.slug));
}

function bookmarkIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.2L6 20V5.5a1 1 0 0 1 1-1z"/></svg>';
}

function renderList() {
  const active = currentSlug();
  const issues = visibleIssues();
  if (!issues.length) {
    listEl.innerHTML = '<p class="wk-empty">还没有收藏。点期次右侧的书签即可留下。</p>';
    return;
  }
  listEl.innerHTML = issues.map((issue) => {
    const on = state.saved.has(issue.slug);
    return `
      <div class="wk-issue-row">
        <a class="wk-issue${issue.slug === active ? ' is-active' : ''}" href="${issueUrl(issue.slug)}">
          <span class="wk-issue__vol">${escapeHtml(issue.volume || '')}</span>
          <span class="wk-issue__period">${escapeHtml(issue.period || issue.slug)}</span>
          <span class="wk-issue__title">${escapeHtml(issue.title)}</span>
        </a>
        <button class="wk-save${on ? ' is-on' : ''}" type="button" data-save="${escapeHtml(issue.slug)}" aria-pressed="${on}" aria-label="${on ? '取消收藏' : '收藏'} ${escapeHtml(issue.volume || issue.slug)}">
          ${bookmarkIcon()}
        </button>
      </div>
    `;
  }).join('');
}

function renderOutline(items) {
  if (!items.length) {
    outlineEl.hidden = true;
    outlineEl.innerHTML = '';
    return;
  }
  outlineEl.hidden = false;
  outlineEl.innerHTML = `
    <p class="wk-outline__label">本期目录</p>
    <nav>${items.map((item) => `
      <a class="wk-outline__link" href="#${item.id}" data-outline="${item.id}">${escapeHtml(item.text)}</a>
    `).join('')}</nav>
  `;
}

function overviewText(meta, body) {
  const cut = body.search(/^#\s+(Part 2|Details)\b/m);
  const overview = (cut === -1 ? body : body.slice(0, cut)).trim();
  return [
    `# ${meta.title || '周报'}`,
    [meta.volume, meta.period].filter(Boolean).join(' · '),
    '',
    overview,
  ].join('\n');
}

function fullText(meta, body) {
  return [`# ${meta.title || '周报'}`, [meta.volume, meta.period].filter(Boolean).join(' · '), '', body.trim()].join('\n');
}

async function copyText(text, ok) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-999px';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast(ok);
}

function downloadMarkdown(meta, body) {
  const blob = new Blob([fullText(meta, body)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${meta.slug || 'weekly'}-战略研判周报.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast('已开始下载 Markdown');
}

function toggleSave(slug) {
  if (state.saved.has(slug)) state.saved.delete(slug);
  else state.saved.add(slug);
  persistSaved();
  renderList();
  const button = articleEl.querySelector('[data-action="save"]');
  if (button && state.current && state.current.meta.slug === slug) syncSaveButton(button);
  toast(state.saved.has(slug) ? '已收藏这一期' : '已从收藏移除');
}

function syncSaveButton(button) {
  const on = state.saved.has(state.current.meta.slug);
  button.classList.toggle('is-on', on);
  button.setAttribute('aria-pressed', String(on));
  button.querySelector('span').textContent = on ? '已收藏' : '收藏本期';
}

async function openIssue(issue) {
  setStatus(state.cache.has(issue.slug) ? '' : '正在打开这一期…');
  let packed = state.cache.get(issue.slug);
  if (!packed) {
    const response = await fetch(new URL(`../../${issue.markdown}`, import.meta.url));
    if (!response.ok) throw new Error(`找不到 ${issue.markdown}`);
    const { meta, body } = parseFrontMatter(await response.text());
    packed = { meta: { ...issue, ...meta }, body, html: renderMarkdown(body) };
    state.cache.set(issue.slug, packed);
  }
  state.current = packed;
  const { meta, html } = packed;
  const saved = state.saved.has(meta.slug);
  articleEl.innerHTML = `
    <header class="wk-hero">
      <p class="wk-hero__vol">${escapeHtml(meta.volume || '')}</p>
      <h1>${escapeHtml(meta.title || '')}</h1>
      <p class="wk-hero__period">${escapeHtml(meta.period || '')}</p>
      <p class="wk-hero__summary">${escapeHtml(meta.summary || '')}</p>
      ${meta.subjects ? `<p class="wk-hero__subjects">${escapeHtml(meta.subjects)}</p>` : ''}
      <div class="wk-tools" aria-label="本期操作">
        <button class="wk-tool${saved ? ' is-on' : ''}" type="button" data-action="save" aria-pressed="${saved}">${bookmarkIcon()}<span>${saved ? '已收藏' : '收藏本期'}</span></button>
        <button class="wk-tool" type="button" data-action="copy-overview">复制概览</button>
        <button class="wk-tool" type="button" data-action="copy-all">复制全文</button>
        <button class="wk-tool" type="button" data-action="download">下载 Markdown</button>
        <button class="wk-tool" type="button" data-action="print">打印</button>
      </div>
    </header>
    <div class="wk-body">${html}</div>
  `;
  renderOutline(extractOutline(html).filter((item) => item.level === 2));
  setStatus('');
  document.title = `${meta.title || issue.title} · 周报`;
}

function setFilter(next) {
  state.filter = next;
  for (const button of filterButtons) {
    const on = button.dataset.filter === next;
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
  }
  renderList();
}

async function boot() {
  const response = await fetch(catalogUrl);
  if (!response.ok) throw new Error('周报目录读取失败');
  const data = await response.json();
  state.issues = data.issues || [];
  if (!state.issues.length) {
    setStatus('目录里还没有周报。');
    return;
  }

  const show = async () => {
    renderList();
    const issue = state.issues.find((item) => item.slug === currentSlug());
    if (issue) await openIssue(issue);
  };

  document.addEventListener('click', (event) => {
    const outline = event.target.closest('[data-outline]');
    if (outline) {
      event.preventDefault();
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById(outline.dataset.outline)?.scrollIntoView({
        behavior: reduce ? 'auto' : 'smooth',
        block: 'start',
      });
      return;
    }
    const save = event.target.closest('[data-save]');
    if (save) {
      toggleSave(save.dataset.save);
      return;
    }
    const filter = event.target.closest('[data-filter]');
    if (filter) {
      setFilter(filter.dataset.filter);
      return;
    }
    const action = event.target.closest('[data-action]');
    if (!action || !state.current) return;
    const { meta, body } = state.current;
    if (action.dataset.action === 'save') toggleSave(meta.slug);
    if (action.dataset.action === 'copy-overview') copyText(overviewText(meta, body), '已复制概览，可直接发到群里');
    if (action.dataset.action === 'copy-all') copyText(fullText(meta, body), '已复制全文');
    if (action.dataset.action === 'download') downloadMarkdown(meta, body);
    if (action.dataset.action === 'print') window.print();
  });

  window.addEventListener('hashchange', () => {
    show().catch((err) => setStatus(err.message));
  });
  if (!location.hash) history.replaceState(null, '', issueUrl(state.issues[0].slug));
  await show();
}

boot().catch((err) => setStatus(err.message || '这一期没有打开。'));
