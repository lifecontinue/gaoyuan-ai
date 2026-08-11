/* =========================================================
   ui/detail-views.js — 抽屉详情视图 + 视图动作
   生成所有「下钻详情 / 菜单面板 / 表单」的 HTML，并承载家长可写操作。
   跨模块通知（刷新顶栏/重建搜索/AI 上下文）一律经 event-bus，
   不 import router / search / ai-panel，避免循环依赖。
   内联 onclick="TT.xxx" 由 main.js 的 window.TT 桥接在运行时解析。
   ========================================================= */
import { $, esc, pct, lvPill, today, thisMonth, download, avgOf } from '../core/utils.js';
import { lvc, subjectColorHex } from '../core/config.js';
import { state } from '../core/state.js';
import { bus } from '../core/event-bus.js';
import { D, DOMS, domMeta, domLabel, STAGES, parentToPeriod, allPeriods, rowsOf, withData, latestFull, registry, lastLv, avgOfPeriod, childInfo, childFullName } from '../domain/growth.js';
import { SUBJS, SUBJ_COMP_TREES } from '../domain/subjects.js';
import { Store } from '../data/store.js';
import { Charts } from '../viz/charts.js';
import { toast, modal, closeModal, kpi, histDots } from './widgets.js';
import { Side } from './side-panel.js';

/* 家长记录模块内部状态 */
let prTab = 'notes', habitMonth = thisMonth(), vaEditing = null, vaDom = null;

/* ---------- 中心：整体概览 ---------- */
export function renderCenter(node) {
  const ps = withData(); const cur = ps[ps.length - 1], prev = ps[ps.length - 2];
  const curAvg = cur ? avgOfPeriod(cur) : null, prevAvg = prev ? avgOfPeriod(prev) : null;
  const diff = (curAvg != null && prevAvg != null) ? curAvg - prevAvg : null;
  const { reg } = registry();
  const chronic = Object.values(reg).filter(e => e.tag === 'chronic').length;
  const child = childInfo();
  const radar = cur ? Charts.radar({ axes: DOMS.map(d => ({ label: domLabel(d) })), series: [{ name: '最新', color: '#ff7c3a', values: DOMS.map(d => cur.domainScores[d]) }], min: 0.5 }) : '';
  let html = `<div class="card">
    <div class="dc-title"><h3 style="font-family:var(--serif)">${esc(child.nickname || child.name || '悠悠')} 的成长星空</h3>
    <span class="sub">${esc((child.grade || '') + ' · ' + (child.kindergarten || child.school || ''))}</span></div>
    <div class="grid g-3" style="margin:10px 0">
      ${kpi('综合得分率', pct(curAvg), '', cur ? esc(cur.name) : '暂无测评')}
      ${kpi('较上期', diff == null ? '–' : (diff >= 0 ? '▲ ' : '▼ ') + (Math.abs(diff * 100)).toFixed(1) + 'pt', '', diff == null ? '' : (diff >= 0 ? '提升' : '下降'))}
      ${kpi('长期待突破', chronic, '项', chronic ? '建议重点干预' : '🎉 均衡')}
    </div>
    ${radar ? `<div class="chart-wrap" style="margin-top:8px">${radar}</div>` : `<div class="empty"><span class="ee">★</span>本阶段暂无结构化测评数据</div>`}
  </div>`;
  if (cur) {
    html += `<div class="card"><div class="card-h"><h3>六大领域</h3><span class="sub">点击下钻</span></div><div class="card-b grid g-2">` +
      DOMS.map(d => { const v = cur.domainScores[d]; return `<div class="list-item dom-card" onclick="TT.openDomain('${esc(d)}')">
        <span class="li-ic" style="background:${domMeta(d).color}33;color:${domMeta(d).color}">${domMeta(d).icon}</span>
        <span class="li-tx">
          <b>${esc(domLabel(d))}<span class="li-score" style="background:${domMeta(d).color}22;color:${domMeta(d).color};border-color:${domMeta(d).color}55">${pct(v)}</span></b>
          <i>${esc(domMeta(d).desc || '')}</i>
        </span>
      </div>`; }).join('') + `</div></div>`;
  }
  html += `<div class="grid g-2">
    <button class="btn primary block" onclick="TT.openMenu('summary')">📄 生成综合评价</button>
    <button class="btn block" onclick="TT.openMenu('parent')">❤️ 家长记录</button>
    <button class="btn block" onclick="TT.openMenu('subjects')">📚 学科维度</button>
    <button class="btn block" onclick="TT.openMenu('data')">💾 数据管理</button>
  </div>`;
  Side.render(`<b>整体概览</b>`, html, { fn: renderCenter, args: [node] });
  bus.emit('ai/context', { domain: null, metric: '整体概览' });
}

/* ---------- 领域详情（幼儿园） ---------- */
export function renderDomain(key) {
  const ps = withData(); const cur = ps[ps.length - 1];
  if (!cur) { Side.render(`<b>${esc(key)}</b>`, `<div class="empty"><span class="ee">◔</span>本阶段暂无数据</div>`, { fn: renderDomain, args: [key] }); return; }
  const dm = domMeta(key);
  const labels = ps.map(p => ({ a: p.name.replace(/^\d{4}学年·/, ''), b: p.date.slice(2).replace('-', '/') }));
  const series = [{ name: domLabel(key), color: dm.color, values: ps.map(p => p.domainScores[key]) }];
  const curV = cur.domainScores[key];
  const rows = rowsOf(cur).filter(r => r.d === key);
  const { reg } = registry();
  const chronic = Object.values(reg).filter(e => e.tag === 'chronic' && e.d === key).sort((a, b) => b.badTimes - a.badTimes);
  const subs = {}; rows.forEach(r => { (subs[r.s] = subs[r.s] || []).push(r); });
  let html = `<div class="card"><div class="dc-title"><h3 style="color:${dm.color}">${dm.icon} ${esc(domLabel(key))}</h3><span class="sub">最新 ${pct(curV)}</span></div>
    <div class="chart-wrap" style="min-height:190px">${Charts.line({ labels, series, height: 190, min: 0.6 })}</div>
    <div class="row mt" style="gap:8px"><button class="btn sm primary" onclick="TT.openNoteModal('${esc(key)}')">＋ 添加观察</button>
    <button class="btn sm" onclick="TT.aiAction('weak')">AI 分析</button></div></div>`;
  html += `<div class="card"><div class="card-h"><h3>子维度</h3><span class="sub">${Object.keys(subs).length} 个 · 点击下钻</span></div><div class="card-b">` +
    Object.keys(subs).map(sk => { const sc = avgOf(rows.filter(r => r.s === sk).map(r => r.v)); const n = subs[sk].length;
      return `<div class="list-item" onclick="TT.openSub('${esc(key)}','${esc(sk)}')">
        <span class="li-ic" style="background:${dm.color}33;color:${dm.color}">${Object.keys(subs).indexOf(sk) + 1}</span>
        <span class="li-tx"><b>${esc(sk)}</b><i>${n} 项指标</i></span>
        <span class="li-meta">${pct(sc)}</span></div>`; }).join('') + `</div></div>`;
  if (chronic.length) html += `<div class="card"><div class="card-h"><h3>长期待突破</h3><span class="sub">${chronic.length} 项</span></div><div class="card-b"><table>
    <thead><tr><th>指标</th><th>要求</th><th>最近</th></tr></thead><tbody>${chronic.slice(0, 8).map(e => `<tr><td><b>${esc(e.n)}</b></td><td class="hint">${esc(e.b || '')}</td><td>${lvPill(lastLv(e))}</td></tr>`).join('')}</tbody></table></div></div>`;
  Side.render(`<b>${esc(domLabel(key))}</b> · 领域详情`, html, { fn: renderDomain, args: [key] });
  bus.emit('ai/context', { domain: key, metric: null });
}

