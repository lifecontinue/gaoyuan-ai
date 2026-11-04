/* 正式与非正式学习配置，静态原型。分类按 gp TypeEnum 和用户截图。 */
(function () {
  'use strict';
  const tabs = ['工具表单', '案例模板', '标准话术', '专家黄页', 'FQ&A'];
  const kinds = tab => tab === '专家黄页' ? ['专家'] : tab === 'FQ&A' ? ['问答', '文章'] : ['资料', '文章'];
  const button = (act, name, attrs = '') => `<button type="button" data-act="${act}" ${attrs}>${name}</button>`;
  function resources(c) {
    return [...c.G.courseLibrary.map(r => ({ ...r })),
      { id:'article-risk',nm:'风险辨识操作指南',kind:'文章',summary:'示例文章：作业前识别风险并采取预防措施。' },
      { id:'article-handover',nm:'交接班记录规范',kind:'文章',summary:'示例文章：记录设备状态及待办事项。' },
      { id:'qa-risk',nm:'如何识别作业风险？',kind:'问答',summary:'示例回答：检查作业环境、设备状态和操作步骤。' },
      { id:'qa-emergency',nm:'发现隐患后如何处理？',kind:'问答',summary:'示例回答：按岗位规范报告并跟进处理。' },
      ...c.S.persons.slice(0,3).map(p => ({ id:'expert-'+p.userId,nm:p.userName,kind:'专家',department:p.deptName,position:p.positionIds.map(c.posName).join('、') }))];
  }
  function config(c, tagId = c.ui.s4Tag) {
    const g=c.S.graphs[c.S.selectedGraphId];
    if(!g || !tagId) return null;
    g.step4 ||= {}; const v=g.step4[tagId] ||= {levels:[],items:[]}; v.informal ||= {};
    // 兼容先前原型把资料放在正式学习列表的记录。
    const materials=v.items.filter(x=>c.G.courseLibrary.find(r=>r.id===x.id)?.kind==='资料');
    if(materials.length){v.informal['工具表单'] ||= {}; v.informal['工具表单']['资料'] ||= []; materials.forEach(x=>{if(!v.informal['工具表单']['资料'].some(r=>r.id===x.id))v.informal['工具表单']['资料'].push({...x,kind:'资料'});});v.items=v.items.filter(x=>!materials.some(m=>m.id===x.id));}
    return v;
  }
  function renderFormal(c) {
    const e=c.esc, cfg=config(c), kind=['课程','考试'].includes(c.ui.s4Tab)?c.ui.s4Tab:'课程'; c.ui.s4Tab=kind;
    const picked=(cfg?.items||[]).filter(x=>c.G.courseLibrary.find(r=>r.id===x.id)?.kind===kind);
    const rec=c.G.courseLibrary.filter(r=>r.kind===kind&&!picked.some(x=>x.id===r.id));
    return `<section class="s4-block s4-block-grow lc-formal"><div class="s4-block-head"><div class="s4-block-title">关联正式学习内容</div></div><div class="s4-tabs" role="tablist">${['课程','考试'].map(k=>button('s4-tab',k,`class="s4-tab ${kind===k?'is-on':''}" data-kind="${k}" role="tab" aria-selected="${kind===k}"`)).join('')}</div>
      <div class="s4-cols"><div class="s4-col s4-col-rec"><div class="s4-col-head">系统推荐${kind}</div><div class="s4-col-body">${rec.map(r=>button('s4-add',`<span class="s4-rec-nm">${e(r.nm)}</span><span class="s4-rec-kind">${kind}</span>`,`data-id="${e(r.id)}" class="s4-rec" ${cfg?'':'disabled'}`)).join('')||'<div class="placeholder-empty">系统推荐已全部加入</div>'}</div></div>
      <div class="s4-col s4-col-sel"><div class="s4-col-toolbar">${button('s4-open-add','新增',`class="btn btn-sm btn-primary" ${cfg?'':'disabled'}`)}${button('s4-clear','清空',`class="btn-link s4-clear" ${picked.length?'':'disabled'}`)}</div><div class="s4-sel-hint">提示：已选${kind}受访问权限影响，请确保关联学员有权限查看。</div><div class="s4-col-head">已选${kind} <span class="s4-sel-count">（${picked.length}）</span>${kind==='课程'?`<span class="s4-req-count">必修 ${picked.filter(p=>p.required).length}</span>`:''}</div><div class="s4-col-body">${picked.map(p=>`<div class="s4-sel-row"><span class="s4-sel-nm">${e(p.nm)}</span>${kind==='课程'?`<select class="s4-req ${p.required?'is-on':''}" data-act="lc-required" data-id="${e(p.id)}" aria-label="${e(p.nm)}修读要求"><option value="required" ${p.required?'selected':''}>必修</option><option value="optional" ${!p.required?'selected':''}>选修</option></select>`:`<select class="s4-req" data-act="lc-test-phase" data-id="${e(p.id)}" aria-label="${e(p.nm)}考试阶段"><option value="pre" ${p.testPhase==='pre'?'selected':''}>前测</option><option value="post" ${p.testPhase!=='pre'?'selected':''}>后测</option></select>`}${button('s4-del','×',`class="s4-del" data-id="${e(p.id)}" aria-label="移除${e(p.nm)}"`)}</div>`).join('')||`<div class="placeholder-empty">尚未添加${kind}</div>`}</div></div></div></section>`;
  }
  function renderInformal(c) {
    const e=c.esc, cfg=config(c), tab=c.ui.lcTab||tabs[0], fields=kinds(tab);
    const group=cfg?.informal?.[tab]||{};
    return `<section class="s4-block lc-informal"><div class="s4-block-head"><div class="s4-block-title">关联非正式学习内容（绩效支持工具）</div></div><div class="s4-tabs lc-tabs" role="tablist">${tabs.map(name=>button('lc-tab',name,`class="s4-tab ${name===tab?'is-on':''}" role="tab" aria-selected="${name===tab}" data-tab="${name}"`)).join('')}</div>
      <div class="lc-toolbar">${fields.map(k=>button('lc-open-add','添加'+k,`class="btn btn-primary btn-sm" data-kind="${k}" ${cfg?'':'disabled'}`)).join('')}${button('lc-clear','清空',`class="btn btn-sm" ${fields.some(k=>group[k]?.length)?'':'disabled'}`)}</div>
      ${fields.map(kind=>`<section class="lc-section" data-kind="${kind}"><h3>已选${kind}</h3>${(group[kind]||[]).length?`<table class="tbl lc-table"><thead><tr><th>${kind==='专家'?'姓名':kind==='问答'?'问题标题':kind+'名称'}</th>${kind==='专家'?'<th>部门</th><th>关联岗位</th>':kind==='问答'?'<th>回答摘要</th>':'<th>类型</th>'}<th>操作</th></tr></thead><tbody>${group[kind].map(r=>`<tr><td>${e(r.nm)}</td>${kind==='专家'?`<td>${e(r.department||'—')}</td><td>${e(r.position||'—')}</td>`:kind==='问答'?`<td>${e(r.summary||'—')}</td>`:`<td>${kind}</td>`}<td>${button('lc-remove','移除',`class="btn-link" data-kind="${kind}" data-id="${e(r.id)}"`)}</td></tr>`).join('')}</tbody></table>`:`<div class="lc-empty"><span aria-hidden="true">▧</span><p>暂无${kind}</p></div>`}</section>`).join('')}</section>`;
  }
  function renderPicker(c) {
    const p=c.ui.lcPicker; if(!p)return '';
    const e=c.esc, cfg=c.S.graphs[p.graphId]?.step4?.[p.tagId]; if(!cfg)return '';
    const existing=p.section==='formal'?cfg.items:cfg.informal?.[p.tab]?.[p.kind]||[];
    const rows=resources(c).filter(r=>r.kind===p.kind&&(!p.query||r.nm.includes(p.query)));
    return `<div class="modal-mask lc-drawer-mask"><aside class="lc-drawer s4-modal" role="dialog" aria-modal="true" aria-labelledby="lc-picker-title"><div class="s4-modal-head"><h3 id="lc-picker-title">新增${e(p.kind)}</h3>${button('lc-picker-close','×','class="close" aria-label="关闭资源栏"')}</div><div class="lc-drawer-body"><div class="lc-picker-search"><input class="input" data-act="lc-picker-key" placeholder="搜索${e(p.kind)}" aria-label="搜索资源" value="${e(p.keyword||'')}">${button('lc-picker-search','查询','class="btn btn-primary"')}</div><div class="lc-resource-list">${rows.map(r=>{const disabled=existing.some(x=>x.id===r.id);return `<label class="s4-modal-row"><input type="checkbox" class="cb" data-act="lc-picker-check" data-id="${e(r.id)}" ${disabled?'disabled':p.selected.includes(r.id)?'checked':''}><span><b>${e(r.nm)}</b>${r.department?`<small>${e(r.department)} · ${e(r.position)}</small>`:r.summary?`<small>${e(r.summary)}</small>`:''}</span>${disabled?'<em>已添加</em>':''}</label>`;}).join('')||'<div class="placeholder-empty">没有匹配的资源</div>'}</div></div><div class="s4-modal-foot"><span class="s4-modal-count">已选 ${p.selected.length} 项</span>${button('lc-picker-close','取消','class="btn"')}${button('lc-picker-confirm','添加','class="btn btn-primary" '+(p.selected.length?'':'disabled'))}</div></aside></div>`;
  }
  function action(act,t,c) {
    const cfg=config(c), e=c.ui;
    switch(act){
      case 's4-tab': if(!['课程','考试'].includes(t.dataset.kind))return true;e.s4Tab=t.dataset.kind;break;
      case 's4-add': if(cfg){const item=c.G.courseLibrary.find(r=>r.id===t.dataset.id&&['课程','考试'].includes(r.kind));if(item&&!cfg.items.some(x=>x.id===item.id))cfg.items.push({id:item.id,nm:item.nm,required:!!item.required,...(item.kind==='考试'?{testPhase:'post'}:{})});}break;
      case 's4-del': if(cfg)cfg.items=cfg.items.filter(x=>x.id!==t.dataset.id);break;
      case 's4-clear': if(cfg)cfg.items=cfg.items.filter(x=>c.G.courseLibrary.find(r=>r.id===x.id)?.kind!==e.s4Tab);break;
      case 'lc-tab': if(tabs.includes(t.dataset.tab))e.lcTab=t.dataset.tab;break;
      case 'lc-clear': if(cfg)cfg.informal[e.lcTab||tabs[0]]={};break;
      case 'lc-remove': if(cfg){const group=cfg.informal[e.lcTab||tabs[0]];if(group)group[t.dataset.kind]=(group[t.dataset.kind]||[]).filter(x=>x.id!==t.dataset.id);}break;
      case 's4-open-add': case 'lc-open-add':
        if(!cfg)return true;e.lcPicker={graphId:c.S.selectedGraphId,tagId:e.s4Tag,section:act==='s4-open-add'?'formal':'informal',kind:act==='s4-open-add'?e.s4Tab:t.dataset.kind,tab:e.lcTab||tabs[0],selected:[],keyword:'',query:''};break;
      case 'lc-picker-close':e.lcPicker=null;break;
      case 'lc-picker-search': if(e.lcPicker)e.lcPicker.query=(e.lcPicker.keyword||'').trim();break;
      case 'lc-picker-check':if(e.lcPicker)e.lcPicker.selected=t.checked?[...new Set([...e.lcPicker.selected,t.dataset.id])]:e.lcPicker.selected.filter(id=>id!==t.dataset.id);break;
      case 'lc-picker-confirm':{
        const p=e.lcPicker,target=p&&c.S.graphs[p.graphId]?.step4?.[p.tagId];if(!target)return true;
        const picked=resources(c).filter(r=>p.selected.includes(r.id)&&r.kind===p.kind);
        let dest;if(p.section==='formal')dest=target.items;else{target.informal ||= {};target.informal[p.tab] ||= {};dest=target.informal[p.tab][p.kind] ||= [];}
        picked.forEach(r=>{if(!dest.some(x=>x.id===r.id))dest.push(p.section==='formal'?{id:r.id,nm:r.nm,required:!!r.required,...(r.kind==='考试'?{testPhase:'post'}:{})}:{...r});});e.lcPicker=null;break;
      }
      default:return false;
    }
    c.render();return true;
  }
  function input(act,t,c){
    if(act==='lc-picker-key'&&c.ui.lcPicker){c.ui.lcPicker.keyword=t.value;return true;}
    if(act==='lc-required'||act==='lc-test-phase'){
      const cfg=config(c), item=cfg?.items.find(x=>x.id===t.dataset.id);if(item){if(act==='lc-required')item.required=t.value==='required';else if(['pre','post'].includes(t.value))item.testPhase=t.value;c.render();}return true;
    }return false;
  }
  function validateInformal(value,c){
    if(value===undefined)return {};
    if(!value||Array.isArray(value)||typeof value!=='object')throw new Error('非正式学习配置格式无效');
    const output={},lib=resources(c);
    for(const [tab,group]of Object.entries(value)){
      if(!tabs.includes(tab)||!group||Array.isArray(group)||typeof group!=='object')throw new Error('非正式学习分类无效');output[tab]={};
      for(const [kind,items]of Object.entries(group)){
        if(!kinds(tab).includes(kind)||!Array.isArray(items)||items.length>100)throw new Error('非正式学习资源类型无效');const seen=new Set();
        output[tab][kind]=items.map(item=>{const found=lib.find(r=>r.id===item?.id&&r.kind===kind);if(!found||seen.has(found.id))throw new Error('非正式学习资源不存在或重复');seen.add(found.id);return {...found};});
      }
    }return output;
  }
  window.GP_CONFIG={renderFormal,renderInformal,renderPicker,action,input,resources,validateInformal};
})();
