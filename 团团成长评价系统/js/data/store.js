/* =========================================================
   data/store.js — 本地持久化层（LocalStorage）
   职责：家长记录 / 指标补充评价 / 习惯打卡 / 家长自评期次 / 综合评价 / 设置。
   含 schema 版本与迁移钩子（P3）：新增字段时先 bump SCHEMA_VERSION 并登记迁移函数，
   保证旧数据无损升级。
   ========================================================= */
import { STORAGE_KEY, SCHEMA_VERSION } from '../core/config.js';
import { uid } from '../core/utils.js';
import { TT_DATA } from './data.js';

const DEFAULT = {
  version: SCHEMA_VERSION,
  notes: [],            // {id,date,by,domain,indicator,text,stars,tags[]}
  overrides: {},        // "periodId::indKey" -> {level,note,by,at}
  subjectOverrides: {}, // "p3-<si>-<ti>-<ii>" -> {level,note,by,at}（小学学科指标家庭自评）
  habits: {},           // "YYYY-MM" -> { habitId: { day: 1|2 } }  1=独立完成 2=帮助下完成
  habitItems: null,     // 自定义打卡项（null 表示用预置）
  parentPeriods: [],    // {id,name,date,klass,standard,templateId,createdAt,ratings:{indKey:{l,r}}}
  summaries: [],        // {id,title,createdAt,from,to,goals,message,author}
  childInfo: null,      // 可编辑的孩子信息覆盖层 {name,nickname,gender,birth,grade,kindergarten,school}
  settings: { lastStage: 'k' }
};

/** 迁移表：key = 目标版本号；value = (data) => data。版本号递增时逐个应用。 */
const MIGRATIONS = {
  // v1 -> v2：补充 settings.lastStage 与 version 字段（纯新增，向后兼容）
  2: (d) => { d.settings = Object.assign({ lastStage: 'k' }, d.settings || {}); return d; },
  // v2 -> v3：新增小学学科指标自评容器（纯新增，向后兼容）
  3: (d) => { if (!('subjectOverrides' in d)) d.subjectOverrides = {}; return d; },
  // v3 -> v4：新增可编辑孩子信息容器（纯新增，向后兼容）
  4: (d) => { if (!('childInfo' in d)) d.childInfo = null; return d; }
};

let state = null;

/** 逐级应用迁移，直至 SCHEMA_VERSION */
function migrate(data) {
  let v = data.version || 1;
  while (v < SCHEMA_VERSION) { v++; if (MIGRATIONS[v]) data = MIGRATIONS[v](data); data.version = v; }
  return data;
}

function load() {
  if (state) return state;
  let data;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    data = raw ? Object.assign({}, DEFAULT, JSON.parse(raw)) : JSON.parse(JSON.stringify(DEFAULT));
  } catch (e) {
    data = JSON.parse(JSON.stringify(DEFAULT));
  }
  const before = data.version || 1;
  state = migrate(data);
  if (state.version !== before) save();   // 迁移后持久化新版本号
  return state;
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(load())); }
  catch (e) { console.warn('保存失败', e); }
}

export const Store = {
  get s() { return load(); },
  save,
  uid,
  /** 当前数据结构版本 */
  get version() { return load().version || 1; },

  /* 观察记录 */
  addNote(n) { const s = load(); n.id = uid('n'); s.notes.unshift(n); save(); return n; },
  updateNote(id, patch) { const s = load(); const i = s.notes.findIndex(x => x.id === id); if (i > -1) { Object.assign(s.notes[i], patch); save(); } },
  delNote(id) { const s = load(); s.notes = s.notes.filter(x => x.id !== id); save(); },

  /* 指标补充评价 */
  setOverride(periodId, indKey, data) {
    const s = load(); const k = periodId + '::' + indKey;
    if (!data) delete s.overrides[k]; else s.overrides[k] = Object.assign({ at: new Date().toISOString().slice(0, 10) }, data);
    save();
  },
  getOverride(periodId, indKey) { return load().overrides[periodId + '::' + indKey] || null; },

  /* 小学学科指标家庭自评（与期次无关，按指标主键存储） */
  setSubjectOverride(key, data) {
    const s = load();
    if (!data) delete s.subjectOverrides[key]; else s.subjectOverrides[key] = Object.assign({ at: new Date().toISOString().slice(0, 10) }, data);
    save();
  },
  getSubjectOverride(key) { return load().subjectOverrides[key] || null; },

  /* 习惯打卡 */
  habitItems() { const s = load(); return s.habitItems || (TT_DATA.habitPresets || []); },
  setHabitItems(items) { const s = load(); s.habitItems = items; save(); },
  toggleHabit(month, hid, day) {
    const s = load();
    const m = s.habits[month] || (s.habits[month] = {});
    const h = m[hid] || (m[hid] = {});
    const next = ((h[day] || 0) + 1) % 3;
    if (next === 0) delete h[day]; else h[day] = next;
    save(); return next;
  },
  habitMonth(month) { return load().habits[month] || {}; },

  /* 家长自评期次 */
  addParentPeriod(p) { const s = load(); p.id = uid('pp'); p.createdAt = new Date().toISOString().slice(0, 10); p.ratings = {}; s.parentPeriods.push(p); save(); return p; },
  getParentPeriod(id) { return load().parentPeriods.find(x => x.id === id) || null; },
  rate(ppId, indKey, val) {
    const p = Store.getParentPeriod(ppId); if (!p) return;
    if (val === null) delete p.ratings[indKey]; else p.ratings[indKey] = Object.assign(p.ratings[indKey] || {}, val);
    save();
  },
  delParentPeriod(id) { const s = load(); s.parentPeriods = s.parentPeriods.filter(x => x.id !== id); save(); },

  /* 综合评价 */
  addSummary(x) { const s = load(); x.id = uid('sm'); x.createdAt = new Date().toISOString().slice(0, 16).replace('T', ' '); s.summaries.unshift(x); save(); return x; },
  delSummary(id) { const s = load(); s.summaries = s.summaries.filter(x => x.id !== id); save(); },

  /* 可编辑的孩子信息（覆盖层，默认继承数据内置信息） */
  get child() {
    const base = TT_DATA.child || {};
    const ov = load().childInfo;
    return ov ? Object.assign({}, base, ov) : base;
  },
  setChildInfo(info) {
    const s = load();
    s.childInfo = Object.assign({}, s.childInfo, info);
    save();
  },

  /* 备份 / 恢复 / 重置 */
  exportJSON() { return JSON.stringify(load(), null, 2); },
  importJSON(txt) { const obj = JSON.parse(txt); state = migrate(Object.assign({}, DEFAULT, obj)); save(); },
  reset() { state = JSON.parse(JSON.stringify(DEFAULT)); save(); }
};