export function renderSubdomain(domainKey, subKey, rows) {
  const dm = domMeta(domainKey);
  const pid = latestFull() ? latestFull().id : null;
  let html = `<div class="card"><div class="dc-title"><h3 style="color:${dm.color}">${esc(subKey)}</h3><span class="sub">${esc(domainKey)} · ${rows.length} 项</span></div>
    <div class="hint">以下指标来自园所最新测评；你可以用「补充评价」记录家庭观察下的判断，或「添加观察」留下具体事例。</div></div>`;
  html += rows.map(r => { const ov = pid ? Store.getOverride(pid, r.k) : null; const lv = ov ? ov.level : r.l;
    return `<div class="card"><div class="li-tx" style="margin-bottom:6px"><b>${esc(r.n)}</b> ${lvPill(lv)}</div>
      <div class="metric-desc"><span class="md-label">达标要求</span><br>${esc(r.b || '')}</div>
      <div class="rate-row">
        ${['符合', '较符合', '不符合'].map(l => `<button class="rate-btn ${lvc(l) === 'ok' ? 'ok' : lvc(l) === 'mid' ? 'mid' : 'no'} ${lv === l ? 'sel' : ''}" onclick="TT.rateIndicator('${esc(domainKey)}','${esc(subKey)}','${esc(r.k)}','${esc(l)}')">${l}</button>`).join('')}
        <button class="rate-btn" onclick="TT.openNoteModal('${esc(domainKey)}','${esc(r.n)}')">＋ 观察</button>
      </div></div>`; }).join('');
  Side.render(`<b>${esc(domainKey)}</b> › ${esc(subKey)}`, html, { fn: renderSubdomain, args: [domainKey, subKey, rows] });
}

export function renderIndicator(domainKey, subKey, row) {
  const dm = domMeta(domainKey);
  const pid = latestFull() ? latestFull().id : null;
  const ov = pid ? Store.getOverride(pid, row.k) : null; const lv = ov ? ov.level : row.l;
  const ps = withData(); const cur = ps[ps.length - 1];
  const e = (registry().reg)[row.k];
  let html = `<div class="card"><div class="dc-title"><h3 style="color:${dm.color}">${esc(row.n)}</h3>${lvPill(lv)}</div>
    <div class="metric-desc"><span class="md-label">达标要求</span><br>${esc(row.b || '')}</div>
    <div class="hint" style="margin-top:10px">所属：${esc(domLabel(domainKey))} › ${esc(subKey)}　·　评价期次：${esc(row.g || '')}</div>
    ${e ? `<div class="row mt" style="align-items:center;gap:8px"><span class="hint">历史</span>${histDots(e)}</div>` : ''}
    <div class="rate-row mt">
      ${['符合', '较符合', '不符合'].map(l => `<button class="rate-btn ${lvc(l) === 'ok' ? 'ok' : lvc(l) === 'mid' ? 'mid' : 'no'} ${lv === l ? 'sel' : ''}" onclick="TT.rateIndicator('${esc(domainKey)}','${esc(subKey)}','${esc(row.k)}','${esc(l)}')">${l}</button>`).join('')}
    </div>
    <button class="btn sm primary mt" onclick="TT.openNoteModal('${esc(domainKey)}','${esc(row.n)}')">＋ 添加观察记录</button>
  </div>`;
  Side.render(`<b>${esc(domainKey)}</b> › ${esc(subKey)} › ${esc(row.n)}`, html, { fn: renderIndicator, args: [domainKey, subKey, row] });
}

/* ---------- 学科详情（小学）：按「二级维度（学科核心素养）」折叠展示 ---------- */
export function renderSubject(i, focusCi) {
  const s = SUBJS[i]; if (!s) return;
  const col = subjectColorHex(s.id);
  const comps = SUBJ_COMP_TREES[i] || [];
  let html = `<div class="card"><div class="dc-title"><h3 style="color:${col}">${esc(s.name)}</h3><span class="sub">三年级 · 第二学段</span></div>
    <div class="hint">学科核心素养（二级维度）：${(s.core_competencies || []).map(c => c.name).join(' · ')}</div></div>`;
  html += comps.map((ct, ci) => {
    const open = (ci === focusCi) ? ' open' : '';
    return `<div class="subj-card${open}" data-i="${i}" data-ci="${ci}">
    <div class="sc-head" onclick="this.closest('.subj-card').classList.toggle('open')"><span class="sc-ic" style="background:${col}">${esc((ct.compName || '?')[0])}</span>
      <span class="li-tx"><b class="sc-name">${esc(ct.compName || '')}</b><i class="sc-sub">${(ct.inds || []).length} 项可评指标 · 二级维度</i></span>
      <span class="sc-chev">▾</span></div>
    <div class="sc-body">${competencyBodyInner(i, ci)}</div></div>`;
  }).join('');
  html += subjectLearningPathsHtml(s);
  Side.render(`<b>学科维度</b> › ${esc(s.name)}`, html, { fn: renderSubject, args: [i, focusCi] });
  bus.emit('ai/context', { domain: s.name, metric: null });
}
function competencyBodyInner(i, ci) {
  const s = SUBJS[i], ct = (SUBJ_COMP_TREES[i] || [])[ci]; if (!ct) return '';
  let h = `<div class="theme-row"><div class="hint" style="margin-bottom:6px">${esc(ct.compDesc || '')}</div>`;
  if (!(ct.inds || []).length) {
    h += `<div class="hint" style="opacity:.8">该核心素养贯穿各主题（内容领域），暂无独立拆分指标；具体表现见下方各主题指标。</div>`;
  } else {
    h += `<div style="font-size:12px;color:var(--txt-dim);margin-bottom:4px">可评指标（点击查看 / 评价）</div>` +
      (ct.inds).map((ind, ii) => `<span class="ind-pill" role="button" tabindex="0" onclick="TT.openPrimaryIndicator(${i},${ci},${ii})">
        <span class="ip-tx">${esc(ind.text || ind)}</span>
        <span class="ind-theme">${esc(ind.themeName || '')}</span></span>`).join('');
    h += `<button class="btn sm mt" onclick="TT.openNoteModal('', '${esc(s.name)}·${esc(ct.compName)}')">＋ 添加该维度观察</button>`;
  }
  return h;
}
function subjectLearningPathsHtml(s) {
  if (!s) return '';
  const lps = s.learning_paths || [];
  if (!lps.length) {
    return `<div class="card"><div class="card-h"><h3>学习路径说明</h3></div><div class="card-b hint">本学科依据 2022 义务教育课程标准梳理主题与可评指标；具体进阶路径以上级教研要求为准，可在「家长记录」中按主题追踪${(childInfo().nickname || '孩子')}的实际学习进展。</div></div>`;
  }
  const kg = lps.filter(l => l.source === 'kg').length, curr = lps.length - kg;
  let h = `<div class="card"><div class="card-h"><h3>学习路径</h3><span class="sub">${lps.length} 条${kg ? ' · 教育知识图谱 ' + kg : ''}${curr ? ' · 课标进阶 ' + curr : ''}</span></div><div class="card-b">`;
  h += lps.map(lp => `<div class="lp"><b>${esc(lp.from)}</b> → <b>${esc(lp.to)}</b>
      <span class="lp-src ${lp.source === 'kg' ? 'kg' : 'curr'}">${lp.source === 'kg' ? '教育知识图谱' : '课标进阶'}</span>
      ${lp.desc ? `<span class="lp-desc">${esc(lp.desc)}</span>` : ''}</div>`).join('');
  h += `</div><div class="hint mt">「教育知识图谱」来自真实教学知识图谱（如数学知识点依赖）；「课标进阶」依据 2022 义务教育课程标准梳理的认知进阶。</div></div>`;
  return h;
}
export function renderTheme(i, ci) { renderSubject(i, ci); }

