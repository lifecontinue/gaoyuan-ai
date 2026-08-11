/* =========================================================
   ui/router.js — 应用路由与顶层编排
   星图节点点击 / 全局菜单 / 阶段切换 / 顶栏与图例刷新。
   依赖 detail-views / side-panel / search / galaxy（单向，无环）。
   通过 bus 订阅 'app/refresh-side' 响应数据变更后的顶栏刷新。
   ========================================================= */
import { $, $$, esc } from '../core/utils.js';
import { subjectColorHex, MENU_TITLES } from '../core/config.js';
import { state } from '../core/state.js';
import { bus } from '../core/event-bus.js';
import { D, STAGES, allPeriods, latestFull, rowsOf } from '../domain/growth.js';
import { SUBJS } from '../domain/subjects.js';
import { Store } from '../data/store.js';
import { Galaxy } from '../viz/galaxy.js';
import { Side } from './side-panel.js';
import { renderCenter, renderDomain, renderSubdomain, renderIndicator, renderSubject, renderTheme, renderSubjects, renderParent, renderSummaryList, renderData, renderAbout, renderPrimaryIndicator } from './detail-views.js';
import { buildSearchIndex } from './search.js';

/* ---------- 星图节点点击路由 ---------- */
export function openNode(node) {
  if (Galaxy) Galaxy.focusNode(node.label);
  if (node.kind === 'center') return renderCenter(node);
  if (node.kind === 'domain') return renderDomain(node.domainKey);
  if (node.kind === 'subject') { const si = +String(node.id).split('-')[1]; return renderSubject(si); }
  if (node.kind === 'subdomain') return renderSubdomain(node.domainKey, node.data.subdomain, node.data.rows);
  if (node.kind === 'theme') { const p = String(node.id).split('-'); return renderSubject(+p[1], +p[2]); }
  if (node.kind === 'indicator') return renderIndicator(node.domainKey, node.data.s, node.data);
  if (node.kind === 'pindicator') { const p = String(node.id).split('-'); return renderPrimaryIndicator(+p[1], +p[2], +p[3]); }
}

/* ---------- 全局菜单 ---------- */
export function openMenu(type) {
  bus.emit('ai/context', { menu: MENU_TITLES[type] || type });
  if (type === 'summary') return renderSummaryList();
  if (type === 'parent') return renderParent('notes');
  if (type === 'subjects') return renderSubjects();
  if (type === 'data') return renderData();
  if (type === 'about') return renderAbout();
}

/* ---------- 下钻便捷入口（供 window.TT 与搜索复用） ---------- */
export function openDomain(k) { renderDomain(k); }
export function openSub(d, s) { const rows = (latestFull() ? rowsOf(latestFull()).filter(r => r.d === d && r.s === s) : []); renderSubdomain(d, s, rows); }
export function openSubject(i) { renderSubject(i); }

/* ---------- 阶段切换 ---------- */
export function setStage(st) {
  if (!STAGES[st]) st = 'k';
  state.stage = st;
  try { Store.s.settings.lastStage = st; Store.save(); } catch (e) {}
  $$('#galStage button').forEach(b => b.classList.toggle('on', b.dataset.stage === st));
  updateStageLiquid(st);
  buildSearchIndex();
  refreshSide();
  bus.emit('ai/context', { domain: null, metric: null, menu: null });
  if (Galaxy && Galaxy.active) Galaxy.enter(st);
  bus.emit('stage/changed', { stage: st });
}

/** 拟水态背景 blob 跟随选中按钮移动（SVG goo filter 负责液体边缘融合） */
export function updateStageLiquid(st) {
  const wrap = $('#galStage'); if (!wrap) return;
  const target = wrap.querySelector(`button[data-stage="${st}"]`); if (!target) return;
  const liquid = wrap.querySelector('.stage-liquid'); if (!liquid) return;
  const pad = parseFloat(getComputedStyle(wrap).paddingLeft) || 0;
  const left = target.offsetLeft - pad;
  const width = target.offsetWidth;
  liquid.classList.add('moving');
  liquid.style.transform = `translateX(${left}px)`;
  liquid.style.width = `${width}px`;
  liquid.style.opacity = '1';
  if (liquid._t) clearTimeout(liquid._t);
  liquid._t = setTimeout(() => liquid.classList.remove('moving'), 540);
}

/** 初始化时根据当前 stage 定位 blob，防止页面加载后无背景 */
export function initStageLiquid() { updateStageLiquid(state.stage || 'k'); }

/* ---------- 顶栏 + HUD + 图例刷新 ---------- */
export function refreshSide() {
  const ps = allPeriods();
  const lab = (STAGES[state.stage] || {}).label || state.stage;
  $('#tbStageLabel').textContent = state.stage === 'k' ? '幼儿园阶段 · 六大领域' : '小学阶段 · 三年级九大学科';
  const indCount = ps.reduce((a, p) => a + (p.indicatorCount || 0), 0);
  $('#galHud').innerHTML = `<span>阶段</span> <b>${esc(lab)}</b><br><span>期次</span> <b>${ps.length}</b> · <span>指标</span> <b>${indCount}</b>`;
  const legend = $('#galLegend');
  if (state.stage === 'k') {
    legend.innerHTML = '<div style="color:var(--txt-dim);margin-bottom:4px">六大领域</div>' + D.domains.map(d => `<div class="lg"><span class="dot" style="background:${d.color}"></span>${esc(d.key)}</div>`).join('');
  } else {
    legend.innerHTML = '<div style="color:var(--txt-dim);margin-bottom:4px">九大学科</div>' + SUBJS.map(s => `<div class="lg"><span class="dot" style="background:${subjectColorHex(s.id)}"></span>${esc(s.name)}</div>`).join('');
  }
}

/* ---------- 菜单开合 ---------- */
export function closeMenuMask() { $('#menuMask').classList.remove('show'); $('#menu').classList.remove('open'); }
export function closeMenu() { closeMenuMask(); Side.hide(); }

/* 数据变更后刷新顶栏（detail-views 通过 bus 触发） */
bus.on('app/refresh-side', () => refreshSide());
