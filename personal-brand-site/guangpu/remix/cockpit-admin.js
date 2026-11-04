/* 驾驶舱配置的本地结构仿真。名单与指标独立保存，不修改图谱关联或评分。 */
(() => {
  'use strict';
  const TYPES = { organization:'组织能力驾驶舱', busSeq:'业务序列能力驾驶舱', group:'团队能力驾驶舱' };
  const STEPS = ['基本信息','选择驾驶舱所含学员','编辑驾驶舱指标','编辑核心人员'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const button = (act,text,attrs='') => `<button type="button" data-act="${act}" ${attrs}>${text}</button>`;
  const flat = nodes => (nodes || []).flatMap(n => [{id:n.id,nm:n.nm},...flat(n.children)]);
  function model(c) {
    if (!c.ui.cockpitAdmin) {
      const people=c.S.persons, graph=Object.values(c.S.graphs)[0], tags=flat(graph?.tagTree);
      c.ui.cockpitAdmin={records:[{id:'ca-demo-1',name:'安全生产能力驾驶舱',managerId:people[0]?.userId||'',type:'group',userIds:people.slice(0,4).map(p=>p.userId),coreIds:people.slice(0,1).map(p=>p.userId),indicators:tags.slice(0,2).map((t,i)=>({graphId:graph?.id,tagId:t.id,type:i?'BAI':'KAI'})),status:graph?.status==='enabled'&&tags.length?'published':'draft',creator:'管理员',createdAt:'2026-10-23 09:00:00'}],name:'',manager:'',query:{},page:1,size:10,draft:null,readonly:false,step:1,error:'',confirmDelete:null};
    }
    return c.ui.cockpitAdmin;
  }
  function getPublished(c) { return clone(model(c).records.filter(r=>r.status==='published')); }
  function person(c,id) { return c.S.persons.find(p=>p.userId===id); }
  function managerName(c,id) { return person(c,id)?.userName || '—'; }
  function resetEditor(m) { Object.assign(m,{draft:null,readonly:false,step:1,error:'',peopleKey:'',peopleQuery:'',scopeType:'dept',scopeId:'',leftPage:1,rightPage:1,leftChecks:[],rightChecks:[],tagKey:'',tagQuery:'',tagGraph:'',tagId:'',indicatorChecks:[],coreKey:'',coreQuery:'',coreChecks:[],corePage:1}); }
  function open(m,record,readonly) { resetEditor(m); m.draft=clone(record);m.readonly=readonly; }
  function pager(act,page,total,size=10) {
    const pages=Math.max(1,Math.ceil(total/size));
    return `<div class="ca-pager">${button(act,'‹',`class="btn btn-sm" data-page="${page-1}" aria-label="上一页" ${page<=1?'disabled':''}`)}<span>${page} / ${pages}</span>${button(act,'›',`class="btn btn-sm" data-page="${page+1}" aria-label="下一页" ${page>=pages?'disabled':''}`)}<span>共 ${total} 条</span></div>`;
  }
  function heading(title,extra='') { return `<header class="ca-heading"><h1>${title}</h1><div>${extra}</div></header>`; }
  function list(c,m) {
    const e=c.esc, rows=m.records.filter(r=>(!m.query.name||r.name.includes(m.query.name))&&(!m.query.manager||managerName(c,r.managerId).includes(m.query.manager)));
    m.page=Math.max(1,Math.min(m.page,Math.ceil(rows.length/m.size)||1));
    return `${heading('驾驶舱',button('ca-return','×','class="ca-close" aria-label="返回图谱中心"'))}<section class="ca-list-panel"><div class="ca-toolbar"><label>驾驶舱名称：<input class="input" data-act="ca-name-filter" value="${e(m.name)}" placeholder="请输入"></label><label>管理者姓名：<input class="input" data-act="ca-manager-filter" value="${e(m.manager)}" placeholder="请输入"></label>${button('ca-query','查询','class="btn btn-primary"')}${button('ca-reset','重置','class="btn"')}</div><div class="ca-toolbar">${button('ca-create','新增','class="btn btn-primary"')}</div><div class="ca-table-wrap"><table class="tbl ca-table"><thead><tr><th>驾驶舱名称</th><th>管理者</th><th>驾驶舱类型</th><th>创建人</th><th>创建日期</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows.slice((m.page-1)*m.size,m.page*m.size).map(r=>`<tr data-cid="${e(r.id)}"><td>${e(r.name)}</td><td>${e(managerName(c,r.managerId))}</td><td>${TYPES[r.type]}</td><td>${e(r.creator)}</td><td>${e(r.createdAt)}</td><td>${r.status==='published'?'已发布':'未发布'}</td><td class="ca-actions">${button('ca-publish','发布',`data-id="${e(r.id)}" ${r.status==='published'?'disabled':''}`)}${button('ca-view','查看',`data-id="${e(r.id)}"`)}${button('ca-disable','停用',`data-id="${e(r.id)}" ${r.status!=='published'?'disabled':''}`)}${button('ca-edit','修改',`data-id="${e(r.id)}" ${r.status==='published'?'disabled title="请先停用驾驶舱"':''}`)}${button('ca-delete','删除',`data-id="${e(r.id)}" ${r.status==='published'?'disabled title="请先停用驾驶舱"':''}`)}</td></tr>`).join('')||'<tr><td colspan="7" class="ca-empty">没有符合条件的驾驶舱</td></tr>'}</tbody></table></div>${pager('ca-page',m.page,rows.length,m.size)}</section>`;
  }
  function basics(c,m) {
    const e=c.esc,d=m.draft,disabled=m.readonly?'disabled':'';
    return `<div class="ca-basic"><label><span><b>*</b> 驾驶舱名称：</span><input class="input" data-act="ca-draft-name" value="${e(d.name)}" maxlength="100" placeholder="请输入" ${disabled}></label><label><span><b>*</b> 管理者：</span><select class="select-native" data-act="ca-draft-manager" ${disabled}><option value="">请选择管理者</option>${c.S.persons.map(p=>`<option value="${e(p.userId)}" ${d.managerId===p.userId?'selected':''}>${e(p.userName)}（${e(p.employeeCode)}）</option>`).join('')}</select></label><label><span><b>*</b> 驾驶舱类型：</span><select class="select-native" data-act="ca-draft-type" ${disabled}><option value="">请选择驾驶舱类型</option>${Object.entries(TYPES).map(([id,nm])=>`<option value="${id}" ${d.type===id?'selected':''}>${nm}</option>`).join('')}</select></label><p class="ca-required-tip">一个管理者仅支持关联一个驾驶舱。</p></div>`;
  }
  function peopleRows(c,m,selected) {
    return c.S.persons.filter(p=>m.draft.userIds.includes(p.userId)===selected).filter(p=>!m.peopleQuery||[p.userName,p.employeeCode].some(v=>v.includes(m.peopleQuery))).filter(p=>selected||!m.scopeId||(m.scopeType==='dept'?p.deptId===m.scopeId:m.scopeType==='position'?p.positionIds.includes(m.scopeId):p.groupIds.includes(m.scopeId)));
  }
  function peopleColumn(c,m,selected) {
    const e=c.esc,all=peopleRows(c,m,selected),pageKey=selected?'rightPage':'leftPage',checkKey=selected?'rightChecks':'leftChecks';
    m[pageKey]=Math.max(1,Math.min(m[pageKey],Math.ceil(all.length/10)||1));
    const rows=all.slice((m[pageKey]-1)*10,m[pageKey]*10);
    return `<section class="ca-transfer-column"><div class="ca-column-head">${selected?'已选':'待选'}（${selected?m.draft.userIds.length:all.length}）${selected&&!m.readonly?button('ca-remove-all','移除全部','class="ca-link"'):''}</div><table class="tbl"><thead><tr><th>${!m.readonly?`<input type="checkbox" data-act="ca-people-all" data-side="${selected?'right':'left'}" aria-label="选择${selected?'已选':'待选'}本页" ${rows.length&&rows.every(p=>m[checkKey].includes(p.userId))?'checked':''}>`:''}</th><th>工号</th><th>姓名</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${!m.readonly?`<input type="checkbox" data-act="ca-people-check" data-side="${selected?'right':'left'}" data-id="${e(p.userId)}" aria-label="选择${e(p.userName)}" ${m[checkKey].includes(p.userId)?'checked':''}>`:''}</td><td>${e(p.employeeCode)}</td><td>${e(p.userName)}</td></tr>`).join('')}</tbody></table>${!rows.length?'<div class="ca-empty">暂无学员</div>':''}${pager(selected?'ca-right-page':'ca-left-page',m[pageKey],all.length)}</section>`;
  }
  function peopleStep(c,m) {
    const e=c.esc,scopes=m.scopeType==='position'?c.G.positions:m.scopeType==='group'?c.G.groups:[...new Map(c.S.persons.map(p=>[p.deptId,{id:p.deptId,nm:p.deptName}])).values()];
    return `<div class="ca-people-layout"><aside class="ca-scope"><div class="ca-scope-tabs">${[['dept','部门'],['position','岗位'],['group','群组']].map(([id,nm])=>button('ca-scope-type',nm,`data-type="${id}" class="${m.scopeType===id?'active':''}"`)).join('')}</div>${button('ca-scope','全部',`data-id="" class="${!m.scopeId?'active':''}"`)}${scopes.map(s=>button('ca-scope',e(s.nm),`data-id="${e(s.id)}" class="${m.scopeId===s.id?'active':''}"`)).join('')}</aside><div class="ca-people-main"><div class="ca-toolbar ca-search"><input class="input" data-act="ca-people-key" value="${e(m.peopleKey)}" placeholder="根据姓名、工号查询" aria-label="学员姓名或工号">${button('ca-people-query','查询','class="btn btn-primary"')}</div><div class="ca-transfer">${peopleColumn(c,m,false)}<div class="ca-transfer-actions">${m.readonly?'':button('ca-move-in','移入 ›',`class="btn btn-sm" ${!m.leftChecks.length?'disabled':''}`)+button('ca-move-out','‹ 移出',`class="btn btn-sm" ${!m.rightChecks.length?'disabled':''}`)+button('ca-move-page','本页 »','class="btn btn-sm btn-primary"')+button('ca-remove-page','« 本页','class="btn btn-sm"')}</div>${peopleColumn(c,m,true)}</div></div></div>`;
  }
  function indicators(c,m) {
    const e=c.esc,d=m.draft;
    const tree=(nodes,gid,depth=0)=>(nodes||[]).map(n=>`<div class="ca-tree-node" style="--ca-depth:${depth}">${button('ca-tag-select',e(n.nm),`data-gid="${e(gid)}" data-id="${e(n.id)}" class="${m.tagGraph===gid&&m.tagId===n.id?'active':''}"`)}</div>${tree(n.children,gid,depth+1)}`).join('');
    return `<div class="ca-indicators"><aside class="ca-scope"><div class="ca-column-head">标签</div><div class="ca-tag-search"><input class="input" data-act="ca-tag-key" value="${e(m.tagKey)}" placeholder="搜索图谱或标签" aria-label="搜索图谱或标签">${button('ca-tag-query','查询','class="btn btn-sm"')}</div>${Object.values(c.S.graphs).map(g=>{const tags=flat(g.tagTree).filter(t=>!m.tagQuery||t.nm.includes(m.tagQuery)||g.name.includes(m.tagQuery));return tags.length?`<div class="ca-tree-graph">${e(g.name)}</div>${m.tagQuery?tags.map(t=>`<div class="ca-tree-node">${button('ca-tag-select',e(t.nm),`data-gid="${e(g.id)}" data-id="${e(t.id)}" class="${m.tagGraph===g.id&&m.tagId===t.id?'active':''}"`)}</div>`).join(''):tree(g.tagTree,g.id)}`:'';}).join('')}</aside><div class="ca-transfer-actions">${m.readonly?'':button('ca-indicator-add','KAI ›',`class="btn btn-primary btn-sm" data-type="KAI" ${!m.tagId?'disabled':''}`)+button('ca-indicator-add','BAI ›',`class="btn btn-primary btn-sm" data-type="BAI" ${!m.tagId?'disabled':''}`)+button('ca-indicator-remove','‹ 移除',`class="btn btn-sm" ${!m.indicatorChecks.length?'disabled':''}`)}</div><section class="ca-indicator-selected"><div class="ca-column-head">已选（${d.indicators.length}）</div>${d.indicators.map((i,index)=>`<label class="ca-indicator-row">${m.readonly?'':`<input type="checkbox" data-act="ca-indicator-check" data-index="${index}" ${m.indicatorChecks.includes(index)?'checked':''}>`}<span>[${i.type}] ${e(flat(c.S.graphs[i.graphId]?.tagTree).find(t=>t.id===i.tagId)?.nm||'标签已移除')}（${e(c.S.graphs[i.graphId]?.name||'图谱已移除')}）</span></label>`).join('')||'<div class="ca-empty">请选择标签并添加 KAI 或 BAI 指标</div>'}</section></div>`;
  }
  function core(c,m) {
    const e=c.esc,d=m.draft,rows=c.S.persons.filter(p=>d.userIds.includes(p.userId)&&(!m.coreQuery||[p.userName,p.employeeCode].some(v=>v.includes(m.coreQuery))));
    m.corePage=Math.max(1,Math.min(m.corePage,Math.ceil(rows.length/10)||1));const pageRows=rows.slice((m.corePage-1)*10,m.corePage*10);
    return `<div class="ca-core"><div class="ca-toolbar">${m.readonly?'':button('ca-core-batch','设为核心人员',`class="btn" data-core="yes" ${!m.coreChecks.length?'disabled':''}`)+button('ca-core-batch','取消核心人员',`class="btn" data-core="no" ${!m.coreChecks.length?'disabled':''}`)}<span class="spacer"></span><input class="input" data-act="ca-core-key" value="${e(m.coreKey)}" placeholder="根据姓名、工号查询" aria-label="核心人员姓名或工号">${button('ca-core-query','筛选','class="btn btn-primary"')}</div><div class="ca-table-wrap"><table class="tbl ca-table"><thead><tr><th>${m.readonly?'':`<input type="checkbox" data-act="ca-core-all" aria-label="选择本页学员" ${pageRows.length&&pageRows.every(p=>m.coreChecks.includes(p.userId))?'checked':''}>`}</th><th>工号</th><th>姓名</th><th>用户名</th><th>部门</th><th>岗位</th><th>核心人员</th>${m.readonly?'':'<th>操作</th>'}</tr></thead><tbody>${pageRows.map(p=>`<tr><td>${m.readonly?'':`<input type="checkbox" data-act="ca-core-check" data-id="${e(p.userId)}" aria-label="选择${e(p.userName)}" ${m.coreChecks.includes(p.userId)?'checked':''}>`}</td><td>${e(p.employeeCode)}</td><td>${e(p.userName)}</td><td>${e(p.employeeCode)}</td><td>${e(p.deptName)}</td><td>${e(p.positionIds.map(c.posName).join('、'))}</td><td><span class="ca-core-tag ${d.coreIds.includes(p.userId)?'on':''}">${d.coreIds.includes(p.userId)?'核心人员':'非核心人员'}</span></td>${m.readonly?'':`<td>${button('ca-core-toggle',d.coreIds.includes(p.userId)?'取消核心人员':'设为核心人员',`class="ca-link" data-id="${e(p.userId)}"`)}</td>`}</tr>`).join('')||'<tr><td colspan="8" class="ca-empty">暂无符合条件的学员</td></tr>'}</tbody></table></div>${pager('ca-core-page',m.corePage,rows.length)}</div>`;
  }
  function editor(c,m) {
    const d=m.draft;
    return `${heading(m.readonly?'查看驾驶舱':m.records.some(r=>r.id===d.id)?'编辑驾驶舱':'新增驾驶舱',button('ca-cancel','×','class="ca-close" aria-label="关闭配置"'))}<div class="ca-editor"><nav class="ca-steps" aria-label="驾驶舱配置步骤">${STEPS.map((name,i)=>`<div class="${i+1===m.step?'current':i+1<m.step?'done':''}"><span>${i+1<m.step?'✓':i+1}</span>${name}</div>`).join('')}</nav>${m.error?`<div class="ca-error" role="alert">${c.esc(m.error)}</div>`:''}<div class="ca-step-body" data-step="${m.step}">${[basics,peopleStep,indicators,core][m.step-1](c,m)}</div></div><footer class="ca-footer">${button('ca-cancel',m.readonly?'关闭':'取消','class="btn"')}${m.step>1?button('ca-prev','上一步','class="btn"'):''}${m.step<4?button('ca-next','下一步','class="btn btn-primary"'):''}${!m.readonly?button('ca-save','保存','class="btn btn-primary"'):d.status==='published'?button('ca-display','打开光谱驾驶舱','class="btn btn-primary"'):''}</footer>`;
  }
  function render(c) {
    const m=model(c);
    const confirm=m.confirmDelete?`<div class="modal-mask"><section class="modal ca-confirm" role="dialog" aria-modal="true" aria-labelledby="ca-delete-title"><div class="modal-head"><h2 id="ca-delete-title">删除驾驶舱</h2></div><div class="modal-body">确认删除“${c.esc(m.records.find(r=>r.id===m.confirmDelete)?.name||'')}”？</div><div class="modal-foot">${button('ca-delete-cancel','取消','class="btn"')}${button('ca-delete-confirm','确认删除','class="btn btn-danger"')}</div></section></div>`:'';
    return `<div class="ca-root">${m.draft?editor(c,m):list(c,m)}${confirm}</div>`;
  }
  function basicError(c,m,d) {
    if(!d.name.trim())return '请输入驾驶舱名称';
    if(!person(c,d.managerId))return '请选择管理者';
    if(!TYPES[d.type])return '请选择驾驶舱类型';
    if(m.records.some(r=>r.id!==d.id&&r.managerId===d.managerId))return '该管理者已关联其他驾驶舱，请选择其他管理者';
    return '';
  }
  function publishError(c,m,d) {
    const basic=basicError(c,m,d);if(basic)return basic;
    if(!d.userIds.length)return '请先选择驾驶舱所含学员';
    if(!d.indicators.length)return '请先添加驾驶舱指标';
    if(d.indicators.some(i=>c.S.graphs[i.graphId]?.status!=='enabled'))return '指标所在图谱尚未启用，请先启用图谱后发布';
    if(d.indicators.some(i=>!flat(c.S.graphs[i.graphId]?.tagTree).some(t=>t.id===i.tagId)))return '部分指标的图谱或标签已移除，请先修改指标';
    return '';
  }
  function toggle(arr,id,checked) { return checked?[...new Set([...arr,id])]:arr.filter(x=>x!==id); }
  function removeUsers(m,ids) { m.draft.userIds=m.draft.userIds.filter(id=>!ids.includes(id));m.draft.coreIds=m.draft.coreIds.filter(id=>m.draft.userIds.includes(id));m.coreChecks=m.coreChecks.filter(id=>m.draft.userIds.includes(id));m.rightChecks=[]; }
  function action(act,t,c) {
    if(!act.startsWith('ca-'))return false;
    const m=model(c),id=t.dataset.id,r=m.records.find(row=>row.id===id),d=m.draft;
    const mutable=['ca-move-in','ca-move-out','ca-move-page','ca-remove-page','ca-remove-all','ca-indicator-add','ca-indicator-remove','ca-core-toggle','ca-core-batch','ca-save'];
    if(m.readonly&&mutable.includes(act))return true;
    switch(act) {
      case 'ca-return':c.delegate('go',{page:'list'});return true;
      case 'ca-query':m.query={name:m.name.trim(),manager:m.manager.trim()};m.page=1;break;
      case 'ca-reset':Object.assign(m,{name:'',manager:'',query:{},page:1});break;
      case 'ca-page':m.page=Math.max(1,Number(t.dataset.page));break;
      case 'ca-create':open(m,{id:'ca-'+Date.now(),name:'',managerId:'',type:'',userIds:[],coreIds:[],indicators:[],status:'draft',creator:'管理员',createdAt:new Date().toLocaleString('sv-SE').replace('T',' ')},false);break;
      case 'ca-view':if(r)open(m,r,true);break;
      case 'ca-edit':if(r&&r.status!=='published')open(m,r,false);break;
      case 'ca-disable':if(r&&r.status==='published'){r.status='draft';c.toast('驾驶舱已停用');}break;
      case 'ca-publish':if(r&&r.status!=='published'){const error=publishError(c,m,r);if(error)c.toast(error,'error');else{r.status='published';c.toast('驾驶舱已发布');}}break;
      case 'ca-delete':if(r&&r.status!=='published')m.confirmDelete=id;break;
      case 'ca-delete-cancel':m.confirmDelete=null;break;
      case 'ca-delete-confirm':m.records=m.records.filter(x=>x.id!==m.confirmDelete||x.status==='published');m.confirmDelete=null;break;
      case 'ca-cancel':resetEditor(m);break;
      case 'ca-next':m.error=m.step===1&&!m.readonly?basicError(c,m,d):'';if(!m.error)m.step=Math.min(4,m.step+1);break;
      case 'ca-prev':m.error='';m.step=Math.max(1,m.step-1);break;
      case 'ca-save':{m.error=basicError(c,m,d);if(m.error){m.step=1;break;}const existing=m.records.findIndex(x=>x.id===d.id);if(existing>=0&&m.records[existing].status==='published')break;d.name=d.name.trim();if(existing>=0)m.records[existing]=clone(d);else m.records.push(clone(d));resetEditor(m);c.toast('驾驶舱配置已保存');break;}
      case 'ca-display':if(d?.status==='published'){c.delegate('open-cockpit-config',{id:d.id});}return true;
      case 'ca-scope-type':m.scopeType=t.dataset.type;m.scopeId='';m.leftPage=1;m.leftChecks=[];break;
      case 'ca-scope':m.scopeId=id;m.leftPage=1;m.leftChecks=[];break;
      case 'ca-people-query':m.peopleQuery=m.peopleKey.trim();m.leftPage=m.rightPage=1;m.leftChecks=[];m.rightChecks=[];break;
      case 'ca-left-page':m.leftPage=Math.max(1,Number(t.dataset.page));break;
      case 'ca-right-page':m.rightPage=Math.max(1,Number(t.dataset.page));break;
      case 'ca-move-in':d.userIds=[...new Set([...d.userIds,...m.leftChecks])];m.leftChecks=[];break;
      case 'ca-move-page':d.userIds=[...new Set([...d.userIds,...peopleRows(c,m,false).slice((m.leftPage-1)*10,m.leftPage*10).map(p=>p.userId)])];m.leftChecks=[];break;
      case 'ca-move-out':removeUsers(m,m.rightChecks);break;
      case 'ca-remove-page':removeUsers(m,peopleRows(c,m,true).slice((m.rightPage-1)*10,m.rightPage*10).map(p=>p.userId));break;
      case 'ca-remove-all':removeUsers(m,d.userIds.slice());break;
      case 'ca-tag-query':m.tagQuery=m.tagKey.trim();break;
      case 'ca-tag-select':m.tagGraph=t.dataset.gid;m.tagId=id;break;
      case 'ca-indicator-add':if(m.tagId&&['KAI','BAI'].includes(t.dataset.type)&&!d.indicators.some(i=>i.graphId===m.tagGraph&&i.tagId===m.tagId&&i.type===t.dataset.type))d.indicators.push({graphId:m.tagGraph,tagId:m.tagId,type:t.dataset.type});break;
      case 'ca-indicator-remove':d.indicators=d.indicators.filter((_,index)=>!m.indicatorChecks.includes(index));m.indicatorChecks=[];break;
      case 'ca-core-query':m.coreQuery=m.coreKey.trim();m.corePage=1;m.coreChecks=[];break;
      case 'ca-core-page':m.corePage=Math.max(1,Number(t.dataset.page));break;
      case 'ca-core-toggle':if(d.userIds.includes(id))d.coreIds=toggle(d.coreIds,id,!d.coreIds.includes(id));break;
      case 'ca-core-batch':m.coreChecks.filter(uid=>d.userIds.includes(uid)).forEach(uid=>{d.coreIds=toggle(d.coreIds,uid,t.dataset.core==='yes');});m.coreChecks=[];break;
      default:return false;
    }
    c.render();return true;
  }
  function input(act,t,c) {
    const m=model(c),fields={'ca-name-filter':'name','ca-manager-filter':'manager','ca-people-key':'peopleKey','ca-core-key':'coreKey','ca-tag-key':'tagKey'};
    if(fields[act]){m[fields[act]]=t.value;return true;}
    if(m.draft&&!m.readonly&&act==='ca-draft-name'){m.draft.name=t.value;return true;}
    return false;
  }
  function change(act,t,c) {
    const m=model(c),d=m.draft;
    if(act==='ca-draft-manager'||act==='ca-draft-type'){if(d&&!m.readonly)d[act==='ca-draft-manager'?'managerId':'type']=t.value;return true;}
    if(m.readonly)return input(act,t,c);
    if(act==='ca-people-check'){const key=t.dataset.side==='right'?'rightChecks':'leftChecks';m[key]=toggle(m[key],t.dataset.id,t.checked);}
    else if(act==='ca-people-all'){const selected=t.dataset.side==='right',key=selected?'rightChecks':'leftChecks',page=selected?m.rightPage:m.leftPage;peopleRows(c,m,selected).slice((page-1)*10,page*10).forEach(p=>{m[key]=toggle(m[key],p.userId,t.checked);});}
    else if(act==='ca-indicator-check')m.indicatorChecks=toggle(m.indicatorChecks,Number(t.dataset.index),t.checked);
    else if(act==='ca-core-check')m.coreChecks=toggle(m.coreChecks,t.dataset.id,t.checked);
    else if(act==='ca-core-all'){c.S.persons.filter(p=>d.userIds.includes(p.userId)&&(!m.coreQuery||[p.userName,p.employeeCode].some(v=>v.includes(m.coreQuery)))).slice((m.corePage-1)*10,m.corePage*10).forEach(p=>{m.coreChecks=toggle(m.coreChecks,p.userId,t.checked);});}
    else return input(act,t,c);
    c.render();return true;
  }
  window.GP_COCKPIT_ADMIN={render,action,input,change,getPublished};
})();
