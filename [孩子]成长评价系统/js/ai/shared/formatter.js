/* =========================================================
   ai/shared/formatter.js — JSON blocks → HTML 渲染
   前端唯一渲染层；不依赖任何具体 Agent。
   ========================================================= */
import { esc } from '../../core/utils.js';
import { BLOCK } from './output-schema.js';

/**
 * 将 Agent 返回的 {stage, blocks} 中的 blocks 渲染为 HTML
 * 同时提取 activities / indicators 列表供面板做卡片/跳转
 * @returns {{ html: string, activities: Array, indicators: Array }}
 */
export function renderBlocks(resp) {
  if (!resp || !Array.isArray(resp.blocks)) {
    return { html: esc(String(resp?.error || '返回为空')), activities: [], indicators: [] };
  }
  const activities = [], indicators = [], parts = [];
  resp.blocks.forEach((block, i) => {
    switch (block.type) {
      case BLOCK.PARAGRAPH:
        parts.push(`<p>${esc(block.text)}</p>`);
        break;
      case BLOCK.HEADING:
        parts.push(`<h${block.level || 2} class="rb-head">${esc(block.text)}</h${block.level || 2}>`);
        break;
      case BLOCK.LIST:
        parts.push(`<ul>${(block.items || []).map(it => `<li>${esc(it)}</li>`).join('')}</ul>`);
        break;
      case BLOCK.ACTIVITY:
        activities.push(block);
        parts.push(`<button class="rich-act" data-act="${esc(block.name)}" title="点击查看活动详情">🎯 ${esc(block.name || '亲子活动')}</button>`);
        break;
      case BLOCK.INDICATOR:
        indicators.push(block);
        parts.push(`<button class="rich-metric rich-ref" data-metric="${esc(block.metric)}" data-domain="${esc(block.domain)}" title="点击跳转指标页">📊 ${esc(block.metric)}${block.note ? '<span class="ref-note">' + esc(block.note) + '</span>' : ''}</button>`);
        break;
      case BLOCK.ACTION:
        parts.push(`<button class="rich-action" data-action="${esc(block.action)}" data-params="${esc(JSON.stringify(block.params || {}))}">${esc(block.label)}</button>`);
        break;
      default:
        if (block.text) parts.push(`<p>${esc(block.text)}</p>`);
    }
  });

  return { html: parts.join(''), activities, indicators };
}

/**
 * 生成文末指标卡片 HTML（与旧 rich-content 格式兼容）
 */
export function indicatorCardsHtml(indicators) {
  if (!indicators || !indicators.length) return '';
  return `<div class="metric-cards"><div class="mc-title">相关指标</div>${indicators.map(i =>
    `<button class="metric-card" data-metric="${esc(i.metric)}" data-domain="${esc(i.domain)}">${esc(i.metric)}${i.note ? '<i>' + esc(i.note) + '</i>' : ''}</button>`
  ).join('')}</div>`;
}
