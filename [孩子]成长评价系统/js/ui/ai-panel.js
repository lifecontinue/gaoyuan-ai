/* =========================================================
   ui/ai-panel.js — AI 面板（表现层）
   负责 AI 面板的 DOM：消息流 / 快捷动作 / 上下文条 / 输入。
   业务分析委托给 ai/orchestrator（async），本层只渲染并执行 navigate。
   通过 bus 订阅 'ai/context' 实时更新上下文。

   聊天记录持久化：存入 localStorage key tuantuan_chat_history，
   每次对话后自动保存，初始化时自动加载最近记录。
   ========================================================= */
import { $, esc } from '../core/utils.js';
import { QUICK_ACTIONS } from '../core/config.js';
import { state } from '../core/state.js';
import { bus } from '../core/event-bus.js';
import { SUBJS } from '../domain/subjects.js';
import { domLabel } from '../domain/growth.js';
import { educationAgent } from '../ai/router/education-router.js';
import { findMetricNode } from '../ai/rich-content.js';
import { getActivity } from '../data/activities.js';
import { modal } from './widgets.js';
import * as Router from './router.js';

/* =========================================================
   聊天记录持久化
   ========================================================= */
const CHAT_KEY = 'tuantuan_chat_history';
const MAX_MSGS = 200; // 每阶段最多保留条数

/** 从 localStorage 加载聊天记录 */
function loadHistory(stage) {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw);
    return (all && all[stage] ? all[stage] : []).slice(-MAX_MSGS);
  } catch (e) { return []; }
}

/** 保存聊天记录到 localStorage */
function saveHistory(stage, msgs) {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[stage] = (msgs || []).slice(-MAX_MSGS);
    localStorage.setItem(CHAT_KEY, JSON.stringify(all));
  } catch (e) { /* 静默 */ }
}

/** 清空聊天记录 */
function clearHistory() {
  try { localStorage.removeItem(CHAT_KEY); } catch (e) { /* 静默 */ }
}

/* =========================================================
   活动任务卡缓存（AI 生成一次后持久化，避免重复生成）
   ========================================================= */
const ACTIVITY_CACHE_KEY = 'tuantuan_activity_cache';
const ACTIVITY_CACHE_TTL = 30 * 24 * 3600 * 1000; // 30 天

