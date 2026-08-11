import { initAudio } from './audio-ambience.js';
import { renderEditorial } from './editorial-renderer.js';

const POSTS_URL = 'assets/js/data/posts.json';
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CATEGORY_COPY = {
  'AI产品': {
    key: 'ai-product-essays',
    title: 'AI Product Essays',
    description: 'Essays on agent interfaces, AI product design, productized model capabilities, and execution patterns that move from prototypes into systems.',
  },
  '静夜思': {
    key: 'long-form-reflections',
    title: 'Long-form Reflections',
    description: 'Long-horizon reflections on work, education, family practice, AI-era thinking, and how systems reshape collaboration.',
  },
};

const EXPERIENCE = [
  {
    time: '2025.06 - Present',
    title: 'Crimson Education · AI Product Manager',
    desc: 'Building AI-native workflows, voice scenarios, automation systems, and human-in-the-loop operating models.',
  },
  {
    time: '2025.03 - 2025.05',
    title: 'Enterprise AI Transformation Consulting · Advisor',
    desc: 'Designed AI roadmaps across HR, finance, compliance, training, monitoring, and operational automation.',
  },
  {
    time: '2024.08 - 2025.02',
    title: 'Suzhou Keda · Product Manager',
    desc: 'Designed public-sector RPA + LLM products and multimodal monitoring systems for safety and service delivery.',
  },
  {
    time: '2022.09 - 2024.06',
    title: 'Suzhou Jinruiyang · Product Manager',
    desc: 'Led 0-1 interview scoring products and hardware-linked systems focused on scale, efficiency, and deployment.',
  },
  {
    time: '2017.05 - 2022.09',
    title: 'Shanghai Silaishi · Product Manager',
    desc: 'Built an education platform serving 300K+ MAU, 20M+ annual records, and 120+ schools.',
  },
  {
    time: '2015.07 - 2017.04',
    title: 'Shanghai Yinghe Education · Product Manager',
    desc: 'Built K12 classroom evaluation products spanning hardware, desktop, web reporting, and parent-facing apps.',
  },
];

const el = {
  stream: document.querySelector('[data-agent-stream]'),
  typing: document.querySelector('[data-agent-typing]'),
  status: document.querySelector('[data-writing-status]'),
  timeline: document.querySelector('[data-experience-list]'),
  navButtons: Array.from(document.querySelectorAll('[data-nav-section], [data-nav-home]')),
  chatScroll: document.querySelector('[data-chat-scroll]'),
  editorialView: document.getElementById('editorialView'),
  edHero: document.getElementById('edHero'),
  edContent: document.getElementById('edContent'),
  edTocList: document.getElementById('edTocList'),
  readingProgress: document.getElementById('readingProgress'),
  lightbox: document.getElementById('lightbox'),
};

let postsCache = [];
let userScrolledUp = false;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function keepInView() {
  const box = el.chatScroll;
  if (!box || userScrolledUp) return;
  box.scrollTo({ top: box.scrollHeight, behavior: REDUCED ? 'auto' : 'smooth' });
}

function markNav(activeKey = 'home') {
  for (const btn of el.navButtons) {
    const isHome = btn.hasAttribute('data-nav-home');
    const key = btn.getAttribute('data-nav-section');
    const active = (activeKey === 'home' && isHome) || key === activeKey;
    btn.classList.toggle('is-active', active);
  }
}

function showTyping() {
  if (REDUCED || !el.typing) return;
  el.typing.hidden = false;
  requestAnimationFrame(() => el.typing.classList.add('show'));
}

function hideTyping() {
  if (!el.typing) return;
  el.typing.classList.remove('show');
  el.typing.hidden = true;
}

function buildMsg(withName = true) {
  const msg = document.createElement('div');
  msg.className = 'wr-agent-msg';

  const avatar = document.createElement('span');
  avatar.className = 'wr-agent-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>';

  const bubble = document.createElement('div');
  bubble.className = 'wr-agent-bubble';
  if (withName) {
    const name = document.createElement('span');
    name.className = 'wr-agent-bubble__name';
    name.textContent = 'Assistant';
    bubble.appendChild(name);
  }

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  return { msg, bubble };
}

