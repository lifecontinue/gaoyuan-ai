/* 学员端结构仿真：studentLayout / userLine / gpStudent；仅使用当前原型数据。 */
(function () {
  'use strict';
  const flatten = (tree, parent = null) => (tree || []).flatMap(n => [{ ...n, parent }, ...flatten(n.children, n.id)]);
  const button = (act, label, extra = '') => `<button type="button" data-act="${act}" ${extra}>${label}</button>`;
  function current(c) {
    const list = c.learnerGraphs();
    const associated = c.G.accessibleGraphs(c.S, c.S.studentUserId);
    if (!list.some(x => x.graphId === c.ui.dashboardGraphId)) c.ui.dashboardGraphId = associated[0]?.graphId || null;
    return { list, g: c.S.graphs[c.ui.dashboardGraphId], p: c.S.persons.find(x => x.userId === c.S.studentUserId) || {} };
  }
  function contents(c, g) {
    const leaves = c.G.leafTags(g.tagTree || []);
    return leaves.flatMap((tag, index) => {
      const config = g.step4?.[tag.id];
      const items = config ? config.items : index === 0 ? c.G.defaultStep4Content[g.id] || [] : [];
      const informal = Object.entries(config?.informal || {}).flatMap(([category, group])=>Object.values(group).flat().map(r=>({...r,category})));
      return [...items.map(item => ({ ...c.G.courseLibrary.find(x => x.id === item.id), ...item })), ...informal].map(item=>({...item,tagId:tag.id,tagName:tag.nm}));
    });
  }
  function header(c, g, p, list) {
    const e = c.esc, linked = list.some(x=>x.graphId===g?.id && x.associated), O = linked ? c.pdOverall(g.id, p.userId) : { total: '—' }, T = linked ? c.pdStudy(g.id, p.userId) : { rate: '—' };
    return `<div class="sl-user pd-user"><div class="sl-graph"><div class="sl-graph-title">${e(g?.name || '暂无关联图谱')}</div>
      <div>关联岗位：${e((p.positionIds || []).map(c.posName).join('、') || '—')}</div>
      ${list.length ? button('pd-open-graph', '⇄ 切换图谱', 'class="pd-switch"') : ''}</div><span class="sl-divider"></span>
      <div class="sl-avatar" aria-hidden="true">${e((p.userName || '?').slice(0, 1))}</div><strong>${e(p.userName || '未选择学员')}</strong>
      <span class="sl-field">部门：<b>${e(p.deptName || '—')}</b></span><span class="sl-field">工号：<b>${e(p.employeeCode || '—')}</b></span>
      <span class="sl-divider"></span><div class="sl-indicator"><strong>${O.total}<small>分</small></strong><span>胜任力指数</span></div>
      <div class="sl-indicator"><strong>${T.rate}<small>%</small></strong><span>总进度</span></div>
      <div class="sl-search"><input aria-label="内容搜索" placeholder="内容搜索" data-act="learner-content-key" value="${e(c.ui.learnerContentKey || '')}">${button('learner-search', '⌕', 'aria-label="搜索内容"')}</div></div>`;
  }
  function graph(c, g) {
    const e = c.esc, nodes = flatten(g.tagTree), selected = nodes.find(n => n.id === c.ui.learnerNode), score = c.pdScores(g.id, c.S.studentUserId);
    const point = (a, r) => ({ x: 560 + Math.cos(a) * r, y: 325 + Math.sin(a) * r });
    const placed = [], lines = [], roots = g.tagTree || [];
    roots.forEach((root, i) => {
      const angle = -Math.PI / 3 + i * Math.PI * 2 / Math.max(roots.length, 1), p = point(angle, 145);
      placed.push({ n: root, ...p, radius: 34, major: true }); lines.push([560, 325, p.x, p.y]);
      const descend = (n, origin, a, depth) => (n.children || []).forEach((child, j, siblings) => {
        const ca = a + (j - (siblings.length - 1) / 2) * .64;
        const q = { x: origin.x + Math.cos(ca) * (depth === 1 ? 115 : 92), y: origin.y + Math.sin(ca) * (depth === 1 ? 115 : 92) };
        lines.push([origin.x, origin.y, q.x, q.y]); placed.push({ n: child, ...q, radius: depth === 1 ? 25 : 22 }); descend(child, q, ca, depth + 1);
      });
      descend(root, p, angle, 1);
    });
    const hits = c.ui.learnerNodeQuery ? nodes.filter(n => n.nm.includes(c.ui.learnerNodeQuery)) : [];
    const history = (c.ui.learnerHistory || []).map(id => nodes.find(n => n.id === id)).filter(Boolean);
    const leaves = selected ? c.G.leafTags([selected]) : c.G.leafTags(g.tagTree);
    const vals = score.filter(s => leaves.some(l => l.id === s.id) && s.val !== null).map(s => s.val);
    const linked = c.G.accessibleGraphs(c.S,c.S.studentUserId).some(x=>x.graphId===g.id);
    const value = !linked ? '—' : vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : 0;
    const related = selected ? contents(c, g).filter(x => leaves.some(l => l.id === x.tagId)) : [];
    return `<div class="sl-full-state"><div class="sl-node-search"><h2>图谱节点查询</h2><div class="sl-search"><input aria-label="节点名称关键词" placeholder="节点名称关键词" data-act="learner-node-key" value="${e(c.ui.learnerNodeKey || '')}">${button('learner-node-query', '⌕', 'aria-label="查询节点"')}</div>
      ${c.ui.learnerNodeQuery ? `<div class="sl-node-hits">${hits.length ? hits.map(n => button('learner-node', e(n.nm), `data-id="${e(n.id)}"`)).join('') : '<p>没有匹配的节点</p>'}</div>` : ''}
      <p>历史查询节点：</p><div class="sl-history">${history.map(n => button('learner-node', e(n.nm), `data-id="${e(n.id)}"`)).join('')}</div></div>
      <div class="sl-graph-canvas"><svg viewBox="0 0 1120 650" role="img" aria-label="${e(g.name)}能力图谱"><defs><linearGradient id="sl-node-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#494cff"/><stop offset="1" stop-color="#3ed8fa"/></linearGradient></defs><circle cx="560" cy="325" r="310" fill="#f7f8fd" stroke="white" stroke-width="2"/>
      ${lines.map(l => `<line x1="${l[0]}" y1="${l[1]}" x2="${l[2]}" y2="${l[3]}" stroke="#a8c2ff" stroke-width="1.4"/>`).join('')}
      ${placed.map(({ n, x, y, radius, major }) => `<g role="button" tabindex="0" data-act="learner-node" data-id="${e(n.id)}" aria-label="查看节点${e(n.nm)}" class="sl-svg-node ${selected?.id === n.id ? 'selected' : ''}"><circle cx="${x}" cy="${y}" r="${radius}" fill="${major ? 'url(#sl-node-fill)' : '#fff'}" stroke="${major ? 'transparent' : '#54b9ff'}" stroke-width="4"/><text x="${x}" y="${y + 3}" text-anchor="middle" font-size="${major ? 11 : 9}" fill="${major ? '#fff' : '#495571'}">${e(n.nm.length > 7 ? n.nm.slice(0, 6) + '…' : n.nm)}</text><title>${e(n.nm)}</title></g>`).join('')}
      <g role="button" tabindex="0" data-act="learner-node-reset" aria-label="查看图谱根节点"><circle cx="560" cy="325" r="72" fill="#fff" stroke="#edf0ff" stroke-width="14"/><circle cx="560" cy="325" r="50" fill="#fff" stroke="url(#sl-node-fill)" stroke-width="15"/><text x="560" y="322" text-anchor="middle" font-size="20">${e((c.S.persons.find(x => x.userId === c.S.studentUserId)?.userName || '?').slice(0, 1))}</text><text x="560" y="345" text-anchor="middle" font-size="10" fill="#384766">${e(g.name.slice(0, 10))}</text></g></svg></div>
      ${button('learner-node-reset', '⌖', 'class="sl-reset" aria-label="复位图谱"')}
      <aside class="sl-node-info ${c.ui.learnerInfoClosed ? 'collapsed' : ''}"><header><h2>节点信息</h2>${button('learner-info-toggle', c.ui.learnerInfoClosed ? '‹' : '›', 'aria-label="展开或收起节点信息"')}</header><div class="sl-info-body"><div class="sl-info-area"><div>${selected ? '节点名称' : '图谱名称'}：<b>${e(selected?.nm || g.name)}</b></div><div class="sl-info-metrics"><div><strong>${value}<small>分</small></strong><span>${selected ? '分数' : '胜任力指数'}</span></div><div><strong>${!linked ? '—' : leaves.length ? Math.round(vals.length / leaves.length * 100) : 0}<small>%</small></strong><span>总进度</span></div></div></div>
      ${selected ? `<div class="sl-info-area"><h3>关联学习内容</h3>${related.length ? related.map(item => button('learner-open-content', e(item.nm), `data-id="${e(item.id)}" data-tag="${e(item.tagId)}" class="sl-related"`)).join('') : '<p>该节点暂无关联学习内容</p>'}</div>${button('learner-go-content', '查看图谱内容', `data-id="${e(leaves[0]?.id || '')}" class="sl-action"`)}` : `<div class="sl-info-area"><h3>岗位意义：</h3><p>${e(g.briefing || '暂无岗位意义')}</p><h3>关键职责：</h3><p>${e(g.duty || '暂无关键职责')}</p></div>`}</div></aside></div>`;
  }
  function content(c, g) {
    const e = c.esc, leaves = c.G.leafTags(g.tagTree), key = (c.ui.learnerContentQuery || '').trim();
    if (!leaves.some(x => x.id === c.ui.learnerContentTag)) c.ui.learnerContentTag = leaves[0]?.id;
    const all = contents(c, g), kind = c.ui.learnerKind || '课程';
    const items = all.filter(x => (key ? x.nm.includes(key) : x.tagId === c.ui.learnerContentTag) && x.kind === kind);
    return `<div class="sl-content"><aside><h2>已选标签</h2>${leaves.map(n => button('learner-content-tag', e(n.nm), `class="${c.ui.learnerContentTag === n.id ? 'active' : ''}" data-id="${e(n.id)}"`)).join('')}</aside><section><header><h2>${key ? '内容搜索：' + e(key) : e(leaves.find(x => x.id === c.ui.learnerContentTag)?.nm || '图谱内容')}</h2>${key ? button('learner-clear-search', '清除搜索') : ''}</header><div class="sl-kind-tabs">${['课程', '考试', '资料', '文章', '专家', '问答'].map(k => button('learner-kind', k, `data-kind="${k}" class="${kind === k ? 'active' : ''}"`)).join('')}</div>
      <div class="sl-content-list">${items.length ? items.map(x => `<article><div class="sl-content-icon">${e(x.kind)}</div><div><h3>${e(x.nm)}</h3><p>${e(x.tagName)} · ${x.required ? '必修' : '选修'}</p></div>${button('learner-open-content', '查看内容', `data-id="${e(x.id)}" data-tag="${e(x.tagId)}" class="sl-action"`)}</article>`).join('') : '<div class="sl-empty">暂无匹配的学习内容</div>'}</div></section></div>`;
  }
  function render(c) {
    const { g, p, list } = current(c), tab = c.ui.learnerTab || 'fullState', e = c.esc;
    let body = !g ? `<div class="sl-empty"><h2>暂无关联图谱，请联系管理员添加图谱</h2>${button('pd-choose-user', '选择学员', 'class="sl-action"')}</div>` : tab === 'dashboard' ? (list.some(x=>x.graphId===g.id && x.associated) ? c.renderPersonal() : '<div class="sl-empty">尚未关联此图谱，暂无个人学习与能力数据</div>') : tab === 'content' ? content(c, g) : graph(c, g);
    const item = c.ui.learnerDetail && window.GP_CONFIG.resources(c).find(x => x.id === c.ui.learnerDetail);
    if (item) body += `<div class="modal-mask"><section class="modal sl-detail" role="dialog" aria-modal="true" aria-labelledby="sl-detail-title"><div class="modal-head"><h2 id="sl-detail-title">${e(item.nm)}</h2>${button('learner-close-detail', '×', 'aria-label="关闭内容详情"')}</div><div class="modal-body"><p>类型：${e(item.kind)}</p><p>当前图谱：${e(g?.name || '—')}</p>${item.department ? `<p>部门：${e(item.department)}；岗位：${e(item.position)}</p>` : ''}${item.summary ? `<p>${e(item.summary)}</p>` : ''}<p>这是本地原型的内容详情预览，未连接真实学习或考试服务，不会产生学习记录。</p></div><div class="modal-foot">${button('learner-close-detail', '返回图谱内容', 'class="btn"')}</div></section></div>`;
    return `<div class="sl-layout">${header(c, g, p, list)}<nav class="sl-tabs" aria-label="学员端页面">${[['content','图谱内容'],['fullState','图谱全态'],['dashboard','个人仪表盘']].map(([id, name]) => button('learner-tab', name, `data-tab="${id}" class="${tab === id ? 'active' : ''}" aria-current="${tab === id ? 'page' : 'false'}"`)).join('')}</nav><div class="sl-body">${body}</div></div>`;
  }
  function action(act, t, c) {
    const { ui } = c;
    switch (act) {
      case 'learner-tab': ui.learnerTab = t.dataset.tab; break;
      case 'learner-node': ui.learnerNode = t.dataset.id; ui.learnerHistory = [t.dataset.id, ...(ui.learnerHistory || []).filter(x => x !== t.dataset.id)].slice(0, 6); ui.learnerInfoClosed = false; break;
      case 'learner-node-query': ui.learnerNodeQuery = (ui.learnerNodeKey || '').trim(); break;
      case 'learner-node-reset': ui.learnerNode = null; ui.learnerNodeQuery = ''; ui.learnerNodeKey = ''; ui.learnerInfoClosed = false; break;
      case 'learner-info-toggle': ui.learnerInfoClosed = !ui.learnerInfoClosed; break;
      case 'learner-search': ui.learnerContentQuery = ui.learnerContentKey || ''; ui.learnerTab = 'content'; break;
      case 'learner-clear-search': ui.learnerContentQuery = ''; ui.learnerContentKey = ''; break;
      case 'learner-content-tag': ui.learnerContentTag = t.dataset.id; ui.learnerContentQuery = ''; ui.learnerContentKey = ''; break;
      case 'learner-kind': ui.learnerKind = t.dataset.kind; break;
      case 'learner-open-content': ui.learnerDetail = t.dataset.id; break;
      case 'learner-close-detail': ui.learnerDetail = null; break;
      case 'learner-go-content': ui.learnerTab = 'content'; ui.learnerContentTag = t.dataset.id; break;
      default: return false;
    }
    c.render(); return true;
  }
  function input(act, t, c) {
    if (act === 'learner-content-key') c.ui.learnerContentKey = t.value;
    else if (act === 'learner-node-key') c.ui.learnerNodeKey = t.value;
    else return false;
    return true;
  }
  window.GP_LEARNER = { render, action, input };
})();
