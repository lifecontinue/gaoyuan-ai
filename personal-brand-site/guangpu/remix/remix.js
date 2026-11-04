/* 光谱 remix（2026-11-04）：客户新需求 N1–N5 与标签、内容界面重做。全部只改本页内存，不调用真实服务或模型。 */
(function () {
  'use strict';
  const LV = ['L1', 'L2', 'L3', 'L4', 'L5'];
  const RANK = { L1: '初级工', L2: '中级工', L3: '高级工', L4: '技师', L5: '高级技师' };
  const DIFF = { L1: '易', L2: '较易', L3: '中等', L4: '较难', L5: '难' };
  const DIFF_LV = Object.fromEntries(Object.entries(DIFF).map(([k, v]) => [v, k]));
  // 现网 ExcelUtils.isSpecialChar 清单，见 PRD 11-02 §2.4。
  const SPECIAL = /[\s_`~!@#$%^&*()+=|{}':;,[\]<>/?！￥…（）—【】‘’“”；：。，、？]/g;
  const RULES = [['optional', '不强制：未配置内容的标签启用时提醒'], ['any', '至少配置一项学习内容'], ['strict', '课程和测试都要配置（现网规则）']];
  const MAT_MAX = 100 * 1024 * 1024, MAT_BATCH = 20;
  const MAT_EXT = /\.(pdf|docx?|xlsx?|pptx?|txt|md|png|jpe?g|mp4|zip)$/i;
  const TAG_TYPES = ['应知', '应会', '核心知识', '核心技能'];

  // 试题管理题库（模拟）。难度与适用层级一一对应是本原型假设，现网字段待研发确认。
  const QUESTION_BANK = [
    ['q101', '作业前风险分析的第一步是什么', '单选题', 'L1', '风险辨识', '安全生产题库'],
    ['q102', '下列哪些属于作业环境风险', '多选题', 'L2', '风险辨识', '安全生产题库'],
    ['q103', '动火作业前必须办理作业票', '判断题', 'L1', '风险辨识', '安全生产题库'],
    ['q104', '交叉作业时如何划分风险责任区', '单选题', 'L3', '风险辨识', '安全生产题库'],
    ['q105', '复杂工况下多源风险叠加的研判方法', '单选题', 'L4', '风险辨识', '安全生产题库'],
    ['q106', '重大危险源辨识与分级管控要点', '多选题', 'L5', '风险辨识', '安全生产题库'],
    ['q111', '发现隐患后第一时间应向谁报告', '单选题', 'L1', '隐患上报', '安全生产题库'],
    ['q112', '隐患上报需要包含哪些要素', '多选题', 'L2', '隐患上报', '安全生产题库'],
    ['q113', '隐患整改闭环的验收标准', '单选题', 'L3', '隐患上报', '安全生产题库'],
    ['q121', '发生泄漏时的首要处置动作', '单选题', 'L2', '应急响应', '安全生产题库'],
    ['q122', '应急预案的启动条件判断', '单选题', 'L4', '应急响应', '安全生产题库'],
    ['q131', '设备点检的五感检查指哪些', '多选题', 'L1', '设备点检', '设备运维题库'],
    ['q132', '振动值超限时的判断顺序', '单选题', 'L3', '设备点检', '设备运维题库'],
    ['q141', '交接班记录必须包含设备状态', '判断题', 'L1', '交接班', '设备运维题库'],
    ['q142', '交接遗漏造成事故的责任界定', '单选题', 'L4', '交接班', '设备运维题库'],
    ['q151', '单位产品能耗的计算口径', '单选题', 'L2', '能耗分析', '能源管理题库'],
    ['q152', '节能方案的投资回收期测算', '单选题', 'L4', '节能方案', '能源管理题库'],
  ].map(([id, stem, type, diff, point, bank]) => ({ id, stem, type, diff, point, bank }));

  const flat = tree => (tree || []).flatMap(n => [n, ...flat(n.children)]);
  const kids = n => (n.children || []).length;
  // ctx 每次渲染都会重建；常驻监听和上传计时器读最新的一份，避免「重置演示」后拿到旧状态。
  let seq = 0, timer = null, ctxNow = null;
  const uid = p => p + Date.now().toString(36) + (++seq);

  function model(c) {
    return c.ui.rx ||= { rule: 'optional', ctab: '课程', onlyTodo: false, uploads: [], modal: null, newName: {}, err: {}, imp: { mode: 'table' }, focus: null };
  }
  function graph(c) { return c.S.graphs[c.S.selectedGraphId]; }
  function cfg(g, id) {
    g.step4 ||= {};
    const v = g.step4[id] ||= { levels: [], items: [] };
    v.informal ||= {}; v.questions ||= [];
    if (v.autoDiff === undefined) v.autoDiff = true;
    return v;
  }
  function leafPaths(tree) {
    const out = [];
    (function walk(nodes, path) { nodes.forEach(n => kids(n) ? walk(n.children, [...path, n]) : out.push({ tag: n, path })); })(tree || [], []);
    return out;
  }
  function kindOf(c, id) { return c.G.courseLibrary.find(r => r.id === id)?.kind; }
  function materials(v) { return v?.informal?.['工具表单']?.['资料'] || []; }
  function counts(c, g, id) {
    const v = g.step4?.[id];
    if (!v) return { course: 0, exam: 0, q: 0, mat: 0, other: 0, total: 0 };
    const items = v.items || [];
    const course = items.filter(x => kindOf(c, x.id) === '课程').length;
    const exam = items.filter(x => kindOf(c, x.id) === '考试').length;
    const mat = materials(v).length + items.filter(x => kindOf(c, x.id) === '资料').length;
    const q = (v.questions || []).length;
    let other = 0;
    Object.entries(v.informal || {}).forEach(([tab, group]) => Object.entries(group || {}).forEach(([kind, list]) => { if (!(tab === '工具表单' && kind === '资料')) other += (list || []).length; }));
    return { course, exam, q, mat, other, total: course + exam + q + mat + other };
  }
  // ok = 满足当前启用规则；warn = 可启用但会提醒；block = 不满足，不能启用。
  function state(n, rule) {
    if (rule === 'strict') return n.course && (n.exam || n.q) ? 'ok' : 'block';
    if (n.total) return 'ok';
    return rule === 'any' ? 'block' : 'warn';
  }
  function stateText(n, rule) {
    const s = state(n, rule);
    if (s === 'ok') return '已配置';
    if (rule === 'strict') return !n.course && !(n.exam || n.q) ? '缺课程和测试' : !n.course ? '缺课程' : '缺测试';
    return s === 'warn' ? '未配置（可启用）' : '未配置';
  }
  function ruleHint(rule) {
    return rule === 'strict' ? '现网规则：课程和测试（试卷或题目）都配置后才能启用。'
      : rule === 'any' ? '至少配置一项：课程、试卷、题目、资料任选其一。'
      : '课程和测试都可以不配；没有内容的标签在学员端显示「暂无学习内容」。';
  }
  function sizeText(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function charName(ch) { return ch === ' ' ? '空格' : ch === '\n' ? '换行' : ch === '\t' ? '制表符' : '「' + ch + '」'; }
  function nameError(nm, max = 20) {
    if (!nm) return '请输入名称';
    if (nm.length > max) return `不超过 ${max} 字（当前 ${nm.length} 字）`;
    const bad = nm.match(SPECIAL);
    return bad ? '不能包含特殊字符：' + [...new Set(bad)].map(charName).join(' ') : '';
  }

  /* ================= 第二步：标签层级 ================= */
  function renderTags(c) {
    const { ui, esc: e } = c, m = model(c), g = graph(c);
    const tree = g.tagTree ||= [];
    const l1 = tree.find(n => n.id === ui.tagActive) || null;
    const l2 = l1?.children?.find(n => n.id === ui.tagActive2) || null;
    if (!l1) ui.tagActive = null;
    if (!l2) ui.tagActive2 = null;
    const all = flat(tree), leaves = leafPaths(tree);
    const at = lv => all.filter(n => n.level === lv).length;
    const done = [tree.length > 0, at(2) > 0, at(3) > 0];

    const col = (level, nodes, parent, title, sub) => {
      const idle = level > 1 && !parent;
      const activeId = level === 1 ? ui.tagActive : level === 2 ? ui.tagActive2 : null;
      const pid = parent?.id || '', key = level + ':' + pid;
      const rows = idle ? '' : (nodes || []).map(n => {
        const leaf = !kids(n), on = activeId === n.id;
        return `<li class="rx-row ${on ? 'is-active' : ''}">
          <button type="button" class="rx-row-main" data-act="rx-tag-sel" data-level="${level}" data-id="${e(n.id)}" ${level < 3 ? `aria-pressed="${on}"` : ''}>
            <span class="rx-row-nm">${e(n.nm)}</span>
            ${leaf ? '<span class="rx-badge is-leaf">末级</span>' : `<span class="rx-badge">${kids(n)} 个下级</span>`}
            ${level < 3 ? '<span class="rx-chev" aria-hidden="true">›</span>' : ''}
          </button>
          ${leaf ? `<button type="button" class="rx-row-go" data-act="rx-goto-content" data-id="${e(n.id)}">配置内容</button>` : ''}
          <button type="button" class="rx-row-del" data-act="tag-del" data-id="${e(n.id)}" aria-label="删除标签 ${e(n.nm)}" title="删除（连同下级）">×</button>
        </li>`;
      }).join('');
      const word = ['', '一', '二', '三'][level];
      const empty = idle ? `<div class="rx-empty is-idle">← 先在左侧选择一个${['', '', '一', '二'][level]}级标签</div>`
        : (nodes || []).length ? ''
        : level === 1 ? '<div class="rx-empty"><b>从岗位的核心能力开始</b>例如「安全意识」「操作规范」。可以直接输入名称，也可以从标签库选择。</div>'
        : `<div class="rx-empty"><b>「${e(parent.nm)}」还没有${word}级标签</b>添加后继续细分；不细分的话，「${e(parent.nm)}」本身就是末级标签，可直接配置内容。</div>`;
      return `<section class="rx-col ${idle ? 'is-idle' : ''}" aria-label="${word}级标签">
        <header class="rx-col-head"><span class="rx-col-no">${level}</span><b>${title}</b>${idle ? '' : `<span class="rx-count">${(nodes || []).length}</span>`}
          <span class="rx-flex"></span>${idle ? '' : `<button type="button" class="btn-link" data-act="tag-new" data-level="${level}" data-parent="${e(pid)}">从标签库选择</button>`}</header>
        <div class="rx-col-sub">${idle ? '&nbsp;' : parent ? `属于「${e(parent.nm)}」` : e(sub)}</div>
        ${rows ? `<ul class="rx-rows">${rows}</ul>` : ''}${empty}
        ${idle ? '' : `<div class="rx-add"><input class="input" data-act="rx-new-name" data-level="${level}" data-parent="${e(pid)}" maxlength="40" placeholder="输入${word}级标签名称，回车添加" value="${e(m.newName[key] || '')}" aria-label="新增${word}级标签">
          <button type="button" class="btn" data-act="rx-tag-add" data-level="${level}" data-parent="${e(pid)}">添加</button></div>
          ${m.err[key] ? `<div class="rx-add-err" role="alert">${e(m.err[key])}</div>` : ''}`}
      </section>`;
    };

    return `<div class="rx-tags">
      <ol class="rx-guide" aria-label="标签搭建步骤">
        <li class="${done[0] ? 'done' : 'on'}"><i>1</i><span><b>一级</b>岗位核心能力</span></li>
        <li class="${done[1] ? 'done' : done[0] ? 'on' : ''}"><i>2</i><span><b>二级</b>拆成能力细项</span></li>
        <li class="${done[2] ? 'done' : ''}"><i>3</i><span><b>三级</b>继续细化（可选）</span></li>
        <li class="${leaves.length ? 'on' : ''}"><i>✓</i><span><b>末级</b>没有下级的标签，下一步配内容</span></li>
      </ol>
      <nav class="rx-path" aria-label="当前位置"><span>当前位置</span>
        <button type="button" data-act="rx-tag-sel" data-level="0">全部标签</button>
        ${l1 ? `<i>›</i><button type="button" data-act="rx-tag-sel" data-level="1" data-id="${e(l1.id)}">${e(l1.nm)}</button>` : ''}
        ${l2 ? `<i>›</i><b>${e(l2.nm)}</b>` : ''}
        <span class="rx-flex"></span><span class="rx-muted">删除上级标签会连同下级一起删除</span></nav>
      <div class="rx-cols">
        ${col(1, tree, null, '一级标签', '岗位的核心能力方向')}
        ${col(2, l1?.children, l1, '二级标签', '')}
        ${col(3, l2?.children, l2, '三级标签', '')}
      </div>
      <div class="rx-tag-foot"><span>一级 <b>${at(1)}</b> · 二级 <b>${at(2)}</b> · 三级 <b>${at(3)}</b></span>
        <span class="rx-flex"></span><span>末级标签 <b>${leaves.length}</b> 个，下一步给它们配置学习内容</span>
        <button type="button" class="btn btn-primary" data-act="step" data-step="3" ${leaves.length ? '' : 'disabled'}>去配置内容 →</button></div>
    </div>`;
  }

  function addTag(c, level, parentId) {
    const m = model(c), g = graph(c), key = level + ':' + (parentId || '');
    const nm = String(m.newName[key] || '').trim();
    const err = nameError(nm) || (flat(g.tagTree).some(n => n.nm === nm) ? `「${nm}」已存在，同一图谱内标签名称不能重复` : '');
    m.err[key] = err;
    m.focus = `[data-act="rx-new-name"][data-level="${level}"]`;
    if (!err) {
      c.G.addTagNodes(g.tagTree, parentId || null, [{ id: uid('rx-t'), nm }]);
      c.G.relabelTree(g.tagTree);
      m.newName[key] = '';
      c.toast(`已添加「${nm}」`, 'success');
    }
    c.render();
  }

  /* ================= 第三步：末级标签内容 ================= */
  function renderContent(c) {
    const { ui, esc: e } = c, m = model(c), g = graph(c);
    const leaves = leafPaths(g.tagTree);
    if (!leaves.length) return '<div class="rx-blank"><b>还没有末级标签</b><p>先在上一步搭好标签层级，没有下级的标签会出现在这里。</p><button type="button" class="btn btn-primary" data-act="step" data-step="2">返回编辑标签</button></div>';
    if (!leaves.some(x => x.tag.id === ui.s4Tag)) ui.s4Tag = leaves[0].tag.id;
    const info = leaves.map(x => ({ ...x, n: counts(c, g, x.tag.id) }));
    const ready = info.filter(x => state(x.n, m.rule) === 'ok').length;
    const shown = m.onlyTodo ? info.filter(x => state(x.n, m.rule) !== 'ok' || x.tag.id === ui.s4Tag) : info;
    const idx = info.findIndex(x => x.tag.id === ui.s4Tag), cur = info[idx];
    const v = cfg(g, cur.tag.id);

    let lastL1 = '';
    const tree = shown.map(x => {
      const top = x.path[0]?.nm || x.tag.nm, head = top !== lastL1 ? `<div class="rx-tree-l1">${e(top)}</div>` : '';
      lastL1 = top;
      const st = state(x.n, m.rule);
      return `${head}<button type="button" class="rx-leaf ${x.tag.id === ui.s4Tag ? 'is-active' : ''}" data-act="s4-pick-tag" data-id="${e(x.tag.id)}">
        <span class="rx-dot ${st}" title="${e(stateText(x.n, m.rule))}"></span>
        <span class="rx-leaf-txt"><span class="rx-leaf-nm">${e(x.tag.nm)}</span>${x.path.length > 1 ? `<small>${e(x.path.slice(1).map(p => p.nm).join(' › '))}</small>` : ''}</span>
        <span class="rx-leaf-meta">${x.n.total ? `课${x.n.course} 卷${x.n.exam} 题${x.n.q} 料${x.n.mat}` : '未配置'}</span></button>`;
    }).join('') || '<div class="rx-muted rx-pad">全部标签都已配置</div>';

    const chosen = LV.filter(L => v.levels.includes(L));
    const lvSummary = chosen.length
      ? `对 <b>${chosen.map(L => RANK[L]).join('、')}</b> 学员展示${v.autoDiff ? `；测试按 <b>${chosen.map(L => DIFF[L]).join('、')}</b> 难度出题` : ''}。`
      : '未选择：对本图谱所有学员展示' + (v.autoDiff ? '；测试按学员自己的层级取对应难度。' : '。');
    const tabs = [['课程', cur.n.course], ['试卷', cur.n.exam], ['题目', cur.n.q], ['资料', cur.n.mat], ['绩效支持工具', cur.n.other]];
    if (!tabs.some(t => t[0] === m.ctab)) m.ctab = '课程';
    const panel = m.ctab === '课程' ? formalPanel(c, v, '课程') : m.ctab === '试卷' ? formalPanel(c, v, '考试')
      : m.ctab === '题目' ? questionPanel(c, v, chosen) : m.ctab === '资料' ? materialPanel(c, v) : window.GP_CONFIG.renderInformal(c);
    const suggestion = g.builderSuggestions?.find(x => x.tagId === cur.tag.id)?.text;
    const st = state(cur.n, m.rule);

    return `<div class="rx-content">
      <div class="rx-rulebar">
        <div class="rx-progress"><b>内容配置</b><span>${ready} / ${info.length} 个末级标签满足启用要求</span><div class="rx-bar"><i style="width:${Math.round(ready / info.length * 100)}%"></i></div></div>
        <label class="rx-rule">启用规则<select class="select-native" data-act="rx-rule" aria-label="启用规则">${RULES.map(([k, t]) => `<option value="${k}" ${m.rule === k ? 'selected' : ''}>${t}</option>`).join('')}</select><span class="rx-pending">待客户确认</span></label>
      </div>
      <div class="rx-c-wrap">
        <aside class="rx-tree" aria-label="末级标签">
          <div class="rx-tree-head"><b>末级标签</b><label><input type="checkbox" data-act="rx-only-todo" ${m.onlyTodo ? 'checked' : ''}>只看未完成</label></div>
          <div class="rx-tree-list">${tree}</div>
          <div class="rx-legend"><span><i class="rx-dot ok"></i>已配置</span><span><i class="rx-dot warn"></i>可启用，会提醒</span><span><i class="rx-dot block"></i>不满足规则</span></div>
        </aside>
        <section class="rx-detail">
          <header class="rx-detail-head">
            <div><div class="rx-crumb">${cur.path.map(p => e(p.nm)).join(' › ') || '一级标签'}</div><h2>${e(cur.tag.nm)}${cur.tag.tagType ? `<span class="rx-badge">${e(cur.tag.tagType)}</span>` : ''}</h2></div>
            <div class="rx-nav"><button type="button" class="btn btn-sm" data-act="rx-leaf-step" data-dir="-1" ${idx ? '' : 'disabled'}>‹ 上一个</button><span>${idx + 1} / ${info.length}</span><button type="button" class="btn btn-sm" data-act="rx-leaf-step" data-dir="1" ${idx < info.length - 1 ? '' : 'disabled'}>下一个 ›</button></div>
          </header>
          ${suggestion ? `<div class="notice notice-info"><div>学习内容建议：${e(suggestion)}</div></div>` : ''}
          <section class="rx-sec">
            <div class="rx-sec-head"><span class="rx-sec-no">1</span><div><h3>谁能看到这个标签</h3><p>按岗位职级选适用层级。层级同时决定学员测试时抽哪种难度的题。</p></div></div>
            <div class="rx-levels">${LV.map(L => `<button type="button" class="rx-lv ${chosen.includes(L) ? 'is-on' : ''}" data-act="s4-level" data-lv="${L}" aria-pressed="${chosen.includes(L)}"><b>${L}</b><span>${RANK[L]}</span><small>题目难度：${DIFF[L]}</small></button>`).join('')}</div>
            <div class="rx-lv-summary">${lvSummary}</div>
          </section>
          <section class="rx-sec">
            <div class="rx-sec-head"><span class="rx-sec-no">2</span><div><h3>配置学习内容</h3><p>${e(ruleHint(m.rule))}</p></div></div>
            <div class="rx-ctabs" role="tablist">${tabs.map(([k, n]) => `<button type="button" role="tab" class="rx-ctab ${m.ctab === k ? 'is-on' : ''}" aria-selected="${m.ctab === k}" data-act="rx-ctab" data-tab="${k}">${k}<em>${n}</em></button>`).join('')}</div>
            <div class="rx-panel">${panel}</div>
          </section>
          <footer class="rx-detail-foot"><span class="rx-state ${st}"><i class="rx-dot ${st}"></i>${e(stateText(cur.n, m.rule))}</span><span class="rx-flex"></span>
            ${idx < info.length - 1 ? '<button type="button" class="btn btn-primary" data-act="rx-leaf-step" data-dir="1">下一个标签 →</button>' : '<button type="button" class="btn btn-primary" data-act="step" data-step="4">全部配完，去关联学员 →</button>'}</footer>
        </section>
      </div>
    </div>`;
  }

  function formalPanel(c, v, kind) {
    const e = c.esc, label = kind === '考试' ? '试卷' : '课程';
    const picked = v.items.filter(x => kindOf(c, x.id) === kind);
    const rec = c.G.courseLibrary.filter(r => r.kind === kind && !picked.some(p => p.id === r.id)).slice(0, 4);
    const rows = picked.map(p => `<div class="rx-item"><span class="rx-item-ic ${kind === '考试' ? 'is-exam' : ''}">${kind === '考试' ? '卷' : '课'}</span><span class="rx-item-nm">${e(p.nm)}</span>
      ${kind === '课程'
        ? `<select class="select-native rx-item-sel" data-act="lc-required" data-id="${e(p.id)}" aria-label="${e(p.nm)}修读要求"><option value="required" ${p.required ? 'selected' : ''}>必修</option><option value="optional" ${!p.required ? 'selected' : ''}>选修</option></select>`
        : `<select class="select-native rx-item-sel" data-act="lc-test-phase" data-id="${e(p.id)}" aria-label="${e(p.nm)}测评类型"><option value="pre" ${p.testPhase === 'pre' ? 'selected' : ''}>前测</option><option value="post" ${p.testPhase !== 'pre' ? 'selected' : ''}>后测</option></select>`}
      <button type="button" class="rx-item-del" data-act="s4-del" data-id="${e(p.id)}" aria-label="移除${e(p.nm)}">移除</button></div>`).join('');
    return `<div class="rx-panel-bar"><button type="button" class="btn btn-primary btn-sm" data-act="rx-add-formal" data-kind="${kind}">＋ 添加${label}</button>
        <span class="rx-muted">已选 ${picked.length}${kind === '课程' ? ` · 必修 ${picked.filter(p => p.required).length}` : ''} · 关联学员需有访问权限</span></div>
      ${rows ? `<div class="rx-items">${rows}</div>` : `<div class="rx-panel-empty">还没有${label}。</div>`}
      ${rec.length ? `<div class="rx-rec"><span>推荐</span>${rec.map(r => `<button type="button" class="rx-chip" data-act="s4-add" data-id="${e(r.id)}">＋ ${e(r.nm)}</button>`).join('')}</div>` : ''}`;
  }

  function questionPanel(c, v, chosen) {
    const e = c.esc, levels = chosen.length ? chosen : LV;
    const refs = v.questions.map(id => QUESTION_BANK.find(q => q.id === id)).filter(Boolean);
    const matrix = levels.map(L => {
      const n = refs.filter(q => q.diff === L).length;
      return `<div class="rx-qm ${n ? '' : 'is-gap'}"><b>${L} ${RANK[L]}</b><span>难度「${DIFF[L]}」</span><em>${n ? n + ' 题' : '暂无题目'}</em></div>`;
    }).join('');
    return `<div class="rx-note">题目在「试题管理」统一维护，这里只引用，不在图谱里另存一份。题目改了，图谱里同步看到。</div>
      <div class="rx-panel-bar"><button type="button" class="btn btn-primary btn-sm" data-act="rx-q-open">＋ 从试题管理选择</button>
        <label class="rx-check"><input type="checkbox" data-act="rx-auto-diff" ${v.autoDiff ? 'checked' : ''}>按适用层级匹配题目难度</label></div>
      ${v.autoDiff ? `<div class="rx-qmatrix" aria-label="各层级题目数">${matrix}</div>` : ''}
      ${refs.length ? `<table class="tbl rx-qtable"><thead><tr><th>题干</th><th>题型</th><th>难度</th><th>来源题库</th><th>知识点</th><th></th></tr></thead><tbody>${refs.map(q => `<tr><td>${e(q.stem)}</td><td>${e(q.type)}</td><td><span class="rx-diff d${q.diff ? q.diff.slice(1) : 0}">${q.diff ? DIFF[q.diff] : '未设置'}</span></td><td>${e(q.bank)}</td><td>${e(q.point)}</td><td><button type="button" class="btn-link" data-act="rx-q-remove" data-id="${e(q.id)}">移除</button></td></tr>`).join('')}</tbody></table>`
        : '<div class="rx-panel-empty">还没有引用题目。</div>'}`;
  }

  function materialPanel(c, v) {
    const e = c.esc, m = model(c), tagId = c.ui.s4Tag;
    const queue = m.uploads.filter(u => u.tagId === tagId && u.gid === c.S.selectedGraphId && u.status !== 'done');
    const linked = materials(v);
    const done = m.uploads.filter(u => u.tagId === tagId && u.status === 'done').length;
    return `<div class="rx-drop" data-rx-drop="mat">
        <div class="rx-drop-ic" aria-hidden="true">⇪</div>
        <div><b>把多个文件拖到这里，一次上传</b><p>支持 PDF、Word、Excel、PPT、图片、视频等；单个不超过 100 MB，一次最多 ${MAT_BATCH} 个。上传完成后自动挂到「${e(c.ui.s4Tag ? (flat(graph(c).tagTree).find(n => n.id === tagId)?.nm || '') : '')}」。</p></div>
        <div class="rx-drop-ops"><button type="button" class="btn btn-primary btn-sm" data-act="rx-upload-pick">选择文件</button><button type="button" class="btn btn-sm" data-act="rx-add-material">从资料库选择</button></div>
        <input type="file" data-act="rx-upload-file" multiple hidden aria-label="上传资料">
      </div>
      ${queue.length ? `<div class="rx-queue" aria-live="polite"><div class="rx-queue-head">上传队列 <span class="rx-muted">${queue.filter(u => u.status === 'uploading').length} 个上传中 · ${queue.filter(u => u.status === 'failed').length} 个失败${done ? ` · 本标签已完成 ${done} 个` : ''}</span>${queue.some(u => u.status === 'failed') ? '<button type="button" class="btn-link" data-act="rx-up-clear">清除失败项</button>' : ''}</div>
        ${queue.map(u => `<div class="rx-up ${u.status}"><span class="rx-up-nm" title="${e(u.name)}">${e(u.name)}</span><span class="rx-muted">${sizeText(u.size)}</span>
          <span class="rx-up-bar"><i data-up="${u.id}" style="width:${Math.round(u.progress)}%"></i></span>
          <span class="rx-up-st" data-up-st="${u.id}">${u.status === 'failed' ? e(u.error) : Math.round(u.progress) + '%'}</span>
          ${u.status === 'failed' && u.retry ? `<button type="button" class="btn-link" data-act="rx-up-retry" data-id="${u.id}">重试</button>` : ''}</div>`).join('')}</div>` : ''}
      ${linked.length ? `<div class="rx-items">${linked.map(r => `<div class="rx-item"><span class="rx-item-ic is-mat">料</span><span class="rx-item-nm">${e(r.nm)}</span><span class="rx-muted">${r.uploaded ? '本地上传 · ' + sizeText(r.size || 0) : r.fromPackage ? 'AI 资料包' : '资料库'}</span><button type="button" class="rx-item-del" data-act="rx-mat-remove" data-id="${e(r.id)}">移除</button></div>`).join('')}</div>` : '<div class="rx-panel-empty">还没有资料。</div>'}`;
  }

  function startUploads(c, files) {
    const m = model(c), g = graph(c), tagId = c.ui.s4Tag;
    if (!tagId || !files.length) return;
    let list = [...files];
    if (list.length > MAT_BATCH) { c.toast(`一次最多上传 ${MAT_BATCH} 个，已取前 ${MAT_BATCH} 个`, 'warning'); list = list.slice(0, MAT_BATCH); }
    const linked = materials(cfg(g, tagId));
    list.forEach(f => {
      const u = { id: uid('up'), tagId, gid: c.S.selectedGraphId, name: f.name, size: f.size, progress: 0, status: 'uploading', error: '', retry: false };
      const clash = linked.some(x => x.nm === f.name) || m.uploads.some(x => x.tagId === tagId && x.name === f.name && x.status === 'uploading');
      const err = !MAT_EXT.test(f.name) ? '格式不支持' : !f.size ? '文件为空' : f.size > MAT_MAX ? '超过 100 MB' : clash ? '该标签下已有同名资料' : '';
      if (err) Object.assign(u, { status: 'failed', error: err });
      // 文件名含「失败」用于演示网络中断后重试。
      u.dropAt = /失败/.test(f.name) ? 60 : 0;
      m.uploads.push(u);
    });
    c.render(); tick();
  }
  function tick() {
    if (timer) return;
    timer = setInterval(() => {
      const c = ctxNow, m = model(c), active = m.uploads.filter(u => u.status === 'uploading');
      if (!active.length) { clearInterval(timer); timer = null; return; }
      let changed = false;
      active.forEach(u => {
        u.progress = Math.min(100, u.progress + 14 + Math.random() * 22);
        if (u.dropAt && u.progress >= u.dropAt) { Object.assign(u, { status: 'failed', error: '网络中断', retry: true, dropAt: 0 }); changed = true; return; }
        if (u.progress >= 100) { finishUpload(c, u); changed = true; return; }
        const bar = document.querySelector(`[data-up="${u.id}"]`), label = document.querySelector(`[data-up-st="${u.id}"]`);
        if (bar) bar.style.width = Math.round(u.progress) + '%';
        if (label) label.textContent = Math.round(u.progress) + '%';
      });
      if (changed) {
        c.render();
        if (!m.uploads.some(u => u.status === 'uploading')) c.toast(`本批上传完成：成功 ${m.uploads.filter(u => u.status === 'done' && !u.reported).length} 个`, 'success');
        m.uploads.filter(u => u.status === 'done').forEach(u => { u.reported = true; });
      }
    }, 280);
  }
  function finishUpload(c, u) {
    const g = c.S.graphs[u.gid];
    if (!g || !leafPaths(g.tagTree).some(x => x.tag.id === u.tagId)) { Object.assign(u, { status: 'failed', error: '标签已删除' }); return; }
    const res = { id: 'up-' + u.id, nm: u.name, kind: '资料', required: false, uploaded: true, size: u.size };
    c.G.courseLibrary.push(res);
    const v = cfg(g, u.tagId);
    v.informal['工具表单'] ||= {};
    (v.informal['工具表单']['资料'] ||= []).push({ ...res });
    Object.assign(u, { status: 'done', progress: 100 });
  }

  /* ================= 题目选择（试题管理） ================= */
  function renderQuestionPicker(c, p) {
    const e = c.esc, v = cfg(graph(c), p.tagId);
    const banks = [...new Set(QUESTION_BANK.map(q => q.bank))], points = [...new Set(QUESTION_BANK.map(q => q.point))];
    const rows = QUESTION_BANK.filter(q => (p.bank === 'all' || q.bank === p.bank) && (p.point === 'all' || q.point === p.point) && (!p.diff.length || p.diff.includes(q.diff)) && (!p.query || q.stem.includes(p.query)));
    return `<div class="modal-mask"><section class="modal rx-modal" role="dialog" aria-modal="true" aria-labelledby="rx-qb-title">
      <div class="modal-head"><h2 id="rx-qb-title">从试题管理选择题目</h2><button type="button" data-act="rx-modal-close" aria-label="关闭">×</button></div>
      <div class="modal-body">
        <div class="rx-qb-filters">
          <label>题库<select class="select-native" data-act="rx-qb-bank"><option value="all">全部</option>${banks.map(b => `<option ${p.bank === b ? 'selected' : ''}>${e(b)}</option>`).join('')}</select></label>
          <label>知识点<select class="select-native" data-act="rx-qb-point"><option value="all">全部</option>${points.map(b => `<option ${p.point === b ? 'selected' : ''}>${e(b)}</option>`).join('')}</select></label>
          <input class="input" data-act="rx-qb-kw" placeholder="搜索题干" value="${e(p.kw)}" aria-label="搜索题干"><button type="button" class="btn btn-primary" data-act="rx-qb-search">查询</button>
        </div>
        <div class="rx-qb-diff"><span>难度</span>${LV.map(L => `<button type="button" class="rx-chip ${p.diff.includes(L) ? 'is-on' : ''}" data-act="rx-qb-diff" data-lv="${L}" aria-pressed="${p.diff.includes(L)}">${DIFF[L]}<small>${L}</small></button>`).join('')}<span class="rx-muted">已按本标签适用层级预选，可调整</span></div>
        <div class="rx-qb-list">${rows.map(q => { const used = v.questions.includes(q.id); return `<label class="rx-qb-row ${used ? 'is-used' : ''}"><input type="checkbox" data-act="rx-qb-check" data-id="${q.id}" ${used ? 'disabled checked' : p.sel.includes(q.id) ? 'checked' : ''}><span class="rx-qb-stem">${e(q.stem)}<small>${e(q.bank)} · ${e(q.point)} · ${e(q.type)}</small></span><span class="rx-diff d${q.diff.slice(1)}">${DIFF[q.diff]}</span>${used ? '<em>已引用</em>' : ''}</label>`; }).join('') || '<div class="rx-panel-empty">没有符合条件的题目</div>'}</div>
        <p class="rx-muted">难度取自试题管理的题目属性。现网试题管理是否有难度字段、分几档，待研发确认。</p>
      </div>
      <div class="modal-foot"><span class="rx-muted">已选 ${p.sel.length} 题</span><button type="button" class="btn" data-act="rx-modal-close">取消</button><button type="button" class="btn btn-primary" data-act="rx-qb-confirm" ${p.sel.length ? '' : 'disabled'}>引用到标签</button></div>
    </section></div>`;
  }

  /* ================= 启用检查（N3） ================= */
  function enableCheck(c, gid) {
    const m = model(c), g = c.S.graphs[gid];
    if (!g || g.status === 'enabled') return false;
    const issues = leafPaths(g.tagTree).map(x => ({ ...x, n: counts(c, g, x.tag.id) })).filter(x => state(x.n, m.rule) !== 'ok');
    if (!issues.length) return false;
    m.modal = { type: 'enable', gid, issues, blocked: issues.some(x => state(x.n, m.rule) === 'block') };
    c.render(); return true;
  }
  function renderEnable(c, p) {
    const e = c.esc, m = model(c), g = c.S.graphs[p.gid];
    return `<div class="modal-mask"><section class="modal rx-modal" role="dialog" aria-modal="true" aria-labelledby="rx-en-title">
      <div class="modal-head"><h2 id="rx-en-title">${p.blocked ? '还不能启用' : '启用前确认'}「${e(g.name)}」</h2><button type="button" data-act="rx-modal-close" aria-label="关闭">×</button></div>
      <div class="modal-body"><p>当前启用规则：<b>${e(RULES.find(r => r[0] === m.rule)[1])}</b>。${p.blocked ? '以下标签不满足规则，配置后再启用。' : '以下标签没有学习内容，学员端会显示「暂无学习内容」，仍可启用。'}</p>
        <ul class="rx-en-list">${p.issues.map(x => `<li><span class="rx-dot ${state(x.n, m.rule)}"></span><span>${e([...x.path.map(t => t.nm), x.tag.nm].join(' › '))}</span><em>${e(stateText(x.n, m.rule))}</em></li>`).join('')}</ul></div>
      <div class="modal-foot"><button type="button" class="btn" data-act="rx-modal-close">取消</button><button type="button" class="btn" data-act="rx-enable-fix">去配置</button>${p.blocked ? '' : '<button type="button" class="btn btn-primary" data-act="rx-enable-confirm">仍然启用</button>'}</div>
    </section></div>`;
  }

  /* ================= 导入建图（N2）与 AI 资料包（N4） ================= */
  const SHEETS = {
    basic: { name: '图谱基本信息', req: ['图谱名称'], cols: ['图谱名称', '岗位意义', '关键职责', '关联岗位编码', '关联岗位名称', '自动同步'] },
    tags: { name: '图谱标签', req: ['一级标签'], cols: ['一级标签', '二级标签', '三级标签', '标签适用层级', '标签类型'] },
    tests: { name: '图谱测试内容', req: ['末梢标签', '题目类型', '题干', '正确答案'], cols: ['末梢标签', '题目类型', '题干', '正确答案', '难度', ...'ABCDEFGHIJ'.split('').map(x => '选项' + x)] },
  };
  function positionsByCode(c) {
    const list = c.G.positions.map(p => ({ code: p.code || 'P-' + p.id.toUpperCase(), nm: p.nm, id: p.id }));
    return [...list, { code: 'P-HCA-01', nm: '合成氨操作工', id: null }];
  }
  function validateWorkbook(c, wb) {
    const fatal = [], out = {};
    for (const [key, def] of Object.entries(SHEETS)) {
      const s = wb.find(x => x.name.trim() === def.name);
      if (!s) { if (key !== 'tests') fatal.push(`缺少「${def.name}」工作表，导入建图必须包含「图谱基本信息」和「图谱标签」`); continue; }
      const head = (s.cells[4] || []).map(x => String(x || '').trim());
      const missing = def.req.filter(h => !head.includes(h));
      if (missing.length) { fatal.push(`「${def.name}」第 5 行缺少必填列：${missing.join('、')}`); continue; }
      const idx = Object.fromEntries(head.map((h, i) => [h, i]).filter(([h]) => h));
      const rows = s.cells.slice(5).map((r, i) => ({ rowNo: i + 6, v: Object.fromEntries(Object.entries(idx).map(([h, j]) => [h, String(r[j] ?? '').trim()])), issues: [] })).filter(r => Object.values(r.v).some(Boolean));
      out[key] = { key, name: def.name, cols: def.cols.filter(h => h in idx), rows };
    }
    if (out.basic && !out.basic.rows.length) fatal.push('「图谱基本信息」没有数据，请从第 6 行开始填写');
    if (out.tags && !out.tags.rows.length) fatal.push('「图谱标签」没有数据，请从第 6 行开始填写');
    if (fatal.length) return { fatal };

    const add = (r, col, level, msg) => r.issues.push({ col, level, msg });
    const text = (r, col, max, label) => { const val = r.v[col]; if (!val) return; const err = nameError(val, max); if (err) add(r, col, 'error', label + err); };

    // 图谱基本信息
    const b = out.basic.rows, first = b[0];
    if (!first.v['图谱名称']) add(first, '图谱名称', 'error', '图谱名称必填（只读第一行）');
    text(first, '图谱名称', 20, '图谱名称');
    b.slice(1).forEach(r => { if (r.v['图谱名称']) add(r, '图谱名称', 'warn', '图谱名称只读取第一行，此处忽略'); });
    ['岗位意义', '关键职责'].forEach(col => {
      let n = 0;
      b.forEach(r => { if (!r.v[col]) return; n++; text(r, col, 50, col); if (n === 21) add(r, col, 'error', col + '最多 20 条'); });
    });
    const code = first.v['关联岗位编码'], pname = first.v['关联岗位名称'], sync = first.v['自动同步'];
    const pos = code ? positionsByCode(c).find(p => p.code === code) : null;
    if (code && !pos) add(first, '关联岗位编码', 'error', `岗位编码 ${code} 在人员主数据中不存在`);
    if (pos && pname && pname !== pos.nm) add(first, '关联岗位名称', 'warn', `岗位名称与编码不一致，已按编码关联「${pos.nm}」`);
    if (sync && !['开', '关'].includes(sync)) add(first, '自动同步', 'error', `自动同步只能填「开」或「关」，当前值：${sync}`);
    else if (sync && !code) add(first, '自动同步', 'warn', '未关联岗位，自动同步不生效');

    // 图谱标签：空单元格沿用上一行的上级
    const reg = new Map(), roots = [];
    const node = (r, col, nm, level, parent) => {
      text(r, col, 20, col + '名称');
      const hit = reg.get(nm);
      if (hit) {
        if (hit.level === level && hit.parent === parent) return hit;
        add(r, col, 'error', `标签名称「${nm}」重复（第 ${hit.row.rowNo} 行已使用），同一图谱内不能重名`);
        return null;
      }
      const n = { nm, level, parent, row: r, children: [] };
      reg.set(nm, n); (parent ? parent.children : roots).push(n);
      return n;
    };
    let p1 = null, p2 = null;
    out.tags.rows.forEach((r, i) => {
      const a = r.v['一级标签'], s2 = r.v['二级标签'], s3 = r.v['三级标签'];
      if (!a && i === 0) { add(r, '一级标签', 'error', '第一行数据的一级标签不能为空'); r.bad = true; return; }
      if (a) { p1 = node(r, '一级标签', a, 1, null); p2 = null; }
      if (s2) p2 = p1 ? node(r, '二级标签', s2, 2, p1) : null;
      let own = s3 ? null : s2 ? p2 : p1;
      if (s3) {
        if (!s2 && (a || !p2)) add(r, '三级标签', 'error', `三级标签「${s3}」缺少二级标签`);
        else if (p2) own = node(r, '三级标签', s3, 3, p2);
      }
      r.node = own;
      const lv = r.v['标签适用层级'];
      if (lv && !/^[1-5](,[1-5])*$/.test(lv)) add(r, '标签适用层级', 'error', '适用层级只能填 1–5，多个用英文逗号隔开' + (/，/.test(lv) ? '（检测到中文逗号）' : ''));
      else if (own && lv) own.levels = [...new Set(lv.split(','))].map(x => 'L' + x);
      const tp = r.v['标签类型'];
      if (tp === '核心知识/应知') { add(r, '标签类型', 'warn', '已按「应知」写入'); if (own) own.tagType = '应知'; }
      else if (tp && !TAG_TYPES.includes(tp)) add(r, '标签类型', 'error', `标签类型只能填${TAG_TYPES.join('、')}，当前值：${tp}`);
      else if (own && tp) own.tagType = tp;
    });
    out.tags.rows.forEach(r => {
      if (r.issues.some(x => x.level === 'error')) { r.bad = true; if (r.node) r.node.bad = true; }
      if (r.node && r.node.children.length && r.v['标签类型'] && !r.issues.some(x => x.col === '标签类型')) add(r, '标签类型', 'warn', '只有末梢标签需要填写标签类型，此处忽略');
    });

    // 图谱测试内容
    const stems = new Set();
    (out.tests?.rows || []).forEach(r => {
      const leaf = r.v['末梢标签'], n = reg.get(leaf), type = r.v['题目类型'], stem = r.v['题干'];
      if (!leaf) add(r, '末梢标签', 'error', '末梢标签必填');
      else if (!n) add(r, '末梢标签', 'error', `末梢标签「${leaf}」在「图谱标签」中不存在`);
      else if (n.children.length) add(r, '末梢标签', 'error', `「${leaf}」有下级标签，不是末梢标签`);
      else if (n.bad) add(r, '末梢标签', 'error', `「${leaf}」所在的标签行有错误，先修正标签`);
      if (!['单选题', '多选题', '判断题'].includes(type)) add(r, '题目类型', 'error', `题目类型只能是单选题、多选题、判断题${type ? '，当前值：' + type : ''}`);
      if (!stem || stem.length > 100) add(r, '题干', 'error', stem ? `题干不超过 100 字（当前 ${stem.length} 字）` : '题干必填');
      const letters = 'ABCDEFGHIJ'.split(''), filled = letters.filter(x => r.v['选项' + x]);
      const lastFilled = letters.findLastIndex(x => r.v['选项' + x]);
      if (filled.length !== lastFilled + 1) add(r, '选项' + letters[letters.findIndex(x => !r.v['选项' + x])], 'error', '选项需从 A 开始连续填写');
      if (filled.length < 2) add(r, '选项A', 'error', '至少填写 2 个选项');
      if (type === '判断题' && filled.length !== 2) add(r, '选项' + (filled[2] || 'A'), 'error', `判断题只能有两个选项（当前 ${filled.length} 个）`);
      filled.forEach(x => { if (r.v['选项' + x].length > 50) add(r, '选项' + x, 'error', `选项${x}不超过 50 字`); });
      const ans = (r.v['正确答案'] || '').toUpperCase().split(/[,，]/).map(x => x.trim()).filter(Boolean);
      if (!ans.length) add(r, '正确答案', 'error', '正确答案必填');
      ans.filter(x => !filled.includes(x)).forEach(x => add(r, '正确答案', 'error', `正确答案 ${x} 不在已填写的选项中`));
      if (['单选题', '判断题'].includes(type) && ans.length > 1) add(r, '正确答案', 'error', `${type}只能有一个正确答案`);
      const df = r.v['难度'];
      if (df && !DIFF_LV[df]) add(r, '难度', 'error', `难度只能填${Object.values(DIFF).join('、')}，当前值：${df}`);
      const k = leaf + '\u0000' + stem;
      if (stem && stems.has(k)) add(r, '题干', 'warn', `「${leaf}」下题干重复，将新增为一道新题`);
      stems.add(k);
    });

    const sheets = ['basic', 'tags', 'tests'].filter(k => out[k]).map(k => out[k]);
    const errRows = s => s.rows.filter(r => r.issues.some(x => x.level === 'error')).length;
    const blocking = errRows(out.basic) + errRows(out.tags);
    return { sheets, roots, reg, pos, blocking, skipped: out.tests ? errRows(out.tests) : 0, basic: out.basic, tests: out.tests };
  }

  function buildFromImport(c, res) {
    const make = nodes => nodes.filter(n => !n.bad || n.children.length).map(n => ({ id: uid('imp-'), nm: n.nm, src: n, ...(n.tagType ? { tagType: n.tagType } : {}), children: make(n.children) }));
    const tree = make(res.roots);
    const step4 = {};
    flat(tree).forEach(n => { if (!n.children.length) { delete n.children; step4[n.id] = { levels: n.src.levels || [], items: [], informal: {}, questions: [], autoDiff: true }; } });
    (res.tests?.rows || []).filter(r => !r.issues.some(x => x.level === 'error')).forEach(r => {
      const n = flat(tree).find(t => t.src === res.reg.get(r.v['末梢标签']));
      if (!n || !step4[n.id]) return;
      const q = { id: uid('qi'), stem: r.v['题干'], type: r.v['题目类型'], diff: DIFF_LV[r.v['难度']] || '', point: n.nm, bank: '光谱导入题库' };
      QUESTION_BANK.push(q); step4[n.id].questions.push(q.id);
    });
    flat(tree).forEach(n => delete n.src);
    c.G.relabelTree(tree);
    const col = k => res.basic.rows.map(r => r.v[k]).filter(Boolean).join('\n');
    return { name: res.basic.rows[0].v['图谱名称'], briefing: col('岗位意义'), duty: col('关键职责'), positionIds: res.pos?.id ? [res.pos.id] : [], groupIds: [], autoAssociate: res.basic.rows[0].v['自动同步'] !== '关', tagTree: tree, step4 };
  }

  function demoWorkbook(withErrors) {
    const sheet = (name, head, rows) => ({ name, cells: [['导入内容规范（演示）'], [], [], [], head, ...rows] });
    const ok = !withErrors;
    return [
      sheet('图谱基本信息', SHEETS.basic.cols, [
        [ok ? '合成氨操作工岗图' : '合成氨操作工（试点）', '保障合成氨装置安全稳定运行', '按巡检路线完成点巡检', ok ? 'P-HCA-01' : 'P-HCA-99', '合成氨操作工', ok ? '开' : '是'],
        ['', ok ? '降低非计划停车' : '降低非计划停车，减少损失', '规范执行开停车操作', '', '', ''],
        ['', '', '异常及时判断并上报', '', '', ''],
      ]),
      sheet('图谱标签', SHEETS.tags.cols, [
        ['运维管理', '点巡检', '巡检路线执行', '1,2,3', '应会'],
        ['', '', '异常判断上报', ok ? '1,2,3,4' : '1，2，3，4', '核心技能'],
        ['', '高压柜', '倒闸操作', '2,3,4,5', '核心技能'],
        ['工艺操作', ok ? '开停车' : '', '紧急停车处置', '2,3,4,5', '核心技能'],
        ['', '开停车', '开车前检查', '1,2,3', ok ? '应知' : '应知会'],
        ...(ok ? [] : [['', '', '巡检路线执行', '1,2,3', '应会']]),
        ['', '', ok ? '安全联锁确认' : '安全联锁 确认', '', '应知'],
      ]),
      sheet('图谱测试内容', SHEETS.tests.cols.slice(0, 9), [
        ['巡检路线执行', '单选题', '巡检发现压缩机出口温度超限第一步应做什么', 'B', '易', '直接停车', '复核仪表并上报班长', '继续观察', '忽略'],
        ['巡检路线执行', '单选题', '巡检发现压缩机出口温度超限第一步应做什么', 'B', '较易', '直接停车', '复核仪表并上报班长', '', ''],
        ['异常判断上报', '多选题', '异常上报需要包含哪些信息', ok ? 'A,B,C' : 'A,B,E', '中等', '发生时间', '异常现象', '处理建议', ''],
        [ok ? '倒闸操作' : '点巡检', '判断题', '倒闸操作可以不填操作票', 'B', '易', '正确', '错误', ok ? '' : '不确定', ''],
        ['倒闸操作', '单选题', '倒闸操作前必须核对的是', 'A', ok ? '较难' : '很难', '操作票', '天气', '', ''],
      ]),
    ];
  }

  function renderImport(c) {
    const e = c.esc, m = model(c), imp = m.imp;
    return `<header class="gp-head import-head"><div class="page-title-with-back"><button class="page-back" data-act="go" data-page="list" aria-label="返回图谱中心" title="返回图谱中心"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5 7 12l7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button><h1 class="gp-head-title">导入建图</h1></div>
        <div class="gp-head-ops"><a class="btn" href="assets/光谱-导入建图模板.xlsx" download>下载导入模板</a></div></header>
      <section class="rx-imp">
        <div class="rx-imp-tabs" role="tablist">
          <button type="button" role="tab" class="${imp.mode === 'table' ? 'is-on' : ''}" aria-selected="${imp.mode === 'table'}" data-act="rx-imp-mode" data-mode="table"><b>表格导入</b><small>用导入模板建图，所有问题在页面上一次列出</small></button>
          <button type="button" role="tab" class="${imp.mode === 'ai' ? 'is-on' : ''}" aria-selected="${imp.mode === 'ai'}" data-act="rx-imp-mode" data-mode="ai"><b>✦ AI 解析资料包</b><small>上传压缩包，自动拆出标签并挂上原资料</small></button>
        </div>
        ${imp.mode === 'ai' ? renderAi(c) : renderTable(c)}
      </section>`;
  }

  function renderTable(c) {
    const e = c.esc, m = model(c), imp = m.imp, res = imp.result;
    if (!res) {
      return `<div class="rx-drop rx-drop-lg" data-rx-drop="imp"><div class="rx-drop-ic" aria-hidden="true">⇪</div>
          <div><b>把填好的导入模板拖到这里</b><p>只支持 .xlsx。上传后一次检查全部工作表，每行的问题都直接显示在页面上，不需要下载表格查看。</p></div>
          <div class="rx-drop-ops"><button type="button" class="btn btn-primary" data-act="rx-imp-pick" ${imp.reading ? 'disabled' : ''}>选择文件</button></div>
          <input type="file" data-act="rx-imp-file" accept=".xlsx" hidden aria-label="选择导入模板"></div>
        ${imp.reading ? '<div class="notice notice-info" role="status">正在读取并检查文件…</div>' : ''}
        ${imp.fatal ? `<div class="notice notice-error rx-fatal" role="alert"><span class="notice-icon">×</span><div><b>文件不能导入${imp.fileName ? '：' + e(imp.fileName) : ''}</b><ul>${imp.fatal.map(x => `<li>${e(x)}</li>`).join('')}</ul>修改后重新上传。</div></div>` : ''}
        <div class="rx-demo-row"><span class="rx-muted">没有文件？用演示数据看效果：</span><button type="button" class="btn btn-sm" data-act="rx-imp-demo" data-ok="0">演示文件（含错误）</button><button type="button" class="btn btn-sm" data-act="rx-imp-demo" data-ok="1">演示文件（全部正确）</button></div>`;
    }
    const issues = res.sheets.flatMap(s => s.rows.flatMap(r => r.issues.map(x => ({ ...x, sheet: s.key, sheetName: s.name, row: r.rowNo }))));
    const errs = issues.filter(x => x.level === 'error').length, warns = issues.length - errs;
    const okRows = res.sheets.reduce((n, s) => n + s.rows.filter(r => !r.issues.length).length, 0);
    const sheet = res.sheets.find(s => s.key === imp.sheet) || res.sheets[0];
    imp.sheet = sheet.key;
    const groups = {};
    issues.forEach(x => { const k = x.sheet + '|' + x.col; (groups[k] ||= { sheet: x.sheet, col: x.col, name: x.sheetName, error: 0, warn: 0 })[x.level]++; });
    const rows = sheet.rows.filter(r => imp.filter === 'issue' ? r.issues.length : imp.filter === 'error' ? r.issues.some(x => x.level === 'error') : true)
      .filter(r => !imp.col || r.issues.some(x => x.col === imp.col));
    const cell = (r, col) => { const hit = r.issues.filter(x => x.col === col); const lv = hit.some(x => x.level === 'error') ? 'err' : hit.length ? 'warn' : ''; return `<td class="${lv ? 'rx-cell-' + lv : ''}" ${hit.length ? `title="${e(hit.map(x => x.msg).join('；'))}"` : ''}>${e(r.v[col] || '')}</td>`; };
    return `<div class="rx-imp-summary">
        <div class="rx-imp-file"><b>${e(imp.fileName)}</b><span class="rx-muted">检查了 ${res.sheets.length} 个工作表、${res.sheets.reduce((n, s) => n + s.rows.length, 0)} 行</span><button type="button" class="btn-link" data-act="rx-imp-reset">重新上传</button></div>
        <div class="rx-stat is-err"><b>${errs}</b>处错误</div><div class="rx-stat is-warn"><b>${warns}</b>处提醒</div><div class="rx-stat is-ok"><b>${okRows}</b>行通过</div>
      </div>
      ${res.blocking ? `<div class="notice notice-error" role="alert"><span class="notice-icon">×</span><div>「图谱基本信息」或「图谱标签」有 <b>${res.blocking}</b> 行错误，改完后重新上传才能导入。下方已列出全部问题。</div></div>`
        : res.skipped ? `<div class="notice notice-warn"><span class="notice-icon">!</span><div>图谱结构没有问题，可以导入。有 <b>${res.skipped}</b> 道测试题有错误，导入时跳过，其余正常写入。</div></div>`
        : '<div class="notice notice-success"><span class="notice-icon">✓</span><div>检查通过，可以导入。</div></div>'}
      ${issues.length ? `<div class="rx-groups"><span class="rx-muted">问题分布</span>${Object.values(groups).map(gp => `<button type="button" class="rx-chip ${imp.col === gp.col && imp.sheet === gp.sheet ? 'is-on' : ''}" data-act="rx-imp-group" data-sheet="${gp.sheet}" data-col="${e(gp.col)}">${e(gp.name)} · ${e(gp.col)}${gp.error ? `<em class="e">${gp.error}</em>` : ''}${gp.warn ? `<em class="w">${gp.warn}</em>` : ''}</button>`).join('')}${imp.col ? '<button type="button" class="btn-link" data-act="rx-imp-group" data-sheet="" data-col="">清除筛选</button>' : ''}</div>` : ''}
      <div class="rx-sheet-tabs" role="tablist">${res.sheets.map(s => { const n = s.rows.filter(r => r.issues.some(x => x.level === 'error')).length; return `<button type="button" role="tab" class="${s.key === sheet.key ? 'is-on' : ''}" aria-selected="${s.key === sheet.key}" data-act="rx-imp-sheet" data-sheet="${s.key}">${e(s.name)}${n ? `<em>${n}</em>` : '<i>✓</i>'}</button>`; }).join('')}
        <span class="rx-flex"></span><select class="select-native" data-act="rx-imp-filter" aria-label="行筛选"><option value="all" ${!imp.filter || imp.filter === 'all' ? 'selected' : ''}>全部行</option><option value="issue" ${imp.filter === 'issue' ? 'selected' : ''}>只看有问题的行</option><option value="error" ${imp.filter === 'error' ? 'selected' : ''}>只看错误行</option></select></div>
      <div class="table-wrap rx-imp-table"><table class="tbl"><thead><tr><th class="num">行号</th>${sheet.cols.map(h => `<th>${e(h)}</th>`).join('')}<th class="rx-result-col">检查结果</th></tr></thead>
        <tbody>${rows.map(r => `<tr class="${r.issues.some(x => x.level === 'error') ? 'row-error' : ''}"><td class="num">${r.rowNo}</td>${sheet.cols.map(h => cell(r, h)).join('')}
          <td class="rx-result">${r.issues.length ? `<ul>${r.issues.map(x => `<li class="${x.level}"><b>${e(x.col)}</b>${e(x.msg)}</li>`).join('')}</ul>` : '<span class="rx-ok">通过</span>'}</td></tr>`).join('') || `<tr><td colspan="${sheet.cols.length + 2}" class="rx-panel-empty">当前筛选下没有数据</td></tr>`}</tbody></table></div>
      <div class="rx-imp-actions"><button type="button" class="btn btn-primary" data-act="rx-imp-confirm" ${res.blocking ? 'disabled' : ''}>确认导入${res.skipped && !res.blocking ? `（跳过 ${res.skipped} 道错题）` : ''}</button>
        <button type="button" class="btn" data-act="rx-imp-reset">重新上传</button><span class="rx-flex"></span>${issues.length ? '<button type="button" class="btn-link" data-act="rx-imp-csv">下载问题清单（可选）</button>' : ''}</div>`;
  }

  /* AI 资料包：按标题层级拆标签，原文件挂到对应末级标签。规则为本地模拟，不代表模型效果。 */
  const HEADINGS = [
    [3, /^#{3,6}\s+(.+)$/], [2, /^##\s+(.+)$/], [1, /^#\s+(.+)$/],
    [1, /^第[一二三四五六七八九十百\d]+[章部篇]\s*(.+)$/], [1, /^[一二三四五六七八九十]+[、.．]\s*(.+)$/],
    [2, /^[（(][一二三四五六七八九十]+[)）]\s*(.+)$/], [3, /^\d+\.\d+[.．、\s]\s*(.+)$/], [2, /^\d+[、.．]\s*(.+)$/],
  ];
  function clean(nm) { return String(nm || '').replace(SPECIAL, '').replace(/[-·]+$/, '').slice(0, 20); }
  function heading(line) {
    if (line.length > 32) return null;
    for (const [level, re] of HEADINGS) { const hit = re.exec(line); if (hit) return { level, text: hit[1] }; }
    return null;
  }
  function genTree(files) {
    const root = [];
    const add = (path, src) => {
      let list = root, n = null;
      path.slice(0, 3).forEach(nm => { n = list.find(x => x.nm === nm); if (!n) { n = { nm, children: [], sources: [] }; list.push(n); } list = n.children; });
      if (n && !n.sources.includes(src)) n.sources.push(src);
    };
    files.filter(f => f.status === 'ok').forEach(f => {
      const base = clean(f.name.replace(/\.[^.]+$/, '')) || '资料';
      const tagSheet = f.sheets?.find(s => s.cells.some(r => r.some(x => /一级/.test(x)) && r.some(x => /二级|三级|末级/.test(x))));
      if (tagSheet) {
        const hi = tagSheet.cells.findIndex(r => r.some(x => /一级/.test(x)));
        const head = tagSheet.cells[hi], pick = re => head.findIndex(x => re.test(x));
        const cols = [pick(/一级/), pick(/二级/), pick(/三级|末级/)].filter(i => i >= 0);
        const last = cols.map(() => '');
        tagSheet.cells.slice(hi + 1).forEach(r => { cols.forEach((ci, k) => { const v = clean(r[ci]); if (v) { last[k] = v; for (let j = k + 1; j < last.length; j++) last[j] = ''; } }); const path = last.filter(Boolean); if (path.length && cols.some(ci => clean(r[ci]))) add(path, f.name); });
        return;
      }
      let cur = [null, null, null], any = false;
      String(f.text || '').split('\n').map(s => s.trim()).filter(Boolean).forEach(line => {
        const h = heading(line); if (!h) return;
        const nm = clean(h.text); if (!nm) return;
        any = true;
        if (h.level === 1) cur = [nm, null, null];
        else if (h.level === 2) cur = [cur[0] || base, nm, null];
        else cur = [cur[0] || base, cur[1] || '核心要求', nm];
        add(cur.filter(Boolean), f.name);
      });
      if (!any) add(['通用能力', base], f.name);
    });
    return root;
  }
  const DEMO_PACKAGE = [
    { name: '合成氨操作工岗位说明书.md', folder: '岗位资料', text: '# 运维管理\n## 点巡检\n### 巡检路线执行\n按规定路线完成巡检。\n### 异常判断上报\n## 高压柜\n### 倒闸操作\n# 工艺操作\n## 开停车\n### 开车前检查\n### 紧急停车处置' },
    { name: '巡检作业指导书.txt', folder: '作业指导', text: '一、运维管理\n（一）点巡检\n1.1 巡检路线执行\n1.2 巡检记录填写\n（二）设备润滑\n二、安全环保\n（一）有限空间作业\n（二）危化品管理' },
    { name: '应急处置手册.docx', folder: '作业指导', text: '第一章 应急响应\n1. 泄漏处置\n2. 火灾初期扑救\n3. 人员急救' },
    { name: '高压柜操作规程.pdf', folder: '作业指导', status: 'skip', error: '暂不支持该格式，已跳过' },
    { name: '现场照片.jpg', folder: '', status: 'skip', error: '暂不支持该格式，已跳过' },
  ].map(f => ({ status: 'ok', size: (f.text || 'x'.repeat(900000)).length * 3, ...f }));

  function aiStats(tree) {
    const all = flat(tree), leaves = leafPaths(tree);
    const src = new Set(); leaves.forEach(x => [...x.path, x.tag].forEach(n => n.sources.forEach(s => src.add(s))));
    const seen = {}; all.forEach(n => { const k = clean(n.nm); seen[k] = (seen[k] || 0) + 1; });
    const dup = new Set(Object.keys(seen).filter(k => k && seen[k] > 1));
    return { l1: tree.length, l2: all.filter(n => tree.some(t => t.children.includes(n))).length, leaves: leaves.length, src: src.size, dup };
  }
  function renderAi(c) {
    const e = c.esc, ai = model(c).imp.ai || {};
    if (!ai.files) {
      return `<div class="rx-drop rx-drop-lg" data-rx-drop="zip"><div class="rx-drop-ic" aria-hidden="true">✦</div>
          <div><b>上传岗位资料压缩包，自动生成图谱草稿</b><p>支持 .zip，也可以一次选多个文档。包内的 Word、Excel、TXT、Markdown 会逐个解析；PDF、图片等暂不支持，会标出来跳过。压缩包不超过 20 MB、最多 30 个文件。</p></div>
          <div class="rx-drop-ops"><button type="button" class="btn btn-primary" data-act="rx-zip-pick" ${ai.reading ? 'disabled' : ''}>选择压缩包或文档</button><a class="btn" href="assets/ai-sample-package.zip" download>下载示例压缩包</a></div>
          <input type="file" data-act="rx-zip-file" accept=".zip,.docx,.xlsx,.txt,.md" multiple hidden aria-label="选择资料压缩包"></div>
        ${ai.reading ? '<div class="notice notice-info" role="status">正在解压并解析资料…</div>' : ''}
        ${ai.error ? `<div class="notice notice-error" role="alert"><span class="notice-icon">×</span><div>${e(ai.error)}</div></div>` : ''}
        <div class="rx-demo-row"><span class="rx-muted">没有文件？</span><button type="button" class="btn btn-sm" data-act="rx-zip-demo">用演示资料包</button></div>`;
    }
    const st = aiStats(ai.tree), ok = ai.files.filter(f => f.status === 'ok').length;
    const nodeRow = (n, path, depth) => `<div class="rx-ai-node d${depth}">
        <input class="input" data-act="rx-ai-rename" data-path="${path}" value="${e(n.nm)}" maxlength="20" aria-label="标签名称">
        ${n.children.length ? `<span class="rx-badge">${n.children.length} 个下级</span>` : '<span class="rx-badge is-leaf">末级</span>'}
        ${st.dup.has(clean(n.nm)) ? '<span class="rx-badge is-dup">重名</span>' : !clean(n.nm) ? '<span class="rx-badge is-dup">名称为空</span>' : ''}
        ${n.sources.length ? `<span class="rx-ai-src">${n.sources.map(s => `<span title="${e(s)}">${e(s)}</span>`).join('')}</span>` : ''}
        <button type="button" class="btn-link danger" data-act="rx-ai-del" data-path="${path}">删除</button></div>
        ${n.children.map((k, i) => nodeRow(k, path + '-' + i, depth + 1)).join('')}`;
    return `<div class="rx-ai">
      <aside class="rx-ai-files"><div class="rx-ai-files-head"><b>${e(ai.fileName)}</b><span class="rx-muted">解析 ${ok} 个 · 跳过 ${ai.files.length - ok} 个</span></div>
        ${ai.files.map(f => `<div class="rx-ai-file ${f.status}"><span class="rx-ai-ic">${f.status === 'ok' ? '✓' : '!'}</span><span><b>${e(f.name)}</b><small>${f.status === 'ok' ? (f.folder ? e(f.folder) + ' · ' : '') + (f.sheets ? f.sheets.length + ' 个工作表' : (f.text || '').length + ' 字') : e(f.error || '解析失败')}</small></span></div>`).join('')}
        <button type="button" class="btn-link" data-act="rx-ai-reset">重新上传</button></aside>
      <section class="rx-ai-main">
        <div class="rx-ai-head"><label>图谱名称<input class="input" data-act="rx-ai-name" maxlength="20" value="${e(ai.name)}"></label>
          <span class="rx-muted">一级 ${st.l1} · 二级 ${st.l2} · 末级 ${st.leaves} · 挂资料 ${st.src} 份</span></div>
        <div class="rx-note">按文档的标题层级拆出标签，原文件作为资料挂到对应的末级标签。生成规则是本地模拟，没有接入真实模型；生成后请检查名称和层级，可直接改名或删除。</div>
        <div class="rx-ai-tree">${ai.tree.map((n, i) => nodeRow(n, String(i), 1)).join('') || '<div class="rx-panel-empty">没有识别出标签。请检查资料是否有标题层级。</div>'}</div>
        <div class="rx-imp-actions"><button type="button" class="btn btn-primary" data-act="rx-ai-apply" ${st.leaves && !st.dup.size ? '' : 'disabled'}>生成图谱草稿</button><span class="rx-muted">${st.dup.size ? `有 ${st.dup.size} 组标签重名（${[...st.dup].map(x => '「' + x + '」').join('')}），同一图谱内不能重名，请改名或删除` : '只生成草稿，不启用、不关联学员'}</span></div>
      </section></div>`;
  }
  function aiNode(tree, path) { const ix = path.split('-').map(Number); let list = tree, n = null; ix.forEach(i => { n = list[i]; list = n?.children || []; }); return n; }
  function applyAi(c) {
    const ai = model(c).imp.ai, lib = c.G.courseLibrary, matId = {};
    const name = clean(ai.name) || 'AI 生成图谱';
    const res = f => (matId[f] ||= (() => { const id = uid('pkg-'); const file = ai.files.find(x => x.name === f); lib.push({ id, nm: f, kind: '资料', required: false, fromPackage: true, size: file?.size || 0 }); return id; })());
    const step4 = {};
    const make = (nodes, inherited) => nodes.filter(n => clean(n.nm)).map(n => {
      const srcs = [...new Set([...inherited, ...n.sources])], node = { id: uid('ai-'), nm: clean(n.nm) };
      if (n.children.length) node.children = make(n.children, srcs);
      if (!node.children?.length) { delete node.children; step4[node.id] = { levels: [], items: [], questions: [], autoDiff: true, informal: { '工具表单': { '资料': srcs.map(f => ({ id: res(f), nm: f, kind: '资料', fromPackage: true })) } } }; }
      return node;
    });
    const tree = make(ai.tree, []);
    c.G.relabelTree(tree);
    c.applyDraft({ name, tagTree: tree, step4, briefing: '', duty: '', positionIds: [], groupIds: [] });
    c.S.currentStep = 2; c.ui.tagActive = null; c.ui.tagActive2 = null;
    model(c).imp = { mode: 'table' };
    c.render();
  }

  async function readWorkbook(c, file) {
    const imp = model(c).imp;
    Object.assign(imp, { reading: true, fatal: null, result: null, fileName: file.name, sheet: null, col: '', filter: 'all' });
    c.render();
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error('请上传 .xlsx 格式的模板文件');
      const parsed = await window.GP_BUILDER_DOCUMENT.parse(file);
      const res = validateWorkbook(c, parsed.sheets || []);
      if (res.fatal) imp.fatal = res.fatal; else imp.result = res;
    } catch (error) { imp.fatal = [error.message || '文件为空或无法解析，请使用下载的模板']; }
    imp.reading = false; c.render();
  }
  async function readPackage(c, files) {
    const imp = model(c).imp;
    imp.ai = { reading: true };
    c.render();
    try {
      const list = [];
      let fileName = files.length === 1 ? files[0].name : `${files.length} 个文件`;
      for (const f of files) {
        if (/\.zip$/i.test(f.name)) list.push(...(await window.GP_BUILDER_DOCUMENT.parsePackage(f)).files);
        else {
          try { list.push({ name: f.name, folder: '', size: f.size, status: 'ok', ...(await window.GP_BUILDER_DOCUMENT.parse(f)) }); }
          catch (error) { list.push({ name: f.name, folder: '', size: f.size, status: 'skip', error: error.message }); }
        }
      }
      if (!list.some(f => f.status === 'ok')) throw new Error('没有可解析的文档：' + list.map(f => f.name + '（' + f.error + '）').join('；'));
      imp.ai = { fileName, files: list, tree: genTree(list), name: clean(fileName.replace(/\.[^.]+$/, '')) || 'AI 生成图谱' };
    } catch (error) { imp.ai = { error: error.message }; }
    c.render();
  }
  function downloadIssues(c) {
    const res = model(c).imp.result;
    const rows = [['工作表', '行号', '列', '级别', '原因'], ...res.sheets.flatMap(s => s.rows.flatMap(r => r.issues.map(x => [s.name, r.rowNo, x.col, x.level === 'error' ? '错误' : '提醒', x.msg])))];
    const csv = '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = '导入问题清单.csv'; a.click();
  }

  /* ================= 事件 ================= */
  function action(act, t, c) {
    const m = model(c), g = graph(c), d = t.dataset;
    switch (act) {
      case 'mgmt-import': m.imp = { mode: 'table' }; c.ui.page = 'graphImport'; break;
      case 'rx-open-ai': m.imp = { mode: 'ai' }; c.ui.page = 'graphImport'; break;
      case 'mgmt-enable': return enableCheck(c, d.gid);
      case 'rx-enable-confirm': { const gid = m.modal?.gid; m.modal = null; window.GP_MANAGEMENT.action('mgmt-enable', { dataset: { gid } }, c); return true; }
      case 'rx-enable-fix': { const p = m.modal; m.modal = null; c.S.selectedGraphId = p.gid; c.S.currentStep = 3; c.ui.page = 'create'; c.ui.s4Tag = p.issues[0].tag.id; m.onlyTodo = true; break; }
      case 'rx-modal-close': m.modal = null; break;
      case 'rx-tag-sel': {
        const lv = Number(d.level);
        if (lv === 0) { c.ui.tagActive = null; c.ui.tagActive2 = null; }
        else if (lv === 1) { c.ui.tagActive = d.id; c.ui.tagActive2 = null; }
        else if (lv === 2) c.ui.tagActive2 = d.id;
        else return true;
        break;
      }
      case 'rx-tag-add': addTag(c, Number(d.level), d.parent); return true;
      case 'rx-goto-content': c.ui.s4Tag = d.id; c.S.currentStep = 3; break;
      case 'rx-ctab': m.ctab = d.tab; if (d.tab === '绩效支持工具') c.ui.lcTab = '工具表单'; break;
      case 'rx-leaf-step': {
        const leaves = leafPaths(g.tagTree), i = leaves.findIndex(x => x.tag.id === c.ui.s4Tag) + Number(d.dir);
        if (leaves[i]) c.ui.s4Tag = leaves[i].tag.id;
        document.querySelector('.admin-workspace .full-shell')?.scrollTo?.({ top: 0 });
        break;
      }
      case 'rx-add-formal': c.ui.s4Tab = d.kind; return window.GP_CONFIG.action('s4-open-add', t, c);
      case 'rx-add-material': c.ui.lcTab = '工具表单'; return window.GP_CONFIG.action('lc-open-add', { dataset: { kind: '资料' } }, c);
      case 'rx-mat-remove': { const v = cfg(g, c.ui.s4Tag), list = materials(v); if (v.informal['工具表单']) v.informal['工具表单']['资料'] = list.filter(x => x.id !== d.id); break; }
      case 'rx-upload-pick': document.querySelector('[data-act="rx-upload-file"]')?.click(); return true;
      case 'rx-up-retry': { const u = m.uploads.find(x => x.id === d.id); if (u) Object.assign(u, { status: 'uploading', progress: 0, error: '', retry: false }); c.render(); tick(); return true; }
      case 'rx-up-clear': m.uploads = m.uploads.filter(u => u.status !== 'failed'); break;
      case 'rx-q-open': {
        // 知识点先按末级标签名匹配，匹配不到再看上级标签。
        const v = cfg(g, c.ui.s4Tag), hit = leafPaths(g.tagTree).find(x => x.tag.id === c.ui.s4Tag);
        const names = hit ? [hit.tag.nm, ...hit.path.map(n => n.nm).reverse()] : [];
        const point = names.map(nm => QUESTION_BANK.find(q => q.point === nm || nm.includes(q.point) || q.point.includes(nm))).find(Boolean)?.point || 'all';
        m.modal = { type: 'qb', tagId: c.ui.s4Tag, bank: 'all', point, diff: v.autoDiff ? LV.filter(L => v.levels.includes(L)) : [], kw: '', query: '', sel: [] };
        break;
      }
      case 'rx-qb-diff': { const p = m.modal; p.diff = p.diff.includes(d.lv) ? p.diff.filter(x => x !== d.lv) : [...p.diff, d.lv]; break; }
      case 'rx-qb-search': m.modal.query = m.modal.kw.trim(); break;
      case 'rx-qb-check': { const p = m.modal; p.sel = t.checked ? [...new Set([...p.sel, d.id])] : p.sel.filter(x => x !== d.id); break; }
      case 'rx-qb-confirm': { const p = m.modal, v = cfg(c.S.graphs[c.S.selectedGraphId], p.tagId); p.sel.forEach(id => { if (!v.questions.includes(id)) v.questions.push(id); }); c.toast(`已引用 ${p.sel.length} 道题`, 'success'); m.modal = null; break; }
      case 'rx-q-remove': { const v = cfg(g, c.ui.s4Tag); v.questions = v.questions.filter(x => x !== d.id); break; }
      case 'rx-imp-mode': m.imp.mode = d.mode; break;
      case 'rx-imp-pick': document.querySelector('[data-act="rx-imp-file"]')?.click(); return true;
      case 'rx-imp-demo': {
        const res = validateWorkbook(c, demoWorkbook(d.ok !== '1'));
        Object.assign(m.imp, { fileName: d.ok === '1' ? '演示-导入建图（正确）.xlsx' : '演示-导入建图（含错误）.xlsx', result: res.fatal ? null : res, fatal: res.fatal || null, sheet: null, col: '', filter: 'all' });
        break;
      }
      case 'rx-imp-reset': m.imp = { mode: 'table' }; break;
      case 'rx-imp-sheet': m.imp.sheet = d.sheet; m.imp.col = ''; break;
      case 'rx-imp-group': m.imp.sheet = d.sheet || m.imp.sheet; m.imp.col = d.col; break;
      case 'rx-imp-csv': downloadIssues(c); return true;
      case 'rx-imp-confirm': {
        const res = m.imp.result; if (!res || res.blocking) return true;
        const draft = buildFromImport(c, res), skipped = res.skipped;
        m.imp = { mode: 'table' };
        c.applyDraft(draft); c.S.currentStep = 2; c.render();
        c.toast(`已新建图谱草稿「${draft.name}」${skipped ? `，跳过 ${skipped} 道错题` : ''}`, 'success');
        return true;
      }
      case 'rx-zip-pick': document.querySelector('[data-act="rx-zip-file"]')?.click(); return true;
      case 'rx-zip-demo': m.imp.ai = { fileName: '合成氨操作工资料包.zip', files: DEMO_PACKAGE, tree: genTree(DEMO_PACKAGE), name: '合成氨操作工资料包' }; break;
      case 'rx-ai-reset': m.imp.ai = null; break;
      case 'rx-ai-del': { const ix = d.path.split('-').map(Number), last = ix.pop(); const list = ix.length ? aiNode(m.imp.ai.tree, ix.join('-')).children : m.imp.ai.tree; list.splice(last, 1); break; }
      case 'rx-ai-apply': applyAi(c); return true;
      default: return false;
    }
    c.render(); return true;
  }
  function change(act, t, c) {
    const m = model(c);
    switch (act) {
      case 'rx-upload-file': startUploads(c, t.files || []); t.value = ''; return true;
      case 'rx-imp-file': if (t.files?.[0]) readWorkbook(c, t.files[0]); t.value = ''; return true;
      case 'rx-zip-file': if (t.files?.length) readPackage(c, [...t.files]); t.value = ''; return true;
      case 'rx-rule': m.rule = t.value; break;
      case 'rx-only-todo': m.onlyTodo = t.checked; break;
      case 'rx-auto-diff': cfg(graph(c), c.ui.s4Tag).autoDiff = t.checked; break;
      case 'rx-qb-bank': m.modal.bank = t.value; break;
      case 'rx-qb-point': m.modal.point = t.value; break;
      case 'rx-imp-filter': m.imp.filter = t.value; break;
      case 'rx-ai-rename': break;
      default: return false;
    }
    c.render(); return true;
  }
  function input(act, t, c) {
    const m = model(c);
    if (act === 'rx-new-name') { m.newName[t.dataset.level + ':' + (t.dataset.parent || '')] = t.value; return true; }
    if (act === 'rx-qb-kw' && m.modal) { m.modal.kw = t.value; return true; }
    if (act === 'rx-ai-name' && m.imp.ai) { m.imp.ai.name = t.value; return true; }
    if (act === 'rx-ai-rename' && m.imp.ai) { const n = aiNode(m.imp.ai.tree, t.dataset.path); if (n) n.nm = t.value; return true; }
    return act.startsWith('rx-');
  }
  function renderOverlays(c) {
    const p = model(c).modal;
    return !p ? '' : p.type === 'qb' ? renderQuestionPicker(c, p) : p.type === 'enable' ? renderEnable(c, p) : '';
  }
  function bind(root, c) {
    ctxNow = c;
    const m = model(c);
    if (m.focus) { const el = root.querySelector(m.focus); m.focus = null; if (el) { el.focus(); } }
    if (root.dataset.rxBound) return;
    root.dataset.rxBound = '1';
    root.addEventListener('keydown', ev => {
      const t = ev.target.closest?.('[data-act]');
      if (ev.key !== 'Enter' || !t) return;
      if (t.dataset.act === 'rx-new-name') { ev.preventDefault(); addTag(ctxNow, Number(t.dataset.level), t.dataset.parent); }
      if (t.dataset.act === 'rx-qb-kw') { ev.preventDefault(); action('rx-qb-search', t, ctxNow); }
    });
    const zone = ev => ev.target.closest?.('[data-rx-drop]');
    root.addEventListener('dragover', ev => { const z = zone(ev); if (!z) return; ev.preventDefault(); z.classList.add('is-over'); });
    root.addEventListener('dragleave', ev => zone(ev)?.classList.remove('is-over'));
    root.addEventListener('drop', ev => {
      const z = zone(ev); if (!z) return;
      ev.preventDefault(); z.classList.remove('is-over');
      const files = [...(ev.dataTransfer?.files || [])]; if (!files.length) return;
      if (z.dataset.rxDrop === 'mat') startUploads(ctxNow, files);
      else if (z.dataset.rxDrop === 'imp') readWorkbook(ctxNow, files[0]);
      else readPackage(ctxNow, files);
    });
  }

  window.GP_REMIX = { renderTags, renderContent, renderImport, renderOverlays, action, change, input, bind, QUESTION_BANK };
})();