async function typeInto(target, text, speed = 13) {
  if (REDUCED) {
    target.textContent = text;
    return;
  }
  target.textContent = '';
  const caret = document.createElement('span');
  caret.className = 'wr-agent-caret';
  target.appendChild(caret);
  for (let i = 0; i < text.length; i++) {
    caret.insertAdjacentText('beforebegin', text[i]);
    if (i % 3 === 0) keepInView();
    await wait(speed + Math.random() * 8);
  }
  caret.remove();
}

async function agentTyped(text, { preDelay = 180 } = {}) {
  showTyping();
  await wait(preDelay);
  hideTyping();
  const { msg, bubble } = buildMsg();
  const p = document.createElement('p');
  bubble.appendChild(p);
  el.stream.appendChild(msg);
  await wait(REDUCED ? 0 : 60);
  msg.classList.add('in');
  keepInView();
  await typeInto(p, text);
}

async function agentBubble(html, { preDelay = 160 } = {}) {
  showTyping();
  await wait(preDelay);
  hideTyping();
  const { msg, bubble } = buildMsg();
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  while (wrap.firstChild) bubble.appendChild(wrap.firstChild);
  el.stream.appendChild(msg);
  await wait(REDUCED ? 0 : 60);
  msg.classList.add('in');
  keepInView();
}

async function loadPosts() {
  const resp = await fetch(POSTS_URL);
  if (!resp.ok) throw new Error(`Failed to load article index (HTTP ${resp.status})`);
  const data = await resp.json();
  const posts = (data.posts || []).filter((p) => !p.archived);
  return posts;
}

function groupPosts(posts) {
  const map = new Map();
  for (const post of posts) {
    const category = (post.categories && post.categories[0]) || 'Uncategorized';
    if (!map.has(category)) map.set(category, []);
    map.get(category).push(post);
  }
  return map;
}

const MAX_PER_GROUP = 7;

function renderCategoryGroup(category, posts) {
  const visible = posts.slice(0, MAX_PER_GROUP);
  const copy = CATEGORY_COPY[category] || {
    key: category.toLowerCase().replace(/\s+/g, '-'),
    title: category,
    description: 'A cluster of related essays and working notes.',
  };

  const section = document.createElement('section');
  section.className = 'wr-agent-group';
  section.id = copy.key;
  const cards = document.createElement('div');
  cards.className = 'wr-agent-cards';
  section.appendChild(cards);

  for (const post of visible) {
    const cover = post.cover ? `<img class="wr-agent-card__cover" src="${escapeHtml(post.cover)}" alt="" loading="lazy" />` : '';
    const tags = (post.tags || []).slice(0, 2).map((tag) => `<span class="wr-agent-card__tag">${escapeHtml(tag)}</span>`).join('');
    const card = document.createElement('a');
    card.className = 'wr-agent-card';
    card.href = `#/p/${encodeURIComponent(post.slug)}`;
    card.innerHTML = `
      ${cover}
      <div class="wr-agent-card__body">
        <h4 class="wr-agent-card__title">${escapeHtml(post.title)}</h4>
        <p class="wr-agent-card__meta"><time>${escapeHtml(formatDate(post.date))}</time></p>
        <div class="wr-agent-card__tags">${tags}</div>
      </div>
    `;
    cards.appendChild(card);
  }

  return section;
}

