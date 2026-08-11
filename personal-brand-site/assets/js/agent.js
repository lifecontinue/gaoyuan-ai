/* agent.js — Agent 流式输出聚合页
 *
 * 把「个人简介 / Writing 作品展示」整合成一条连续的 Agent 输出流：
 * · 逐条吐出消息（打字机 + 气泡淡入）
 * · 精选文章卡片逐张流式出现（触发提示音）
 * · 产品/作品网格逐张出现
 * · 背景与音效复用 writing 页的 northgarden 资源（audio-ambience.js）
 * · 尊重 prefers-reduced-motion：直接呈现，不做动画与逐字
 */

import { initAudio, playChime } from './audio-ambience.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const POSTS_URL = 'assets/js/data/posts.json';

/* 精选文章（来自真实 37 篇中的代表主题，与 about.html 对应） */
const FEATURED_SLUGS = [
  '2026-07-31-从shadowing到AI接管-我们如何通过automation重塑组织架构和增效。',
  '2026-07-25-当界面开始消失：从OpenAI-Realtime到新一代-VoiceAI的实践与判断',
  '2026-07-24-Human-in-the-Loop-产品的构建复盘',
  '2025-04-14-用AI拆解孩子作业后，发现提升学习效率的秘密！家长必看攻略',
  '2025-01-26-如何搭建适合自己的AI体系',
  '2026-08-01-陪8岁孩子做游戏：Vibe-Coding-的家庭实践经验',
];

const el = {
  stream: document.querySelector('[data-agent-stream]'),
  typing: document.querySelector('[data-agent-typing]'),
  status: document.querySelector('[data-agent-status]'),
};

