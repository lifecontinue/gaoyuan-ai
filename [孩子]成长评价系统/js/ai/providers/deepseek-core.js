/* =========================================================
   ai/providers/deepseek-core.js — DeepSeek 云端 Provider 公共内核
   两个阶段 Agent（幼儿园 / 小学）共用本文件的能力，仅在「系统提示 / 知识库 /
   欢迎语 / 意图映射」上不同，由 createDeepSeekProvider({...}) 注入。
   · 调用统一走服务端代理 `${AI_API_BASE}/api/ai/chat`，Key 存于服务端，前端免输入。
   · ready 恒为 true：只要代理可达即视为可用；代理不可达时由 Orchestrator 回落本地规则。
   ========================================================= */
import { esc } from '../../core/utils.js';
import { aiApiBase } from '../../core/config.js';
import { ProviderRegistry } from '../provider-registry.js';
import { getChildText } from './child-info.js';

const MODEL = 'deepseek-chat';

/** AI 代理地址：运行时按当前页面路径推断，支持子路径部署 */
function apiUrl() { return aiApiBase() + '/api/ai/chat'; }

/** 组装一个 DeepSeek Provider 实例 */
export function createDeepSeekProvider({ name, stage, systemPrompt, welcomeInstruction, intentMap }) {
  const provider = {
    name,
    stage, // 'k' | 'p' —— Orchestrator 按当前阶段择优
    get ready() { return true; },

    /** 调用服务端代理（代理再转发 DeepSeek，Key 不在前端） */
    async call(messages) {
      const res = await fetch(apiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, messages, temperature: 0.6, max_tokens: 1200, stream: false })
      });
      if (!res.ok) {
        let msg = 'AI 服务调用失败（' + res.status + '）';
        try { const j = await res.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch (e) {}
        if (res.status >= 500) msg = 'AI 服务端暂不可用，已为你切换到本地分析。';
        throw new Error(msg);
      }
      const j = await res.json();
      return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    },

    /** 流式调用：逐块解析 SSE，提取 delta.content 调用 onToken(delta)。
     *  完成时 resolve；出错 throw（由 Orchestrator 回落本地规则）。 */
    async stream(messages, onToken) {
      const res = await fetch(apiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, messages, temperature: 0.6, max_tokens: 1200, stream: true })
      });
      if (!res.ok) {
        let msg = 'AI 服务调用失败（' + res.status + '）';
        try { const j = await res.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch (e) {}
        if (res.status >= 500) msg = 'AI 服务端暂不可用，已为你切换到本地分析。';
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const events = buf.split('\n\n');
          buf = events.pop();
          for (const evt of events) {
            const lines = evt.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              const data = line.slice(5).trim();
              if (data === '[DONE]') return;
              try {
                const j = JSON.parse(data);
                const d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
                if (d) onToken(d);
              } catch (e) { /* 跳过非 JSON 行 */ }
            }
          }
        }
      } finally {
        try { reader.cancel(); } catch (e) {}
      }
    },

    /** 模型文本 → 安全 HTML（先转义，再做轻量 markdown：加粗 / 列表 / 分段） */
    mdToHtml(src) {
      let s = esc(src || '');
      s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      const blocks = s.split(/\n{2,}/).map(block => {
        const lines = block.split('\n');
        let inList = false, out = '';
        lines.forEach(line => {
          const m = line.match(/^[\-\*]\s+(.*)$/);
          if (m) { if (!inList) { out += '<ul>'; inList = true; } out += '<li>' + m[1] + '</li>'; }
          else { if (inList) { out += '</ul>'; inList = false; } out += (out ? '<br>' : '') + line; }
        });
        if (inList) out += '</ul>';
        return out;
      });
      return blocks.join('<br><br>');
    },

    focusText(focus) {
      if (!focus) return '';
      const f = [];
      if (focus.domain) f.push('当前聚焦领域：' + focus.domain);
      if (focus.metric) f.push('当前聚焦指标 / 内容：' + focus.metric);
      if (focus.menu) f.push('当前所在模块：' + focus.menu);
      return f.join('；');
    },

    snapshotText(snap) {
      if (!snap) return '';
      const p = [];
      p.push('阶段：' + (snap.stageLabel || snap.stage));
      if (snap.cur) {
        p.push('最新一期：' + snap.cur.name);
        if (snap.curAvg != null) p.push('综合得分率：' + Math.round(snap.curAvg * 100) + '%');
        if (snap.weak) p.push('当前最薄弱领域：' + snap.weak.key + (snap.weak.v != null ? '（' + Math.round(snap.weak.v * 100) + '%）' : ''));
        if (snap.strong) p.push('当前最优势领域：' + snap.strong.key);
      } else p.push('当前阶段暂无结构化测评数据');
      return p.join('；');
    },

    /** 组装 messages：system + user(分析要求 / 数据快照 / 当前上下文 / 用户问题) */
    buildMessages(userText, opts = {}) {
      const ctx = [];
      if (opts.instruction) ctx.push('【分析要求】' + opts.instruction);
      if (opts.snapshot) ctx.push('【成长数据快照】' + this.snapshotText(opts.snapshot));
      if (opts.focus) ctx.push('【当前查看上下文】' + this.focusText(opts.focus));
      let user = ctx.join('\n');
      if (userText) user += (user ? '\n\n' : '') + '用户问题：' + userText;
      return [{ role: 'system', content: systemPrompt() }, { role: 'user', content: user }];
    },

    async welcome(snap) {
      const content = await this.call(this.buildMessages('', { snapshot: snap, instruction: welcomeInstruction }));
      return this.mdToHtml(content);
    },

    async analyze({ intent, snapshot, focus }) {
      const instruction = intentMap[intent] || '请结合当前上下文给出专业分析。';
      const content = await this.call(this.buildMessages('', { snapshot, focus, instruction }));
      const navigate = (intent === 'report') ? { menu: 'summary' } : (intent === 'subjects' ? { menu: 'subjects' } : null);
      return { html: this.mdToHtml(content), navigate };
    },

    async chat({ text, snapshot, focus }) {
      const content = await this.call(this.buildMessages(text, { snapshot, focus }));
      return { html: this.mdToHtml(content) };
    },

    /** 以下三个为流式版（消息自行组装，复用 buildMessages / stream） */
    async streamWelcome(snap, onToken) {
      const messages = this.buildMessages('', { snapshot: snap, instruction: welcomeInstruction });
      await this.stream(messages, onToken);
    },
    async streamAnalyze({ intent, snapshot, focus }, onToken) {
      const instruction = intentMap[intent] || '请结合当前上下文给出专业分析。';
      const messages = this.buildMessages('', { snapshot, focus, instruction });
      await this.stream(messages, onToken);
    },
    async streamChat({ text, snapshot, focus }, onToken) {
      const messages = this.buildMessages(text, { snapshot, focus });
      await this.stream(messages, onToken);
    }
  };

  /* 自注册（Orchestrator 按阶段择优；代理可达即就绪） */
  ProviderRegistry.register(provider);
  return provider;
}

/* 供子 Provider 复用：当前被评估儿童信息文本（合并可编辑覆盖层） */
export { getChildText };
export const childInfoText = getChildText;