async function renderOverview(posts) {
  el.stream.innerHTML = '';
  markNav('home');
  await agentTyped('Hi. I am an assistant interface for Yuan Gao — his writing, organized by category, in one place.');

  await agentBubble(`
    <p class="wr-agent-lead">Yuan works as an <span class="wr-agent-key">AI Product Manager</span>. This archive is built around one question:</p>
    <p class="wr-agent-question">How do you turn <span class="wr-agent-key">raw model capability</span> into a product that actually ships — and survives contact with real operations?</p>

    <p class="wr-agent-lead">The throughline: AI products are not features bolted onto an old workflow. They are <span class="wr-agent-key">new operating models</span>.</p>

    <ul class="wr-agent-list">
      <li><span class="wr-agent-key">Agent interfaces</span> that keep a human in the loop</li>
      <li><span class="wr-agent-key">Voice &amp; automation</span> scenarios that compress cycle time</li>
      <li><span class="wr-agent-key">Execution patterns</span> that move a prototype into a system people rely on daily</li>
    </ul>

    <p class="wr-agent-lead">Less interested in demos. More interested in <span class="wr-agent-key">instrumentation, guardrails, and the boring plumbing</span> that makes an LLM behave predictably at scale.</p>

    <p class="wr-agent-lead">The work spans:</p>
    <ul class="wr-agent-list">
      <li>Education platforms serving hundreds of thousands of users</li>
      <li>Public-sector RPA + multimodal monitoring</li>
      <li>Enterprise AI transformation across <span class="wr-agent-key">HR, finance, compliance, and training</span></li>
    </ul>

    <p class="wr-agent-lead">Below, the writing is grouped into two threads — <span class="wr-agent-key">AI Product Essays</span> and <span class="wr-agent-key">Long-form Reflections</span> — so you can open any thread directly without jumping between pages.</p>
  `);

  const groups = groupPosts(posts);
  for (const [category, items] of groups.entries()) {
    const copy = CATEGORY_COPY[category] || {
      key: category.toLowerCase().replace(/\s+/g, '-'),
      title: category,
      description: 'A cluster of related essays and working notes.',
    };
    await agentBubble(`
      <p class="wr-agent-cards-intro">${escapeHtml(copy.title)}</p>
      <p>${escapeHtml(copy.description)}</p>
    `);
    const lastMsg = el.stream.lastElementChild?.querySelector('.wr-agent-bubble');
    if (lastMsg) lastMsg.appendChild(renderCategoryGroup(category, items));
  }
}

async function renderCategoryFocus(posts, key) {
  const groups = groupPosts(posts);
  const entry = Array.from(groups.entries()).find(([category]) => {
    const copy = CATEGORY_COPY[category];
    return (copy?.key || category.toLowerCase().replace(/\s+/g, '-')) === key;
  });

  if (!entry) {
    await renderOverview(posts);
    return;
  }

  const [category, items] = entry;
  const copy = CATEGORY_COPY[category] || {
    key,
    title: category,
    description: 'A cluster of related essays and working notes.',
  };

  el.stream.innerHTML = '';
  markNav(key);
  await agentTyped(`Opening ${copy.title}.`);
  await agentBubble(`<p>${escapeHtml(copy.description)}</p>`);
  const { msg, bubble } = buildMsg();
  bubble.appendChild(renderCategoryGroup(category, items));
  el.stream.appendChild(msg);
  await wait(REDUCED ? 0 : 60);
  msg.classList.add('in');
  keepInView();
}

async function renderArticle(slug, posts) {
  const post = posts.find((p) => p.slug === slug);
  if (!post) {
    await agentBubble('<p>That article could not be found in the current archive.</p>');
    return;
  }

  const resp = await fetch(encodeURI(post.markdown));
  if (!resp.ok) {
    await agentBubble(`<p>Failed to load article content (HTTP ${resp.status}).</p>`);
    return;
  }

  const raw = await resp.text();
  const result = renderEditorial(raw, post);

  // Switch to editorial view
  hideChatView();
  showEditorialView(result, post);
}

function hideChatView() {
  if (el.stream) el.stream.innerHTML = '';
  if (el.chatScroll) el.chatScroll.style.display = 'none';
  // Hide typing indicator
  const typing = document.querySelector('[data-agent-typing]');
  if (typing) { typing.classList.remove('show'); typing.hidden = true; }
  // Mark nav inactive
  markNav('home');
}

