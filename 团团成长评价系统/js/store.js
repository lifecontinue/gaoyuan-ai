/* 本地存储层：家长记录、指标补充评价、习惯打卡、家长自评期次、综合评价草稿 */
(function (w) {
  const KEY = 'tuantuan_growth_v1';
  const DEFAULT = {
    notes: [],            // {id,date,by,domain,indicator,text,stars,tags[]}
    overrides: {},        // "periodId::indKey" -> {level,note,by,at}
    habits: {},           // "YYYY-MM" -> { habitId: { day: 1|2 } }   1=独立完成 2=帮助下完成
    habitItems: null,     // 自定义打卡项（null 表示用预置）
    parentPeriods: [],    // {id,name,date,klass,standard,templateId,createdAt,done,ratings:{indKey:{l,r}}}
    summaries: [],        // {id,title,createdAt,scope,strengths,focus,goals,message,author}
    settings: { lastView: 'overview' }
  };

  let state = null;

  function load() {
    if (state) return state;
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? Object.assign({}, DEFAULT, JSON.parse(raw)) : JSON.parse(JSON.stringify(DEFAULT));
    } catch (e) {
      state = JSON.parse(JSON.stringify(DEFAULT));
    }
    return state;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(load())); }
    catch (e) { console.warn('保存失败', e); }
  }
  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  const Store = {
    get s() { return load(); },
    save,
    uid,

    /* 观察记录 */
    addNote(n) { const s = load(); n.id = uid('n'); s.notes.unshift(n); save(); return n; },
    updateNote(id, patch) { const s = load(); const i = s.notes.findIndex(x => x.id === id); if (i > -1) { Object.assign(s.notes[i], patch); save(); } },
    delNote(id) { const s = load(); s.notes = s.notes.filter(x => x.id !== id); save(); },

    /* 指标补充评价 */
    setOverride(periodId, indKey, data) {
      const s = load();
      const k = periodId + '::' + indKey;
      if (!data) delete s.overrides[k]; else s.overrides[k] = Object.assign({ at: new Date().toISOString().slice(0, 10) }, data);
      save();
    },
    getOverride(periodId, indKey) { return load().overrides[periodId + '::' + indKey] || null; },

    /* 习惯打卡 */
    habitItems() { const s = load(); return s.habitItems || (w.TT_DATA.habitPresets || []); },
    setHabitItems(items) { const s = load(); s.habitItems = items; save(); },
    toggleHabit(month, hid, day) {
      const s = load();
      const m = s.habits[month] || (s.habits[month] = {});
      const h = m[hid] || (m[hid] = {});
      const cur = h[day] || 0;
      const next = (cur + 1) % 3;
      if (next === 0) delete h[day]; else h[day] = next;
      save();
      return next;
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

    /* 备份 */
    exportJSON() { return JSON.stringify(load(), null, 2); },
    importJSON(txt) {
      const obj = JSON.parse(txt);
      state = Object.assign({}, DEFAULT, obj);
      save();
    },
    reset() { state = JSON.parse(JSON.stringify(DEFAULT)); save(); }
  };

  w.Store = Store;
})(window);
