/* =========================================================
   ai/provider-registry.js — AI Provider 注册与路由
   所有 AI 能力实现（本地规则 / 云端 LLM / 未来更多）都在此注册。
   pick() 负责按可用性选择 Provider，天然支持「云端不可用 → 本地降级」。
   ========================================================= */

const providers = [];

export const ProviderRegistry = {
  /** 注册一个 Provider（实现 IAIProvider）。返回该 Provider 便于链式。 */
  register(p) { if (p && !providers.includes(p)) providers.push(p); return p; },
  /** 全部已注册 Provider */
  list() { return providers.slice(); },
  /**
   * 选择可用 Provider：优先「阶段匹配且就绪」的 Provider（如 deepseek-k / deepseek-p）；
   * 否则回落到本地规则（name==='rule'）；再否则返回任一就绪者。
   * @param {string} stage 当前阶段 'k' | 'p'
   */
  pick(stage) {
    const ready = providers.filter(p => { try { return !!p.ready; } catch (e) { return false; } });
    const staged = ready.find(p => p.stage === stage);
    if (staged) return staged;
    const rule = ready.find(p => p.name === 'rule') || ready.find(p => !p.stage);
    return rule || ready[0] || null;
  }
};