function showEditorialView(result, post) {
  const view = el.editorialView;
  if (!view) return;

  // Build hero
  if (el.edHero) {
    const hero = result.hero;
    const cats = (hero.categories || []).slice(0, 2).map(c => `<span class="ed-hero__cat">${escapeHtml(c)}</span>`).join('');
    const obj = ' · ';
    el.edHero.innerHTML = `
      <a class="ed-hero__back" href="#/">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
        Back to overview
      </a>
      <div class="ed-hero__meta">
        ${cats}
        ${cats ? `<span class="ed-hero__sep">${obj}</span>` : ''}
        <time>${escapeHtml(formatDate(hero.date))}</time>
      </div>
      <h1 class="ed-hero__title">${escapeHtml(hero.title)}</h1>
      ${hero.summary ? `<p class="ed-hero__summary">${escapeHtml(hero.summary)}</p>` : ''}
      <div class="ed-hero__byline">
        <span>${escapeHtml(hero.author)}</span>
        ${hero.wordCount ? `<span>${Math.max(1, Math.round(hero.wordCount / 400))} min read</span>` : ''}
      </div>`;
  }

  // Content
  if (el.edContent) {
    el.edContent.innerHTML = result.html;
  }

  // TOC
  buildTOC(result.toc);

  // Scroll tracking
  bindEditorialScroll();

  // Lightbox
  setupLightbox();

  // Progress
  if (el.readingProgress) el.readingProgress.style.display = 'block';

  // Initial reveal
  requestAnimationFrame(() => {
    revealVisible();
  });

  // Show
  view.hidden = false;
  view.classList.add('is-active');
  view.scrollTop = 0;
  window.scrollTo(0, 0);
}

function buildTOC(toc) {
  if (!el.edTocList) return;
  el.edTocList.innerHTML = '';
  if (!toc || toc.length === 0) {
    el.edTocList.innerHTML = '';
    return;
  }
  for (const item of toc) {
    const a = document.createElement('a');
    a.className = 'ed-toc__item' + (item.level === 3 ? ' ed-toc__item--h3' : '');
    a.href = `#${item.id}`;
    a.textContent = item.displayText;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById(item.id);
      if (target) {
        target.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
        history.replaceState(null, '', `#${item.id}`);
      }
    });
    el.edTocList.appendChild(a);
  }
}

function bindEditorialScroll() {
  const view = el.editorialView;
  if (!view) return;
  view.addEventListener('scroll', () => {
    updateReadingProgress(view);
    updateActiveToc(view);
    revealVisible();
  }, { passive: true });
}

function updateReadingProgress(view) {
  if (!el.readingProgress) return;
  const scrollTop = view.scrollTop;
  const maxScroll = view.scrollHeight - view.clientHeight;
  if (maxScroll <= 0) { el.readingProgress.style.setProperty('--pct', '0%'); return; }
  const pct = Math.min(100, Math.round((scrollTop / maxScroll) * 100));
  el.readingProgress.style.setProperty('--pct', pct + '%');
}

function updateActiveToc(view) {
  if (!el.edTocList) return;
  const links = el.edTocList.querySelectorAll('.ed-toc__item');
  if (links.length === 0) return;
  const scrollTop = view.scrollTop + 80; // offset for sticky header area
  let activeId = null;

  // Find the last heading that has scrolled past
  for (const link of links) {
    const id = link.getAttribute('href')?.replace('#', '');
    if (!id) continue;
    const target = document.getElementById(id);
    if (!target) continue;
    if (target.getBoundingClientRect().top <= scrollTop) {
      activeId = id;
    }
  }

  for (const link of links) {
    const id = link.getAttribute('href')?.replace('#', '');
    link.classList.toggle('is-active', id === activeId);
  }
}

function revealVisible() {
  if (REDUCED) return;
  const view = el.editorialView;
  if (!view) return;
  const reveals = view.querySelectorAll('.ed-section, .ed-metrics > p, .ed-pullquote, .ed-figure, .ed-compare');
  for (const el of reveals) {
    if (el.classList.contains('is-visible')) continue;
    const rect = el.getBoundingClientRect();
    const viewH = view.clientHeight;
    if (rect.top < viewH * 0.88) {
      el.classList.add('is-visible');
    }
  }
}

