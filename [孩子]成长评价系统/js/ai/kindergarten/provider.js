/* =========================================================
   ai/kindergarten/provider.js — 幼儿园阶段 Provider

   职责：
   · 整合 prompt + knowledge + memory → 构建完整 system prompt
   · 封装 DeepSeek API 调用（stream / call）
   · 返回 JSON 格式响应（符合 output-schema）

   调用方式：由 educationAgent() Router 统一调配，不直接暴露给前端
   ========================================================= */
import { esc } from '../../core/utils.js';
import { buildSystemPrompt } from './prompt.js';
import { childProfileText } from '../shared/memory.js';
import { response } from '../shared/output-schema.js';
import { webSearch, searchContextBlock, needsWebSearch, extractSearchQuery } from '../shared/search.js';
import { aiApiBase } from '../../core/config.js';

/* ==== 常量 ==== */
const MODEL = 'deepseek-chat';
const DEEPSEEK_KEY = import.meta.env?.VITE_DEEPSEEK_KEY ?? '__DEEPSEEK_API_KEY__';
const DIRECT_URL = 'https://api.deepseek.com/chat/completions';

/* ==== API 调用（代理优先 → 失败直连 DeepSeek） ==== */
async function call(messages) {
  return doChat(false, messages);
}

async function stream(messages, onToken) {
  return doChat(true, messages, onToken);
}

async function doChat(streamMode, messages, onToken) {
  const payload = {
    model: MODEL,
    messages: Array.isArray(messages) ? messages : [],
    temperature: 0.6,
    max_tokens: 2000,
    stream: !!streamMode,
  };
  // 1. 尝试同源代理（本地 Node 后端 或 独立部署后端）
  const proxyBase = aiApiBase();
  if (proxyBase) {
    try {
      const res = await fetch(proxyBase + '/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        if (!streamMode) {
          const j = await res.json();
          return (j.choices?.[0]?.message?.content) || '';
        }
        await readSSE(res, onToken);
        return;
      }
    } catch (e) { /* 代理不可达，走直连 */ }
  }
  // 2. 回退：直连 DeepSeek
  const res = await fetch(DIRECT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DEEPSEEK_KEY },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = 'AI 服务暂不可用';
    try { msg = JSON.parse(text).error?.message || msg; } catch (e) { /**/ }
    throw new Error(msg);
  }
  if (!streamMode) {
    const j = await res.json();
    return (j.choices?.[0]?.message?.content) || '';
  }
  await readSSE(res, onToken);
}

async function readSSE(res, onToken) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const d = t.slice(5).trim();
        if (d === '[DONE]') return;
        try {
          const j = JSON.parse(d);
          const c = j.choices?.[0]?.delta?.content;
          if (c) onToken(c);
        } catch (e) { /**/ }
      }
    }
  } finally {
    try { reader.cancel(); } catch (e) { /**/ }
  }
}

/* =========================================================
   Provider（被 educationAgent Router 调用）
   ========================================================= */
export const KindergartenProvider = {
  name: 'kindergarten-specialist',
  stage: 'k',
  label: '幼儿发展评估专家',

  /** 构建系统消息（含实时画像） */
  async buildSystem() {
    const profile = await childProfileText();
    return { role: 'system', content: buildSystemPrompt(profile) };
  },

  /** 流式 welcome */
  async welcomeStream(onToken) {
    const sys = await this.buildSystem();
    const msgs = [sys, { role: 'user', content: '请用3–4句话向家长自我介绍：你是幼儿发展评估专家，能结合《指南》六大领域分析孩子表现并给出教养建议；并简要说明当前孩子的数据概览（若有），以及你可以帮家长做什么。输出为 JSON。' }];
    await stream(msgs, onToken);
  },

  /** 流式对话 */
  async chatStream(text, focus, snapshot, onToken) {
    const sys = await this.buildSystem();
    const userParts = [];
    if (snapshot) {
      userParts.push('【成长数据快照】阶段：' + (snapshot.stageLabel || snapshot.stage));
      if (snapshot.curAvg != null) userParts.push('综合得分率：' + Math.round(snapshot.curAvg * 100) + '%');
      if (snapshot.weak) userParts.push('最薄弱领域：' + snapshot.weak.key);
      if (snapshot.strong) userParts.push('最优势领域：' + snapshot.strong.key);
    }
    if (focus) {
      if (focus.domain) userParts.push('当前聚焦领域：' + focus.domain);
      if (focus.metric) userParts.push('当前聚焦指标：' + focus.metric);
    }
    if (text) userParts.push('用户问题：' + text);
    // 判断是否需要 Web 搜索并注入结果
    if (needsWebSearch(text)) {
      const sq = extractSearchQuery(text);
      if (sq) {
        const searchData = await webSearch(sq, 4);
        if (searchData) {
          const ctx = searchContextBlock(searchData);
          if (ctx) userParts.push(ctx);
        }
      }
    }
    const msgs = [sys, { role: 'user', content: userParts.join('\n') }];
    await stream(msgs, onToken);
  },

  /** 快捷动作 */
  async actionStream(actionId, focus, snapshot, onToken) {
    const instructions = {
      trend: '请基于提供的成长数据快照，分析孩子最近的发展趋势，指出值得关注的信号。',
      weak: '请基于数据指出当前相对薄弱的领域，给出 2–3 条具体、可操作的家园共育建议。',
      plan: '请基于薄弱点与优势，为孩子制定可落地的提升计划，包含每周可执行的小任务。',
      report: '请生成一份面向家长的简短成长综述。',
      activity: '请推荐 2–3 个结合生活的亲子活动，说明对应维度、怎么玩、观察什么。如需要也可以搜索当前季节/节日相关的幼儿活动。',
      subjects: '请结合幼小衔接视角，说明家长如何在生活中以游戏化方式为孩子进入小学打基础。',
    };
    const sys = await this.buildSystem();
    const userParts = ['【分析要求】' + (instructions[actionId] || actionId)];
    if (snapshot) {
      if (snapshot.curAvg != null) userParts.push('综合得分率：' + Math.round(snapshot.curAvg * 100) + '%');
      if (snapshot.weak) userParts.push('最薄弱：' + snapshot.weak.key);
      if (snapshot.strong) userParts.push('最优势：' + snapshot.strong.key);
    }
    // 活动推荐 → 搜索当前季节/节日
    if (actionId === 'activity') {
      const searchData = await webSearch('幼儿亲子活动 游戏 推荐 ' + new Date().getFullYear(), 3);
      if (searchData) {
        const ctx = searchContextBlock(searchData);
        if (ctx) userParts.push(ctx);
      }
    }
    const msgs = [sys, { role: 'user', content: userParts.join('\n') }];
    await stream(msgs, onToken);
  },
};
