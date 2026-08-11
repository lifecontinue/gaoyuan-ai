/* =========================================================
   ai/providers/llm-provider.js — 云端 LLM Provider（可配置 · 默认关闭）
   实现 IAIProvider 的占位实现：演示「新增 AI 能力 = 新增 Provider」的接入方式。
   - 默认 ready=false（未配置 API），ProviderRegistry.pick() 会自动跳过它，
     从而回落到本地规则（RuleProvider），不影响任何现有功能。
   - 将来接入真实模型（OpenAI / 腾讯云 / 微信等）时：
     1) 在 config 注入 apiKey/endpoint（不要硬编码进仓库）；
     2) 实现 _call() 发起请求；
     3) 用 PromptRegistry.get(intent) + ContextBuilder 快照拼装 prompt。
   ========================================================= */
import { PromptRegistry } from '../prompt-registry.js';
import { esc } from '../../core/utils.js';

export function createLLMProvider(options) {
  const opts = options || {};
  return {
    name: 'llm',
    /** 未配置 endpoint/apiKey 时不可用 → 自动降级到本地规则 */
    get ready() { return !!(opts.endpoint && opts.apiKey); },

    /** 欢迎语：云端不可用时不会被调用（pick 已跳过） */
    welcome(snap) {
      return `你好，我是接入云端的成长顾问。当前数据快照已加载（${esc(snap.stageLabel)}）。`;
    },

    /** 意图分析：拼装 prompt 后调用云端（此处为占位，未真正发请求） */
    async analyze({ intent, snapshot }) {
      const prompt = PromptRegistry.get(intent);
      // TODO: const text = await this._call(prompt, snapshot);
      return { html: `（云端分析「${esc(intent)}」尚未配置 API，已回退本地规则。）` };
    },

    /** 自由问答 */
    async chat({ text }) {
      return { html: `（云端问答尚未配置 API，已回退本地规则。）` };
    },

    /** 真实的云端调用（待实现） */
    async _call(prompt, snapshot) {
      // 示例：
      // const res = await fetch(opts.endpoint, { method:'POST', headers:{ Authorization:'Bearer '+opts.apiKey, 'Content-Type':'application/json' }, body: JSON.stringify({ prompt, snapshot }) });
      // return (await res.json()).text;
      throw new Error('LLMProvider._call 未实现');
    }
  };
}
