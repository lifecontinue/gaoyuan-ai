/** 光谱 AI 帮建：本地流程仿真，无模型请求。宿主只在 onApply 时创建草稿。 */
(function () {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let state = null;
  let opener = null;
  let currentContext = {};
  const fresh = () => ({ stage: 'input', position: '', description: '', feedback: '', confirmed: false, direction: '', draft: null, error: '', discard: false, document:null, documentContext:null, documentReading:false, documentVersion:0 });
  const field = (name, label, value, multiline) => `<label class="sb-field"><span>${esc(label)}</span><${multiline ? 'textarea rows="3"' : 'input type="text"'} data-builder-field="${name}" maxlength="${multiline ? 2000 : 100}" ${multiline ? '' : `value="${esc(value)}"`}>${multiline ? esc(value) + '</textarea>' : ''}</label>`;
  const primary = (action, label, disabled) => `<button type="button" class="sb-button sb-primary" data-act="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  function requestRefresh(ctx) { if (ctx.refresh) ctx.refresh(); }
  function collect(root) {
    if (!state || !root) return;
    root.querySelectorAll('[data-builder-field]').forEach((el) => {
      const name = el.dataset.builderField;
      if (name.startsWith('draft.')) {
        if (state.draft) state.draft[name.slice(6)] = el.value;
      } else if (name.startsWith('tag.')) {
        const [, index, key] = name.split('.');
        if (state.draft) state.draft.tagTree[Number(index)][key] = el.value;
      } else state[name] = el.value;
    });
  }
  function documentRoles(document) {
    const cells=document.edited?null:document.sheets?.[document.sheetIndex]?.cells;
    const names=['岗位名称','岗位','适用岗位'],duties=['岗位职责','工作职责','职责'];
    const index=cells?.findIndex(row=>row.some(v=>names.includes(String(v).trim()))&&row.some(v=>duties.includes(String(v).trim())));
    if(index==null||index<0)return [];
    const col=cells[index].findIndex(v=>names.includes(String(v).trim()));
    return [...new Set(cells.slice(index+1).map(row=>String(row[col]||'').trim()).filter(Boolean))];
  }
  function documentPanel() {
    const d=state.document, busy=state.documentReading, roles=d?documentRoles(d):[];
    return `<section class="sb-document" aria-label="导入岗位资料"><div class="sb-document-toolbar"><button type="button" class="sb-button" data-act="builder-upload" ${busy?'disabled':''}>导入文档解析</button><input type="file" data-builder-document accept=".xlsx,.docx,.txt,.md" aria-label="导入岗位文档" hidden><a href="assets/ai-spectrum-example.xlsx" download="光谱帮建岗位资料示例.xlsx">下载 Excel 示例</a><span class="sb-muted">Excel .xlsx / Word .docx / TXT / MD · 最大5MB</span></div>
      ${busy?'<p role="status">正在解析文件，请稍候…</p>':''}
      ${d?`<div class="sb-document-info"><b>${esc(d.fileName)}</b><span>${state.documentUsed?'已带入需求':'解析完成，待核对'}</span><button type="button" class="sb-button" data-act="builder-remove-document">移除资料</button></div>
      ${d.sheets?.length>1?`<label class="sb-field"><span>工作表</span><select data-builder-sheet>${d.sheets.map((sheet,i)=>`<option value="${i}" ${d.sheetIndex===i?'selected':''}>${esc(sheet.name)}</option>`).join('')}</select></label>`:''}
      ${roles.length>1?`<label class="sb-field"><span>选择本次帮建的岗位</span><select data-builder-document-role><option value="">请选择岗位</option>${roles.map(role=>`<option value="${esc(role)}" ${state.position===role?'selected':''}>${esc(role)}</option>`).join('')}</select></label>`:''}
      ${d.warnings?.length?`<div class="sb-document-warning">${d.warnings.map(esc).join('<br>')}</div>`:''}
      <details open><summary>解析正文 · 请核对并删去无关内容</summary><textarea rows="5" maxlength="30000" data-builder-document-text aria-label="解析正文">${esc(d.text)}</textarea></details><button type="button" class="sb-button sb-primary" data-act="builder-use-document">带入帮建需求</button>`:''}
    </section>`;
  }
  async function readDocument(file,ctx) {
    if(!file||!state)return;
    collect(document.querySelector('.sb-drawer'));
    const session=state,version=++session.documentVersion;
    session.documentReading=true;session.error='';requestRefresh(ctx);
    try {
      const parsed=await window.GP_BUILDER_DOCUMENT.parse(file);
      if(state!==session||version!==session.documentVersion)return;
      session.document={...parsed,text:parsed.sheets?.[0]?.text || parsed.text,sheetIndex:0,edited:false};session.documentUsed=false;
    } catch(error) {if(state===session&&version===session.documentVersion)session.error=error.message||'文档解析失败，请检查文件';}
    finally {if(state===session&&version===session.documentVersion){session.documentReading=false;requestRefresh(ctx);}}
  }
  function sourceRequirements(document) {
    let cells=!document.edited&&document.sheets?.[document.sheetIndex]?.cells;
    let position='',description='';
    const roleNames=['岗位名称','岗位','适用岗位'],dutyNames=['岗位职责','工作职责','职责'];
    if(cells){
      const matrix=cells.findIndex(row=>row.some(x=>roleNames.includes(String(x).trim()))&&row.some(x=>dutyNames.includes(String(x).trim())));
      if(matrix>=0){
        const header=cells[matrix].map(x=>String(x).trim()),roleCol=header.findIndex(x=>roleNames.includes(x)),dutyCol=header.findIndex(x=>dutyNames.includes(x));
        const data=cells.slice(matrix+1).filter(row=>row.some(x=>String(x).trim()));
        const roles=[...new Set(data.map(row=>String(row[roleCol]||'').trim()).filter(Boolean))];
        position=roles.length===1?roles[0]:roles.includes(state.position.trim())?state.position.trim():'';
        if(roles.length>1&&!position)throw new Error('该工作表包含多个岗位，请先填写本次要帮建的岗位名称，再带入需求');
        const selected=data.filter(row=>!position||String(row[roleCol]||'').trim()===position);
        description=selected.map(row=>String(row[dutyCol]||'').trim()).filter(Boolean).filter((v,i,arr)=>arr.indexOf(v)===i).join('\n');
        cells=[cells[matrix],...selected];
      } else cells.forEach(row=>{const key=String(row[0]||'').trim();if(roleNames.includes(key))position=String(row[1]||'').trim();if([...dutyNames,'岗位意义','培养目标'].includes(key))description+=(description?'\n':'')+key+'：'+String(row[1]||'').trim();});
    }
    return {position,description:description||document.text,cells:cells||null};
  }
  function documentTree(cells) {
    if(!cells)return null;
    const headerIndex=cells.findIndex(row=>row.some(x=>['一级能力','一级标签'].includes(String(x).trim()))&&row.some(x=>['末级能力','末级标签','能力项'].includes(String(x).trim())));
    if(headerIndex<0)return null;
    const header=cells[headerIndex].map(x=>String(x).trim()),rootCol=header.findIndex(x=>['一级能力','一级标签'].includes(x)),leafCol=header.findIndex(x=>['末级能力','末级标签','能力项'].includes(x)),suggestionCol=header.findIndex(x=>['学习内容建议','内容建议'].includes(x));
    const roots=[];let previous='';let count=0;
    for(const row of cells.slice(headerIndex+1)) {
      const leaf=String(row[leafCol]||'').trim(),root=String(row[rootCol]||'').trim()||previous;
      if(!leaf&&!root)continue;if(!leaf||!root)throw new Error('能力明细缺少一级能力或末级能力，请先修正文档');
      if(++count>100)throw new Error('单次最多生成100条能力明细，请精简文档');
      if(root.length>100||leaf.length>100)throw new Error('能力标签名称超过100字，请精简后生成');
      previous=root;let node=roots.find(n=>n.nm===root);if(!node){node={id:'sb-doc-'+roots.length,nm:root,level:1,children:[],suggestion:''};roots.push(node);}
      if(!node.children.some(n=>n.nm===leaf))node.children.push({id:node.id+'-'+node.children.length,nm:leaf,level:2,leaf:true,suggestion:String(row[suggestionCol]||'').trim()});
      const advice=String(row[suggestionCol]||'').trim();if(node.children.length===1)node.suggestion=advice;
    }
    return roots.length?roots:null;
  }

  function generate() {
    const role = state.position.trim();
    const advanced = state.direction === 'advanced';
    const names = advanced ? ['目标管理', '业务改善', '团队协作'] : ['岗位认知', '专业技能', '实践应用'];
    state.draft = {
      name: (role + '能力图谱').slice(0,100), briefing: `通过明确${role}的能力要求，支持岗位履职与持续发展。`,
      duty: state.description.trim(), positionIds: [], groupIds: [], autoAssociate: true, status: 'draft', contentVersion: 'v1',
      tagTree: documentTree(state.documentContext?.cells) || names.map((nm, i) => ({ id: 'sb-' + (i + 1), nm, level: 1, children: [{ id: 'sb-' + (i + 1) + '-1', nm: advanced ? ['目标拆解与跟进', '问题分析与改善', '跨部门沟通'][i] : ['岗位职责与规范', '关键任务执行', '问题处理与复盘'][i], level: 2, leaf: true }], suggestion: ['建议配置岗位制度与入门课程。', '建议配置任务案例与考核。', '建议配置实操记录与复盘模板。'][i] })), step4: {},
    };
  }
  function preview() {
    const d = state.draft;
    return `<aside class="sb-preview" aria-label="图谱创建预览"><h3>图谱创建预览</h3><p class="sb-status">已生成 · 可编辑</p>
      ${field('draft.name', '图谱名称', d.name)}${field('draft.briefing', '岗位意义', d.briefing, true)}${field('draft.duty', '岗位职责', d.duty, true)}
      <h4>能力标签与内容建议</h4>${d.tagTree.map((t, i) => `<section class="sb-tag">${field('tag.' + i + '.nm', '一级标签', t.nm)}${t.children.map((leaf,j)=>`<label class="sb-field"><span>末级能力 ${j+1}</span><input data-builder-leaf="${j?i+':'+j:i}" value="${esc(leaf.nm)}" maxlength="100"></label>${j?`<label class="sb-field"><span>学习内容建议</span><textarea rows="3" data-builder-advice="${i}:${j}" maxlength="2000">${esc(leaf.suggestion||'')}</textarea></label>`:field('tag.' + i + '.suggestion', '学习内容建议', t.suggestion, true)}`).join('')}</section>`).join('')}
      <p class="sb-muted">内容建议供选课参考，实际资源请在“配置标签内容”中选择。</p></aside>`;
  }
  function render(context) {
    currentContext = context || currentContext;
    if (!state) return '';
    let body;
    if (state.stage === 'input') body = `<div class="sb-welcome"><h3>你好，我是光谱帮建助手</h3><p>告诉我岗位与工作要求，一起整理能力图谱。</p><div class="sb-examples"><span>你可以这样开始</span><button type="button" data-act="builder-example">为车间安全岗建立能力图谱</button></div></div><div class="sb-composer">${field('position', '岗位名称', state.position)}${field('description', '工作描述与培养目标', state.description, true)}${primary('builder-send', '发送需求', !state.position.trim() || !state.description.trim())}</div>`;
    else body = `<div class="sb-chat"><div class="sb-user">${esc(state.position)}<br>${esc(state.description)}</div><p>我已整理需求，请先确认，再选择图谱方向。</p><div class="sb-summary"><h4>岗位需求</h4><div>岗位：${esc(state.position)}</div><div class="sb-preline">职责与目标：${esc(state.description)}</div></div>${state.stage === 'preview' ? '<div class="sb-user">需求与方向已确认</div><p>图谱预览已生成。你可以修改右侧内容，再应用为草稿。</p>' : ''}</div>
      <div class="sb-confirm">${state.stage === 'confirm' ? `<h4>1 / 2 · 确认岗位需求</h4><label class="sb-option"><input type="radio" name="sb-confirm" data-act="builder-select-confirm" ${state.confirmed ? 'checked' : ''}>信息已确认，下一步${state.confirmed ? '<span>已选择</span>' : ''}</label>${field('feedback', '补充或修正需求', state.feedback, true)}${primary('builder-confirm', state.feedback.trim() ? '更新需求' : '确认', !state.feedback.trim() && !state.confirmed)}` : state.stage === 'direction' ? `<h4>2 / 2 · 选择图谱方向</h4>${[['foundation','岗位履职','梳理职责、专业技能与实践应用'],['advanced','能力提升','聚焦目标管理、业务改善与协作']].map(([v,n,desc]) => `<label class="sb-option"><input type="radio" name="sb-direction" value="${v}" data-act="builder-direction" ${state.direction === v ? 'checked' : ''}><span>${n}<small>${desc}</small></span></label>`).join('')}${primary('builder-generate', '生成图谱预览', !state.direction)}` : `<button type="button" class="sb-button" data-act="builder-back">调整需求</button>${primary('builder-apply', '应用草稿并继续编辑', false)}<p class="sb-muted">应用后进入四步编辑，不会启用图谱或关联学员。</p>`}</div>`;
    return `<div class="sb-mask"><section class="sb-drawer ${state.stage === 'preview' ? 'sb-has-preview' : ''}" role="dialog" aria-modal="true" aria-labelledby="sb-title"><header class="sb-top"><h2 id="sb-title"><span class="sb-ai" aria-hidden="true">✦</span>光谱 AI 帮建</h2><span class="sb-demo">模拟数据</span><button type="button" class="sb-close" data-act="builder-close" aria-label="关闭帮建">×</button></header><div class="sb-simulation">本地演示 · 文件在浏览器解析，生成未调用真实 AI</div><div class="sb-layout"><main class="sb-main">${documentPanel()}${body}${state.error ? `<p class="sb-error" role="alert">${esc(state.error)}</p>` : ''}</main>${state.stage === 'preview' ? preview() : ''}</div>${state.discard ? `<div class="sb-discard" role="alertdialog" aria-label="放弃帮建"><h3>放弃本次帮建？</h3><p>尚未应用的需求和预览将被清除。</p><button type="button" class="sb-button" data-act="builder-keep">继续编辑</button><button type="button" class="sb-button" data-act="builder-discard">放弃并关闭</button></div>` : ''}</section></div>`;
  }
  function close(ctx) {
    state = null; requestRefresh(ctx);
    const restore = opener && opener.isConnected ? opener : document.querySelector('[data-act="builder-open"]');
    if (restore) restore.focus();
  }
  function handle(act, target, context) {
    const ctx = context || currentContext;
    if (!String(act || '').startsWith('builder-')) return false;
    if (act === 'builder-open') { opener = target || document.activeElement; state = fresh(); requestRefresh(ctx); return true; }
    if (!state) return true;
    collect(document.querySelector('.sb-drawer'));
    state.error = '';
    if(act==='builder-upload'){document.querySelector('[data-builder-document]')?.click();return true;}
    if(act==='builder-remove-document'){state.documentVersion++;state.documentReading=false;state.document=null;state.documentContext=null;state.documentUsed=false;}
    if(act==='builder-use-document'&&state.document){
      let req;try{req=sourceRequirements(state.document);}catch(error){state.error=error.message;requestRefresh(ctx);return true;}
      const base=state.description===state.documentAppliedDescription?(state.documentBaseDescription||''):state.description.trim();
      const combined=(base?base+'\n':'')+req.description;
      if(combined.length>2000)state.error='文档已解析，请在解析正文中精简或选取需求，控制在2000字以内后再带入';
      else {state.documentBaseDescription=base;state.documentAppliedDescription=combined;state.description=combined;state.position=req.position||state.position;state.documentContext={cells:req.cells};state.documentUsed=true;state.confirmed=false;state.direction='';state.draft=null;state.stage=state.position.trim()?'confirm':'input';if(!state.position.trim())state.error='已带入正文，请补充岗位名称后发送需求';}
    }
    if (act === 'builder-close') { if (state.position || state.description || state.document || state.documentReading) state.discard = true; else { close(ctx); return true; } }
    if (act === 'builder-keep') state.discard = false;
    if (act === 'builder-discard') { close(ctx); return true; }
    if (act === 'builder-example') { state.position = '车间安全岗'; state.description = '负责作业风险识别、隐患排查与应急处置；帮助新员工掌握安全规范并完成岗位实操。'; }
    if (act === 'builder-send') {
      if (!state.position.trim() || !state.description.trim()) state.error = '请填写岗位名称和工作描述。';
      else { state.stage = 'confirm'; state.confirmed = false; }
    }
    if (act === 'builder-select-confirm') { state.confirmed = true; state.feedback = ''; }
    if (act === 'builder-confirm') {
      if (state.feedback.trim()) { state.description += '\n' + state.feedback.trim(); state.feedback = ''; state.confirmed = false; }
      else if (state.confirmed) state.stage = 'direction';
    }
    if (act === 'builder-direction') state.direction = target.value;
    if (act === 'builder-generate' && state.direction) { try {generate(); state.stage = 'preview';}catch(error){state.error=error.message;} }
    if (act === 'builder-back') { state.stage = 'confirm'; state.confirmed = false; }
    if (act === 'builder-apply') {
      const d = state.draft;
      if (!d || !d.name.trim() || !d.briefing.trim() || !d.duty.trim() || d.tagTree.some(t => !t.nm.trim() || !t.children[0].nm.trim())) state.error = '请补全图谱名称、岗位意义、职责和能力标签。';
      else if (typeof ctx.onApply === 'function') {
        const output = JSON.parse(JSON.stringify(d));
        output.positionIds = (ctx.positions || []).filter(p => p.nm === state.position.trim()).map(p => p.id);
        output.builderSuggestions = output.tagTree.flatMap(t=>t.children.map((leaf,j)=>({tagId:leaf.id,text:j?leaf.suggestion||'':t.suggestion||''})));
        output.tagTree.forEach(t=>{delete t.suggestion;t.children.forEach(leaf=>delete leaf.suggestion);});
        state = null; ctx.onApply(output); return true;
      }
    }
    requestRefresh(ctx);
    return true;
  }
  function bind(root, context) {
    currentContext = context || currentContext;
    const dialog = root.querySelector('.sb-drawer');
    if (!dialog || dialog.dataset.bound) return;
    dialog.dataset.bound = 'true';
    dialog.addEventListener('change',event=>{
      if(event.target.matches('[data-builder-document]'))readDocument(event.target.files?.[0],currentContext);
      if(event.target.matches('[data-builder-document-role]')){state.position=event.target.value;requestRefresh(currentContext);}
      if(event.target.matches('[data-builder-sheet]')&&state.document){const d=state.document;d.sheetIndex=Number(event.target.value);d.text=d.sheets[d.sheetIndex].text;d.edited=false;state.documentUsed=false;requestRefresh(currentContext);}
    });
    dialog.addEventListener('input', (event) => {
      collect(dialog);
      if(event.target.matches('[data-builder-document-text]')&&state.document){state.document.text=event.target.value;state.document.edited=true;state.documentUsed=false;}
      const send = dialog.querySelector('[data-act="builder-send"]');
      if (send) send.disabled = !state.position.trim() || !state.description.trim();
      if (event.target.dataset.builderLeaf != null && state && state.draft) state.draft.tagTree[Number(event.target.dataset.builderLeaf.split(':')[0])].children[Number(event.target.dataset.builderLeaf.split(':')[1]||0)].nm = event.target.value;
      if(event.target.dataset.builderAdvice!=null&&state?.draft){const [i,j]=event.target.dataset.builderAdvice.split(':').map(Number);state.draft.tagTree[i].children[j].suggestion=event.target.value;}
      if (event.target.dataset.builderField === 'feedback') {
        state.confirmed = false;
        const radio = dialog.querySelector('[data-act="builder-select-confirm"]'); if (radio) radio.checked = false;
        const selected = dialog.querySelector('.sb-option > span'); if (selected) selected.remove();
        const button = dialog.querySelector('[data-act="builder-confirm"]'); if (button) { button.disabled = !state.feedback.trim(); button.textContent = state.feedback.trim() ? '更新需求' : '确认'; }
      }
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); handle(state && state.discard ? 'builder-keep' : 'builder-close', event.target, currentContext); }
      if (event.key !== 'Tab') return;
      const scope = dialog.querySelector('.sb-discard') || dialog;
      const controls = Array.from(scope.querySelectorAll('button:not([disabled]),input:not([disabled]):not([hidden]),textarea:not([disabled]),select:not([disabled])'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    const focus = dialog.querySelector('.sb-discard button') || dialog.querySelector('[data-builder-field="position"]') || dialog.querySelector('.sb-confirm button:not([disabled])') || dialog.querySelector('.sb-close');
    if (focus) focus.focus();
  }
  window.GP_BUILDER = { render, handle, bind, isOpen: () => !!state };
})();
