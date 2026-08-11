/* =========================================================
   ui/search.js — 全局搜索服务
   跨「领域 / 子维度 / 指标 / 学科 / 主题」全文索引与即时下拉；
   命中后镜头聚焦星空节点并打开对应详情。
   通过 bus 订阅 'search/rebuild' 在数据/阶段变更后重建索引。
   ========================================================= */
import { $, esc } from '../core/utils.js';
import { state } from '../core/state.js';
import { bus } from '../core/event-bus.js';
import { D, latestFull, rowsOf } from '../domain/growth.js';
import { SUBJS, SUBJ_COMP_TREES } from '../domain/subjects.js';
import { Galaxy } from '../viz/galaxy.js';
import { renderDomain, renderSubject, renderSubdomain, renderTheme, renderPrimaryIndicator } from './detail-views.js';

let SEARCH = [];

/** 按当前阶段重建搜索索引 */
export function buildSearchIndex() {
  SEARCH = [];
  if (state.stage === 'k') {
    D.domains.forEach(d => {
      const rows = (latestFull() ? rowsOf(latestFull()).filter(r => r.d === d.key) : []);
      const subs = {}; rows.forEach(r => { (subs[r.s] = subs[r.s] || []).push(r); });
      SEARCH.push({ type: 'domain', label: d.key, sub: d.desc, ref: d.key });
      Object.keys(subs).forEach(sk => { SEARCH.push({ type: 'sub', label: sk, sub: d.key, ref: { dom: d.key, sub: sk } }); subs[sk].forEach(r => SEARCH.push({ type: 'ind', label: r.n, sub: d.key + ' · ' + sk, ref: { dom: d.key, sub: sk } })); });
    });
  } else {
    SUBJS.forEach((s, si) => {
      SEARCH.push({ type: 'subject', label: s.name, sub: (s.core_competencies || []).map(c => c.name).join(' · '), ref: si });
      (SUBJ_COMP_TREES[si] || []).forEach((ct, ci) => {
        SEARCH.push({ type: 'theme', label: ct.compName, sub: s.name + ' · 二级维度', ref: { si, ci } });
        (ct.inds || []).forEach((ind, ii) => SEARCH.push({ type: 'ind', label: ind.text, sub: `${s.name} · ${ct.compName} · ${ind.themeName}`, ref: { si, ci, ii } }));
      });
    });
  }
}

/** 输入即时搜索并渲染下拉 */
export function doSearch(q) {
  const box = $('#searchResults'); const term = (q || '').trim().toLowerCase();
  if (!term) { box.classList.remove('show'); box.innerHTML = ''; return; }
  const rank = { domain: 0, subject: 0, sub: 1, theme: 1, ind: 2 };
  const hits = SEARCH.filter(it => (it.label || '').toLowerCase().includes(term) || (it.sub || '').toLowerCase().includes(term))
    .sort((a, b) => (rank[a.type] - rank[b.type]) || (a.label.length - b.label.length)).slice(0, 24);
  box.innerHTML = hits.length ? hits.map(it => `<div class="sr-item" data-i='${esc(JSON.stringify(it))}'>
    <span class="sr-ic">${it.type === 'domain' ? '🌟' : it.type === 'subject' ? '📘' : it.type === 'sub' || it.type === 'theme' ? '🧩' : '⭐'}</span>
    <span class="sr-tx"><b>${esc(it.label)}</b><i>${esc(it.sub || '')}</i></span></div>`).join('')
    : `<div class="sr-empty">没有匹配「${esc(term)}」</div>`;
  box.classList.add('show');
  box.onclick = e => { const it = e.target.closest('.sr-item'); if (!it) return; const item = JSON.parse(it.dataset.i); openSearchResult(item); box.classList.remove('show'); $('#searchInput').value = ''; };
}

/** 打开搜索结果：镜头聚焦 + 渲染对应详情 */
export function openSearchResult(item) {
  if (Galaxy) Galaxy.focusNode(item.label);
  if (item.type === 'domain') renderDomain(item.ref);
  else if (item.type === 'subject') renderSubject(item.ref);
  else if (item.type === 'sub') renderSubdomain(item.ref.dom, item.ref.sub, (latestFull() ? rowsOf(latestFull()).filter(r => r.d === item.ref.dom && r.s === item.ref.sub) : []));
  else if (item.type === 'theme') renderSubject(item.ref.si, item.ref.ci);
  else if (item.type === 'ind') { if (state.stage === 'p' && item.ref && 'ii' in item.ref) renderPrimaryIndicator(item.ref.si, item.ref.ci, item.ref.ii); else renderSubdomain(item.ref.dom, item.ref.sub, (latestFull() ? rowsOf(latestFull()).filter(r => r.d === item.ref.dom && r.s === item.ref.sub) : [])); }
}

/* 数据/阶段变更后重建索引（router 与 detail-views 通过 bus 触发） */
bus.on('search/rebuild', () => buildSearchIndex());