/* 自动滚动：用户未向上翻看时，始终让最新内容可见 */
let userScrolledUp = false;
window.addEventListener('scroll', () => {
  const nearBottom = (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 90;
  userScrolledUp = !nearBottom;
}, { passive: true });

function keepInView() {
  if (!userScrolledUp) {
    window.scrollTo({ top: document.body.scrollHeight, behavior: REDUCED ? 'auto' : 'smooth' });
  }
}

/* ---------- 数据加载 ---------- */
async function loadPosts() {
  const resp = await fetch(POSTS_URL, { cache: 'no-cache' });
  if (!resp.ok) throw new Error(`文章索引加载失败（HTTP ${resp.status}）`);
  const data = await resp.json();
  return (data.posts || []).filter((p) => !p.archived);
}

/* ---------- DOM 构建辅助 ---------- */
function buildMsg(withName = true) {
  const msg = document.createElement('div');
  msg.className = 'agent-msg';

  const avatar = document.createElement('span');
  avatar.className = 'agent-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>';

  const bubble = document.createElement('div');
  bubble.className = 'agent-bubble';
  if (withName) {
    const name = document.createElement('span');
    name.className = 'agent-bubble__name';
    name.textContent = 'AI 助手';
    bubble.appendChild(name);
  }

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  return { msg, bubble };
}

function showTyping() {
  if (REDUCED) return;
  el.typing.hidden = false;
  requestAnimationFrame(() => el.typing.classList.add('show'));
}
function hideTyping() {
  el.typing.classList.remove('show');
  el.typing.hidden = true;
}

/* 逐字打字（带回车不拆词，中文按字） */
async function typeInto(target, text, speed = 24) {
  if (REDUCED) {
    target.textContent = text;
    return;
  }
  target.textContent = '';
  const caret = document.createElement('span');
  caret.className = 'agent-caret';
  target.appendChild(caret);
  for (let i = 0; i < text.length; i++) {
    caret.insertAdjacentText('beforebegin', text[i]);
    if (i % 2 === 0) keepInView();
    await wait(speed + Math.random() * speed * 0.5);
  }
  caret.remove();
}

/* ---------- 消息类型 ---------- */

/* 打字机文本消息 */
async function agentTyped(text, { preDelay = 260 } = {}) {
  showTyping();
  await wait(preDelay);
  hideTyping();

  const { msg, bubble } = buildMsg();
  const p = document.createElement('p');
  bubble.appendChild(p);
  el.stream.appendChild(msg);
  await wait(REDUCED ? 0 : 180);
  msg.classList.add('in');
  keepInView();
  await typeInto(p, text);
  keepInView();
}

/* 即时气泡（HTML 内容） */
async function agentBubble(html, { preDelay = 420 } = {}) {
  if (!REDUCED) {
    showTyping();
    await wait(REDUCED ? 0 : 360);
    hideTyping();
  }
  await wait(preDelay);
  const { msg, bubble } = buildMsg();
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  while (wrap.firstChild) bubble.appendChild(wrap.firstChild);
  el.stream.appendChild(msg);
  await wait(REDUCED ? 0 : 200);
  msg.classList.add('in');
  keepInView();
}

/* 精选文章卡片逐张流式出现 */
async function agentCards(posts) {
  if (!REDUCED) {
    showTyping();
    await wait(360);
    hideTyping();
  }
  const { msg, bubble } = buildMsg();
  const intro = document.createElement('p');
  intro.className = 'agent-cards-intro';
  intro.textContent = `我为你精选了 ${posts.length} 篇 👇`;
  bubble.appendChild(intro);

  const grid = document.createElement('div');
  grid.className = 'agent-cards';
  bubble.appendChild(grid);
  el.stream.appendChild(msg);
  await wait(REDUCED ? 0 : 220);
  msg.classList.add('in');
  keepInView();

  for (const post of posts) {
    const card = renderArticleCard(post);
    grid.appendChild(card);
    await wait(REDUCED ? 0 : 120);
    card.classList.add('in');
    playChime();
    keepInView();
    await wait(REDUCED ? 0 : 360);
  }
}

function renderArticleCard(post) {
  const card = document.createElement('a');
  card.className = 'agent-card';
  card.href = `essay.html#/p/${encodeURIComponent(post.slug)}`;
  const date = (post.date || '').slice(0, 10);
  const tags = (post.tags || []).slice(0, 3)
    .map((t) => `<span class="agent-card__tag">${escapeHtml(t)}</span>`).join('');
  card.innerHTML = `
    <h3 class="agent-card__title">${escapeHtml(post.title)}</h3>
    ${post.summary ? `<p class="agent-card__summary">${escapeHtml(post.summary)}</p>` : ''}
    <p class="agent-card__meta"><time>${escapeHtml(date)}</time><span aria-hidden="true">·</span><span>阅读</span></p>
    <div class="agent-card__tags">${tags}</div>`;
  return card;
}

/* 产品 / 作品网格逐张出现 */
async function agentProducts(apps) {
  if (!REDUCED) {
    showTyping();
    await wait(360);
    hideTyping();
  }
  const { msg, bubble } = buildMsg();
  const intro = document.createElement('p');
  intro.className = 'agent-cards-intro';
  intro.textContent = `他亲手构建的 ${apps.length} 款上线产品 👇（点开各产品官网）`;
  bubble.appendChild(intro);

  const grid = document.createElement('div');
  grid.className = 'agent-products';
  bubble.appendChild(grid);
  el.stream.appendChild(msg);
  await wait(REDUCED ? 0 : 220);
  msg.classList.add('in');
  keepInView();

  for (const app of apps) {
    const card = renderProductCard(app);
    grid.appendChild(card);
    await wait(REDUCED ? 0 : 120);
    card.classList.add('in');
    playChime();
    keepInView();
    await wait(REDUCED ? 0 : 300);
  }
}

function renderProductCard(app) {
  const card = document.createElement('a');
  card.className = 'agent-product';
  card.href = app.url || 'index.html';
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.innerHTML = `
    <span class="agent-product__name">${escapeHtml(app.en)}</span>
    ${app.name ? `<span class="agent-product__en">${escapeHtml(app.name)}</span>` : ''}
    <p class="agent-product__tagline">${escapeHtml(app.tagline || app.desc || '')}</p>`;
  return card;
}

/* ---------- 工具 ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- 编排 ---------- */
async function run() {
  initAudio();

  let posts = [];
  try {
    posts = await loadPosts();
  } catch (err) {
    if (el.status) {
      el.status.textContent = `${err.message} —— 请先运行采集脚本生成 posts.json。`;
      el.status.hidden = false;
    }
  }

  const { apps } = await import('./data/apps.js');
  const featured = FEATURED_SLUGS
    .map((s) => posts.find((p) => p.slug === s))
    .filter(Boolean);
  const recommended = featured.length ? featured : posts.slice(0, 6);

  /* 1. 打招呼 */
  await agentTyped('嗨，我是gaoyuan的 AI 助手。下面我用一条时间线，把关于他、他做的产品与写作，按你最可能想知道的顺序讲给你听。');

  /* 2. 个人简介 */
  await agentTyped('先说人：gaoyuan（Yuan Gao），一名 AI 产品经理，专注把大模型能力做成产品——覆盖 LLM 产品化、RAG、多模态 AI、RPA+LLM 自动化与 human-in-the-loop 系统，并构建育儿、教育与游戏方向的消费级应用。');

  /* 3. 过渡到写作推荐 */
  await agentTyped('他常写两类东西：AI 产品方法论，以及把 AI 能力产品化的底层思考。下面几篇是他反复写、也最有把握的主题。');

  /* 4. 精选文章卡片（逐张流式 + 提示音） */
  await agentCards(recommended);

  /* 5. 过渡到产品 */
  await agentTyped('除了写作，他还亲手做了 8 款上线产品，横跨游戏、育儿教育、生产力与身心健康。');

  /* 6. 产品网格（逐张流式 + 提示音） */
  await agentProducts(apps);

  /* 7. 收尾引导 */
  await agentBubble(`
    <p>想看全部 37 篇文章？<a href="essay.html">打开 Writing 存档 →</a></p>
    <p>想逐一点开体验 8 款产品？<a href="index.html">回到沉浸式书房 →</a></p>
  `);
}

run();
