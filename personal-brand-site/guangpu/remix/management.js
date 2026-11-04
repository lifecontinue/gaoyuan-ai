/* 截图中的图谱中心操作；所有写入仅发生在本地演示状态。 */
(function () {
  'use strict';
  const clone = x => JSON.parse(JSON.stringify(x));
  const flat = tree => (tree || []).flatMap(n => [n, ...flat(n.children)]);
  const btn = (act, label, attrs = '') => `<button type="button" data-act="${act}" ${attrs}>${label}</button>`;
  function model(c) {
    if (!c.ui.mgmt) c.ui.mgmt = { tab: 'center', name: '', creator: '', from: '', to: '', query: {}, selected: [], page: 1, size: 10, modal: null, deletedTagIds: [], tags: c.G.tagCategories.flatMap(cat => (cat.children || []).map(t => ({ id:t.id,nm:t.nm,level:1 }))) };
    return c.ui.mgmt;
  }
  function meta(g) { return { creator: g.creator || '管理员', createdAt: g.createdAt || '2026-10-23 09:00:00' }; }
  function status(g) { return g.status === 'enabled' ? g.pendingUpdate ? '待更新' : '已启用' : g.status === 'disabled' ? '已停用' : '未启用'; }
  function nextId(c) { let n = Object.keys(c.S.graphs).length + 1; while (c.S.graphs['G' + n]) n++; return 'G' + n; }
  function createFrom(c, original, name) {
    const id = nextId(c), g = clone(original);
    Object.assign(g, { id, name, order: Math.max(0, ...Object.values(c.S.graphs).map(x => x.order || 0)) + 1, status: 'draft', autoAssociate: true, creator: '管理员', createdAt: new Date().toLocaleString('sv-SE'), pendingUpdate: false, contentVersion: 'v1' });
    // 定义可复制，成员关系和成绩不复制；启用时仍按关联范围生成名单。
    c.S.graphs[id] = g; c.S.rel[id] = {}; return id;
  }
  function download(name, value) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function definition(g) { return { name: g.name, positionIds: g.positionIds, groupIds: g.groupIds, briefing: g.briefing || '', duty: g.duty || '', tagTree: g.tagTree || [], step4: g.step4 || {}, builderSuggestions:(g.builderSuggestions || []).filter(x=>flat(g.tagTree).some(t=>t.id===x.tagId && !t.children?.length)) }; }
  function validateImport(data, c) {
    if (!data || data.format !== 'guangpu-prototype' || data.version !== 1 || !Array.isArray(data.graphs) || !data.graphs.length || data.graphs.length > 100) throw new Error('请选择本原型导出的 JSON 文件，最多 100 张图谱。');
    const text = (v, label, max = 2000) => { if (typeof v !== 'string' || v.length > max) throw new Error(label + '格式不正确'); return v; };
    const ids = (v, source, label) => { if (!Array.isArray(v) || v.length > source.length || v.some(x => !source.some(s => s.id === x)) || new Set(v).size !== v.length) throw new Error(label + '包含无效或重复标识'); return v.slice(); };
    return data.graphs.map(raw => {
      const name = text(raw?.name, '图谱名称', 100).trim(); if (!name) throw new Error('图谱名称不能为空');
      const seen = new Set(); let count = 0;
      const tree = (nodes, level) => {
        if (!Array.isArray(nodes) || level > 3 || nodes.length > 200) throw new Error('标签树最多三级，且必须为列表');
        return nodes.map(n => {
          const id = text(n?.id, '标签标识', 80), nm = text(n?.nm, '标签名称', 100);
          if (!/^[a-zA-Z0-9_-]+$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id) || seen.has(id) || !nm.trim() || ++count > 500) throw new Error('标签标识重复、标签名称为空或标签数超过 500');
          seen.add(id); const children = n.children?.length ? tree(n.children, level + 1) : [];
          return { id, nm, level, leaf: !children.length, ...(children.length ? { children } : {}) };
        });
      };
      const tagTree = tree(raw.tagTree, 1), leaves = c.G.leafTags(tagTree), step4 = {};
      if (raw.step4 && (typeof raw.step4 !== 'object' || Array.isArray(raw.step4))) throw new Error('学习内容配置格式不正确');
      for (const [id, config] of Object.entries(raw.step4 || {})) {
        if (!leaves.some(t => t.id === id) || !config || !Array.isArray(config.items) || config.items.length > c.G.courseLibrary.length || !Array.isArray(config.levels) || config.levels.some(x => !['L1','L2','L3','L4','L5'].includes(x))) throw new Error('学习内容的标签或层级无效');
        const seenItems = new Set();
        step4[id] = { levels: [...new Set(config.levels)], items: config.items.map(item => {
          const base = c.G.courseLibrary.find(x => x.id === item.id);
          if (!base || seenItems.has(item.id) || typeof item.required !== 'boolean') throw new Error('学习内容引用无效、重复或缺少必学标记');
          seenItems.add(item.id); if(item.testPhase && !['pre','post'].includes(item.testPhase)) throw new Error('考试阶段无效'); return { id: base.id, nm: base.nm, required: item.required, ...(item.testPhase ? {testPhase:item.testPhase} : {}) };
        }), informal: window.GP_CONFIG.validateInformal(config.informal,c) };
      }
      const builderSuggestions = raw.builderSuggestions || [];
      if (!Array.isArray(builderSuggestions) || builderSuggestions.length>500) throw new Error('帮建建议格式不正确');
      const suggestionTags = new Set();
      const suggestions = builderSuggestions.map(item=>{
        if(!item || !leaves.some(t=>t.id===item.tagId) || suggestionTags.has(item.tagId)) throw new Error('帮建建议的标签无效或重复');
        suggestionTags.add(item.tagId); return {tagId:item.tagId,text:text(item.text,'帮建建议')};
      });
      return { name, tagTree, step4, builderSuggestions:suggestions, positionIds: ids(raw.positionIds, c.G.positions, '岗位'), groupIds: ids(raw.groupIds, c.G.groups, '群组'), briefing: text(raw.briefing || '', '岗位意义'), duty: text(raw.duty || '', '岗位职责') };
    });
  }
  function center(c, m) {
    const e = c.esc, query = m.query;
    const all = Object.values(c.S.graphs).filter(g => (!query.name || g.name.includes(query.name)) && (!query.creator || meta(g).creator === query.creator) && (!query.from || meta(g).createdAt.slice(0, 10) >= query.from) && (!query.to || meta(g).createdAt.slice(0, 10) <= query.to));
    const pages = Math.max(1, Math.ceil(all.length / m.size)); m.page = Math.min(m.page, pages);
    const rows = all.slice((m.page - 1) * m.size, m.page * m.size), count = c.S.persons.filter(p => !c.G.accessibleGraphs(c.S, p.userId).length).length;
    return `<div class="mgmt-filters"><label>图谱名称：<input class="input" data-act="mgmt-name" placeholder="请输入" value="${e(m.name)}"></label><label>创建人：<select class="select-native" data-act="mgmt-creator"><option value="">请选择</option>${[...new Set(Object.values(c.S.graphs).map(g => meta(g).creator))].map(n => `<option ${m.creator === n ? 'selected' : ''}>${e(n)}</option>`).join('')}</select></label><label>创建时间：<input type="date" data-act="mgmt-from" value="${e(m.from)}"> — <input type="date" data-act="mgmt-to" value="${e(m.to)}"></label>${btn('mgmt-query', '查询', 'class="btn btn-primary"')}${btn('mgmt-reset', '重置', 'class="btn"')}</div>
      <div class="mgmt-toolbar">${btn('mgmt-create', '＋ 新增', 'class="btn btn-primary"')}${btn('builder-open', '✦ AI 帮建光谱', 'class="btn mgmt-ai-build"')}${btn('rx-open-ai', '✦ AI 资料包建图', 'class="btn mgmt-ai-build"')}${btn('mgmt-import', '导入', 'class="btn"')}${btn('mgmt-delete-selected', '删除', `class="btn" ${m.selected.length ? '' : 'disabled'}`)}<span class="spacer"></span>${btn('mgmt-no-graph', `无有效图谱学员（${count}）`, 'class="btn"')}</div>
      <div class="mgmt-table-wrap"><table class="mgmt-table tbl"><thead><tr><th><input type="checkbox" data-act="mgmt-select-all" aria-label="选择当前页全部图谱" ${rows.length && rows.every(g => m.selected.includes(g.id)) ? 'checked' : ''}></th><th>图谱名称</th><th>关联岗位</th><th>关联学员数量</th><th>创建人</th><th>创建时间</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows.map(g => `<tr data-gid="${e(g.id)}"><td><input type="checkbox" data-act="mgmt-select" data-gid="${e(g.id)}" aria-label="选择${e(g.name)}" ${m.selected.includes(g.id) ? 'checked' : ''}></td><td><span class="mgmt-name" title="${e(g.name)}">${e(g.name)}</span></td><td>${e(g.positionIds.map(c.posName).join('、') || '—')}</td><td>${c.G.effectiveMembers(c.S, g.id).length}</td><td>${e(meta(g).creator)}</td><td class="mgmt-date">${e(meta(g).createdAt)}</td><td><span class="mgmt-status ${g.pendingUpdate && g.status === 'enabled' ? 'pending' : g.status}">●</span> ${status(g)}</td><td class="mgmt-row-actions">
      ${btn('mgmt-view', '查看', `data-gid="${e(g.id)}"`)}${btn('mgmt-edit', '编辑', `data-gid="${e(g.id)}"`)}${btn('mgmt-delete', '删除', `data-gid="${e(g.id)}" ${g.status === 'enabled' ? 'disabled title="请先停用图谱"' : ''}`)}${btn('mgmt-enable', '启用', `data-gid="${e(g.id)}" ${g.status === 'enabled' ? 'disabled' : ''}`)}${btn('mgmt-disable', '停用', `data-gid="${e(g.id)}" ${g.status !== 'enabled' ? 'disabled' : ''}`)}${btn('mgmt-update', '更新', `data-gid="${e(g.id)}" ${!g.pendingUpdate || g.status !== 'enabled' ? 'disabled' : ''}`)}${btn('mgmt-copy', '复制', `data-gid="${e(g.id)}"`)}${btn('mgmt-export', '导出', `data-gid="${e(g.id)}"`)}${btn('mgmt-score', '胜任力指数导入', `data-gid="${e(g.id)}"`)}</td></tr>`).join('') || '<tr><td colspan="8" class="mgmt-empty">没有符合条件的图谱</td></tr>'}</tbody></table></div>
      <div class="mgmt-pager">${btn('mgmt-page', '‹', `data-page="${m.page - 1}" class="btn" ${m.page <= 1 ? 'disabled' : ''}`)}<span>${m.page} / ${pages}</span>${btn('mgmt-page', '›', `data-page="${m.page + 1}" class="btn" ${m.page >= pages ? 'disabled' : ''}`)}<select class="select-native" data-act="mgmt-size" aria-label="每页数量">${[5,10,20].map(n => `<option value="${n}" ${m.size === n ? 'selected' : ''}>${n}条/页</option>`).join('')}</select><span>共 ${all.length} 条</span></div>`;
  }
  function catalogs(c, m) {
    const e = c.esc, templates = m.tab !== 'tags', key = m.catalogKey || '';
    const rows = templates ? Object.values(c.G.graphs).filter(g => g.name.includes(key)) : m.tags.filter(t => t.nm.includes(key));
    return `<div class="mgmt-toolbar"><input class="input" aria-label="模板或标签名称" data-act="mgmt-catalog-key" placeholder="请输入名称" value="${e(key)}">${btn('mgmt-catalog-query', '查询', 'class="btn btn-primary"')}${!templates ? btn('mgmt-add-tag', '新增标签', 'class="btn"') : ''}</div>
      <div class="anno hint">模板取自本地示例图谱，操作只影响当前原型，不代表企业模板库。</div><div class="mgmt-table-wrap"><table class="tbl"><thead><tr><th>名称</th><th>${templates ? '标签数量' : '标签层级'}</th><th>操作</th></tr></thead><tbody>${rows.map(x => `<tr><td>${e(x.name || x.nm)}${templates ? ' · 示例模板' : ''}</td><td>${templates ? flat(x.tagTree).length : x.level}</td><td>${templates ? btn('mgmt-template-view', '查看', `data-gid="${e(x.id)}"`) + btn('mgmt-use-template', m.tab === 'tagTemplates' ? '使用标签模板' : '使用模板创建', `data-gid="${e(x.id)}"`) : btn('mgmt-tag-view', '查看', `data-id="${e(x.id)}"`) + btn('mgmt-tag-delete', '删除', `data-id="${e(x.id)}"`)}</td></tr>`).join('') || '<tr><td colspan="3" class="mgmt-empty">暂无匹配记录</td></tr>'}</tbody></table></div>`;
  }
  function modal(c, m) {
    if (!m.modal) return '';
    const e = c.esc, v = m.modal, g = v.template ? c.G.graphs[v.gid] : c.S.graphs[v.gid] || c.G.graphs[v.gid]; let title = '', body = '', foot = btn('mgmt-close', '关闭', 'class="btn"');
    if (v.type === 'delete') { title = '删除图谱'; body = `<p>确认删除所选的 ${v.ids.length} 张图谱？本地配置及关联关系将移除，历史评分与学习记录不删除。</p>`; foot = btn('mgmt-close', '取消', 'class="btn"') + btn('mgmt-confirm-delete', '确认删除', 'class="btn btn-danger"'); }
    else if (v.type === 'view') { title = '图谱详情'; body = `<dl><dt>图谱名称</dt><dd>${e(g.name)}</dd><dt>关联岗位</dt><dd>${e(g.positionIds.map(c.posName).join('、') || '—')}</dd><dt>关联群组</dt><dd>${e(g.groupIds.map(c.groupName).join('、') || '—')}</dd><dt>岗位意义</dt><dd>${e(g.briefing || '—')}</dd><dt>关键职责</dt><dd>${e(g.duty || '—')}</dd><dt>标签</dt><dd>${e(flat(g.tagTree).map(t => t.nm).join(' / ') || '—')}</dd></dl>`; if (!v.template && c.S.graphs[v.gid]) foot += btn('mgmt-detail-edit', '进入编辑', `class="btn btn-primary" data-gid="${e(v.gid)}"`); }
    else if (v.type === 'deleteTag') { title='删除标签'; body='<p>确认删除此标签库记录？已在图谱内配置的标签保持不变。</p>'; foot=btn('mgmt-close','取消','class="btn"')+btn('mgmt-confirm-tag-delete','确认删除','class="btn btn-danger"'); }
    else if (v.type === 'help') { title = '帮助中心'; body = '<p>在图谱中心新增或编辑图谱，按四步配置岗位、标签、学习内容和学员。</p><p>启用后，学员可访问有效关联的图谱。编辑已启用图谱后先保存，再使用“更新”同步成员并增加内容版本。本原型的编辑直接作用于内存，不模拟生产草稿与发布隔离。</p><p>“图谱模板”和“标签模板”提供本地示例；导入、导出仅使用本原型 JSON 格式，不兼容生产系统文件。</p><p>右上角可进入学员仪表盘和驾驶舱。客户演示模式可隐藏备注及评审工具。</p>'; }
    else if (v.type === 'roles') { title = '系统管理员'; body = '<p>当前为管理员模拟身份，可管理图谱及查看学员展示。</p><p>“切换学员”用于选择本地模拟学员，不会修改真实用户或权限。</p>'; }
    else if (v.type === 'import') { title = '导入图谱'; body = `<p>请选择本原型导出的 JSON 文件。导入为新草稿，不带成员关系或成绩。</p><label class="mgmt-file">选择文件<input type="file" accept=".json,application/json" data-act="mgmt-file"></label><p class="mgmt-error" role="alert">${e(v.error || '')}</p>${v.names ? `<p>已导入：${e(v.names.join('、'))}</p>` : ''}`; }
    else if (v.type === 'tag') { title = v.id ? '标签详情' : '新增标签'; const tag = m.tags.find(t => t.id === v.id); body = tag ? `<p>名称：${e(tag.nm)}</p><p>层级：${tag.level}</p><p>删除标签库记录不会删除图谱中已配置的标签。</p>` : '<label>标签名称<input class="input" data-act="mgmt-tag-name" maxlength="100"></label>'; if (!tag) foot += btn('mgmt-tag-save', '保存标签', 'class="btn btn-primary"'); }
    return `<div class="modal-mask"><section class="modal mgmt-modal" role="dialog" aria-modal="true" aria-labelledby="mgmt-modal-title"><div class="modal-head"><h2 id="mgmt-modal-title">${title}</h2>${btn('mgmt-close', '×', 'aria-label="关闭"')}</div><div class="modal-body">${body}</div><div class="modal-foot">${foot}</div></section></div>`;
  }
  function render(c) {
    const m = model(c);
    return `<div class="mgmt-root"><div class="mgmt-nav"><nav aria-label="光谱管理页面">${[['center','图谱中心'],['templates','图谱模板'],['tags','自建标签'],['tagTemplates','标签模板']].map(([id,name]) => btn('mgmt-tab', name, `data-tab="${id}" class="${m.tab === id ? 'active' : ''}" aria-selected="${m.tab === id}"`)).join('')}</nav><div class="mgmt-nav-right">${btn('go','学员仪表盘','data-page="dashboard"')}${btn('go','驾驶舱','data-page="cockpitAdmin"')}${btn('mgmt-roles','系统管理员⌄')}${btn('mgmt-help','ⓘ 帮助中心')}</div></div><section class="mgmt-panel">${m.tab === 'center' ? center(c,m) : catalogs(c,m)}</section>${modal(c,m)}</div>`;
  }
  function action(act, t, c) {
    const m = model(c), id = t.dataset.gid, g = c.S.graphs[id];
    switch (act) {
      case 'mgmt-tab': m.tab = t.dataset.tab; m.modal = null; m.catalogKey = ''; break;
      case 'mgmt-query': if (m.from && m.to && m.from > m.to) { c.toast('开始时间不能晚于结束时间', 'error'); return true; } m.query = { name: m.name.trim(), creator: m.creator, from: m.from, to: m.to }; m.page = 1; break;
      case 'mgmt-reset': Object.assign(m, {name:'',creator:'',from:'',to:'',query:{},page:1}); break;
      case 'mgmt-edit': case 'mgmt-detail-edit': m.modal=null; c.delegate('open-graph',{gid:id}); return true;
      case 'mgmt-create': c.delegate('create-graph'); return true;
      case 'mgmt-score': c.delegate('open-import',{gid:id}); return true;
      case 'mgmt-no-graph': c.delegate('go',{page:'noGraph'}); return true;
      case 'mgmt-enable': case 'mgmt-disable': if (g && ((act === 'mgmt-enable') !== (g.status === 'enabled'))) { c.delegate('toggle-status-row',{gid:id}); if (act === 'mgmt-enable') { c.runSync(id); c.render(); } } return true;
      case 'mgmt-update': if (g?.status === 'enabled' && g.pendingUpdate) { c.runSync(id); g.pendingUpdate=false; g.contentVersion='v'+((parseInt(String(g.contentVersion).replace('v',''),10)||1)+1); c.toast('图谱已更新（本地模拟）','success'); } break;
      case 'mgmt-view': m.modal={type:'view',gid:id}; break;
      case 'mgmt-delete': if (g && g.status !== 'enabled') m.modal={type:'delete',ids:[id]}; break;
      case 'mgmt-delete-selected': if (m.selected.some(x => c.S.graphs[x]?.status === 'enabled')) { c.toast('所选图谱包含已启用项，请先停用或取消选择','error'); return true; } if (m.selected.length) m.modal={type:'delete',ids:m.selected.slice()}; break;
      case 'mgmt-confirm-delete': if (m.modal?.type === 'delete') { m.modal.ids.forEach(gid => { if (c.S.graphs[gid]?.status !== 'enabled') { delete c.S.graphs[gid]; delete c.S.rel[gid]; } }); m.selected=[]; m.modal=null; } break;
      case 'mgmt-copy': if (g) { const copy=createFrom(c,g,g.name+'（副本）'); m.name='';m.query={};m.page=1; c.toast('已复制为新草稿；成员和历史成绩未复制','success'); } break;
      case 'mgmt-export': if (g) download(g.name+'.json',{format:'guangpu-prototype',version:1,graphs:[definition(g)]}); return true;
      case 'mgmt-import': m.modal={type:'import'}; break;
      case 'mgmt-help': m.modal={type:'help'}; break;
      case 'mgmt-roles': m.modal={type:'roles'}; break;
      case 'mgmt-close': m.modal=null; break;
      case 'mgmt-page': m.page=Math.max(1,Number(t.dataset.page)); break;
      case 'mgmt-select': { const gid=t.dataset.gid; m.selected=t.checked ? [...new Set([...m.selected,gid])] : m.selected.filter(x=>x!==gid); break; }
      case 'mgmt-select-all': { const ids=[...document.querySelectorAll('[data-act="mgmt-select"]')].map(el=>el.dataset.gid); m.selected=t.checked ? [...new Set([...m.selected,...ids])] : m.selected.filter(x=>!ids.includes(x)); break; }
      case 'mgmt-template-view': m.modal={type:'view',gid:id,template:true}; break;
      case 'mgmt-use-template': { const template=c.G.graphs[id]; if (!template) return true; const nid=createFrom(c,template,template.name+'（模板新建）'); c.delegate('open-graph',{gid:nid}); return true; }
      case 'mgmt-catalog-query': break;
      case 'mgmt-add-tag': m.modal={type:'tag',name:''}; break;
      case 'mgmt-tag-view': m.modal={type:'tag',id:t.dataset.id}; break;
      case 'mgmt-tag-save': { const name=(m.modal?.name||'').trim(); if (!name) {c.toast('请输入标签名称','error');return true;} if(m.tags.some(x=>x.nm===name)){c.toast('标签名称已存在','error');return true;} m.tags.push({id:'custom-'+Date.now(),nm:name,level:1,custom:true});m.modal=null;break; }
      case 'mgmt-confirm-tag-delete': if(m.modal?.type==='deleteTag'){m.deletedTagIds.push(m.modal.id);m.tags=m.tags.filter(x=>x.id!==m.modal.id);m.modal=null;} break;
      case 'mgmt-tag-delete': m.modal={type:'deleteTag',id:t.dataset.id}; break;
      default: return false;
    }
    c.render(); return true;
  }
  function input(act,t,c) {
    const m=model(c), fields={'mgmt-name':'name','mgmt-creator':'creator','mgmt-from':'from','mgmt-to':'to','mgmt-catalog-key':'catalogKey'};
    if(fields[act]) m[fields[act]]=t.value;
    else if(act==='mgmt-tag-name' && m.modal) m.modal.name=t.value;
    else return false;
    return true;
  }
  function change(act,t,c) {
    const m=model(c);
    if(act==='mgmt-size'){m.size=Number(t.value);m.page=1;c.render();return true;}
    if(act!=='mgmt-file') return input(act,t,c);
    const target=m.modal, file=t.files?.[0]; if(!file || target?.type!=='import') return true;
    if(file.size>2*1024*1024){target.error='文件超过 2 MB，请缩小后重试';c.render();return true;}
    file.text().then(text=>{
      if(m.modal!==target) return;
      const graphs=validateImport(JSON.parse(text),c); // 整批通过后才写入。
      graphs.forEach(g=>createFrom(c,g,g.name)); target.names=graphs.map(g=>g.name); target.error='';m.name='';m.query={};c.render();
    }).catch(error=>{if(m.modal===target){target.error='导入失败：'+error.message;c.render();}});
    return true;
  }
  window.GP_MANAGEMENT={render,action,input,change};
})();
