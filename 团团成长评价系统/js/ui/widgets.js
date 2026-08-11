/* =========================================================
   ui/widgets.js — 通用 UI 小组件
   toast / modal / kpi / histDots 等可复用的展示件。
   依赖 core 与 domain（单向），不依赖其他 ui 模块。
   ========================================================= */
import { $, esc } from '../core/utils.js';
import { lvc } from '../core/config.js';
import { allPeriods } from '../domain/growth.js';

/** 轻提示 */
export function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200); }

/** 通用模态框 */
export function modal(title, body, footer) {
  $('#modal').innerHTML = `<h2>${title}</h2><div class="modal-body">${body}</div><div class="m-foot">${footer || ''}</div>`;
  $('#modalMask').classList.add('show');
}
export function closeModal() { $('#modalMask').classList.remove('show'); }

/** KPI 卡片 */
export function kpi(lab, val, unit, dt) { return `<div class="kpi"><div class="kpi-l">${lab}</div><div class="kpi-v">${val}<span class="kpi-u">${unit || ''}</span></div><div class="hint">${esc(dt || '')}</div></div>`; }

/** 指标历史点（跨期达标轨迹） */
export function histDots(e) {
  const ps = allPeriods().filter(p => p.indicatorCount > 0);
  return `<div class="dots">${ps.map(p => { const h = e.hist[p.id]; return `<span class="dot ${h ? lvc(h.l) : 'empty'}" title="${esc(p.name)}：${h ? esc(h.l) : '该期无此指标'}"></span>`; }).join('')}</div>`;
}
