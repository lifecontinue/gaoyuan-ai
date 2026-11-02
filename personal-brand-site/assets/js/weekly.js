import { extractOutline, parseFrontMatter, renderMarkdown } from './md-render.js';

const listEl = document.querySelector('[data-weekly-list]');
const articleEl = document.querySelector('[data-weekly-article]');
const outlineEl = document.querySelector('[data-weekly-outline]');
const statusEl = document.querySelector('[data-weekly-status]');

const catalogUrl = new URL('./data/weekly.json', import.meta.url);

function setStatus(message) {
  statusEl.hidden = !message;
  statusEl.textContent = message || '';
}

function issueUrl(slug) {
  return `#/${encodeURIComponent(slug)}`;
}

function currentSlug(issues) {
  const raw = decodeURIComponent(location.hash.replace(/^#\//, ''));
  if (raw && issues.some((issue) => issue.slug === raw)) return raw;
  return issues[0] ? issues[0].slug : '';
}

function renderList(issues, active) {
  listEl.innerHTML = issues.map((issue) => `
    <a class="wk-issue${issue.slug === active ? ' is-active' : ''}" href="${issueUrl(issue.slug)}">
      <span class="wk-issue__vol">${issue.volume || ''}</span>
      <span class="wk-issue__period">${issue.period || issue.slug}</span>
      <span class="wk-issue__title">${issue.title}</span>
    </a>
  `).join('');
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
      <a class="wk-outline__link${item.level === 3 ? ' is-sub' : ''}" href="#${item.id}" data-outline="${item.id}">${item.text}</a>
    `).join('')}</nav>
  `;
}

async function openIssue(issue) {
  setStatus('正在打开这一期…');
  const response = await fetch(new URL(`../../${issue.markdown}`, import.meta.url));
  if (!response.ok) throw new Error(`找不到 ${issue.markdown}`);
  const { meta, body } = parseFrontMatter(await response.text());
  const html = renderMarkdown(body);
  articleEl.innerHTML = `
    <header class="wk-hero">
      <p class="wk-hero__vol">${meta.volume || issue.volume || ''}</p>
      <h1>${meta.title || issue.title}</h1>
      <p class="wk-hero__period">${meta.period || issue.period || ''}</p>
      <p class="wk-hero__summary">${meta.summary || issue.summary || ''}</p>
      ${meta.subjects ? `<p class="wk-hero__subjects">${meta.subjects}</p>` : ''}
    </header>
    <div class="wk-body">${html}</div>
  `;
  renderOutline(extractOutline(html).filter((item) => item.level === 2));
  setStatus('');
  document.title = `${meta.title || issue.title} · 周报`;
}

async function boot() {
  try {
    const response = await fetch(catalogUrl);
    if (!response.ok) throw new Error('周报目录读取失败');
    const data = await response.json();
    const issues = data.issues || [];
    if (!issues.length) {
      setStatus('目录里还没有周报。');
      return;
    }
    const show = () => {
      const slug = currentSlug(issues);
      renderList(issues, slug);
      const issue = issues.find((item) => item.slug === slug);
      return openIssue(issue);
    };
    document.addEventListener('click', (event) => {
      const link = event.target.closest('[data-outline]');
      if (!link) return;
      event.preventDefault();
      document.getElementById(link.dataset.outline)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    window.addEventListener('hashchange', () => {
      show().catch((err) => setStatus(err.message));
    });
    if (!location.hash) history.replaceState(null, '', issueUrl(issues[0].slug));
    await show();
  } catch (err) {
    setStatus(err.message || '这一期没有打开。');
  }
}

boot();
