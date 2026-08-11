/* =========================================================
   domain/growth.js — 成长领域模型（幼儿园六大领域 + 测评期次 + 指标登记）
   单一职责：纯业务计算。不访问 DOM；通过 state.stage 读取当前阶段，
   通过 Store 读取家长数据。所有 UI 取数都应经过这里，保证单一口径。
   ========================================================= */
import { TT_DATA } from '../data/data.js';
import { Store } from '../data/store.js';
import { LV } from '../core/config.js';
import { state } from '../core/state.js';
import { avgOf } from '../core/utils.js';

export const D = TT_DATA;
/** 六大领域 key 列表 */
export const DOMS = D.domains.map(d => d.key);
/** 领域元信息（颜色/图标/描述） */
export const domMeta = k => D.domains.find(d => d.key === k) || { color: '#999', icon: '•' };
/** 领域显示名（通用化后的 name；无 name 时退回 key） */
export const domLabel = k => { const d = (D.domains || []).find(x => x.key === k); return d ? (d.name || d.key) : k; };
/** 阶段定义 */
export const STAGES = D.meta.stages || { k: { label: '幼儿园' }, p: { label: '小学' } };

/* ---------- 指标索引（同名指标按出现次序编号为唯一 k） ---------- */
export function keyRows(rows) {
  const seen = {}, out = [];
  rows.forEach(r => { const base = r.d + '|' + r.n; seen[base] = (seen[base] || 0) + 1; out.push(Object.assign({}, r, { k: base + '#' + seen[base] })); });
  return out;
}
export const INDEX = {};
Object.keys(D.indicators || {}).forEach(pid => { INDEX[pid] = keyRows(D.indicators[pid]); });

/** 把一期家长自评展开成统一 period 结构（含逐行得分与领域分） */
export function parentToPeriod(pp) {
  const tpl = INDEX[pp.templateId] || INDEX['P5'] || [];
  const rows = tpl.map(r => { const rt = pp.ratings[r.k]; return Object.assign({}, r, { l: rt ? rt.l : '未测试', v: rt ? (LV[rt.l] || {}).s : null, r: rt && rt.r ? rt.r : '' }); });
  const ds = {}, stats = {};
  DOMS.forEach(dk => {
    const sub = rows.filter(r => r.d === dk); const scored = sub.filter(r => r.v != null);
    ds[dk] = scored.length ? +(scored.reduce((a, b) => a + b.v, 0) / scored.length).toFixed(4) : null;
    stats[dk] = { rate: ds[dk], scored: scored.length, total: sub.length, ok: sub.filter(r => r.l === '符合').length, mid: sub.filter(r => r.l === '较符合').length, no: sub.filter(r => r.l === '不符合').length, pending: sub.filter(r => r.v == null).length };
  });
  const done = rows.filter(r => r.v != null).length;
  return { id: pp.id, code: '家长', name: pp.name, date: pp.date, klass: pp.klass || '', standard: pp.standard || '沿用园所指标体系', kind: 'parent', dataLevel: 'full', domainScores: ds, domainStats: stats, indicatorCount: rows.length, _rows: rows, _progress: done / (rows.length || 1), summary: pp.summary || '', files: [], stage: pp.stage || 'k' };
}

/** 当前（或指定）阶段的全部期次：园所测评 + 家长自评，按日期排序 */
export function stagePeriods(stage) {
  const st = stage || state.stage;
  const built = D.periods.filter(p => p.stage === st);
  const parents = Store.s.parentPeriods.filter(pp => (pp.stage || 'k') === st).map(parentToPeriod);
  return built.concat(parents).sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
}
export function allPeriods() { return stagePeriods(state.stage); }

/** 取某期指标行（家长期次用其内存行；园所期次套用补充评价 override） */
export function rowsOf(p) {
  if (p._rows) return p._rows;
  return (INDEX[p.id] || []).map(r => { const ov = Store.getOverride(p.id, r.k); return ov ? Object.assign({}, r, { l: ov.level || r.l, v: ov.level ? (LV[ov.level] || {}).s : r.v, _ov: ov }) : r; });
}

/** 有数据的期次（含明细或领域级） */
export const withData = () => allPeriods().filter(p => p.indicatorCount > 0 || p.dataLevel === 'domain');
/** 最近一期含指标明细的期次 */
export const latestFull = () => { const a = allPeriods().filter(p => p.indicatorCount > 0); return a[a.length - 1]; };

/** 跨期指标登记：把同一指标在各期的表现聚成一条记录，并打标签 */
export function registry() {
  const ps = allPeriods().filter(p => p.indicatorCount > 0); const reg = {};
  ps.forEach(p => rowsOf(p).forEach(r => {
    const e = reg[r.k] || (reg[r.k] = { k: r.k, d: r.d, s: r.s, g: r.g, n: r.n, b: r.b, hist: {} });
    e.d = r.d; e.s = r.s || e.s; e.g = r.g || e.g; e.b = r.b || e.b; e.hist[p.id] = { l: r.l, v: r.v, r: r.r, ov: r._ov };
  }));
  Object.values(reg).forEach(e => {
    const seq = ps.map(p => e.hist[p.id]).filter(Boolean); const scored = seq.filter(x => x.v != null);
    e.first = scored[0] ? scored[0].v : null; e.last = scored.length ? scored[scored.length - 1].v : null; e.times = seq.length;
    e.badTimes = seq.filter(x => x.v != null && x.v < 1).length; e.delta = (e.first != null && e.last != null) ? +(e.last - e.first).toFixed(2) : null;
    e.tag = e.last == null ? 'unknown' : (e.last < 1 && e.badTimes >= 2) ? 'chronic' : (e.delta > 0) ? 'up' : (e.delta < 0) ? 'down' : (e.last === 1 ? 'stable' : 'watch');
  });
  return { reg, ps };
}

/** 指标最近一次评价等级 */
export function lastLv(e) { const ps = allPeriods().filter(p => p.indicatorCount > 0); for (let i = ps.length - 1; i >= 0; i--) if (e.hist[ps[i].id]) return e.hist[ps[i].id].l; return '未测试'; }

/** 某期综合得分率（六大领域已计分值的平均） */
export function avgOfPeriod(p) { return avgOf(DOMS.map(d => p.domainScores[d])); }

/** 某期最薄弱 / 最优势领域 */
export function weakestDomain(p) { const list = DOMS.map(d => ({ key: d, v: p.domainScores[d] })).filter(x => x.v != null).sort((a, b) => a.v - b.v); return list[0] || { key: DOMS[0], v: 0 }; }
export function strongestDomain(p) { const list = DOMS.map(d => ({ key: d, v: p.domainScores[d] })).filter(x => x.v != null).sort((a, b) => b.v - a.v); return list[0] || { key: DOMS[0], v: 0 }; }
/** 一组登记记录里出现最多的领域 */
export function topDomain(list) { const counts = {}; list.forEach(e => { counts[e.d] = (counts[e.d] || 0) + 1; }); const arr = Object.entries(counts).sort((a, b) => b[1] - a[1]); return arr.length ? arr[0][0] : '–'; }

/* ---------- 可编辑的孩子信息（覆盖层，默认继承数据内置信息） ---------- */
/** 合并后的孩子信息（Store 覆盖层优先） */
export function childInfo() { return Store.child; }
/** 全名：姓名（小名） */
export function childFullName() {
  const c = Store.child || {};
  if (c.name && c.nickname) return `${c.name}（${c.nickname}）`;
  return c.name || c.nickname || '孩子';
}