/* ---------- 小学指标评价卡片（6 字段优化卡片） ---------- */
export function renderPrimaryIndicator(si, ci, ii) {
  const s = SUBJS[si], ct = (SUBJ_COMP_TREES[si] || [])[ci];
  const ind = ct ? ct.inds[ii] : null;
  if (!s || !ct || !ind) { Side.render(`<b>指标</b>`, `<div class="empty"><span class="ee">◔</span>未找到该指标</div>`, { fn: renderSubject, args: [si] }); return; }
  const col = subjectColorHex(s.id);
  const ov = Store.getSubjectOverride(ind.key); const lv = ov ? ov.level : null;
  const crumb = `${esc(s.name)} › ${esc(ind.compName)} › ${esc(ind.text)}`;
  let html = `<div class="card ind-card">
    <div class="dc-title"><h3 style="color:${col}">${esc(ind.text)}</h3>${lvPill(lv)}</div>
    <div class="ind-meta">
      <div class="ind-field"><span class="if-k">指标名称</span><span class="if-v">${esc(ind.text)}</span></div>
      <div class="ind-field"><span class="if-k">指标所属维度</span><span class="if-v">${esc(s.name)} › ${esc(ind.compName)} › ${esc(ind.themeName)}</span></div>
      <div class="ind-field"><span class="if-k">label</span><span class="if-v">${esc(ind.label || '—')}</span></div>
      <div class="ind-field if-desc"><span class="if-k">指标描述</span><span class="if-v">${esc(ind.desc || '—')}</span></div>
      ${ind.story ? `<div class="ind-story"><div class="is-h"><span class="is-ic">📖</span><span class="is-t">情景故事</span></div><p class="is-body">${esc(ind.story)}</p></div>` : ''}
    </div>
    ${ind.criteria ? criteriaHtml(ind.criteria) : ''}
    <div class="hint mt">评价方式：符合=已达成　较符合=部分达成　不符合=尚未达成。记录为家庭观察自评，可与老师评价对照。</div>
    <div class="rate-row mt">
      ${['符合', '较符合', '不符合'].map(l => `<button class="rate-btn ${lvc(l) === 'ok' ? 'ok' : lvc(l) === 'mid' ? 'mid' : 'no'} ${lv === l ? 'sel' : ''}" onclick="TT.ratePrimaryIndicator(${si},${ci},${ii},'${esc(l)}')">${l}</button>`).join('')}
      ${lv ? `<button class="rate-btn" onclick="TT.ratePrimaryIndicator(${si},${ci},${ii},'')">清除</button>` : ''}
    </div>
    <button class="btn sm primary mt" onclick="TT.openNoteModal('', '${esc(s.name)}·${esc(ind.compName)}·${esc(ind.text)}')">＋ 添加观察记录</button>
  </div>`;
  Side.render(crumb, html, { fn: renderPrimaryIndicator, args: [si, ci, ii] });
  bus.emit('ai/context', { domain: s.name, metric: ind.text });
}

/* 指标三级判定标准渲染：符合 / 较符合 / 不符合，家长可直接对照 */
function criteriaHtml(c) {
  const order = ['符合', '较符合', '不符合'];
  const cls = { '符合': 'ok', '较符合': 'mid', '不符合': 'no' };
  return `<div class="ind-criteria"><div class="ic-h"><span class="ic-ic">🎯</span><span class="ic-t">判定标准（家长可直接对照）</span></div>` +
    order.map(l => `<div class="ic-row ic-${cls[l]}"><span class="ic-lv">${esc(l)}</span><span class="ic-tx">${esc(c[l] || '—')}</span></div>`).join('') +
    `</div>`;
}

/* ---------- 学科维度总览 ---------- */
export function renderSubjects() {
  if (!SUBJS.length) { Side.render(`<b>学科维度</b>`, `<div class="empty"><span class="ee">📚</span>当前阶段暂无学科维度</div>`, { fn: renderSubjects, args: [] }); return; }
  const html = SUBJS.map((s, i) => `<div class="list-item" onclick="TT.openSubject(${i})">
    <span class="li-ic" style="background:${subjectColorHex(s.id)}">${esc(s.name[0])}</span>
    <span class="li-tx"><b>${esc(s.name)}</b><i>${(s.core_competencies || []).join(' · ')}</i></span>
    <span class="li-meta">${(s.themes || []).length} 主题</span></div>`).join('');
  Side.render(`<b>学科维度</b> · 三年级九大学科`, html, { fn: renderSubjects, args: [] });
}
export function openSubject(i) { renderSubject(i); }

