/* =========================================================
   ai/rich-content.js — AI 富文本渲染与「内联标记」解析
   把模型输出的纯文本 + 内联标记转换为可交互 HTML：
     [[活动:活动名]]        → 可点击的活动 chip（点击弹窗看详情）
     [[指标:领域>指标名]]    → 可点击的指标 chip，并在文末汇总指标卡
   其余文本做轻量 markdown（加粗 / 列表 / 分段），先做 HTML 转义防注入。
   输出：{ html, activities:[name], metrics:[{label,domainHint}] }
   另提供 metricCardsHtml() 与 findMetricNode()（按 Galaxy 节点跳转指标页）。
   ========================================================= */
import { esc } from '../core/utils.js';
import { domLabel } from '../domain/growth.js';

/** 文本 → 安全 HTML（转义 + 轻量 markdown） */
function mdLite(s) {
  let out = esc(s || '');
  out = out.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const blocks = out.split(/\n{2,}/).map(block => {
    const lines = block.split('\n');
    let inList = false, r = '';
    lines.forEach(line => {
      const m = line.match(/^[\-\*]\s+(.*)$/);
      if (m) { if (!inList) { r += '<ul>'; inList = true; } r += '<li>' + m[1] + '</li>'; }
      else { if (inList) { r += '</ul>'; inList = false; } r += (r ? '<br>' : '') + line; }
    });
    if (inList) r += '</ul>';
    return r;
  });
  return blocks.join('<br><br>');
}

/** 解析内联标记，返回渲染结果 */
export function renderRich(raw) {
  const activities = [];
  const metrics = [];
  const re = /\[\[(?:活动|指标):[^\]]+\]\]/g;
  let html = '', last = 0, m;
  while ((m = re.exec(raw))) {
    const token = m[0];
    html += mdLite(raw.slice(last, m.index));
    if (token.indexOf('[[活动:') === 0) {
      const name = token.slice(5, -2).trim();
      if (name && !activities.includes(name)) activities.push(name);
      html += `<button type="button" class="rich-act" data-act="${esc(name)}">${esc(name)}</button>`;
    } else {
      const inner = token.slice(5, -2).trim();
      const parts = inner.split('>').map(x => x.trim()).filter(Boolean);
      const label = parts[parts.length - 1];
      const domainHint = parts.length > 1 ? parts[0] : '';
      if (label && !metrics.some(x => x.label === label && x.domainHint === domainHint)) metrics.push({ label, domainHint, raw: inner });
      html += `<button type="button" class="rich-metric" data-metric="${esc(label)}" data-domain="${esc(domainHint)}">${esc(label)}</button>`;
    }
    last = m.index + token.length;
  }
  html += mdLite(raw.slice(last));
  return { html, activities, metrics };
}

/** 文末指标卡块（点击跳转到对应指标页） */
export function metricCardsHtml(metrics) {
  if (!metrics || !metrics.length) return '';
  const cards = metrics.map(mt =>
    `<button type="button" class="metric-card" data-metric="${esc(mt.label)}" data-domain="${esc(mt.domainHint)}">
       <span class="mc-ico">🎯</span>
       <span class="mc-body"><span class="mc-lab">${esc(mt.label)}</span>${mt.domainHint ? `<span class="mc-dom">${esc(mt.domainHint)}</span>` : ''}</span>
       <span class="mc-go">查看 ›</span>
     </button>`).join('');
  return `<div class="metric-cards"><div class="mc-title">相关指标</div>${cards}</div>`;
}

/** 在 Galaxy 节点中按名称解析指标节点（用于跳转），可选领域/学科提示 */
export function findMetricNode(label, domainHint) {
  const G = (typeof window !== 'undefined') ? window.Galaxy : null;
  if (!G || !G.nodes) return null;
  const norm = s => (s || '').replace(/[\s，,。\.、！!？?《》""''（）()【】\[\]]/g, '');
  const nl = norm(label);
  const cand = G.nodes.filter(x => x.kind === 'indicator' || x.kind === 'pindicator');
  // 1. 精确匹配
  let hit = cand.find(x => norm(x.label) === nl);
  // 2. 包含匹配
  if (!hit) hit = cand.find(x => nl.length > 0 && norm(x.label).includes(nl));
  if (!hit) hit = cand.find(x => nl.length > 0 && nl.includes(norm(x.label)));
  // 3. 领域/学科 + 关键词组合匹配
  if (!hit && domainHint) {
    const dh = norm(domainHint);
    hit = cand.find(x => {
      const dom = (x.domainKey && domLabel(x.domainKey)) || x.subjectLabel || x.subject || x.data?.subject || '';
      return norm(dom).includes(dh) && (norm(x.label).includes(nl) || nl.includes(norm(x.label)));
    });
  }
  // 4. 宽松匹配：label 中能匹配到至少 2 个连续字
  if (!hit && nl.length >= 2) {
    hit = cand.find(x => {
      const xl = norm(x.label);
      for (let i = 0; i <= xl.length - 2; i++) {
        if (nl.includes(xl.slice(i, i + 2))) return true;
      }
      return false;
    });
  }
  return hit || null;
}
