/* =========================================================
   ai/router/education-router.js — EducationAgent 统一入口

   === 前端只需要 import { educationAgent } ===

   职责：
   1. 接收 stage（k/p）+ intent（welcome/chat/action）+ input
   2. 按 stage 路由到对应 Specialist Agent
   3. 流式输出 raw → parse → JSON blocks
   4. 错误时回落本地规则（RuleProvider）

   目录结构：
   router/education-router.js   ← 本文件（统一入口）
   kindergarten/{provider,prompt,knowledge}.js
   primary/{provider,prompt,knowledge}.js
   shared/{output-schema,formatter,memory}.js
   ========================================================= */
import { KindergartenProvider } from '../kindergarten/provider.js';
import { PrimaryProvider } from '../primary/provider.js';
import { renderBlocks, indicatorCardsHtml } from '../shared/formatter.js';
import { response } from '../shared/output-schema.js';
import { buildSnapshot } from '../context-builder.js';
import { RuleProvider } from '../providers/rule-provider.js';

const SPECIALISTS = { k: KindergartenProvider, p: PrimaryProvider };
function getSpecialist(stage) { return SPECIALISTS[stage || 'k'] || SPECIALISTS.k; }

/** 尝试将 LLM 返回文本解析为 JSON；失败则包装为纯文本 blocks */
function parseAgentOutput(raw, stage) {
  if (!raw) return response(stage, [{ type: 'paragraph', text: '（未获得有效回复）' }]);
  // 尝试提取 JSON（LLM 可能包裹在 markdown 代码块中）
  let json = raw;
  const m = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (m) json = m[1].trim();
  try {
    const parsed = JSON.parse(json);
    if (parsed && Array.isArray(parsed.blocks)) {
      return response(parsed.stage || stage, parsed.blocks);
    }
  } catch (e) { /* 解析失败，降级为纯文本 */ }
  // 降级：把原始文本当作一个段落 block
  return response(stage, [{ type: 'paragraph', text: raw }]);
}

/* =========================================================
   公开 API：educationAgent(config)
   config: { stage?, intent, text?, focus?, snapshot? }
   返回: { html, activities, indicators, parseError? }
   ========================================================= */

export const educationAgent = {

  /** 流式欢迎语 */
  async welcomeStream(stage, onHtml) {
    const specialist = getSpecialist(stage);
    let raw = '';
    try {
      await specialist.welcomeStream((token) => {
        raw += token;
      });
      const parsed = parseAgentOutput(raw, stage);
      const rendered = renderBlocks(parsed);
      const html = rendered.html + indicatorCardsHtml(rendered.indicators);
      onHtml(html, true);
    } catch (e) {
      // 回落 RuleProvider
      try {
        const snap = buildSnapshot();
        const ruleHtml = await Promise.resolve(RuleProvider.welcome(snap));
        onHtml(ruleHtml || '欢迎使用 AI 成长顾问。', true);
      } catch (e2) {
        onHtml('⚠️ AI 服务暂不可用，请确认服务端已启动。', true);
      }
    }
  },

  /** 流式自由对话 */
  async chatStream(stage, text, focus, onHtml) {
    const specialist = getSpecialist(stage);
    let raw = '';
    try {
      await specialist.chatStream(text, focus, buildSnapshot(), (token) => {
        raw += token;
      });
      const parsed = parseAgentOutput(raw, stage);
      const rendered = renderBlocks(parsed);
      const html = rendered.html + indicatorCardsHtml(rendered.indicators);
      onHtml(html, true);
    } catch (e) {
      try {
        const ruleRes = await Promise.resolve(RuleProvider.reply(text, focus));
        onHtml(ruleRes?.html || '（无分析结果）', true);
      } catch (e2) {
        onHtml('⚠️ AI 服务暂不可用。', true);
      }
    }
  },

  /** 流式自由对话（返回原始文本，不渲染）—— 供外部工具如活动详情生成 */
  async chatStreamRaw(stage, text, focus, onToken) {
    const specialist = getSpecialist(stage);
    try {
      await specialist.chatStream(text, focus, buildSnapshot(), onToken);
    } catch (e) {
      throw e;
    }
  },

  /** 流式快捷动作 */
  async actionStream(stage, actionId, focus, onHtml) {
    const specialist = getSpecialist(stage);
    let raw = '';
    try {
      await specialist.actionStream(actionId, focus, buildSnapshot(), (token) => {
        raw += token;
      });
      const parsed = parseAgentOutput(raw, stage);
      const rendered = renderBlocks(parsed);
      const html = rendered.html + indicatorCardsHtml(rendered.indicators);
      onHtml(html, true);
    } catch (e) {
      try {
        const ruleRes = await Promise.resolve(RuleProvider.action(actionId, focus));
        onHtml(ruleRes?.html || '（无分析结果）', true);
      } catch (e2) {
        onHtml('⚠️ AI 服务暂不可用。', true);
      }
    }
  },

  /** Promise 版（兼容旧代码） */
  async welcome(stage) {
    return new Promise((resolve) => {
      this.welcomeStream(stage, (html) => resolve({ html }));
    });
  },

  async reply(stage, text, focus) {
    return new Promise((resolve) => {
      this.chatStream(stage, text, focus, (html) => resolve({ html }));
    });
  },

  async action(stage, actionId, focus) {
    return new Promise((resolve) => {
      this.actionStream(stage, actionId, focus, (html) => resolve({ html }));
    });
  },
};
