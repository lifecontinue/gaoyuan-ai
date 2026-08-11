/* =========================================================
   ai/orchestrator.js — AI 编排器（纯逻辑，不访问 DOM）
   职责：组装上下文快照 → 按当前阶段选可用 Provider（幼儿园/小学 Agent）→
   调用 → 返回统一结果。云 Agent 不可用时自动回落本地规则 Provider。
   结果结构：{ html, navigate?: { menu }, chips?: [...] }
   新增 AI 能力：Orchestrator.registerProvider(newProvider) 即可，UI 不变。
   方法均为 async（返回 Promise），以兼容未来的异步云端 Provider。
   ========================================================= */
import { buildSnapshot } from './context-builder.js';
import { ProviderRegistry } from './provider-registry.js';
import { RuleProvider } from './providers/rule-provider.js';
/* 引入两个阶段 Agent（幼儿园 / 小学）；二者在 createDeepSeekProvider 内自注册到 ProviderRegistry。
   用「具名导入 + 显式注册保活」确保 bundler 不会因「未使用」而摇树掉模块。 */
import { DeepSeekKProvider } from './providers/deepseek-k-provider.js';
import { DeepSeekPProvider } from './providers/deepseek-p-provider.js';
ProviderRegistry.register(DeepSeekKProvider);
ProviderRegistry.register(DeepSeekPProvider);

/** 注册默认 Provider：本地规则（永远 ready，作为兜底） */
ProviderRegistry.register(RuleProvider);

/** 自由文本 → 已知意图 的轻量路由 */
const INTENT_PATTERNS = [
  { intent: 'trend',    re: /趋势|变化|走势/ },
  { intent: 'weak',     re: /薄弱|弱|问题|不足|风险/ },
  { intent: 'plan',     re: /计划|提升|改进|方案/ },
  { intent: 'report',   re: /报告|总结|综合/ },
  { intent: 'activity', re: /活动|游戏|亲子|推荐/ }
];

/**
 * 选 Provider（按阶段），并在云端调用失败时回落本地规则。
 * @param {string} stage 当前阶段
 * @param {string} method 'welcome' | 'analyze' | 'chat'
 * @param {object} args 传给 Provider 方法的参数
 */
async function runWithFallback(stage, method, args) {
  const primary = ProviderRegistry.pick(stage);
  if (!primary || primary.name === 'rule') {
    return await Promise.resolve(primary ? primary[method](args) : null);
  }
  try {
    return await primary[method](args);
  } catch (e) {
    // 云端 Agent 不可用（代理未启动 / 网络 / Key 缺失）→ 回落本地规则
    console.warn('[Orchestrator] 云端 Agent 不可用，回落本地规则：', (e && e.message) || e);
    return await Promise.resolve(RuleProvider[method](args));
  }
}

/** 流式版：优先用云端 Agent 的 stream* 方法逐字回调；失败回落本地规则（一次性返回已渲染 html）。
 *  onToken(content, isFinal)：流式增量时 isFinal 为空；回落时 isFinal=true 表示 content 已是最终 HTML。 */
async function streamWithFallback(stage, method, args, onToken) {
  const primary = ProviderRegistry.pick(stage);
  if (primary && primary.name !== 'rule' && typeof primary.stream === 'function') {
    try {
      if (method === 'welcome') await primary.streamWelcome(args, onToken);
      else if (method === 'analyze') await primary.streamAnalyze(args, onToken);
      else if (method === 'chat') await primary.streamChat(args, onToken);
      return;
    } catch (e) {
      console.warn('[Orchestrator] 云端流式失败，回落本地规则：', (e && e.message) || e);
    }
  }
  const res = await runWithFallback(stage, method, args);
  if (res && res.html) onToken(res.html, true);
}

export const Orchestrator = {
  /** 注册额外 Provider（如 main.js 注入的 LLM 配置） */
  registerProvider(p) { return ProviderRegistry.register(p); },

  /** 欢迎语 → html 字符串 */
  async welcome() {
    const snap = buildSnapshot();
    return await runWithFallback(snap.stage, 'welcome', snap);
  },

  /** 意图分析 → { html, navigate? }（focus = 当前查看的领域/指标上下文） */
  async action(intent, focus) {
    const snap = buildSnapshot();
    return await runWithFallback(snap.stage, 'analyze', { intent, snapshot: snap, focus });
  },

  /** 自由问答 → { html, navigate? }（先走已知意图路由，否则交给 Provider.chat） */
  async reply(text, focus) {
    const t = (text || '').trim(); if (!t) return { html: '' };
    const hit = INTENT_PATTERNS.find(x => x.re.test(t.toLowerCase()));
    if (hit) return this.action(hit.intent, focus);
    const snap = buildSnapshot();
    return await runWithFallback(snap.stage, 'chat', { text: t, snapshot: snap, focus });
  },

  /* ---------- 流式版（逐字回调 onToken） ---------- */
  async welcomeStream(onToken) {
    const snap = buildSnapshot();
    return await streamWithFallback(snap.stage, 'welcome', snap, onToken);
  },
  async actionStream(intent, focus, onToken) {
    const snap = buildSnapshot();
    return await streamWithFallback(snap.stage, 'analyze', { intent, snapshot: snap, focus }, onToken);
  },
  async replyStream(text, focus, onToken) {
    const t = (text || '').trim(); if (!t) { onToken('', true); return; }
    const hit = INTENT_PATTERNS.find(x => x.re.test(t.toLowerCase()));
    if (hit) return this.actionStream(hit.intent, focus, onToken);
    const snap = buildSnapshot();
    return await streamWithFallback(snap.stage, 'chat', { text: t, snapshot: snap, focus }, onToken);
  }
};