/* ---------- 家长记录 ---------- */
export function renderParent(tab) {
  if (tab) prTab = tab;
  if (vaEditing) prTab = 'assess';
  const html = `<div class="row mb" style="border-bottom:1px solid var(--stroke-soft);padding-bottom:10px">
    <button class="btn sm ${prTab === 'notes' ? 'primary' : ''}" onclick="TT.renderParent('notes')">观察记录</button>
    <button class="btn sm ${prTab === 'habit' ? 'primary' : ''}" onclick="TT.renderParent('habit')">习惯打卡</button>
    <button class="btn sm ${prTab === 'assess' ? 'primary' : ''}" onclick="TT.renderParent('assess')">家长测评</button>
  </div><div id="pr-body"></div>`;
  Side.render(`<b>家长记录</b>`, html, { fn: renderParent, args: [prTab] });
  const root = $('#pr-body'); if (prTab === 'notes') renderNotes(root); else if (prTab === 'habit') renderHabits(root); else renderParentAssess(root);
}
function renderNotes(out) {
  const notes = Store.s.notes; const byDom = {}; notes.forEach(n => { byDom[n.domain] = (byDom[n.domain] || 0) + 1; });
  const levelOf = n => n.level || (n.stars >= 5 ? '符合' : n.stars >= 3 ? '较符合' : '不符合');
  const badgeOf = l => `<span class="rate-btn ${lvc(l)}" style="pointer-events:none;padding:2px 8px;font-size:11px;transform:none;border-width:1px">${esc(l)}</span>`;
  out.innerHTML = `<div class="card"><div class="card-h"><h3>新增观察记录</h3><button class="btn sm" onclick="TT.openNoteModal()">快速添加</button></div>
    <div class="card-b">
      <div class="field mb"><label>日期</label><input type="date" id="n-date" value="${today()}"></div>
      <div class="field mb"><label>记录人</label><input type="text" id="n-by" value="爸爸"></div>
      <div class="field mb"><label>关联领域</label><select id="n-dom">${D.domains.map(d => `<option value="${esc(d.key)}">${esc(domLabel(d.key))}</option>`).join('')}</select></div>
      <div class="field mb"><label>关联指标（可选）</label><input type="text" id="n-ind" placeholder="如：连续跳绳 / 整理物品"></div>
      <div class="field mb"><label>表现评级</label><div class="rate-row" id="n-level">${[['符合','ok'],['较符合','mid'],['不符合','no']].map(([l,c]) => `<button class="rate-btn ${c}" data-l="${esc(l)}">${esc(l)}</button>`).join('')}</div></div>
      <div class="field mb"><label>观察内容</label><textarea id="n-txt" placeholder="记录具体情境、行为与结果……"></textarea></div>
      <button class="btn primary" id="n-add">保存记录</button>
    </div></div>
    <div class="card"><div class="card-h"><h3>记录时间线</h3><span class="sub">共 ${notes.length} 条${notes.length ? ' · ' + Object.entries(byDom).map(([k, v]) => k + ' ' + v).join(' / ') : ''}</span>
      ${notes.length ? '<button class="btn sm" onclick="TT.exportNotes()">导出 MD</button>' : ''}</div>
      <div class="card-b">${notes.length ? notes.map(n => `<div class="note-item"><div class="ni-top"><span class="ni-date">${esc(n.date)} · ${esc(n.by || '家长')}</span><button class="ni-del" onclick="TT.delNote('${n.id}')">删除</button></div>
        <div class="ni-tx">${badgeOf(levelOf(n))} <span class="chip" style="border-color:${domMeta(n.domain).color}33;color:${domMeta(n.domain).color}">${esc(n.domain)}</span>${n.indicator ? ' <span class="chip">' + esc(n.indicator) + '</span>' : ''}<br>${esc(n.text)}</div></div>`).join('')
      : '<div class="empty"><span class="ee">◔</span>还没有观察记录<br><span class="hint">建议每周记录 2~3 条，期末生成综合评价时会自动引用</span></div>'}</div></div>`;
  let level = '符合'; const sw = $('#n-level');
  const paint = () => sw.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.l === level));
  sw.onclick = e => { const b = e.target.closest('button'); if (b) { level = b.dataset.l; paint(); } }; paint();
  $('#n-add').onclick = () => { const text = $('#n-txt').value.trim(); if (!text) return toast('请填写观察内容');
    const stars = level === '符合' ? 5 : level === '较符合' ? 3 : 1;
    Store.addNote({ date: $('#n-date').value || today(), by: $('#n-by').value.trim() || '家长', domain: $('#n-dom').value, indicator: $('#n-ind').value.trim(), text, level, stars });
    bus.emit('app/refresh-side'); renderNotes($('#pr-body')); toast('已保存'); };
}
function renderHabits(out) {
  const items = Store.habitItems(); const data = Store.habitMonth(habitMonth);
  const [y, m] = habitMonth.split('-').map(Number); const days = new Date(y, m, 0).getDate();
  const wd = d => ['日', '一', '二', '三', '四', '五', '六'][new Date(y, m - 1, d).getDay()];
  let filled = 0, indep = 0; items.forEach(it => { const h = data[it.id] || {}; Object.values(h).forEach(v => { filled++; if (v === 1) indep++; }); });
  out.innerHTML = `<div class="row mb" style="gap:10px;align-items:flex-end">
    <div class="field" style="margin:0"><label>月份</label><input type="month" id="hb-m" value="${habitMonth}"></div>
    <button class="btn" onclick="TT.editHabits()">管理打卡项</button></div>
  <div class="grid g-4 mb">${kpi('本月打卡格', filled, '格', '共 ' + items.length * days + ' 格')}${kpi('独立完成', indep, '次', filled ? '占 ' + ((indep / filled) * 100).toFixed(0) + '%' : '')}
    ${kpi('覆盖率', items.length * days ? ((filled / (items.length * days)) * 100).toFixed(0) + '%' : '–', '', '记录完整度')}${kpi('打卡项目', items.length, '项', '可增删')}</div>
  <div class="card"><div class="card-b" style="overflow-x:auto"><table style="font-size:11.5px"><thead><tr><th>打卡项</th>${Array.from({ length: days }, (_, i) => `<th style="${['六', '日'].includes(wd(i + 1)) ? 'color:#ff9a5a' : ''}">${i + 1}</th>`).join('')}<th>独立</th></tr></thead>
    <tbody>${items.map(it => { const h = data[it.id] || {}; const ic = Object.values(h).filter(v => v === 1).length;
      return `<tr><td><b>${esc(it.name)}</b><div class="hint">${esc(it.cat || '')}</div></td>${Array.from({ length: days }, (_, i) => { const d = i + 1, v = h[d] || 0; return `<td style="padding:2px"><div class="habit-day ${v === 1 ? 'd1' : v === 2 ? 'd2' : ''} ${['六', '日'].includes(wd(d)) ? 'wk' : ''}" onclick="TT.tapHabit('${it.id}',${d})">${v === 1 ? '✓' : v === 2 ? '▲' : ''}</div></td>`; }).join('')}<td class="num"><b>${ic}</b></td></tr>`; }).join('')}</tbody></table></div>
    <div class="hint mt">✓ 独立完成　▲ 帮助下完成　（点击单元格切换：未做 → 独立 → 帮助 → 未做）</div></div>`;
  $('#hb-m').onchange = e => { habitMonth = e.target.value; renderHabits($('#pr-body')); };
}
function renderParentAssess(out) {
  if (vaEditing) return renderAssessEditor(out);
  const list = Store.s.parentPeriods.filter(pp => (pp.stage || 'k') === state.stage);
  out.innerHTML = `<div class="row mb"><button class="btn primary" onclick="TT.newParentPeriod()">＋ 新建一期家长评价</button></div>` +
    (list.length ? `<div class="grid g-2">${list.map(pp => { const p = parentToPeriod(pp); const done = Object.keys(pp.ratings).length;
      return `<div class="card"><div class="card-b"><div class="spread"><b>${esc(pp.name)}</b><span class="chip">家长评价</span></div>
        <div class="hint">${esc(pp.date)} · 模板：${esc((D.periods.find(x => x.id === pp.templateId) || {}).name || '默认')}</div>
        <div class="row mt" style="gap:8px"><button class="btn sm primary" onclick="TT.editPP('${pp.id}')">${done ? '继续填写' : '开始评价'}</button>
        <button class="btn sm" onclick="TT.openPeriod('${pp.id}')">查看</button><button class="btn sm danger" onclick="TT.delPP('${pp.id}')">删除</button></div></div></div>`; }).join('')}</div>`
    : `<div class="card"><div class="empty"><span class="ee">✎</span>本阶段还没有家长评价<br><span class="hint">建议每学期末做一次，与园所评价形成家园对照</span></div></div>`);
}
function renderAssessEditor(out) {
  const pp = Store.getParentPeriod(vaEditing); if (!pp) { vaEditing = null; return renderParentAssess(out || $('#pr-body')); }
  const p = parentToPeriod(pp); const rows = p._rows; const done = Object.keys(pp.ratings).length;
  if (!vaDom) vaDom = DOMS[0]; const sub = rows.filter(r => r.d === vaDom);
  out.innerHTML = `<div class="card"><div class="card-b">
    <div class="spread"><div class="row" style="gap:10px;flex:1"><b style="font-size:13px">${esc(pp.name)}</b>
      <div class="bar" style="flex:1;max-width:240px;height:8px;background:rgba(255,255,255,.1);border-radius:99px"><i style="display:block;height:100%;width:${(done / rows.length) * 100}%;background:#5fd39a;border-radius:99px"></i></div>
      <b>${done}/${rows.length}</b><span class="hint">综合 ${pct(avgOfPeriod(p))}</span></div>
      <div class="row"><button class="btn sm" onclick="TT.assessBack()">← 返回</button><button class="btn sm primary" onclick="TT.assessFin('${pp.id}')">完成</button></div></div>
    <div class="row mt" style="gap:6px;flex-wrap:wrap">${D.domains.map(d => { const n = rows.filter(r => r.d === d.key).length; const dn = rows.filter(r => r.d === d.key && pp.ratings[r.k]).length; return `<button class="btn sm ${vaDom === d.key ? 'primary' : ''}" onclick="TT.setAsDom('${esc(d.key)}')">${d.icon} ${d.key} ${dn}/${n}</button>`; }).join('')}</div>
  </div></div>
  <div class="card"><div class="card-b">${Object.entries(sub.reduce((acc, r) => { const g = (r.s || '') + ' › ' + (r.g || ''); (acc[g] = acc[g] || []).push(r); return acc; }, {})).map(([g, items]) => `<div style="padding:10px 0;border-top:1px solid var(--stroke-soft)"><div class="hint" style="margin-bottom:6px">${esc(g)}</div>${items.map(r => { const rt = pp.ratings[r.k] || {}; return `<div style="padding:8px 0;display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:200px"><div style="font-size:13px;font-weight:600">${esc(r.n)}</div><div class="metric-desc" style="margin-top:4px;padding:6px 10px;font-size:12px">${esc(r.b || '')}</div>
      <input class="glass-field" style="margin-top:5px;font-size:12px;padding:6px 9px" placeholder="观察备注（可选）" value="${esc(rt.r || '')}" onchange="TT.rateNote('${vaEditing}','${esc(r.k)}',this.value)"></div>
      <div class="row" style="gap:5px">${[['符合', 'ok'], ['较符合', 'mid'], ['不符合', 'no']].map(([l, c]) => `<button class="rate-btn ${rt.l === l ? 'sel' : ''}" onclick="TT.rate('${vaEditing}','${esc(r.k)}','${l}')">${l}</button>`).join('')}<button class="rate-btn" onclick="TT.rate('${vaEditing}','${esc(r.k)}','')">✕</button></div></div>`; }).join('')}</div>`).join('')}</div></div>`;
}

