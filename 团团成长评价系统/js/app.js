/* =========================================================
   团团成长星空 · 控制器
   以全屏星空为核心，所有功能整合进右侧抽屉（SidePanel）与全局菜单。
   数据：TT_DATA / Store / Charts / TT_SUBJECTS_P3
   ========================================================= */
(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const D = window.TT_DATA, S = window.Store, C = window.Charts;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = v => v == null ? '–' : (v * 100).toFixed(v * 100 % 1 === 0 ? 0 : 1) + '%';
  const domMeta = k => D.domains.find(d => d.key === k) || { color: '#999', icon: '•' };
  const DOMS = D.domains.map(d => d.key);
  const SUBJS = (window.TT_SUBJECTS_P3 && window.TT_SUBJECTS_P3.subjects) || [];

  const LV = { '符合': { c: 'ok', s: 1 }, '较符合': { c: 'mid', s: 0.5 }, '不符合': { c: 'no', s: 0 }, '待观察': { c: 'pending', s: null }, '未测试': { c: 'pending', s: null } };
  const lvc = l => (LV[l] || LV['未测试']).c;
  const lvPill = l => `<span class="lv lv-${lvc(l)}">${esc(l || '未测试')}</span>`;

  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200); }
  function modal(title, body, footer) {
    $('#modal').innerHTML = `<h2>${title}</h2><div class="modal-body">${body}</div><div class="m-foot">${footer || ''}</div>`;
    $('#modalMask').classList.add('show');
  }
  function closeModal() { $('#modalMask').classList.remove('show'); }
  $('#modalMask').addEventListener('click', e => { if (e.target.id === 'modalMask') closeModal(); });
  function download(name, text, mime) {
    const b = new Blob(['\ufeff' + text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  const today = () => new Date().toISOString().slice(0, 10);
  const thisMonth = () => new Date().toISOString().slice(0, 7);

  /* ---------- 数据装配 ---------- */
  function keyRows(rows) { const seen = {}, out = []; rows.forEach(r => { const base = r.d + '|' + r.n; seen[base] = (seen[base] || 0) + 1; out.push(Object.assign({}, r, { k: base + '#' + seen[base] })); }); return out; }
  const INDEX = {};
  Object.keys(D.indicators || {}).forEach(pid => { INDEX[pid] = keyRows(D.indicators[pid]); });
  function parentToPeriod(pp) {
    const tpl = INDEX[pp.templateId] || INDEX['P5'] || [];
    const rows = tpl.map(r => { const rt = pp.ratings[r.k]; return Object.assign({}, r, { l: rt ? rt.l : '未测试', v: rt ? (LV[rt.l] || {}).s : null, r: rt && rt.r ? rt.r : '' }); });
    const ds = {}, stats = {};
    DOMS.forEach(dk => { const sub = rows.filter(r => r.d === dk); const scored = sub.filter(r => r.v != null);
      ds[dk] = scored.length ? +(scored.reduce((a, b) => a + b.v, 0) / scored.length).toFixed(4) : null;
      stats[dk] = { rate: ds[dk], scored: scored.length, total: sub.length, ok: sub.filter(r => r.l === '符合').length, mid: sub.filter(r => r.l === '较符合').length, no: sub.filter(r => r.l === '不符合').length, pending: sub.filter(r => r.v == null).length }; });
    const done = rows.filter(r => r.v != null).length;
    return { id: pp.id, code: '家长', name: pp.name, date: pp.date, klass: pp.klass || '', standard: pp.standard || '沿用园所指标体系', kind: 'parent', dataLevel: 'full', domainScores: ds, domainStats: stats, indicatorCount: rows.length, _rows: rows, _progress: done / (rows.length || 1), summary: pp.summary || '', files: [], stage: pp.stage || 'k' };
  }

  const STAGES = D.meta.stages || { k: { label: '幼儿园' }, p: { label: '小学' } };
  const state = { stage: (S.s.settings && S.s.settings.lastStage) || 'k' };

  function setStage(st) {
    if (!STAGES[st]) st = 'k';
    state.stage = st;
    try { S.s.settings.lastStage = st; S.save(); } catch (e) {}
    $$('#galStage button, #stageMini button').forEach(b => b.classList.toggle('on', b.dataset.stage === st));
    buildSearchIndex();
    refreshSide();
    AI.setContext({ domain: null, metric: null, menu: null });
    if (window.AIPanel && window.AIPanel.onStageChange) window.AIPanel.onStageChange();
    if (window.Galaxy && window.Galaxy.active) window.Galaxy.enter(st);
  }

  function stagePeriods(stage) {
    const st = stage || state.stage;
    const built = D.periods.filter(p => p.stage === st);
    const parents = S.s.parentPeriods.filter(pp => (pp.stage || 'k') === st).map(parentToPeriod);
    return built.concat(parents).sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
  }
  function allPeriods() { return stagePeriods(state.stage); }
  function rowsOf(p) {
    if (p._rows) return p._rows;
    return (INDEX[p.id] || []).map(r => { const ov = S.getOverride(p.id, r.k); return ov ? Object.assign({}, r, { l: ov.level || r.l, v: ov.level ? (LV[ov.level] || {}).s : r.v, _ov: ov }) : r; });
  }
  const withData = () => allPeriods().filter(p => p.indicatorCount > 0 || p.dataLevel === 'domain');
  const latestFull = () => { const a = allPeriods().filter(p => p.indicatorCount > 0); return a[a.length - 1]; };
  function registry() {
    const ps = allPeriods().filter(p => p.indicatorCount > 0); const reg = {};
    ps.forEach(p => rowsOf(p).forEach(r => { const e = reg[r.k] || (reg[r.k] = { k: r.k, d: r.d, s: r.s, g: r.g, n: r.n, b: r.b, hist: {} }); e.d = r.d; e.s = r.s || e.s; e.g = r.g || e.g; e.b = r.b || e.b; e.hist[p.id] = { l: r.l, v: r.v, r: r.r, ov: r._ov }; }));
    Object.values(reg).forEach(e => { const seq = ps.map(p => e.hist[p.id]).filter(Boolean); const scored = seq.filter(x => x.v != null);
      e.first = scored[0] ? scored[0].v : null; e.last = scored.length ? scored[scored.length - 1].v : null; e.times = seq.length;
      e.badTimes = seq.filter(x => x.v != null && x.v < 1).length; e.delta = (e.first != null && e.last != null) ? +(e.last - e.first).toFixed(2) : null;
      e.tag = e.last == null ? 'unknown' : (e.last < 1 && e.badTimes >= 2) ? 'chronic' : (e.delta > 0) ? 'up' : (e.delta < 0) ? 'down' : (e.last === 1 ? 'stable' : 'watch'); });
    return { reg, ps };
  }
  function kpi(lab, val, unit, dt) { return `<div class="kpi"><div class="kpi-l">${lab}</div><div class="kpi-v">${val}<span class="kpi-u">${unit || ''}</span></div><div class="hint">${esc(dt || '')}</div></div>`; }
  function lastLv(e) { const ps = allPeriods().filter(p => p.indicatorCount > 0); for (let i = ps.length - 1; i >= 0; i--) if (e.hist[ps[i].id]) return e.hist[ps[i].id].l; return '未测试'; }
  function histDots(e) { const ps = allPeriods().filter(p => p.indicatorCount > 0); return `<div class="dots">${ps.map(p => { const h = e.hist[p.id]; return `<span class="dot ${h ? lvc(h.l) : 'empty'}" title="${esc(p.name)}：${h ? esc(h.l) : '该期无此指标'}"></span>`; }).join('')}</div>`; }
  function avgOfPeriod(p) { const v = DOMS.map(d => p.domainScores[d]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }

  /* ---------- 顶部信息 / 图例 ---------- */
  function refreshSide() {
    const ps = allPeriods();
    const lab = (STAGES[state.stage] || {}).label || state.stage;
    $('#tbStageLabel').textContent = state.stage === 'k' ? '幼儿园阶段 · 六大领域' : '小学阶段 · 三年级九大学科';
    const indCount = ps.reduce((a, p) => a + (p.indicatorCount || 0), 0);
    $('#galHud').innerHTML = `<span>阶段</span> <b>${esc(lab)}</b><br><span>期次</span> <b>${ps.length}</b> · <span>指标</span> <b>${indCount}</b>`;
    const legend = $('#galLegend');
    if (state.stage === 'k') {
      legend.innerHTML = '<div style="color:var(--txt-dim);margin-bottom:4px">六大领域</div>' + D.domains.map(d => `<div class="lg"><span class="dot" style="background:${d.color}"></span>${esc(d.key)}</div>`).join('');
    } else {
      const cmap = { chinese: '#e85c48', math: '#4a90ff', english: '#78c878', science: '#78dcdc', morals: '#ffb450', pe: '#ff8c64', arts: '#c878dc', it: '#50b4ff', labor: '#b4a078' };
      legend.innerHTML = '<div style="color:var(--txt-dim);margin-bottom:4px">九大学科</div>' + SUBJS.map(s => `<div class="lg"><span class="dot" style="background:${cmap[s.id] || '#ff9a5a'}"></span>${esc(s.name)}</div>`).join('');
    }
  }

  /* =========================================================
     AI 成长顾问（复用逻辑，路由恒为星空）
     ========================================================= */
  const AI = {
    messages: [], lastMenu: null,
    context: { route: 'galaxy', domain: null, metric: null, menu: null },
    quick: [
      { id: 'trend', label: '分析成长趋势', icon: '📈' },
      { id: 'weak', label: '找出薄弱领域', icon: '🔍' },
      { id: 'plan', label: '制定提升计划', icon: '📝' },
      { id: 'report', label: '生成家长报告', icon: '📄' },
      { id: 'activity', label: '推荐亲子活动', icon: '🎯' },
      { id: 'subjects', label: '三年级学科', icon: '📚' }
    ],
    init() { this.renderQuick(); this.setContext({ route: 'galaxy', domain: null, metric: null, menu: null }); this.post('ai', this.welcome(), false); this.scroll(); },
    setContext(ctx) { Object.assign(this.context, ctx); const el = $('#aiContextText'); if (el) el.textContent = this.contextText(); },
    contextText() {
      const c = this.context;
      if (c.menu) return '当前：' + c.menu;
      let s = '当前：星空总览'; if (c.domain) s += ' · ' + c.domain; if (c.metric) s += ' · ' + c.metric;
      if (state.stage === 'p' && SUBJS.length) s += ' · 三年级'; return s;
    },
    post(role, html, autoScroll = true) { this.messages.push({ role, html, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }); this.renderMessages(); if (autoScroll) this.scroll(); },
    renderMessages() { const out = $('#aiMessages'); if (!out) return; out.innerHTML = this.messages.map(m => `<div class="msg msg-${m.role}"><div class="msg-bubble">${m.html}</div><div class="msg-time">${m.time}</div></div>`).join(''); },
    renderQuick() { const out = $('#aiQuick'); if (!out) return; out.innerHTML = this.quick.map(q => `<button class="quick-chip" data-q="${esc(q.id)}">${esc(q.icon)} ${esc(q.label)}</button>`).join(''); out.onclick = e => { const b = e.target.closest('.quick-chip'); if (b) this.action(b.dataset.q); }; },
    scroll() { const out = $('#aiMessages'); if (out) out.scrollTop = out.scrollHeight; },
    welcome() {
      const ps = withData(); const cur = ps[ps.length - 1], prev = ps[ps.length - 2];
      if (!cur) {
        if (state.stage === 'p' && SUBJS.length) return `Hi，我是团团成长顾问。当前<b>小学</b>阶段还没有结构化测评数据，但团团已进入<b>三年级（第二学段）</b>。我已备好 <b>${SUBJS.length}</b> 门学科的「学科评价维度」：数学融合了教育知识图谱的真实学习路径，其余学科依据 2022 课标梳理。<br><br>在右侧抽屉「学科维度」可查看主题与可评指标；在「家长记录」里添加观察，我会随时帮你分析。`;
        return `Hi，我是团团成长顾问。当前<b>${STAGES[state.stage].label}</b>阶段还没有结构化测评数据。你可以在「家长记录」里添加观察，我会随时帮你分析。`;
      }
      const curAvg = avgOfPeriod(cur), prevAvg = prev ? avgOfPeriod(prev) : null;
      const diff = (curAvg != null && prevAvg != null) ? curAvg - prevAvg : null;
      const weak = this.weakestDomain(cur), strong = this.strongestDomain(cur);
      const { reg } = registry(); const chronic = Object.values(reg).filter(e => e.tag === 'chronic').length;
      let html = `Hi，林悠然（团团）的<b>${STAGES[state.stage].label}</b>数据已就绪。<br><br>最新一期 <b>${esc(cur.name)}</b> 综合得分率 <b>${pct(curAvg)}</b>`;
      if (diff != null) html += `，较上期${diff >= 0 ? '提升' : '下降'} <b class="${diff >= 0 ? 'up' : 'down'}">${Math.abs(diff * 100).toFixed(1)}pt</b>`;
      html += `。<br><br>优势领域：<b style="color:${domMeta(strong.key).color}">${strong.key}</b>（${pct(cur.domainScores[strong.key])}）；相对薄弱：<b style="color:${domMeta(weak.key).color}">${weak.key}</b>（${pct(cur.domainScores[weak.key])}）。`;
      if (chronic) html += `<br>目前长期待突破指标共 <b>${chronic}</b> 项。`;
      return html + `<br><br>点击星图中的节点可下钻详情；或试试下方快捷动作。`;
    },
    weakestDomain(p) { const list = DOMS.map(d => ({ key: d, v: p.domainScores[d] })).filter(x => x.v != null).sort((a, b) => a.v - b.v); return list[0] || { key: DOMS[0], v: 0 }; },
    strongestDomain(p) { const list = DOMS.map(d => ({ key: d, v: p.domainScores[d] })).filter(x => x.v != null).sort((a, b) => b.v - a.v); return list[0] || { key: DOMS[0], v: 0 }; },
    topDomain(list) { const counts = {}; list.forEach(e => { counts[e.d] = (counts[e.d] || 0) + 1; }); const arr = Object.entries(counts).sort((a, b) => b[1] - a[1]); return arr.length ? arr[0][0] : '–'; },
    domainSummary(p) { const list = DOMS.map(d => ({ key: d, v: p.domainScores[d] })).filter(x => x.v != null).sort((a, b) => b.v - a.v); if (!list.length) return '暂无领域得分。'; const s = list[0], w = list[list.length - 1]; return `<b style="color:${domMeta(s.key).color}">${s.key}</b> 表现最好（${pct(s.v)}），<b style="color:${domMeta(w.key).color}">${w.key}</b> 相对薄弱（${pct(w.v)}）。`; },
    action(id) {
      const ps = withData(); const cur = ps[ps.length - 1], prev = ps[ps.length - 2]; const { reg } = registry();
      if (id === 'trend') {
        if (!cur) { this.post('ai', '当前阶段数据不足，无法分析趋势。'); return; }
        const rows = ps.map(p => ({ name: p.name, avg: avgOfPeriod(p) }));
        let html = `最近 <b>${ps.length}</b> 期综合得分率趋势：<br>` + rows.map(r => `· ${esc(r.name)}：<b>${pct(r.avg)}</b>`).join('<br>');
        if (prev) { const deltas = DOMS.map(d => { const a = cur.domainScores[d], b = prev.domainScores[d]; return (a != null && b != null) ? { d, delta: a - b } : null; }).filter(Boolean).sort((a, b) => b.delta - a.delta);
          if (deltas.length) { html += `<br><br>与上期相比，提升最多的是 <b style="color:${domMeta(deltas[0].d).color}">${deltas[0].d}</b>（+${(deltas[0].delta * 100).toFixed(1)}pt），变化最小/下降的是 <b style="color:${domMeta(deltas[deltas.length - 1].d).color}">${deltas[deltas.length - 1].d}</b>（${deltas[deltas.length - 1].delta >= 0 ? '+' : ''}${(deltas[deltas.length - 1].delta * 100).toFixed(1)}pt）。`; } }
        this.post('ai', html);
      } else if (id === 'weak') {
        const chronic = Object.values(reg).filter(e => e.tag === 'chronic').sort((a, b) => b.badTimes - a.badTimes); const weakDomain = cur ? this.weakestDomain(cur) : null;
        let html = ''; if (weakDomain) html += `当前最薄弱领域是 <b style="color:${domMeta(weakDomain.key).color}">${weakDomain.key}</b>（${pct(weakDomain.v)}）。<br><br>`;
        if (chronic.length) html += `长期待突破指标 TOP 5：<br>` + chronic.slice(0, 5).map((e, i) => `${i + 1}. <b>${esc(e.n)}</b>（${esc(e.d)}）— 最近 ${lvPill(lastLv(e))}`).join('<br>') + `<br><br>建议优先把 <b>${this.topDomain(chronic)}</b> 领域的这些指标融入日常游戏与观察中。`;
        else html += '当前没有长期未达标指标，整体发展均衡。';
        this.post('ai', html);
      } else if (id === 'plan') {
        const chronic = Object.values(reg).filter(e => e.tag === 'chronic').slice(0, 3);
        let html = `<b>林悠然下阶段提升计划</b><br><br>1. <b>目标聚焦</b>：${chronic.length ? chronic.map(e => `提升「${esc(e.n)}」`).join('、') : '保持各领域均衡发展'}。<br>2. <b>每周记录</b>：在「家长记录」留下 2-3 条具体观察。<br>3. <b>习惯打卡</b>：把待突破指标转化为每日打卡项。<br>4. <b>家园对照</b>：学期末做一次家长测评。<br>5. <b>正向反馈</b>：关注进步指标，及时鼓励。`;
        this.post('ai', html);
      } else if (id === 'report') { this.post('ai', '已为你打开「综合评价」生成器。'); TT.openMenu('summary'); }
      else if (id === 'subjects') { this.post('ai', '已打开<b>三年级学科维度</b>。'); TT.openMenu('subjects'); }
      else if (id === 'activity') {
        if (state.stage === 'p' && SUBJS.length) {
          const picks = ['语文', '数学', '科学', '劳动']; let html = '基于<b>三年级</b>学科维度，推荐亲子活动：<br><br>';
          picks.forEach(name => { const s = SUBJS.find(x => x.name === name || (name === '语文' && x.id === 'chinese')); if (!s) return; const t = s.themes[0]; const ind = (t && t.indicators && t.indicators[0]) ? t.indicators[0] : '结合生活情境练习'; html += `· <b>${esc(s.name)}</b>：${esc(ind.text || ind)}<br>`; });
          html += '<br>通用建议：每天 10–15 分钟小任务、用照片记录过程、优先选孩子感兴趣的形式。'; this.post('ai', html); return;
        }
        const weak = cur ? this.weakestDomain(cur) : null;
        const map = { '健康与体能': '每天 15 分钟户外运动：拍球、跳绳、单脚站。', '习惯与自理': '用「睡前三件事」清单培养自理。', '自我与社会性': '通过角色扮演练习轮流与情绪表达。', '语言与交流': '每天亲子共读 20 分钟，鼓励复述故事。', '探究与认知': '提供自然观察任务（看蚂蚁、种豆子）。', '美感与表现': '准备画材/黏土，每周一次自由创作。' };
        let html = '推荐亲子活动：<br><br>'; if (weak) html += `针对薄弱领域 <b>${weak.key}</b>：${map[weak.key] || '多提供相关情境练习。'}<br><br>`;
        html += '通用建议：每天 10 分钟小任务 · 用照片记录 · 优先选感兴趣的形式。'; this.post('ai', html);
      }
    },
    reply(text) {
      const t = text.trim(); if (!t) return; this.post('user', esc(t));
      const low = t.toLowerCase();
      if (/趋势|变化|走势/.test(low)) this.action('trend');
      else if (/薄弱|弱|问题|不足|风险/.test(low)) this.action('weak');
      else if (/计划|提升|改进|方案/.test(low)) this.action('plan');
      else if (/报告|总结|综合/.test(low)) this.action('report');
      else if (/活动|游戏|亲子|推荐/.test(low)) this.action('activity');
      else this.post('ai', `我理解了你的问题「${esc(t)}」。可以点击中间星图的节点下钻详情，或用上方快捷动作让我分析趋势、薄弱点、生成报告或推荐活动。`);
    }
  };

  /* =========================================================
     右侧万能抽屉 SidePanel
     ========================================================= */
  const Side = {
    el: null, body: null, crumbs: null, cur: null,
    init() { this.el = $('#sidePanel'); this.body = $('#spBody'); this.crumbs = $('#spCrumbs'); },
    show() { this.el.classList.add('open'); document.body.classList.add('sp-open'); },
    hide() { this.el.classList.remove('open'); document.body.classList.remove('sp-open'); this.cur = null; AI.setContext({ domain: null, metric: null, menu: null }); },
    render(crumbs, html, cur) { this.crumbs.innerHTML = crumbs; this.body.innerHTML = html; this.cur = cur || null; this.show(); this.body.scrollTop = 0; },
    refresh() { if (this.cur && this.cur.fn) this.cur.fn.apply(null, this.cur.args || []); },
    close() { this.hide(); }
  };

  // 星图节点点击入口
  function openNode(node) {
    if (window.Galaxy) window.Galaxy.focusNode(node.label);
    if (node.kind === 'center') return renderCenter(node);
    if (node.kind === 'domain') return renderDomain(node.domainKey);
    if (node.kind === 'subject') { const si = +String(node.id).split('-')[1]; return renderSubject(si); }
    if (node.kind === 'subdomain') return renderSubdomain(node.domainKey, node.data.subdomain, node.data.rows);
    if (node.kind === 'theme') { const p = String(node.id).split('-'); return renderTheme(+p[1], +p[2]); }
    if (node.kind === 'indicator') return renderIndicator(node.domainKey, node.data.s, node.data);
    if (node.kind === 'pindicator') { const p = String(node.id).split('-'); return renderTheme(+p[1], +p[2]); }
  }

  /* ---------- 中心：整体概览 ---------- */
  function renderCenter(node) {
    const ps = withData(); const cur = ps[ps.length - 1], prev = ps[ps.length - 2];
    const curAvg = cur ? avgOfPeriod(cur) : null, prevAvg = prev ? avgOfPeriod(prev) : null;
    const diff = (curAvg != null && prevAvg != null) ? curAvg - prevAvg : null;
    const { reg } = registry();
    const chronic = Object.values(reg).filter(e => e.tag === 'chronic').length;
    const child = D.child || {};
    const radar = cur ? C.radar({ axes: DOMS.map(d => ({ label: d })), series: [{ name: '最新', color: '#ff7c3a', values: DOMS.map(d => cur.domainScores[d]) }], min: 0.5 }) : '';
    let html = `<div class="card">
      <div class="dc-title"><h3 style="font-family:var(--serif)">${esc(child.nickname || child.name || '团团')} 的成长星空</h3>
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
        DOMS.map(d => { const v = cur.domainScores[d]; return `<div class="list-item" onclick="TT.openDomain('${esc(d)}')">
          <span class="li-ic" style="background:${domMeta(d).color}33;color:${domMeta(d).color}">${domMeta(d).icon}</span>
          <span class="li-tx"><b>${esc(d)}</b><i>${esc(domMeta(d).desc || '')}</i></span>
          <span class="li-score" style="color:${domMeta(d).color}">${pct(v)}</span></div>`; }).join('') + `</div></div>`;
    }
    html += `<div class="grid g-2">
      <button class="btn primary block" onclick="TT.openMenu('summary')">📄 生成综合评价</button>
      <button class="btn block" onclick="TT.openMenu('parent')">❤️ 家长记录</button>
      <button class="btn block" onclick="TT.openMenu('subjects')">📚 学科维度</button>
      <button class="btn block" onclick="TT.openMenu('data')">💾 数据管理</button>
    </div>`;
    Side.render(`<b>整体概览</b>`, html, { fn: renderCenter, args: [node] });
    AI.setContext({ domain: null, metric: '整体概览' });
  }

  /* ---------- 领域详情（幼儿园） ---------- */
  function renderDomain(key) {
    const ps = withData(); const cur = ps[ps.length - 1];
    if (!cur) { Side.render(`<b>${esc(key)}</b>`, `<div class="empty"><span class="ee">◔</span>本阶段暂无数据</div>`, { fn: renderDomain, args: [key] }); return; }
    const dm = domMeta(key);
    const labels = ps.map(p => ({ a: p.name.replace(/^\d{4}学年·/, ''), b: p.date.slice(2).replace('-', '/') }));
    const series = [{ name: key, color: dm.color, values: ps.map(p => p.domainScores[key]) }];
    const curV = cur.domainScores[key];
    const rows = rowsOf(cur).filter(r => r.d === key);
    const { reg } = registry();
    const chronic = Object.values(reg).filter(e => e.tag === 'chronic' && e.d === key).sort((a, b) => b.badTimes - a.badTimes);
    const subs = {}; rows.forEach(r => { (subs[r.s] = subs[r.s] || []).push(r); });
    let html = `<div class="card"><div class="dc-title"><h3 style="color:${dm.color}">${dm.icon} ${esc(key)}</h3><span class="sub">最新 ${pct(curV)}</span></div>
      <div class="chart-wrap" style="min-height:190px">${C.line({ labels, series, height: 190, min: 0.6 })}</div>
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
    Side.render(`<b>${esc(key)}</b> · 领域详情`, html, { fn: renderDomain, args: [key] });
    AI.setContext({ domain: key, metric: null });
  }
  function avgOf(arr) { const v = arr.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }

  function renderSubdomain(domainKey, subKey, rows) {
    const dm = domMeta(domainKey);
    const pid = latestFull() ? latestFull().id : null;
    let html = `<div class="card"><div class="dc-title"><h3 style="color:${dm.color}">${esc(subKey)}</h3><span class="sub">${esc(domainKey)} · ${rows.length} 项</span></div>
      <div class="hint">以下指标来自园所最新测评；你可以用「补充评价」记录家庭观察下的判断，或「添加观察」留下具体事例。</div></div>`;
    html += rows.map(r => { const ov = pid ? S.getOverride(pid, r.k) : null; const lv = ov ? ov.level : r.l;
      return `<div class="card"><div class="li-tx" style="margin-bottom:6px"><b>${esc(r.n)}</b> ${lvPill(lv)}</div>
        <div class="hint" style="margin-bottom:8px">${esc(r.b || '')}</div>
        <div class="rate-row">
          ${['符合', '较符合', '不符合'].map(l => `<button class="rate-btn ${lvc(l) === 'ok' ? 'ok' : lvc(l) === 'mid' ? 'mid' : 'no'} ${lv === l ? 'sel' : ''}" onclick="TT.rateIndicator('${esc(domainKey)}','${esc(subKey)}','${esc(r.k)}','${esc(l)}')">${l}</button>`).join('')}
          <button class="rate-btn" onclick="TT.openNoteModal('${esc(domainKey)}','${esc(r.n)}')">＋ 观察</button>
        </div></div>`; }).join('');
    Side.render(`<b>${esc(domainKey)}</b> › ${esc(subKey)}`, html, { fn: renderSubdomain, args: [domainKey, subKey, rows] });
  }

  function renderIndicator(domainKey, subKey, row) {
    const dm = domMeta(domainKey);
    const pid = latestFull() ? latestFull().id : null;
    const ov = pid ? S.getOverride(pid, row.k) : null; const lv = ov ? ov.level : row.l;
    const ps = withData(); const cur = ps[ps.length - 1];
    const rowsAll = cur ? rowsOf(cur) : []; const e = (registry().reg)[row.k];
    let html = `<div class="card"><div class="dc-title"><h3 style="color:${dm.color}">${esc(row.n)}</h3>${lvPill(lv)}</div>
      <div class="hint" style="margin:6px 0">${esc(row.b || '')}</div>
      <div class="hint">所属：${esc(domainKey)} › ${esc(subKey)}　·　评价期次：${esc(row.g || '')}</div>
      ${e ? `<div class="row mt" style="align-items:center;gap:8px"><span class="hint">历史</span>${histDots(e)}</div>` : ''}
      <div class="rate-row mt">
        ${['符合', '较符合', '不符合'].map(l => `<button class="rate-btn ${lvc(l) === 'ok' ? 'ok' : lvc(l) === 'mid' ? 'mid' : 'no'} ${lv === l ? 'sel' : ''}" onclick="TT.rateIndicator('${esc(domainKey)}','${esc(subKey)}','${esc(row.k)}','${esc(l)}')">${l}</button>`).join('')}
      </div>
      <button class="btn sm primary mt" onclick="TT.openNoteModal('${esc(domainKey)}','${esc(row.n)}')">＋ 添加观察记录</button>
    </div>`;
    Side.render(`<b>${esc(domainKey)}</b> › ${esc(subKey)} › ${esc(row.n)}`, html, { fn: renderIndicator, args: [domainKey, subKey, row] });
  }

  /* ---------- 学科详情（小学） ---------- */
  function renderSubject(i) {
    const s = SUBJS[i]; if (!s) return;
    const cmap = { chinese: '#e85c48', math: '#4a90ff', english: '#78c878', science: '#78dcdc', morals: '#ffb450', pe: '#ff8c64', arts: '#c878dc', it: '#50b4ff', labor: '#b4a078' };
    const col = cmap[s.id] || '#ff9a5a';
    let html = `<div class="card"><div class="dc-title"><h3 style="color:${col}">${esc(s.name)}</h3><span class="sub">三年级 · 第二学段</span></div>
      <div class="hint">${esc((s.core_competencies || []).join(' · '))}</div></div>`;
    html += (s.themes || []).map((t, ti) => `<div class="subj-card open" data-i="${i}">
      <div class="sc-head" onclick="this.closest('.subj-card').classList.toggle('open')"><span class="sc-ic" style="background:${col}">${esc(s.name[0])}</span>
        <span class="li-tx"><b class="sc-name">${esc(t.title)}</b><i class="sc-sub">${(t.indicators || []).length} 项可评指标</i></span>
        <span class="sc-chev">▾</span></div>
      <div class="sc-body" id="themeBody-${i}-${ti}">${themeBodyInner(i, ti)}</div></div>`).join('');
    html += subjectLearningPathsHtml(s);
    Side.render(`<b>学科维度</b> › ${esc(s.name)}`, html, { fn: renderSubject, args: [i] });
    AI.setContext({ domain: s.name, metric: null });
  }
  function themeBodyInner(i, ti) {
    const s = SUBJS[i], t = (s.themes || [])[ti]; if (!t) return '';
    const col = { chinese: '#e85c48', math: '#4a90ff', english: '#78c878', science: '#78dcdc', morals: '#ffb450', pe: '#ff8c64', arts: '#c878dc', it: '#50b4ff', labor: '#b4a078' }[s.id] || '#ff9a5a';
    let h = `<div class="theme-row"><div class="hint" style="margin-bottom:6px">${esc(t.desc || '')}</div>`;
    h += `<div style="font-size:12px;color:var(--txt-dim);margin-bottom:4px">可评指标</div>` + (t.indicators || []).map(ind => `<span class="ind-pill">${esc(ind.text || ind)}</span>`).join('');
    h += `<button class="btn sm mt" onclick="TT.openNoteModal('', '${esc(s.name)}·${esc(t.title)}')">＋ 添加该主题观察</button></div>`;
    return h;
  }
  function subjectLearningPathsHtml(s) {
    if (!s) return '';
    const lps = s.learning_paths || [];
    if (!lps.length) {
      return `<div class="card"><div class="card-h"><h3>学习路径说明</h3></div><div class="card-b hint">本学科依据 2022 义务教育课程标准梳理主题与可评指标；具体进阶路径以上级教研要求为准，可在「家长记录」中按主题追踪团团的实际学习进展。</div></div>`;
    }
    const kg = lps.filter(l => l.source === 'kg').length, curr = lps.length - kg;
    let h = `<div class="card"><div class="card-h"><h3>学习路径</h3><span class="sub">${lps.length} 条${kg ? ' · 教育知识图谱 ' + kg : ''}${curr ? ' · 课标进阶 ' + curr : ''}</span></div><div class="card-b">`;
    h += lps.map(lp => `<div class="lp"><b>${esc(lp.from)}</b> → <b>${esc(lp.to)}</b>
        <span class="lp-src ${lp.source === 'kg' ? 'kg' : 'curr'}">${lp.source === 'kg' ? '教育知识图谱' : '课标进阶'}</span>
        ${lp.desc ? `<span class="lp-desc">${esc(lp.desc)}</span>` : ''}</div>`).join('');
    h += `</div><div class="hint mt">「教育知识图谱」来自真实教学知识图谱（如数学知识点依赖）；「课标进阶」依据 2022 义务教育课程标准梳理的认知进阶。</div></div>`;
    return h;
  }
  function renderTheme(i, ti) { renderSubject(i); const el = $('#themeBody-' + i + '-' + ti); if (el) { const card = el.closest('.subj-card'); if (card) { card.classList.add('open'); } } }

  /* =========================================================
     全局菜单各面板（在 SidePanel 内渲染）
     ========================================================= */
  function openMenu(type) {
    const titles = { summary: '综合评价', parent: '家长记录', subjects: '学科维度（三年级）', data: '数据管理', about: '关于本系统' };
    AI.setContext({ menu: titles[type] || type });
    if (type === 'summary') return renderSummaryList();
    if (type === 'parent') return renderParent('notes');
    if (type === 'subjects') return renderSubjects();
    if (type === 'data') return renderData();
    if (type === 'about') return renderAbout();
  }

  /* ---------- 学科维度总览 ---------- */
  function renderSubjects() {
    if (!SUBJS.length) { Side.render(`<b>学科维度</b>`, `<div class="empty"><span class="ee">📚</span>当前阶段暂无学科维度</div>`, { fn: renderSubjects, args: [] }); return; }
    const cmap = { chinese: '#e85c48', math: '#4a90ff', english: '#78c878', science: '#78dcdc', morals: '#ffb450', pe: '#ff8c64', arts: '#c878dc', it: '#50b4ff', labor: '#b4a078' };
    const html = SUBJS.map((s, i) => `<div class="list-item" onclick="TT.openSubject(${i})">
      <span class="li-ic" style="background:${cmap[s.id] || '#ff9a5a'}">${esc(s.name[0])}</span>
      <span class="li-tx"><b>${esc(s.name)}</b><i>${(s.core_competencies || []).join(' · ')}</i></span>
      <span class="li-meta">${(s.themes || []).length} 主题</span></div>`).join('');
    Side.render(`<b>学科维度</b> · 三年级九大学科`, html, { fn: renderSubjects, args: [] });
  }
  function openSubject(i) { renderSubject(i); }

  /* ---------- 家长记录 ---------- */
  let prTab = 'notes', habitMonth = thisMonth(), vaEditing = null, vaDom = null;
  function renderParent(tab) {
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
    const notes = S.s.notes; const byDom = {}; notes.forEach(n => { byDom[n.domain] = (byDom[n.domain] || 0) + 1; });
    out.innerHTML = `<div class="card"><div class="card-h"><h3>新增观察记录</h3><button class="btn sm" onclick="TT.openNoteModal()">快速添加</button></div>
      <div class="card-b">
        <div class="field mb"><label>日期</label><input type="date" id="n-date" value="${today()}"></div>
        <div class="field mb"><label>记录人</label><input type="text" id="n-by" value="爸爸"></div>
        <div class="field mb"><label>关联领域</label><select id="n-dom">${D.domains.map(d => `<option>${d.key}</option>`).join('')}</select></div>
        <div class="field mb"><label>关联指标（可选）</label><input type="text" id="n-ind" placeholder="如：连续跳绳 / 整理物品"></div>
        <div class="field mb"><label>表现评级</label><div class="row" id="n-stars">${[1, 2, 3, 4, 5].map(i => `<button class="btn sm" data-v="${i}">${'★'.repeat(i)}</button>`).join('')}</div></div>
        <div class="field mb"><label>观察内容</label><textarea id="n-txt" placeholder="记录具体情境、行为与结果……"></textarea></div>
        <button class="btn primary" id="n-add">保存记录</button>
      </div></div>
      <div class="card"><div class="card-h"><h3>记录时间线</h3><span class="sub">共 ${notes.length} 条${notes.length ? ' · ' + Object.entries(byDom).map(([k, v]) => k + ' ' + v).join(' / ') : ''}</span>
        ${notes.length ? '<button class="btn sm" onclick="TT.exportNotes()">导出 MD</button>' : ''}</div>
        <div class="card-b">${notes.length ? notes.map(n => `<div class="note-item"><div class="ni-top"><span class="ni-date">${esc(n.date)} · ${esc(n.by || '家长')}</span><button class="ni-del" onclick="TT.delNote('${n.id}')">删除</button></div>
          <div class="ni-tx">${'★'.repeat(n.stars || 0)} <span class="chip" style="border-color:${domMeta(n.domain).color}33;color:${domMeta(n.domain).color}">${esc(n.domain)}</span>${n.indicator ? ' <span class="chip">' + esc(n.indicator) + '</span>' : ''}<br>${esc(n.text)}</div></div>`).join('')
        : '<div class="empty"><span class="ee">◔</span>还没有观察记录<br><span class="hint">建议每周记录 2~3 条，期末生成综合评价时会自动引用</span></div>'}</div></div>`;
    let stars = 3; const sw = $('#n-stars');
    const paint = () => sw.querySelectorAll('button').forEach(b => b.classList.toggle('primary', +b.dataset.v === stars));
    sw.onclick = e => { const b = e.target.closest('button'); if (b) { stars = +b.dataset.v; paint(); } }; paint();
    $('#n-add').onclick = () => { const text = $('#n-txt').value.trim(); if (!text) return toast('请填写观察内容');
      S.addNote({ date: $('#n-date').value || today(), by: $('#n-by').value.trim() || '家长', domain: $('#n-dom').value, indicator: $('#n-ind').value.trim(), text, stars });
      refreshSide(); renderNotes($('#pr-body')); toast('已保存'); };
  }
  function renderHabits(out) {
    const items = S.habitItems(); const data = S.habitMonth(habitMonth);
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
    const list = S.s.parentPeriods.filter(pp => (pp.stage || 'k') === state.stage);
    out.innerHTML = `<div class="row mb"><button class="btn primary" onclick="TT.newParentPeriod()">＋ 新建一期家长评价</button></div>` +
      (list.length ? `<div class="grid g-2">${list.map(pp => { const p = parentToPeriod(pp); const done = Object.keys(pp.ratings).length;
        return `<div class="card"><div class="card-b"><div class="spread"><b>${esc(pp.name)}</b><span class="chip">家长评价</span></div>
          <div class="hint">${esc(pp.date)} · 模板：${esc((D.periods.find(x => x.id === pp.templateId) || {}).name || '默认')}</div>
          <div class="row mt" style="gap:8px"><button class="btn sm primary" onclick="TT.editPP('${pp.id}')">${done ? '继续填写' : '开始评价'}</button>
          <button class="btn sm" onclick="TT.openPeriod('${pp.id}')">查看</button><button class="btn sm danger" onclick="TT.delPP('${pp.id}')">删除</button></div></div></div>`; }).join('')}</div>`
      : `<div class="card"><div class="empty"><span class="ee">✎</span>本阶段还没有家长评价<br><span class="hint">建议每学期末做一次，与园所评价形成家园对照</span></div></div>`);
  }
  function renderAssessEditor(out) {
    const pp = S.getParentPeriod(vaEditing); if (!pp) { vaEditing = null; return renderParentAssess(out || $('#pr-body')); }
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
        <div style="flex:1;min-width:200px"><div style="font-size:13px;font-weight:600">${esc(r.n)}</div><div class="hint">${esc(r.b || '')}</div>
        <input class="glass-field" style="margin-top:5px;font-size:12px;padding:6px 9px" placeholder="观察备注（可选）" value="${esc(rt.r || '')}" onchange="TT.rateNote('${vaEditing}','${esc(r.k)}',this.value)"></div>
        <div class="row" style="gap:5px">${[['符合', 'ok'], ['较符合', 'mid'], ['不符合', 'no']].map(([l, c]) => `<button class="rate-btn ${rt.l === l ? 'sel' : ''}" onclick="TT.rate('${vaEditing}','${esc(r.k)}','${l}')">${l}</button>`).join('')}<button class="rate-btn" onclick="TT.rate('${vaEditing}','${esc(r.k)}','')">✕</button></div></div>`; }).join('')}</div>`).join('')}</div></div>`;
  }

  /* ---------- 综合评价 ---------- */
  function renderSummaryList() {
    const list = S.s.summaries;
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
    const notes = S.s.notes.filter(n => (!first || n.date >= first.date));
    return { scope, first, last, chronic, ups, domRank, notes };
  }
  function summaryDocHtml(x) {
    const { scope, first, last, chronic, ups, domRank, notes } = summaryData(x); const c = D.child;
    const strong = domRank.filter(d => d.last != null).sort((a, b) => b.last - a.last).slice(0, 2);
    const weak = domRank.filter(d => d.last != null).sort((a, b) => a.last - b.last).slice(0, 2);
    const listOther = S.s.summaries.filter(y => y.id !== x.id);
    return `<div class="row mb" style="gap:8px;flex-wrap:wrap;align-items:center"><select class="glass-field" id="sm-pick" style="width:auto">${S.s.summaries.map(y => `<option value="${y.id}" ${y.id === x.id ? 'selected' : ''}>${esc(y.title)}（${esc(y.createdAt.slice(0, 10))}）</option>`).join('')}</select>
      <button class="btn sm" onclick="TT.printSummary()">打印 / PDF</button><button class="btn sm" onclick="TT.exportSummaryMD('${x.id}')">导出 MD</button><button class="btn sm danger" onclick="TT.delSummary('${x.id}')">删除</button></div>
    <div class="doc">
      <h1>${esc(x.title)}</h1><div class="doc-sub">评价周期：${esc(first ? first.name : '')} — ${esc(last ? last.name : '')}　|　${esc(x.createdAt)}　|　${esc(x.author)}</div>
      <h2>一、基本信息</h2><table><tbody>
        <tr><th style="width:90px">姓名</th><td>${esc(c.name)}（小名 ${esc(c.nickname)}）</td><th style="width:90px">性别 / 出生</th><td>${esc(c.gender)} / ${esc(c.birth)}</td></tr>
        <tr><th>学校</th><td>${esc(c.school)} ${esc(c.grade)}</td><th>幼儿园</th><td>${esc(c.kindergarten)}</td></tr></tbody></table>
      <h2>二、总体发展水平</h2><p>共完成 ${scope.length} 次结构化测评。综合得分率由 <b>${pct(first ? avgOfPeriod(first) : null)}</b> 变化为 <b>${pct(last ? avgOfPeriod(last) : null)}</b>。各期标准随月龄递进，纵向比较应结合当期标准。</p>
      <table><thead><tr><th>领域</th><th class="num">${esc(first ? first.code : '')}</th><th class="num">${esc(last ? last.code : '')}</th><th class="num">变化</th><th>说明</th></tr></thead><tbody>
        ${domRank.map(d => `<tr><td><b style="color:${d.color}">${d.key}</b></td><td class="num">${pct(d.first)}</td><td class="num">${pct(d.last)}</td><td class="num"><b class="${d.delta > 0 ? 'up' : d.delta < 0 ? 'down' : ''}">${d.delta == null ? '–' : (d.delta > 0 ? '+' : '') + (d.delta * 100).toFixed(1) + 'pt'}</b></td><td style="font-size:12px">${d.last == null ? '–' : d.last >= 0.95 ? '发展充分' : d.last >= 0.85 ? '总体良好' : '相对薄弱'}</td></tr>`).join('')}</tbody></table>
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
  function openSummaryForm() {
    const ps = withData();
    modal('生成综合评价', `<div class="field mb"><label>报告标题</label><input type="text" id="sf-title" value="林悠然（团团）${STAGES[state.stage].label}成长综合评价报告"></div>
      <div class="grid g-2 mb"><div class="field"><label>起始期次</label><select id="sf-from">${ps.map((p, i) => `<option value="${p.id}" ${i === 0 ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>截止期次</label><select id="sf-to">${ps.map((p, i) => `<option value="${p.id}" ${i === ps.length - 1 ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div></div>
      <div class="field mb"><label>家长寄语</label><textarea id="sf-msg" placeholder="想对团团说的话……"></textarea></div>
      <div class="field mb"><label>下阶段目标（每行一条）</label><textarea id="sf-goal" placeholder="每天跳绳 5 分钟&#10;睡前自己整理书包&#10;每周承担 2 次家务"></textarea></div>
      <div class="field"><label>撰写人</label><input type="text" id="sf-author" value="爸爸 林建国"></div>`,
      `<button class="btn" onclick="TT.closeModal()">取消</button><button class="btn primary" id="sf-ok">生成</button>`);
    $('#sf-ok').onclick = () => { const x = S.addSummary({ title: $('#sf-title').value.trim() || '成长综合评价报告', from: $('#sf-from').value, to: $('#sf-to').value, message: $('#sf-msg').value.trim(), goals: $('#sf-goal').value.trim(), author: $('#sf-author').value.trim() || '家长' });
      closeModal(); renderSummaryList(); toast('已生成'); };
  }
  function summaryMarkdown(x) {
    const { scope, first, last, chronic, ups, domRank, notes } = summaryData(x); const c = D.child;
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

  /* ---------- 数据管理 ---------- */
  function renderData() {
    const s = S.s;
    const html = `<div class="grid g-2 mb">
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
  function renderAbout() {
    const html = `<div class="card"><div class="card-h"><h3>设计理念</h3></div><div class="card-b para">
      以 <b>全屏星空图</b> 作为唯一主界面：每个孩子是一颗星，六大领域 / 九大学科是环绕的星座，指标是更小的星辰。拖拽旋转、滚轮缩放、悬停高亮、点击下钻——所有评价、记录、分析与报告都围绕这颗星展开，不再有分散的页面。
      <br><br><b>数据口径</b>：幼儿园阶段依据《3~6岁儿童学习与发展指南》六大领域过程性评价指标体系；小学阶段依据 2022 义务教育课程标准梳理的学科评价维度，数学融合教育知识图谱真实学习路径。
      <br><br><b>隐私</b>：园所测评数据固化在 js/data.js，家长新增数据仅存于本机浏览器（localStorage）。换电脑或清理浏览器前请先「导出全部数据」备份。</div></div>`;
    Side.render(`<b>关于本系统</b>`, html, { fn: renderAbout, args: [] });
  }

  /* =========================================================
     搜索
     ========================================================= */
  let SEARCH = [];
  function buildSearchIndex() {
    SEARCH = [];
    if (state.stage === 'k') {
      D.domains.forEach(d => {
        const rows = (latestFull() ? rowsOf(latestFull()).filter(r => r.d === d.key) : []);
        const subs = {}; rows.forEach(r => { (subs[r.s] = subs[r.s] || []).push(r); });
        SEARCH.push({ type: 'domain', label: d.key, sub: d.desc, ref: d.key });
        Object.keys(subs).forEach(sk => { SEARCH.push({ type: 'sub', label: sk, sub: d.key, ref: { dom: d.key, sub: sk } }); subs[sk].forEach(r => SEARCH.push({ type: 'ind', label: r.n, sub: d.key + ' · ' + sk, ref: { dom: d.key, sub: sk } })); });
      });
    } else {
      SUBJS.forEach((s, si) => { SEARCH.push({ type: 'subject', label: s.name, sub: (s.core_competencies || []).join(' · '), ref: si }); (s.themes || []).forEach((t, ti) => { SEARCH.push({ type: 'theme', label: t.title, sub: s.name, ref: { si, ti } }); (t.indicators || []).forEach(ind => SEARCH.push({ type: 'ind', label: (ind.text || ind), sub: s.name + ' · ' + t.title, ref: { si, ti } })); }); });
    }
  }
  function doSearch(q) {
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
  function openSearchResult(item) {
    if (window.Galaxy) window.Galaxy.focusNode(item.label);
    if (item.type === 'domain') renderDomain(item.ref);
    else if (item.type === 'subject') renderSubject(item.ref);
    else if (item.type === 'sub') renderSubdomain(item.ref.dom, item.ref.sub, (latestFull() ? rowsOf(latestFull()).filter(r => r.d === item.ref.dom && r.s === item.ref.sub) : []));
    else if (item.type === 'theme') renderTheme(item.ref.si, item.ref.ti);
    else if (item.type === 'ind') renderSubdomain(item.ref.dom, item.ref.sub, (latestFull() ? rowsOf(latestFull()).filter(r => r.d === item.ref.dom && r.s === item.ref.sub) : []));
  }

  /* =========================================================
     对外接口 + 事件绑定 + 初始化
     ========================================================= */
  const TT = {
    openNode, setStage, closeModal, openMenu, closeMenu() { closeMenuMask(); Side.hide(); },
    openDomain(k) { renderDomain(k); }, openSub(d, s) { const rows = (latestFull() ? rowsOf(latestFull()).filter(r => r.d === d && r.s === s) : []); renderSubdomain(d, s, rows); },
    openSubject(i) { renderSubject(i); }, toggleTheme(i, ti) { const el = $('#themeBody-' + i + '- ' + ti); },
    aiAction(id) { AI.action(id); if (window.innerWidth <= 1024) $('#aiPanel').classList.remove('collapsed'); },
    renderParent, newParentPeriod() { newParentPeriodModal(); },
    editPP(id) { vaEditing = id; vaDom = null; prTab = 'assess'; renderParent('assess'); },
    delPP(id) { if (confirm('删除这期家长评价及其全部打分？')) { S.delParentPeriod(id); refreshSide(); renderParent('assess'); } },
    assessBack() { vaEditing = null; renderParent('assess'); }, assessFin(id) { vaEditing = null; toast('已保存'); TT.openPeriod(id); },
    setAsDom(d) { vaDom = d; Side.refresh(); }, rate(pp, k, l) { const cur = S.getParentPeriod(pp); if (!cur) return; if (!l) S.rate(pp, k, null); else S.rate(pp, k, { l }); Side.refresh(); },
    rateNote(pp, k, v) { const cur = S.getParentPeriod(pp); if (!cur) return; const ex = cur.ratings[k]; S.rate(pp, k, ex ? Object.assign({}, ex, { r: v }) : { l: '未测试', r: v }); },
    openPeriod(id) { const p = allPeriods().concat(D.periods).find(x => x.id === id) || D.periods.find(x => x.id === id); if (!p) return; modal(esc(p.name), `<div class="doc">${summaryPeriodHtml(p)}</div>`); },
    openNoteModal(domain, indicator) { openNoteModal(domain, indicator); },
    delNote(id) { if (confirm('删除这条观察记录？')) { S.delNote(id); refreshSide(); Side.refresh(); toast('已删除'); } },
    exportNotes() { const notes = S.s.notes; const md = ['# 团团观察记录\n'].concat(notes.map(n => `## ${n.date} · ${n.domain}${n.indicator ? ' · ' + n.indicator : ''}\n\n${'★'.repeat(n.stars || 0)}　${n.by}\n\n${n.text}\n`)).join('\n'); download('团团观察记录.md', md, 'text/markdown'); toast('已导出'); },
    tapHabit(id, day) { S.toggleHabit(habitMonth, id, day); Side.refresh(); },
    editHabits() { editHabitsModal(); },
    openSummaryForm, printSummary() { window.print(); }, exportSummaryMD(id) { const x = S.s.summaries.find(v => v.id === id) || S.s.summaries[0]; if (x) { download(x.title + '.md', summaryMarkdown(x), 'text/markdown'); toast('已导出'); } },
    delSummary(id) { if (confirm('删除这份综合评价？')) { S.delSummary(id); renderSummaryList(); } },
    exportData() { download(`团团成长评价_备份_${today()}.json`, S.exportJSON(), 'application/json'); toast('已导出备份'); },
    importData() { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json'; inp.onchange = () => { const f = inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { S.importJSON(rd.result); toast('恢复成功'); refreshSide(); buildSearchIndex(); renderData(); } catch (e) { toast('文件格式有误'); } }; rd.readAsText(f); }; inp.click(); },
    resetData() { if (confirm('将清空所有家长记录、打卡与评价报告，且不可恢复。确定？')) { S.reset(); refreshSide(); buildSearchIndex(); renderData(); toast('已清空'); } },
    toggleAI() { $('#aiPanel').classList.toggle('collapsed'); }
  };
  window.TT = TT;

  function summaryPeriodHtml(p) {
    const ds = p.domainScores || {}; const stats = p.domainStats || {};
    return `<h1>${esc(p.name)}</h1><div class="doc-sub">${esc(p.date)} · ${esc(p.code || '')} · 综合 ${pct(avgOfPeriod(p))}</div>
      <table><thead><tr><th>领域</th><th class="num">得分率</th><th>结构（符合/较/不符/待）</th></tr></thead><tbody>
      ${DOMS.map(d => `<tr><td><b style="color:${domMeta(d).color}">${d}</b></td><td class="num">${pct(ds[d])}</td>
        <td>${stats[d] ? `${stats[d].ok}/${stats[d].mid}/${stats[d].no}/${stats[d].pending}` : '–'}</td></tr>`).join('')}</tbody></table>`;
  }

  function newParentPeriodModal() {
    const tpls = D.periods.filter(p => p.indicatorCount > 0);
    modal('新建一期家长评价', `<div class="field mb"><label>评价名称</label><input type="text" id="np-name" value="家长评价 ${new Date().getFullYear()}·${new Date().getMonth() < 6 ? '上半年' : '下半年'}"></div>
      <div class="field mb"><label>评价日期</label><input type="date" id="np-date" value="${today()}"></div>
      <div class="field mb"><label>指标模板</label><select id="np-tpl">${tpls.map(t => `<option value="${t.id}" ${t.id === 'P5' ? 'selected' : ''}>${esc(t.name)} · ${t.indicatorCount} 项</option>`).join('')}</select></div>
      <div class="field"><label>阶段说明（可选）</label><textarea id="np-sum" placeholder="例如：小学二年级下学期，重点关注运动习惯与作业专注度"></textarea></div>`,
      `<button class="btn" onclick="TT.closeModal()">取消</button><button class="btn primary" id="np-ok">创建并开始</button>`);
    $('#np-ok').onclick = () => { const pp = S.addParentPeriod({ name: $('#np-name').value.trim() || '家长评价', date: $('#np-date').value || today(), templateId: $('#np-tpl').value, summary: $('#np-sum').value.trim(), klass: D.child.grade, stage: state.stage });
      closeModal(); refreshSide(); vaEditing = pp.id; vaDom = null; prTab = 'assess'; renderParent('assess'); };
  }
  function openNoteModal(domain, indicator) {
    modal('新增观察记录', `<div class="field mb"><label>日期</label><input type="date" id="nm-date" value="${today()}"></div>
      <div class="field mb"><label>记录人</label><input type="text" id="nm-by" value="爸爸"></div>
      <div class="field mb"><label>关联领域</label><select id="nm-dom">${D.domains.map(d => `<option ${domain === d.key ? 'selected' : ''}>${d.key}</option>`).join('')}</select></div>
      <div class="field mb"><label>关联指标（可选）</label><input type="text" id="nm-ind" value="${esc(indicator || '')}" placeholder="如：连续跳绳"></div>
      <div class="field mb"><label>表现评级</label><div class="row" id="nm-stars">${[1, 2, 3, 4, 5].map(i => `<button class="btn sm" data-v="${i}">${'★'.repeat(i)}</button>`).join('')}</div></div>
      <div class="field mb"><label>观察内容</label><textarea id="nm-txt" placeholder="记录具体情境、行为与结果……"></textarea></div>`,
      `<button class="btn" onclick="TT.closeModal()">取消</button><button class="btn primary" id="nm-ok">保存</button>`);
    let stars = 3; const sw = $('#nm-stars'); const paint = () => sw.querySelectorAll('button').forEach(b => b.classList.toggle('primary', +b.dataset.v === stars));
    sw.onclick = e => { const b = e.target.closest('button'); if (b) { stars = +b.dataset.v; paint(); } }; paint();
    $('#nm-ok').onclick = () => { const text = $('#nm-txt').value.trim(); if (!text) return toast('请填写观察内容');
      S.addNote({ date: $('#nm-date').value || today(), by: $('#nm-by').value.trim() || '家长', domain: $('#nm-dom').value, indicator: $('#nm-ind').value.trim(), text, stars });
      closeModal(); refreshSide(); if (Side.cur) Side.refresh(); toast('已保存'); };
  }
  function editHabitsModal() {
    const items = S.habitItems();
    modal('管理打卡项', `<div class="hint mb">每行一项，格式：名称 | 分类</div><textarea id="hb-txt" style="min-height:220px">${items.map(i => i.name + ' | ' + (i.cat || '')).join('\n')}</textarea>`,
      `<button class="btn" onclick="TT.closeModal()">取消</button><button class="btn primary" id="hb-ok">保存</button>`);
    $('#hb-ok').onclick = () => { const list = $('#hb-txt').value.split('\n').map(s => s.trim()).filter(Boolean).map((s, i) => { const [n, c] = s.split('|').map(x => (x || '').trim()); return { id: 'h' + (i + 1), name: n, cat: c || '' }; }); S.setHabitItems(list); closeModal(); Side.refresh(); toast('已更新'); };
  }
  function rateIndicator(domainKey, subKey, rowKey, level) {
    const pid = latestFull() ? latestFull().id : null; if (!pid) return toast('暂无可补充评价的期次');
    S.setOverride(pid, rowKey, level ? { level, by: '家长', note: '' } : null);
    Side.refresh(); toast('已记录补充评价');
  }

  function closeMenuMask() { $('#menuMask').classList.remove('show'); $('#menu').classList.remove('open'); }

  function bindEvents() {
    Side.init();
    $('#stageMini').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setStage(b.dataset.stage); });
    $('#galStage').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setStage(b.dataset.stage); });
    /* #aiToggle 元素不存在时跳过（常驻启动按钮由 main.js 绑定 #aiLaunch）；#aiMin 由 main.js 统一绑定，避免重复 */
    const aiToggle = $('#aiToggle'); if (aiToggle) aiToggle.addEventListener('click', () => $('#aiPanel').classList.toggle('collapsed'));
    const menuToggle = $('#menuToggle'); if (menuToggle) menuToggle.addEventListener('click', () => { $('#menuMask').classList.add('show'); $('#menu').classList.add('open'); });
    $('#menuClose').addEventListener('click', closeMenuMask);
    $('#menuMask').addEventListener('click', closeMenuMask);
    $('#menu').addEventListener('click', e => { const b = e.target.closest('.menu-item'); if (!b) return; $('#menu').classList.remove('open'); setTimeout(() => $('#menuMask').classList.remove('show'), 200); openMenu(b.dataset.menu); });
    $('#spClose').addEventListener('click', () => Side.hide());
    const aiInput = $('#aiInput');
    function sendAi() { const t = aiInput.value.trim(); if (!t) return; aiInput.value = ''; aiInput.style.height = 'auto'; AI.reply(t); }
    aiInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAi(); } });
    aiInput.addEventListener('input', () => { aiInput.style.height = 'auto'; aiInput.style.height = Math.min(aiInput.scrollHeight, 120) + 'px'; });
    $('#aiSend').addEventListener('click', sendAi);
    const si = $('#searchInput'); si.addEventListener('input', e => doSearch(e.target.value));
    si.addEventListener('focus', e => doSearch(e.target.value));
    document.addEventListener('click', e => { if (!e.target.closest('.tb-search')) { $('#searchResults').classList.remove('show'); } });
  }

  function init() {
    buildSearchIndex();
    bindEvents();
    refreshSide();
    if (window.Galaxy) window.Galaxy.enter(state.stage);
    AI.init();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