/** 读取活动缓存（含 TTL 校验） */
function loadActivityCache(name) {
  try {
    const raw = localStorage.getItem(ACTIVITY_CACHE_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    const item = all && all[name];
    if (!item || !item.title) return null;
    if (Date.now() - (item.ts || 0) > ACTIVITY_CACHE_TTL) return null;
    return item;
  } catch (e) { return null; }
}

/** 保存活动缓存 */
function saveActivityCache(name, parsed) {
  try {
    const raw = localStorage.getItem(ACTIVITY_CACHE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[name] = Object.assign({}, parsed, { ts: Date.now() });
    // 上限 50 条，超出删除最旧
    const keys = Object.keys(all).filter(k => all[k] && all[k].title);
    if (keys.length > 50) {
      keys.sort((a, b) => (all[a].ts || 0) - (all[b].ts || 0));
      keys.slice(0, keys.length - 50).forEach(k => delete all[k]);
    }
    localStorage.setItem(ACTIVITY_CACHE_KEY, JSON.stringify(all));
  } catch (e) { /* 静默 */ }
}

/** 任务卡生成 Loading 动画 HTML（星空风格：旋转星环 + 骨架屏 + 打字点） */
function loadingTaskCardHtml(name) {
  return `
  <div class="ac-loading">
    <div class="ld-orb"><span class="ld-orb-ico">🎮</span></div>
    <div class="ld-title">正在生成「${esc(name)}」游戏任务卡<span class="ld-dots"><i></i><i></i><i></i></span></div>
    <div class="ld-sk">
      <div class="ld-sk-row lg w80"></div>
      <div class="ld-sk-row w60"></div>
      <div class="ld-sk-row w70"></div>
      <div class="ld-sk-row w45"></div>
      <div class="ld-sk-row w80"></div>
    </div>
    <div class="ld-foot">AI 正在规划在家可执行的任务步骤…</div>
  </div>`;
}

export const AIPanel = {
  messages: [],
  context: { route: 'galaxy', domain: null, metric: null, menu: null },
  quick: QUICK_ACTIONS,
  _savedLen: 0, // 上次保存时的消息条数，用于去重保存

  init() {
    bus.on('ai/context', (ctx) => this.setContext(ctx));
    bus.on('stage/changed', () => this.renderWelcomeStream());
    this.renderQuick();
    this.renderStatus();
    this._bindRichClicks();
    this.setContext({ route: 'galaxy', domain: null, metric: null, menu: null });
    // 加载历史记录；若有则显示，否则生成欢迎语
    const history = loadHistory(state.stage);
    if (history && history.length > 0) {
      this.messages = history;
      this.renderMessages();
      this.scroll();
    } else {
      this.renderWelcomeStream();
    }
  },

  /** 持久化保存（在每次消息更新后调用） */
  _persist() {
    if (this.messages.length === this._savedLen) return;
    this._savedLen = this.messages.length;
    saveHistory(state.stage, this.messages);
  },

  /** 事件委托：活动 chip → 弹窗；指标 chip / 指标卡 → 跳转指标页 */
  _bindRichClicks() {
    const out = $('#aiMessages');
    if (!out) return;
    out.addEventListener('click', (e) => {
      const act = e.target.closest('.rich-act');
      if (act) { this.openActivity(act.dataset.act); return; }
      const mc = e.target.closest('.rich-metric, .metric-card');
      if (mc) { this.openMetric(mc.dataset.metric, mc.dataset.domain); return; }
    });
  },

  /** 流式欢迎语：educationAgent 内部处理 JSON 解析 + 渲染 */
  renderWelcomeStream() {
    this.messages = [];
    this._savedLen = 0;
    saveHistory(state.stage, []);
    this.renderMessages();
    const idx = this.pushTyping();
    this._simpleStream(idx, (onHtml) => educationAgent.welcomeStream(state.stage, onHtml));
  },

  /** 简化的流式调用：agent 内部处理 JSON 解析 → HTML，一次性返回 */
  async _simpleStream(idx, streamFn) {
    try {
      await new Promise((resolve, reject) => {
        streamFn((html) => {
          this.messages[idx].html = html;
          this.messages[idx].time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
          this.renderMessages(); this.scroll();
          this._persist();
          resolve();
        });
        // 30 秒超时自救
        setTimeout(() => resolve(), 30000);
      });
    } catch (e) {
      this.messages[idx].html = '⚠️ ' + esc(String((e && e.message) || e));
      this.renderMessages(); this._persist();
    }
  },

  /** 头部状态：说明 AI 顾问由服务端代理驱动，用户免配置 Key */
  renderStatus() {
    const el = $('#aiStatusText');
    if (el) el.textContent = '云端 AI 顾问已接入 · 切换阶段自动切换专家';
  },

  /** 清空消息并以当前阶段对应 Agent 重新生成欢迎语（阶段切换时调用） */
  refreshWelcome() {
    this.renderWelcomeStream();
  },

  /** 推送一条「正在分析」占位消息，返回其索引 */
  pushTyping() {
    this.messages.push({ role: 'ai', html: '<span class="typing"><i></i><i></i><i></i>专家正在分析…</span>', time: '' });
    this.renderMessages(); this.scroll();
    return this.messages.length - 1;
  },
  /** 用最终结果替换占位消息 */
  updateMsg(idx, html) {
    if (this.messages[idx]) { this.messages[idx].html = html; this.messages[idx].time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
    this.renderMessages();
  },

  setContext(ctx) { Object.assign(this.context, ctx); const el = $('#aiContextText'); if (el) el.textContent = this.contextText(); },
  contextText() {
    const c = this.context;
    if (c.menu) return '当前：' + c.menu;
    let s = '当前：星空总览'; if (c.domain) s += ' · ' + domLabel(c.domain); if (c.metric) s += ' · ' + c.metric;
    if (state.stage === 'p' && SUBJS.length) s += ' · 三年级'; return s;
  },

  post(role, html, autoScroll = true) { this.messages.push({ role, html, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }); this.renderMessages(); if (autoScroll) this.scroll(); },
  renderMessages() { const out = $('#aiMessages'); if (!out) return; out.innerHTML = this.messages.map(m => `<div class="msg msg-${m.role}"><div class="msg-bubble">${m.html}</div><div class="msg-time">${m.time}</div></div>`).join(''); },
  renderQuick() { const out = $('#aiQuick'); if (!out) return; out.innerHTML = this.quick.map(q => `<button class="quick-chip" data-q="${esc(q.id)}"><span class="qc-dot"></span><span class="qc-tx">${esc(q.label)}</span></button>`).join(''); out.onclick = e => { const b = e.target.closest('.quick-chip'); if (b) this.action(b.dataset.q); }; },
  scroll() { const out = $('#aiMessages'); if (out) out.scrollTop = out.scrollHeight; },

  /** 快捷动作：educationAgent 按阶段路由，流式返回 JSON → HTML */
  async action(id) {
    const idx = this.pushTyping();
    await this._simpleStream(idx, (onHtml) => educationAgent.actionStream(state.stage, id, this.context, onHtml));
    const navigate = (id === 'report') ? { menu: 'summary' } : (id === 'subjects' ? { menu: 'subjects' } : null);
    if (navigate && navigate.menu) Router.openMenu(navigate.menu);
  },

  /** 自由问答：先上屏用户消息，再流式渲染 AI 结果并执行导航 */
  async reply(text) {
    const t = (text || '').trim(); if (!t) return; this.post('user', esc(t));
    const idx = this.pushTyping();
    await this._simpleStream(idx, (onHtml) => educationAgent.chatStream(state.stage, t, this.context, onHtml));
  },

  /** 点击活动 → 弹窗展示详细引导（本地库 → 缓存 → AI 生成） */
  openActivity(name) {
    const key = String(name || '').trim();
    /* 1. 内置活动库 */
    const a = getActivity(key);
    if (a) {
      const body =
        `<p class="ac-goal"><b>活动目标</b>　${esc(a.goal)}</p>` +
        `<div class="ac-sec"><b>具体做法</b><ol>${a.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>` +
        `<div class="ac-sec"><b>引导话术</b><p class="ac-talk">${esc(a.talk)}</p></div>` +
        `<div class="ac-sec"><b>注意事项</b><p>${esc(a.note)}</p></div>` +
        `<div class="ac-sec"><b>适龄提示</b><p>${esc(a.age)}</p></div>`;
      modal(esc(a.title) + ' · 亲子活动引导', body);
      return;
    }
    /* 2. 本地缓存（AI 曾生成过） */
    const cached = loadActivityCache(key);
    if (cached) {
      this._renderActivityBody(cached, key);
      return;
    }
    /* 3. 均无 → 流式生成并缓存 */
    this._streamActivityDetail(key);
  },

  /** 渲染活动详情到弹窗（AI 生成结果统一入口） */
  _renderActivityBody(p, fallbackName) {
    const body =
      `<p class="ac-goal"><b>活动目标</b>　${esc(p.goal)}</p>` +
      `<div class="ac-sec"><b>具体做法（任务卡）</b><ol>${(p.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>` +
      `<div class="ac-sec"><b>引导话术</b><p class="ac-talk">${esc(p.talk)}</p></div>` +
      `<div class="ac-sec"><b>注意事项</b><p>${esc(p.note)}</p></div>` +
      `<div class="ac-sec"><b>适龄提示</b><p>${esc(p.age)}</p></div>`;
    modal(esc(p.title || fallbackName) + ' · 亲子活动引导', body);
  },

  /** 流式生成活动详情（游戏任务式：目标 / 任务步骤 / 引导话术 / 注意事项 / 适龄） */
  async _streamActivityDetail(name) {
    const prompt =
      `请以「游戏任务卡」的活泼风格，为活动「${name}」生成详细执行方案。` +
      `必须严格使用如下 JSON 格式返回（不要 markdown 代码块、不要任何额外文字）：\n` +
      `{"title":"活动名","goal":"一句话目标","steps":["步骤1（要可在家落地）","步骤2","步骤3","步骤4"],"talk":"家长可直接用的引导话术示例","note":"注意事项","age":"适龄提示"}\n` +
      `要求：\n` +
      `· 像 App 里"任务卡"一样，步骤要具体到场景、动作、家长怎么配合；\n` +
      `· 步骤数量 3–5 条；\n` +
      `· 话术要能直接照念；\n` +
      `· 适合当前阶段（${state.stage === 'k' ? '3–6 岁幼儿' : '小学三年级'}），考虑在家中、没有专业器材的场景。`;
    /* 弹窗先以「星空生成动画」占位 */
    modal(esc(name) + ' · 亲子活动引导', loadingTaskCardHtml(name));
    try {
      const raw = await this._collectChatText(prompt);
      const parsed = this._parseActivityJson(raw, name);
      /* 生成成功 → 写入本地缓存，下次直接调用 */
      if (parsed && parsed.steps && parsed.steps.length > 0) {
        saveActivityCache(name, parsed);
      }
      this._renderActivityBody(parsed, name);
    } catch (e) {
      modal(esc(name) + ' · 亲子活动引导', '<p class="ac-talk">⚠️ 生成失败：' + esc(String((e && e.message) || e)) + '</p>');
    }
  },

  /** 收集 AI 流式返回的全文 */
  _collectChatText(prompt) {
    return new Promise((resolve, reject) => {
      let text = '';
      const onToken = (token) => { text += token; };
      try {
        educationAgent.chatStreamRaw(state.stage, prompt, this.context, onToken)
          .then(() => resolve(text))
          .catch(reject);
      } catch (e) { reject(e); }
    });
  },

  /** 从 AI 文本中尝试解析活动 JSON */
  _parseActivityJson(raw, fallbackName) {
    if (!raw) return { title: fallbackName, goal: '—', steps: [], talk: '', note: '', age: '' };
    let s = String(raw).trim();
    const m = s.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (m) s = m[1].trim();
    try {
      const obj = JSON.parse(s);
      return {
        title: obj.title || fallbackName,
        goal: obj.goal || '',
        steps: Array.isArray(obj.steps) ? obj.steps.map(String) : [],
        talk: obj.talk || '',
        note: obj.note || '',
        age: obj.age || '',
      };
    } catch (e) {
      // JSON 解析失败：把原文作为「具体做法」原样展示
      return { title: fallbackName, goal: '（AI 未按 JSON 返回，下方为原文）', steps: [s], talk: '', note: '', age: '' };
    }
  },

  /** 点击指标 → 跳转到对应指标页面 */
  openMetric(label, domainHint) {
    const node = findMetricNode(label, domainHint);
    if (!node) { modal('指标跳转', `<p class="ac-talk">未找到「${esc(label)}」对应的指标页面，可能尚未录入数据。</p>`); return; }
    Router.openNode(node);
  },

  toggle() { $('#aiPanel').classList.toggle('collapsed'); },

  /** 切换阶段时由 app.js 调用：清空并以新阶段 Agent 重新欢迎 */
  onStageChange() { this.refreshWelcome(); }
};