/* ---------- 综合评价 ---------- */
export function renderSummaryList() {
  const list = Store.s.summaries;
  let html = `<div class="row mb"><button class="btn primary" onclick="TT.openSummaryForm()">＋ 生成新的综合评价</button></div>`;
  if (list.length) {
    html += `<div id="sm-body">${summaryDocHtml(list[0])}</div>`;
  } else html += `<div class="card"><div class="empty"><span class="ee">★</span>还没有生成过综合评价<br><span class="hint">选择评价周期即可自动汇总测评、家长记录与习惯打卡</span></div></div>`;
  Side.render(`<b>综合评价</b>`, html, { fn: renderSummaryList, args: [] });
}
function summaryData(x) {
  const ps = withData(); const i0 = ps.findIndex(p => p.id === x.from), i1 = ps.findIndex(p => p.id === x.to);
  const scope = ps.slice(Math.min(i0, i1) < 0 ? 0 : Math.min(i0, i1), (Math.max(i0, i1) < 0 ? ps.length - 1 : Math.max(i0, i1)) + 1);
  const first = scope[0], last = scope[scope.length - 1]; const { reg } = registry();
  const inScope = k => scope.some(p => reg[k] && reg[k].hist[p.id]);
  const all = Object.values(reg).filter(e => inScope(e.k));
  const chronic = all.filter(e => e.tag === 'chronic').sort((a, b) => b.badTimes - a.badTimes);
  const ups = all.filter(e => e.tag === 'up').sort((a, b) => b.delta - a.delta);
  const domRank = D.domains.map(d => ({ key: d.key, color: d.color, first: first ? first.domainScores[d.key] : null, last: last ? last.domainScores[d.key] : null }))
    .map(o => Object.assign(o, { delta: (o.first != null && o.last != null) ? +(o.last - o.first).toFixed(3) : null }));
  const notes = Store.s.notes.filter(n => (!first || n.date >= first.date));
  return { scope, first, last, chronic, ups, domRank, notes };
}
function summaryDocHtml(x) {
  const { scope, first, last, chronic, ups, domRank, notes } = summaryData(x); const c = childInfo();
  const strong = domRank.filter(d => d.last != null).sort((a, b) => b.last - a.last).slice(0, 2);
  const weak = domRank.filter(d => d.last != null).sort((a, b) => a.last - b.last).slice(0, 2);
  return `<div class="row mb" style="gap:8px;flex-wrap:wrap;align-items:center"><select class="glass-field" id="sm-pick" style="width:auto">${Store.s.summaries.map(y => `<option value="${y.id}" ${y.id === x.id ? 'selected' : ''}>${esc(y.title)}（${esc(y.createdAt.slice(0, 10))}）</option>`).join('')}</select>
    <button class="btn sm" onclick="TT.printSummary()">打印 / PDF</button><button class="btn sm" onclick="TT.exportSummaryMD('${x.id}')">导出 MD</button><button class="btn sm danger" onclick="TT.delSummary('${x.id}')">删除</button></div>
  <div class="doc">
    <h1>${esc(x.title)}</h1><div class="doc-sub">评价周期：${esc(first ? first.name : '')} — ${esc(last ? last.name : '')}　|　${esc(x.createdAt)}　|　${esc(x.author)}</div>
    <h2>一、基本信息</h2><table><tbody>
      <tr><th style="width:90px">姓名</th><td>${esc(c.name)}（小名 ${esc(c.nickname)}）</td><th style="width:90px">性别 / 出生</th><td>${esc(c.gender)} / ${esc(c.birth)}</td></tr>
      <tr><th>学校</th><td>${esc(c.school)} ${esc(c.grade)}</td><th>幼儿园</th><td>${esc(c.kindergarten)}</td></tr></tbody></table>
    <h2>二、总体发展水平</h2><p>共完成 ${scope.length} 次结构化测评。综合得分率由 <b>${pct(first ? avgOfPeriod(first) : null)}</b> 变化为 <b>${pct(last ? avgOfPeriod(last) : null)}</b>。各期标准随月龄递进，纵向比较应结合当期标准。</p>
    <table><thead><tr><th>领域</th><th class="num">${esc(first ? first.code : '')}</th><th class="num">${esc(last ? last.code : '')}</th><th class="num">变化</th><th>说明</th></tr></thead><tbody>
      ${domRank.map(d => `<tr><td><b style="color:${d.color}">${esc(domLabel(d.key))}</b></td><td class="num">${pct(d.first)}</td><td class="num">${pct(d.last)}</td><td class="num"><b class="${d.delta > 0 ? 'up' : d.delta < 0 ? 'down' : ''}">${d.delta == null ? '–' : (d.delta > 0 ? '+' : '') + (d.delta * 100).toFixed(1) + 'pt'}</b></td><td style="font-size:12px">${d.last == null ? '–' : d.last >= 0.95 ? '发展充分' : d.last >= 0.85 ? '总体良好' : '相对薄弱'}</td></tr>`).join('')}</tbody></table>
    <h2>三、优势领域</h2><p>${strong.map(d => `<b>${d.key}</b>（${pct(d.last)}）`).join('、')} 表现突出。${ups.length ? `周期内 ${ups.length} 项指标进步：` : ''}</p>
    ${ups.length ? `<ul>${ups.slice(0, 8).map(e => `<li><b>${esc(e.n)}</b>（${esc(e.d)}）</li>`).join('')}</ul>` : ''}
    <h2>四、需重点关注</h2><p>${weak.map(d => `<b>${d.key}</b>（${pct(d.last)}）`).join('、')} 相对薄弱。${chronic.length} 项指标两期及以上未完全达标：</p>
    ${chronic.length ? `<table><thead><tr><th style="width:80px">领域</th><th>指标</th><th>达标要求</th><th style="width:56px">最近</th></tr></thead><tbody>${chronic.slice(0, 15).map(e => `<tr><td>${esc(e.d)}</td><td><b>${esc(e.n)}</b></td><td style="font-size:12px">${esc(e.b || '')}</td><td>${lvPill(lastLv(e))}</td></tr>`).join('')}</tbody></table>` : '<p>暂无长期未达标指标。</p>'}
    <h2>五、家长观察摘要</h2>${notes.length ? `<p>周期内 ${notes.length} 条日常观察：</p><ul>${notes.slice(0, 10).map(n => `<li><b>${esc(n.date)}</b>（${esc(n.domain)}${n.indicator ? ' · ' + esc(n.indicator) : ''}）${esc(n.text)}</li>`).join('')}</ul>` : '<p>本周期暂无家长观察记录。</p>'}
    ${x.goals ? `<h2>六、下阶段目标</h2><ul>${x.goals.split('\n').filter(Boolean).map(g => `<li>${esc(g.trim())}</li>`).join('')}</ul>` : ''}
    ${x.message ? `<h2>${x.goals ? '七' : '六'}、家长寄语</h2><p style="text-indent:2em">${esc(x.message).replace(/\n/g, '<br>')}</p>` : ''}
    <div class="sig">${esc(x.author)}<br>${esc(x.createdAt.slice(0, 10))}</div>
  </div>`;
}
export function openSummaryForm() {
  const ps = withData();
  modal('生成综合评价', `<div class="field mb"><label>报告标题</label><input type="text" id="sf-title" value="林悠然（悠悠）${STAGES[state.stage].label}成长综合评价报告"></div>
    <div class="grid g-2 mb"><div class="field"><label>起始期次</label><select id="sf-from">${ps.map((p, i) => `<option value="${p.id}" ${i === 0 ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    <div class="field"><label>截止期次</label><select id="sf-to">${ps.map((p, i) => `<option value="${p.id}" ${i === ps.length - 1 ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div></div>
    <div class="field mb"><label>家长寄语</label><textarea id="sf-msg" placeholder="想对悠悠说的话……"></textarea></div>
    <div class="field mb"><label>下阶段目标（每行一条）</label><textarea id="sf-goal" placeholder="每天跳绳 5 分钟&#10;睡前自己整理书包&#10;每周承担 2 次家务"></textarea></div>
    <div class="field"><label>撰写人</label><input type="text" id="sf-author" value="爸爸 林建国"></div>`,
    `<button class="btn" onclick="TT.closeModal()">取消</button><button class="btn primary" id="sf-ok">生成</button>`);
  $('#sf-ok').onclick = () => { const x = Store.addSummary({ title: $('#sf-title').value.trim() || '成长综合评价报告', from: $('#sf-from').value, to: $('#sf-to').value, message: $('#sf-msg').value.trim(), goals: $('#sf-goal').value.trim(), author: $('#sf-author').value.trim() || '家长' });
    closeModal(); renderSummaryList(); toast('已生成'); };
}
export function summaryMarkdown(x) {
  const { scope, first, last, chronic, ups, domRank, notes } = summaryData(x); const c = childInfo();
  let md = `# ${x.title}\n\n> ${first ? first.name : ''} — ${last ? last.name : ''}　撰写：${x.author}　${x.createdAt}\n\n`;
  md += `## 一、基本信息\n\n| 项目 | 内容 |\n| --- | --- |\n| 姓名 | ${c.name}（小名 ${c.nickname}） |\n| 性别 / 出生 | ${c.gender} / ${c.birth} |\n| 学校 | ${c.school} ${c.grade} |\n| 幼儿园 | ${c.kindergarten} |\n\n`;
  md += `## 二、总体发展水平\n\n综合得分率由 **${pct(first ? avgOfPeriod(first) : null)}** 变为 **${pct(last ? avgOfPeriod(last) : null)}**。\n\n| 领域 | ${first ? first.code : ''} | ${last ? last.code : ''} | 变化 |\n| --- | --- | --- | --- |\n`;
  domRank.forEach(d => { md += `| ${d.key} | ${pct(d.first)} | ${pct(d.last)} | ${d.delta == null ? '–' : (d.delta > 0 ? '+' : '') + (d.delta * 100).toFixed(1) + 'pt'} |\n`; });
  if (ups.length) { md += `\n## 三、优势领域\n\n`; domRank.filter(d => d.last != null).sort((a, b) => b.last - a.last).slice(0, 2).forEach(d => { md += `- **${d.key}**（${pct(d.last)}）\n`; }); md += `\n周期内 ${ups.length} 项指标进步：\n\n`; ups.slice(0, 8).forEach(e => { md += `- **${e.n}**（${e.d}）\n`; }); }
  md += `\n## 四、需重点关注\n\n`; if (chronic.length) { md += `两期及以上未完全达标：\n\n| 领域 | 指标 | 要求 | 最近 |\n| --- | --- | --- | --- |\n`; chronic.slice(0, 15).forEach(e => { md += `| ${e.d} | ${e.n} | ${(e.b || '').replace(/\|/g, '/')} | ${lastLv(e)} |\n`; }); } else md += `暂无长期未达标指标。\n`;
  md += `\n## 五、家长观察摘要\n\n`; if (notes.length) notes.slice(0, 10).forEach(n => { md += `- **${n.date}**（${n.domain}${n.indicator ? ' · ' + n.indicator : ''}）${n.text}\n`; }); else md += `本周期暂无观察记录。\n`;
  if (x.goals) { md += `\n## 六、下阶段目标\n\n`; x.goals.split('\n').filter(Boolean).forEach(g => { md += `- ${g.trim()}\n`; }); }
  if (x.message) md += `\n## ${x.goals ? '七' : '六'}、家长寄语\n\n${x.message}\n`;
  return md;
}
export function summaryPeriodHtml(p) {
  const ds = p.domainScores || {}; const stats = p.domainStats || {};
  return `<h1>${esc(p.name)}</h1><div class="doc-sub">${esc(p.date)} · ${esc(p.code || '')} · 综合 ${pct(avgOfPeriod(p))}</div>
    <table><thead><tr><th>领域</th><th class="num">得分率</th><th>结构（符合/较/不符/待）</th></tr></thead><tbody>
    ${DOMS.map(d => `<tr><td><b style="color:${domMeta(d).color}">${esc(domLabel(d))}</b></td><td class="num">${pct(ds[d])}</td>
      <td>${stats[d] ? `${stats[d].ok}/${stats[d].mid}/${stats[d].no}/${stats[d].pending}` : '–'}</td></tr>`).join('')}</tbody></table>`;
}

/* ---------- 数据管理 ---------- */
export function renderData() {
  const s = Store.s;
  const c = childInfo();
  const html = `<div class="card mb"><div class="card-h"><h3>孩子信息</h3><button class="btn sm" onclick="TT.openChild()">✎ 编辑</button></div>
    <div class="card-b">
      <div class="spread"><b style="font-size:15px">${esc(childFullName())}</b><span class="chip">${esc(c.gender || '—')} · ${esc(c.birth || '—')}</span></div>
      <div class="hint mt">${esc([c.grade, c.kindergarten || c.school].filter(Boolean).join(' · '))}</div>
    </div></div>
  <div class="grid g-2 mb">
    <div class="card"><div class="card-h"><h3>备份与恢复</h3></div><div class="card-b">
      <div class="row mb" style="gap:8px"><button class="btn primary" onclick="TT.exportData()">导出全部数据</button><button class="btn" onclick="TT.importData()">从备份恢复</button></div>
      <table><tbody>
        <tr><th>观察记录</th><td class="num">${s.notes.length} 条</td></tr>
        <tr><th>指标补充评价</th><td class="num">${Object.keys(s.overrides).length} 条</td></tr>
        <tr><th>家长测评期次</th><td class="num">${s.parentPeriods.length} 期</td></tr>
        <tr><th>习惯打卡月份</th><td class="num">${Object.keys(s.habits).length} 个月</td></tr>
        <tr><th>综合评价报告</th><td class="num">${s.summaries.length} 份</td></tr></tbody></table>
      <div class="mt"><button class="btn danger sm" onclick="TT.resetData()">清空所有家长数据</button></div>
    </div></div>
    <div class="card"><div class="card-h"><h3>数据来源与口径</h3></div><div class="card-b" style="max-height:300px;overflow:auto">
      <table><thead><tr><th>期次</th><th>来源</th><th>阶段</th><th>完整度</th></tr></thead><tbody>
      ${D.periods.map(p => `<tr><td><b>${esc(p.code)}</b><div class="hint">${esc(p.name)}</div></td><td style="font-size:12px">${(p.files || []).map(f => esc(f.n)).join('<br>') || '–'}</td>
        <td><span class="chip" style="border-color:${p.stage === 'k' ? '#4a7fd433' : '#c9622f33'};color:${p.stage === 'k' ? '#6ea8ff' : '#ff9a5a'}">${p.stage === 'k' ? '幼儿园' : '小学'}</span></td>
        <td>${p.dataLevel === 'full' ? `<span class="lv lv-ok">明细 ${p.indicatorCount} 项</span>` : p.dataLevel === 'domain' ? '<span class="lv lv-mid">领域级</span>' : '<span class="lv lv-pending">叙述性</span>'}</td></tr>`).join('')}</tbody></table>
      <div class="hint mt">计分口径：符合=1，较符合=0.5，不符合=0，待观察/未测试不计入。领域得分率=该领域已计分指标得分之和÷已计分指标数。</div>
    </div></div></div>
  <div class="card"><div class="card-h"><h3>成长档案（原始材料索引）</h3></div><div class="card-b">
    ${[...new Set((D.archives || []).map(a => a.cat))].map(cat => `<div class="sec-t">${esc(cat)}</div><div class="grid g-2">${(D.archives || []).filter(a => a.cat === cat).map(a => `<div class="card"><div class="card-b"><div class="spread"><b style="font-size:13.5px">${esc(a.title)}</b><span class="chip">${esc(a.date)}</span></div>
      <div class="para" style="font-size:12px;margin-top:5px">${esc(a.desc)}</div>
      <div class="files">${(a.files || []).map(f => `<a class="file" href="${esc(f.p)}" target="_blank"><span class="ft ${esc(f.t)}">${esc(f.t.toUpperCase())}</span>${esc(f.n)}</a>`).join('')}</div></div></div>`).join('')}</div>`).join('')}
  </div></div>
  <div class="card"><div class="card-h"><h3>关于本系统</h3></div><div class="card-b"><div class="para">纯本地静态应用，无需联网与服务器，双击 index.html 即可使用。数据集生成于 ${esc(D.meta.generatedAt || '')}，共整合 ${esc(D.meta.sourceCount || '')} 条指标记录。所有原始文件链接指向本机真实文件。</div></div></div>`;
  Side.render(`<b>数据管理</b>`, html, { fn: renderData, args: [] });
}
export function renderAbout() {
  const html = `<div class="card"><div class="card-h"><h3>设计理念</h3></div><div class="card-b para">
    以 <b>全屏星空图</b> 作为唯一主界面：每个孩子是一颗星，六大领域 / 九大学科是环绕的星座，指标是更小的星辰。拖拽旋转、滚轮缩放、悬停高亮、点击下钻——所有评价、记录、分析与报告都围绕这颗星展开，不再有分散的页面。
    <br><br><b>数据口径</b>：幼儿园阶段依据《3~6岁儿童学习与发展指南》六大领域过程性评价指标体系；小学阶段依据 2022 义务教育课程标准梳理的学科评价维度，数学融合教育知识图谱真实学习路径。
    <br><br><b>隐私</b>：园所测评数据固化在 js/data/data.js，家长新增数据仅存于本机浏览器（localStorage）。换电脑或清理浏览器前请先「导出全部数据」备份。</div></div>`;
  Side.render(`<b>关于本系统</b>`, html, { fn: renderAbout, args: [] });
}

/* =========================================================
   视图动作（供 window.TT 桥接调用）
   ========================================================= */
export function newParentPeriod() { newParentPeriodModal(); }
export function editPP(id) { vaEditing = id; vaDom = null; prTab = 'assess'; renderParent('assess'); }
export function delPP(id) { if (confirm('删除这期家长评价及其全部打分？')) { Store.delParentPeriod(id); bus.emit('app/refresh-side'); renderParent('assess'); } }
export function assessBack() { vaEditing = null; renderParent('assess'); }
export function assessFin(id) { vaEditing = null; toast('已保存'); openPeriod(id); }
export function setAsDom(d) { vaDom = d; Side.refresh(); }
export function rate(pp, k, l) { const cur = Store.getParentPeriod(pp); if (!cur) return; if (!l) Store.rate(pp, k, null); else Store.rate(pp, k, { l }); Side.refresh(); }
export function rateNote(pp, k, v) { const cur = Store.getParentPeriod(pp); if (!cur) return; const ex = cur.ratings[k]; Store.rate(pp, k, ex ? Object.assign({}, ex, { r: v }) : { l: '未测试', r: v }); }
export function openPeriod(id) { const p = allPeriods().concat(D.periods).find(x => x.id === id) || D.periods.find(x => x.id === id); if (!p) return; modal(esc(p.name), `<div class="doc">${summaryPeriodHtml(p)}</div>`); }
export function delNote(id) { if (confirm('删除这条观察记录？')) { Store.delNote(id); bus.emit('app/refresh-side'); Side.refresh(); toast('已删除'); } }
export function exportNotes() { const notes = Store.s.notes; const levelOf = n => n.level || (n.stars >= 5 ? '符合' : n.stars >= 3 ? '较符合' : '不符合'); const md = ['# 悠悠观察记录\n'].concat(notes.map(n => `## ${n.date} · ${n.domain}${n.indicator ? ' · ' + n.indicator : ''}\n\n${levelOf(n)}　${n.by}\n\n${n.text}\n`)).join('\n'); download('悠悠观察记录.md', md, 'text/markdown'); toast('已导出'); }
export function tapHabit(id, day) { Store.toggleHabit(habitMonth, id, day); Side.refresh(); }
export function editHabits() { editHabitsModal(); }
export function printSummary() { window.print(); }
export function exportSummaryMD(id) { const x = Store.s.summaries.find(v => v.id === id) || Store.s.summaries[0]; if (x) { download(x.title + '.md', summaryMarkdown(x), 'text/markdown'); toast('已导出'); } }
export function delSummary(id) { if (confirm('删除这份综合评价？')) { Store.delSummary(id); renderSummaryList(); } }
export function exportData() { download(`悠悠成长评价_备份_${today()}.json`, Store.exportJSON(), 'application/json'); toast('已导出备份'); }
export function importData() { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json'; inp.onchange = () => { const f = inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { Store.importJSON(rd.result); toast('恢复成功'); bus.emit('app/refresh-side'); bus.emit('search/rebuild'); renderData(); } catch (e) { toast('文件格式有误'); } }; rd.readAsText(f); }; inp.click(); }
export function resetData() { if (confirm('将清空所有家长记录、打卡与评价报告，且不可恢复。确定？')) { Store.reset(); bus.emit('app/refresh-side'); bus.emit('search/rebuild'); renderData(); toast('已清空'); } }
export function rateIndicator(domainKey, subKey, rowKey, level) { const pid = latestFull() ? latestFull().id : null; if (!pid) return toast('暂无可补充评价的期次'); Store.setOverride(pid, rowKey, level ? { level, by: '家长', note: '' } : null); Side.refresh(); toast('已记录补充评价'); }
export function openPrimaryIndicator(si, ci, ii) { renderPrimaryIndicator(si, ci, ii); }
export function ratePrimaryIndicator(si, ci, ii, level) {
  const ct = (SUBJ_COMP_TREES[si] || [])[ci]; const ind = ct ? ct.inds[ii] : null; if (!ind) return;
  Store.setSubjectOverride(ind.key, level ? { level, by: '家长', note: '' } : null);
  Side.refresh(); toast(level ? '已记录评价' : '已清除评价');
}

/* ---------- 模态表单 ---------- */
export function openChild() {
  const c = childInfo();
  modal('编辑孩子信息', `<div class="hint mb">这些信息只保存在本机浏览器，用于替换默认示例（林悠然·悠悠），让系统适用于你家孩子。</div>
    <div class="field mb"><label>姓名</label><input type="text" id="cc-name" value="${esc(c.name || '')}" placeholder="如：张小明"></div>
    <div class="field mb"><label>小名 / 昵称</label><input type="text" id="cc-nick" value="${esc(c.nickname || '')}" placeholder="如：小明"></div>
    <div class="grid g-2 mb">
      <div class="field"><label>性别</label><input type="text" id="cc-gender" value="${esc(c.gender || '')}" placeholder="女 / 男"></div>
      <div class="field"><label>出生年月</label><input type="text" id="cc-birth" value="${esc(c.birth || '')}" placeholder="如：2015-01"></div>
    </div>
    <div class="field mb"><label>年级 / 班级</label><input type="text" id="cc-grade" value="${esc(c.grade || '')}" placeholder="如：二年级"></div>
    <div class="field mb"><label>幼儿园 / 学校</label><input type="text" id="cc-kg" value="${esc(c.kindergarten || '')}" placeholder="如：XX 幼儿园"></div>
    <div class="field"><label>就读学校</label><input type="text" id="cc-school" value="${esc(c.school || '')}" placeholder="如：XX 小学"></div>`,
    `<button class="btn" onclick="TT.closeModal()">取消</button><button class="btn primary" id="cc-ok">保存</button>`);
  $('#cc-ok').onclick = () => {
    Store.setChildInfo({
      name: $('#cc-name').value.trim(),
      nickname: $('#cc-nick').value.trim(),
      gender: $('#cc-gender').value.trim(),
      birth: $('#cc-birth').value.trim(),
      grade: $('#cc-grade').value.trim(),
      kindergarten: $('#cc-kg').value.trim(),
      school: $('#cc-school').value.trim()
    });
    closeModal();
    bus.emit('app/child-updated');
    toast('已更新孩子信息');
  };
}
function newParentPeriodModal() {
  const tpls = D.periods.filter(p => p.indicatorCount > 0);
  modal('新建一期家长评价', `<div class="field mb"><label>评价名称</label><input type="text" id="np-name" value="家长评价 ${new Date().getFullYear()}·${new Date().getMonth() < 6 ? '上半年' : '下半年'}"></div>
    <div class="field mb"><label>评价日期</label><input type="date" id="np-date" value="${today()}"></div>
    <div class="field mb"><label>指标模板</label><select id="np-tpl">${tpls.map(t => `<option value="${t.id}" ${t.id === 'P5' ? 'selected' : ''}>${esc(t.name)} · ${t.indicatorCount} 项</option>`).join('')}</select></div>
    <div class="field"><label>阶段说明（可选）</label><textarea id="np-sum" placeholder="例如：小学二年级下学期，重点关注运动习惯与作业专注度"></textarea></div>`,
    `<button class="btn" onclick="TT.closeModal()">取消</button><button class="btn primary" id="np-ok">创建并开始</button>`);
  $('#np-ok').onclick = () => { const pp = Store.addParentPeriod({ name: $('#np-name').value.trim() || '家长评价', date: $('#np-date').value || today(), templateId: $('#np-tpl').value, summary: $('#np-sum').value.trim(), klass: D.child.grade, stage: state.stage });
    closeModal(); bus.emit('app/refresh-side'); vaEditing = pp.id; vaDom = null; prTab = 'assess'; renderParent('assess'); };
}
export function openNoteModal(domain, indicator) {
  modal('新增观察记录', `<div class="field mb"><label>日期</label><input type="date" id="nm-date" value="${today()}"></div>
    <div class="field mb"><label>记录人</label><input type="text" id="nm-by" value="爸爸"></div>
    <div class="field mb"><label>关联领域</label><select id="nm-dom">${D.domains.map(d => `<option value="${esc(d.key)}" ${domain === d.key ? 'selected' : ''}>${esc(domLabel(d.key))}</option>`).join('')}</select></div>
    <div class="field mb"><label>关联指标（可选）</label><input type="text" id="nm-ind" value="${esc(indicator || '')}" placeholder="如：连续跳绳"></div>
    <div class="field mb"><label>表现评级</label><div class="rate-row" id="nm-level">${[['符合','ok'],['较符合','mid'],['不符合','no']].map(([l,c]) => `<button class="rate-btn ${c}" data-l="${esc(l)}">${esc(l)}</button>`).join('')}</div></div>
    <div class="field mb"><label>观察内容</label><textarea id="nm-txt" placeholder="记录具体情境、行为与结果……"></textarea></div>`,
    `<button class="btn" onclick="TT.closeModal()">取消</button><button class="btn primary" id="nm-ok">保存</button>`);
  let level = '符合'; const sw = $('#nm-level'); const paint = () => sw.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.l === level));
  sw.onclick = e => { const b = e.target.closest('button'); if (b) { level = b.dataset.l; paint(); } }; paint();
  $('#nm-ok').onclick = () => { const text = $('#nm-txt').value.trim(); if (!text) return toast('请填写观察内容');
    const stars = level === '符合' ? 5 : level === '较符合' ? 3 : 1;
    Store.addNote({ date: $('#nm-date').value || today(), by: $('#nm-by').value.trim() || '家长', domain: $('#nm-dom').value, indicator: $('#nm-ind').value.trim(), text, level, stars });
    closeModal(); bus.emit('app/refresh-side'); if (Side.cur) Side.refresh(); toast('已保存'); };
}
function editHabitsModal() {
  const items = Store.habitItems();
  modal('管理打卡项', `<div class="hint mb">每行一项，格式：名称 | 分类</div><textarea id="hb-txt" style="min-height:220px">${items.map(i => i.name + ' | ' + (i.cat || '')).join('\n')}</textarea>`,
    `<button class="btn" onclick="TT.closeModal()">取消</button><button class="btn primary" id="hb-ok">保存</button>`);
  $('#hb-ok').onclick = () => { const list = $('#hb-txt').value.split('\n').map(s => s.trim()).filter(Boolean).map((s, i) => { const [n, c] = s.split('|').map(x => (x || '').trim()); return { id: 'h' + (i + 1), name: n, cat: c || '' }; }); Store.setHabitItems(list); closeModal(); Side.refresh(); toast('已更新'); };
}