function setupLightbox() {
  if (!el.lightbox) return;
  const lb = el.lightbox;
  const img = lb.querySelector('img');
  const closeBtn = lb.querySelector('.ed-lightbox__close');

  // Delegate click from editorial content
  if (el.edContent) {
    el.edContent.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-lightbox]');
      if (!trigger) return;
      const src = trigger.getAttribute('data-lightbox');
      if (!src) return;
      img.src = src;
      img.alt = trigger.querySelector('img')?.alt || '';
      lb.hidden = false;
      requestAnimationFrame(() => lb.classList.add('is-open'));
    });
  }

  function close() {
    lb.classList.remove('is-open');
    setTimeout(() => { lb.hidden = true; }, 250);
  }
  lb.addEventListener('click', (e) => {
    if (e.target === lb || e.target === closeBtn) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lb.classList.contains('is-open')) close();
  });
}

function hideEditorialView() {
  const view = el.editorialView;
  if (!view) return;
  view.classList.remove('is-active');
  view.hidden = true;
  if (el.readingProgress) {
    el.readingProgress.style.display = 'none';
    el.readingProgress.style.setProperty('--pct', '0%');
  }
  if (el.chatScroll) el.chatScroll.style.display = '';
  // Restore timeline
  renderTimeline();
}

function renderTimeline() {
  if (!el.timeline) return;
  el.timeline.innerHTML = '';

  for (const item of EXPERIENCE) {
    const sep = item.title.indexOf(' · ');
    const company = sep > -1 ? item.title.slice(0, sep) : '';
    const role = sep > -1 ? item.title.slice(sep + 3) : item.title;

    const node = document.createElement('article');
    node.className = 'wr-timeline-item';
    node.innerHTML = `
      <span class="wr-timeline-item__marker" aria-hidden="true"></span>
      <p class="wr-timeline-item__time">${escapeHtml(item.time)}</p>
      <h3 class="wr-timeline-item__role">${escapeHtml(role)}</h3>
      ${company ? `<p class="wr-timeline-item__company">${escapeHtml(company)}</p>` : ''}
      <p class="wr-timeline-item__desc">${escapeHtml(item.desc)}</p>
    `;
    el.timeline.appendChild(node);
  }
}

function bindNavigation() {
  for (const btn of el.navButtons) {
    btn.addEventListener('click', () => {
      const section = btn.getAttribute('data-nav-section');
      if (section) {
        window.location.hash = `#/section/${section}`;
      } else {
        window.location.hash = '#/';
      }
    });
  }
}

async function route() {
  const hash = window.location.hash || '#/';
  const postMatch = /^#\/p\/(.+)$/.exec(hash);
  const sectionMatch = /^#\/section\/(.+)$/.exec(hash);

  hideEditorialView();

  if (postMatch) {
    await renderArticle(decodeURIComponent(postMatch[1]), postsCache);
    return;
  }
  if (sectionMatch) {
    await renderCategoryFocus(postsCache, decodeURIComponent(sectionMatch[1]));
    return;
  }
  renderTimeline();
  await renderOverview(postsCache);
}

async function init() {
  initAudio();
  renderTimeline();
  bindNavigation();

  if (el.chatScroll) {
    el.chatScroll.addEventListener('scroll', () => {
      const nearBottom = (el.chatScroll.scrollTop + el.chatScroll.clientHeight) >= (el.chatScroll.scrollHeight - 80);
      userScrolledUp = !nearBottom;
    }, { passive: true });
  }

  try {
    postsCache = await loadPosts();
  } catch (err) {
    if (el.status) {
      el.status.textContent = `${err.message} — generate posts.json first.`;
      el.status.hidden = false;
    }
    return;
  }

  window.addEventListener('hashchange', route);
  await route();
}

init();
