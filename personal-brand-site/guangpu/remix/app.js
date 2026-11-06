/**
 * 光谱四步创建原型 · 应用逻辑
 * 覆盖 SPEC P01–P11。全部数据为模拟，不写后台。
 */
(function () {
  'use strict';

  const G = window.GP;

  /* ================= 状态 ================= */
  let S = null;
  let scores = null;
  let progress = null;
  let ui = {
    page: 'list',        // list | create | import | dashboard | cockpit | noGraph
    listKeyword: '',
    showAnno: false,
    demoMode: false,
    annoBeforeDemo: false,
    sidebarOpen: false,  // 选人抽屉
    modal: null,         // { type, ... }
    popover: null,       // { target, text, title }
    toasts: [],
    pickerSel: new Set(),
    pickerPage: 1,
    pickerFilter: { keyword: '', tree: 'ORGANIZATION', nodeId: null },
    cockpitGraphId: 'A',
    importPreview: null,
    importExecResult: null,
    showFailMode: false,
    actor: { userId: 'admin', userName: '管理员（模拟）' },
    lastAction: '',
    // 标签栏：当前展开的一级/二级
    tagActive: null,
    tagActive2: null,
    // 第四步：当前标签、内容页签、搜索与筛选
    s4Tag: null,
    s4Tab: '课程',
    s4Kw: '',
    s4SideKw: '',
    s4FilterLevel: 'all',
    // 驾驶舱：左侧筛选（按部门/群组/岗位/图谱）、选中范围、图表交互
    cpTab: 'ORGANIZATION',
    cpChecked: {},        // { groupKey: [gpId...] }
    cpKeyword: '',
    cpTrendTag: null,     // 趋势图当前一级标签
    cpRankTag: null,      // 排名当前标签
    cpQuarter: '当前',
    // 学员仪表盘：图谱切换弹窗、一级/二级标签选中、排行弹层
    pdGraphModal: false,
    pdGraphPick: null,
    pdL1: null,
    pdL2: null,
    pdRankOpen: false,
    pdTagTab: '课程',
    pdPage: 1,
  };

  function resetAll() {
    S = G.createInitialState();
    scores = G.createScores();
    progress = G.createProgress();
    ui.lcPicker = null; ui.lcTab = '工具表单';
    ui.mgmt = null; ui.cockpitAdmin=null; ui.cpConfigId=null;
    clearLearnerContext();
    ui.learnerTab = 'fullState';
    ui.dashboardGraphId = null;
    ui.modal = null;
    ui.popover = null;
    ui.sidebarOpen = false;
    ui.importPreview = null;
    ui.importExecResult = null;
    ui.lastAction = '';
    ui.tagActive = null;
    ui.tagActive2 = null;
    ui.s4Tag = null;
    ui.s4Tab = '课程';
    ui.s4Kw = '';
    ui.s4SideKw = '';
    ui.s4FilterLevel = 'all';
    ui.cpTab = 'ORGANIZATION';
    ui.cpChecked = {};
    ui.cpKeyword = '';
    ui.cpTrendTag = null;
    ui.cpRankTag = null;
    // 初始化关系：A 自动关联 + 手动加入；B 自动关联 + 手动加入
    seedRelations();
    toast('演示数据已重置', 'success');
    render();
  }

  function rel(graphId, userId) {
    if (!S.rel[graphId]) S.rel[graphId] = {};
    if (!S.rel[graphId][userId]) {
      S.rel[graphId][userId] = { sources: [], excluded: false, retained: false, order: S.seq++ };
    }
    return S.rel[graphId][userId];
  }

  function addSource(graphId, userId, type, label) {
    const r = rel(graphId, userId);
    if (!r.sources.some((s) => s.type === type && s.label === label)) {
      r.sources.push({ type, label });
    }
    return r;
  }

  function removeSource(graphId, userId, type, label) {
    const r = (S.rel[graphId] || {})[userId];
    if (!r) return;
    r.sources = r.sources.filter((s) => !(s.type === type && (!label || s.label === label)));
  }

  /** 按当前配置与成员重算自动来源（模拟「同步」）。autoAssociate=false 时不按岗增删（除非 forceSeed 一次性灌入）。 */
  function runSync(graphId, opts) {
    const o = opts || {};
    const g = S.graphs[graphId];
    if (!g || (g.status !== 'enabled' && !(o.includeDraft && g.status==='draft'))) return { added: [], removed: [], skippedExcluded: [], off: false };
    const autoOn = g.autoAssociate !== false;
    if (!autoOn && !o.forceSeed) {
      return { added: [], removed: [], skippedExcluded: [], off: true };
    }
    const added = [];
    const removed = [];
    const skippedExcluded = [];

    const hits = new Map(); // userId -> [{type,label}]
    S.persons.forEach((p) => {
      const list = [];
      if (p.positionIds.some((id) => g.positionIds.includes(id))) {
        list.push({ type: 'position', label: '岗位：' + p.positionIds.filter((id) => g.positionIds.includes(id)).map(posName).join('、') });
      }
      if ((g.groupIds || []).length && p.groupIds.some((id) => g.groupIds.includes(id))) {
        list.push({ type: 'group', label: '群组：' + p.groupIds.filter((id) => g.groupIds.includes(id)).map(groupName).join('、') });
      }
      if (list.length) hits.set(p.userId, list);
    });

    const bucket = S.rel[graphId] || {};
    // 1) 补：命中且未排除
    hits.forEach((list, uid) => {
      const r = bucket[uid];
      if (r && r.excluded) {
        skippedExcluded.push(uid);
        return;
      }
      const before = r ? r.sources.length : 0;
      if(r) r.sources=r.sources.filter(source=>source.type==='manual');
      list.forEach((s) => addSource(graphId, uid, s.type, s.label));
      const after = S.rel[graphId][uid].sources.length;
      if (after > before) added.push(uid);
      S.rel[graphId][uid].retained = false;
    });

    // 1b) 仍有手动来源的人在第四步继续维护，保留标记一并清除
    Object.keys(bucket).forEach((uid) => {
      if (bucket[uid].sources.some((s) => s.type === 'manual')) bucket[uid].retained = false;
    });

    // 2) 减：服务端不再命中的自动来源移除
    Object.keys(bucket).forEach((uid) => {
      const r = bucket[uid];
      if (!r) return;
      const nextTypes = new Set((hits.get(uid) || []).map((s) => s.type));
      const before = r.sources.length;
      r.sources = r.sources.filter((s) => {
        if (s.type === 'manual') return true;
        return nextTypes.has(s.type);
      });
      if (r.sources.length < before) removed.push(uid);
      if (r.sources.length === 0 && !r.excluded) {
        // 无有效来源 → 取消关联
        delete bucket[uid];
      }
    });

    if (o.forceSeed) g.manualSeeded = true;
    return { added, removed, skippedExcluded, off: false };
  }

  /** 关闭自动同步时：按当前岗位一次性灌入学员（可再删），标记已灌过 */
  function seedOnceFromPositions(graphId) {
    const g = S.graphs[graphId];
    if (!g || g.manualSeeded) return { added: [], removed: [], skippedExcluded: [], off: false };
    const r = runSync(graphId, { includeDraft: true, forceSeed: true });
    const bucket = S.rel[graphId] || {};
    Object.keys(bucket).forEach((uid) => {
      const row = bucket[uid];
      if (!row || row.excluded) return;
      const hasAuto = row.sources.some((s) => s.type === 'position' || s.type === 'group');
      if (hasAuto) {
        row.sources = row.sources.filter((s) => s.type === 'manual');
        if (!row.sources.some((s) => s.type === 'manual')) {
          addSource(graphId, uid, 'manual', '初始化按岗灌入');
        }
      }
    });
    g.manualSeeded = true;
    return r;
  }

  function seedRelations() {
    // A：开启自动 → 同步一次
    runSync('A');
    // 王芳（u004）岗位为综合管理岗，不在任何图谱的关联范围内，
    // 因此只能靠手动加入 → 验证 D03/A12「手动人员不能因无岗位配置被统计漏掉」
    addSource('A', 'u004', 'manual', '手动添加');
    // 孙丽、郑雪不在 A 的范围，刻意无图 → 用于无有效图谱名单
    // B：自动关联之外，再手动补两个范围外的人（模拟第四步手动调整）
    runSync('B');
    addSource('B', 'u001', 'manual', '手动添加');
    addSource('B', 'u003', 'manual', '手动添加');
  }

  /* ================= 小工具 ================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function personName(uid) {
    const p = S.persons.find((x) => x.userId === uid);
    return p ? p.userName : uid;
  }
  function personCode(uid) {
    const p = S.persons.find((x) => x.userId === uid);
    return p ? p.employeeCode : '';
  }
  function posName(id) {
    const p = G.positions.find((x) => x.id === id);
    return p ? p.nm : id;
  }
  function groupName(id) {
    const g = G.groups.find((x) => x.id === id);
    return g ? g.nm : id;
  }
  function graphName(id) { return S.graphs[id] ? S.graphs[id].name : id; }

  function updateToasts() {
    const stack = document.querySelector('.toast-stack');
    if (stack) stack.innerHTML = ui.toasts.map(t => `<div class="toast ${t.type}">${esc(t.msg)}</div>`).join('');
  }

  function toast(msg, type) {
    const id = Math.random().toString(36).slice(2);
    ui.toasts.push({ id, msg, type: type || 'info' });
    if (ui.toasts.length > 2) ui.toasts = ui.toasts.slice(-2);
    updateToasts();
    setTimeout(() => {
      ui.toasts = ui.toasts.filter(t => t.id !== id);
      updateToasts();
    }, 3200);
  }

  function srcTags(r) {
    const out = [];
    const seen = new Set();
    (r.sources || []).forEach((s) => {
      const key = s.type + s.label;
      if (seen.has(key)) return;
      seen.add(key);
      const cls = s.type === 'manual' ? 'tag-manual' : s.type === 'position' ? 'tag-position' : 'tag-group';
      const label = s.type === 'manual' ? '手动' : s.type === 'position' ? '岗位' : '群组';
      out.push(`<span class="tag ${cls}" title="${esc(s.label)}">${label}</span>`);
    });
    if (r.retained) out.push('<span class="tag tag-retained">保留</span>');
    if (r.excluded) out.push('<span class="tag tag-excluded">已排除</span>');
    return out.join('');
  }

  function srcDetail(r) {
    return (r.sources || []).map((s) => esc(s.label)).join('；');
  }

  /* ================= 渲染入口 ================= */
  function render() {
    const root = document.getElementById('app');
    if (['create','import'].includes(ui.page) && !S.graphs[S.selectedGraphId]) ui.page = 'list';
    const cockpit = ui.page === 'cockpit';
    const learner = ui.page === 'dashboard';
    const footer = ui.page === 'create' ? renderStep1Footer() : '';
    root.innerHTML = (cockpit
        ? `<div class="full-shell is-flush"><button class="cockpit-return btn" data-act="go" data-page="list">返回图谱中心</button>${renderPage()}</div>`
        : `<div class="admin-host ${learner ? 'learner-host' : ''}">${renderAdminFrame()}<div class="admin-workspace"><div class="full-shell ${learner ? 'learner-page' : 'admin-page'} ${footer ? 'has-footer' : ''}">${renderPage()}</div>${footer}</div></div>`)
      + `<div class="demo-controls"><span>演示数据</span><button class="btn btn-sm" data-act="exit-demo">退出演示</button></div>`
      + renderOverlays();
    syncPresentation();
    bind(root);
    window.GP_BUILDER?.bind(root, builderContext());
    window.GP_REMIX?.bind(root, extensionContext());
    if (ui.popover) positionPopover();
  }

  // 切换展示状态只更新属性，不重建表单、弹窗或滚动容器。
  function syncPresentation() {
    const root = document.getElementById('app');
    root.classList.toggle('show-anno', ui.showAnno && !ui.demoMode);
    root.classList.toggle('is-demo', ui.demoMode);
    root.classList.toggle('is-management', ui.page !== 'dashboard' && ui.page !== 'cockpit');
    const shell = root.querySelector('.full-shell');
    if (shell) shell.classList.toggle('show-anno', ui.showAnno && !ui.demoMode);
    root.querySelector('.review-tools')?.classList.toggle('open', !!ui.reviewToolsOpen);
    root.querySelector('[data-act="review-tools"]')?.setAttribute('aria-expanded', String(!!ui.reviewToolsOpen));
    const toggle = root.querySelector('[data-act="toggle-anno"]');
    if (toggle) {
      toggle.setAttribute('aria-checked', String(ui.showAnno));
      toggle.classList.toggle('on', ui.showAnno);
      toggle.innerHTML = `${ui.showAnno ? '隐藏备注' : '显示备注'}<span class="proto-anno-dot"></span>`;
    }
  }

  function builderContext() {
    return { positions:G.positions, refresh:render, onApply(draft) {
      const id = newGraph();
      Object.assign(S.graphs[id], draft, { id, status:'draft', creator:'管理员', createdAt:new Date().toLocaleString('sv-SE') });
      S.selectedGraphId=id; S.currentStep=1; ui.page='create';
      ui.tagActive=null; ui.tagActive2=null; ui.s4Tag=null;
      ui.lastAction='应用 AI 帮建草稿'; render(); toast('草稿已生成，请检查岗位、标签与内容后保存', 'success');
    } };
  }

  function extensionContext() {
    return { S, G, ui, esc, render, toast, runSync, personName, posName, groupName, graphName,
      pdOverall, pdStudy, pdScores, learnerGraphs, renderPersonal: renderPersonalDashboard,
      effectiveMembers: gid => G.effectiveMembers(S, gid),
      applyDraft: draft => builderContext().onApply(draft),
      delegate(act, data = {}) {
        const button = document.createElement('button');
        button.dataset.act = act;
        Object.entries(data).forEach(([key, value]) => button.dataset[key] = value);
        onClick({ target: button, preventDefault() {} });
      }
    };
  }

  function platformIcon(i) {
    const paths = ['M3 10 12 3l9 7v11h-6v-7H9v7H3Z', 'M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0M3 21v-4c0-5 18-5 18 0v4', 'M4 5h16v4H4zM4 11h16v4H4zM4 17h16v4H4z', 'M7 3h10v6h4v12H3V9h4zM8 13h8M8 17h8', 'M4 4h16v13H4zM8 21h8M12 17v4', 'M4 4h13v16H4zM8 8h6M8 12h6M20 7v14', 'M8 3h8v5h5v13H3V8h5zM8 12h8M8 16h8', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M7 12h10M12 7v10'];
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[i % paths.length]}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function renderAdminFrame() {
    const learner = ui.page === 'dashboard';
    const names = ['首页','组织结构','资源管理','混合培训','线上培训','评估调研','考试管理','学习社区','报表管理','平台设置','全部应用'];
    return `<header class="admin-top"><span class="admin-brand" aria-label="时代光华">时代<br>光华</span>
      <button class="platform-home" data-act="go" data-page="list">首页</button>
      <button class="admin-app-tab ${!learner ? 'active' : ''}" data-act="go" data-page="list">光谱</button>
      <button class="platform-tab ${learner ? 'active' : ''}" data-act="go" data-page="dashboard">学员仪表盘</button>
      <button class="platform-tab" data-act="go" data-page="cockpit">光谱驾驶舱</button>
      <span class="admin-account"><span class="platform-search" aria-hidden="true">⌕ 搜索应用</span>
        <button class="platform-tab" data-act="pd-choose-user">⇆ 切换学员</button><span>${esc(learner ? personName(S.studentUserId) : '管理员')}</span></span></header>
      <aside class="admin-rail" aria-label="平台导航示意">${names.map((name, i) => `<span class="${i === 10 ? 'selected' : ''}">${platformIcon(i)}${name}</span>`).join('')}</aside>`;
  }

  function renderReviewTools() {
    return `<div class="review-tools ${ui.reviewToolsOpen ? 'open' : ''}"><div class="review-panel" role="group" aria-label="演示设置选项">
      <button class="proto-anno" data-act="toggle-anno" role="switch" aria-checked="${!!ui.showAnno}">${ui.showAnno ? '隐藏备注' : '显示备注'}<span class="proto-anno-dot"></span></button>
      <button data-act="enter-demo">客户演示</button><button data-act="reset">重置演示</button>
      </div><button class="review-settings" data-act="review-tools" aria-expanded="${!!ui.reviewToolsOpen}">演示设置</button></div>`;
  }

  /* 管理页页头：白底、左标题、右操作；展示端使用各自独立页头。 */
  function gpHead(title, extra) {
    return `<div class="gp-head">
      <div class="gp-head-title">${esc(title)}</div>
      <div class="gp-head-ops">${extra || ''}</div>
    </div>`;
  }

  function renderPage() {
    switch (ui.page) {
      case 'list': return window.GP_MANAGEMENT ? window.GP_MANAGEMENT.render(extensionContext()) : renderList();
      case 'create': return renderCreate();
      case 'import': return renderImport();
      case 'graphImport': return window.GP_REMIX.renderImport(extensionContext());
      case 'cockpitAdmin': return window.GP_COCKPIT_ADMIN?.render(extensionContext()) || '';
      case 'cockpit': return renderCockpit();
      case 'dashboard': return renderDashboard();
      case 'noGraph': return renderNoGraph();
      default: return '';
    }
  }

  /* ================= 光谱列表（默认页） ================= */
  function renderList() {
    const kw = String(ui.listKeyword || '').trim();
    const rows = Object.keys(S.graphs)
      .map((gid) => ({ gid, g: S.graphs[gid] }))
      .filter(({ g }) => !kw || g.name.includes(kw))
      .sort((a, b) => a.g.order - b.g.order);
    // 无有效图谱学员数：可访问图谱为空的人
    const noGraphCount = S.persons.filter((p) => G.accessibleGraphs(S, p.userId).length === 0).length;

    return `
      ${gpHead('光谱', `
        <button class="btn btn-sm" data-act="go" data-page="noGraph">无有效图谱学员${noGraphCount ? `（${noGraphCount}）` : ''}</button>
        <button class="btn btn-primary btn-sm" data-act="create-graph">+ 新建光谱</button>`)}

      <div class="card">
        <div class="card-head"><h2>全部光谱</h2>
          <div class="extra"><input class="input" style="width:220px;height:30px;" placeholder="搜索光谱名称" data-act="list-search" value="${esc(ui.listKeyword || '')}">
            ${kw ? `<span class="hint" style="margin:0 0 0 8px;">匹配 ${rows.length} 条</span>` : ''}</div>
        </div>
        <div class="card-body" style="padding:0;">
          <table class="tbl list-tbl">
            <thead><tr>
              <th style="width:52px;">#</th>
              <th>光谱名称</th>
              <th style="width:110px;">状态</th>
              <th style="width:100px;">关联岗位</th>
              <th style="width:100px;">关联群组</th>
              <th style="width:110px;">有效学员</th>
              <th style="width:110px;">内容版本</th>
              <th style="width:300px;">操作</th>
            </tr></thead>
            <tbody>
              ${rows.map(({ gid, g }) => {
                const eff = G.effectiveMembers(S, gid).filter((m) => !m.excluded).length;
                return `<tr data-gid="${gid}">
                  <td class="mono" style="color:rgba(0,0,0,.45)">${g.order}</td>
                  <td><b>${esc(g.name)}</b></td>
                  <td>${statusTag(g)}</td>
                  <td>${g.positionIds.length} 个</td>
                  <td>${g.groupIds.length} 个</td>
                  <td>${eff} 人</td>
                  <td class="mono" style="font-size:12px;color:rgba(0,0,0,.45)">${esc(g.contentVersion)}</td>
                  <td class="list-ops">
                    <button class="btn-link" data-act="open-graph" data-gid="${gid}">进入配置</button>
                    <button class="btn-link" data-act="open-import" data-gid="${gid}">评分数据导入</button>
                    <button class="btn-link" data-act="toggle-status-row" data-gid="${gid}">${g.status === 'enabled' ? '停用' : '启用'}</button>
                  </td>
                </tr>`;
              }).join('') || '<tr><td colspan="9"><div class="empty">没有匹配的光谱</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div class="anno"><div class="hint">图谱是团队级配置。进入具体光谱后才可编辑四步内容；评分数据导入按光谱单独执行。</div></div>
    `;
  }

  /* ================= 创建 / 编辑四步 ================= */
  const STEPS = [
    { n: 1, title: '基本信息', desc: '名称与关联范围' },
    { n: 2, title: '编辑标签', desc: '能力标签树' },
    { n: 3, title: '配置标签内容', desc: '课程 / 考试 / 资料' },
    { n: 4, title: '关联学员', desc: '学员名单与来源' },
  ];

  function renderCreate() {
    return `
      ${gpHead('光谱详情', '')}
      ${renderSteps()}

      ${renderStepBody()}
    `;
  }

  /* 第一步底部固定操作条：关闭 / 下一步 / 保存（对齐真实后台） */
  function renderStep1Footer() {
    return `<div class="step-actions">
      <button class="btn" data-act="close-create">关闭</button>
      ${S.currentStep > 1 ? `<button class="btn" data-act="step" data-step="${S.currentStep - 1}">上一步</button>` : ''}
      ${S.currentStep < STEPS.length ? (S.currentStep === 1
        ? '<button class="btn btn-primary" data-act="step1-next">下一步</button>'
        : `<button class="btn btn-primary" data-act="step" data-step="${S.currentStep + 1}">下一步</button>`) : ''}
      <button class="btn btn-primary" data-act="save-draft">保存</button>
    </div>`;
  }

  function renderSteps() {
    let html = '<div class="steps" role="tablist">';
    STEPS.forEach((s, i) => {
      if (i > 0) {
        html += `<div class="step-line ${S.currentStep > i ? 'done' : ''}"></div>`;
      }
      const cls = S.currentStep === s.n ? 'active' : S.currentStep > s.n ? 'done' : '';
      html += `<button class="step ${cls}" role="tab" aria-selected="${S.currentStep === s.n}" data-act="step" data-step="${s.n}">
        <span class="step-num"><span>${s.n}</span></span>
        <span class="step-txt"><span class="step-title">${esc(s.title)}</span></span>
      </button>`;
    });
    html += '</div>';
    return html;
  }

  function renderStepBody() {
    // remix：第二、三步改由 remix.js 渲染，原 renderStep3/renderStep4 保留未用。
    const fn = [() => renderStep1() + renderStep2(), () => window.GP_REMIX.renderTags(extensionContext()), () => window.GP_REMIX.renderContent(extensionContext()), renderStep5][S.currentStep - 1];
    return `<section class="card step-card" aria-label="${esc(STEPS[S.currentStep - 1].title)}"><div class="card-body">${fn()}</div></section>`;
  }

  /* --- 第一步 --- */
  function renderStep1() {
    const gid = S.selectedGraphId;
    const g = S.graphs[gid];
    const autoOn = g.autoAssociate !== false;
    const syncLocked = g.autoSyncLocked || g.status !== 'draft';
    return `
      <div class="form-item">
        <div class="form-label required">图谱名称</div>
        <div class="form-ctrl"><input class="input" data-act="field" data-field="name" value="${esc(g.name)}"></div>
      </div>

      <div class="form-item position-form-item">
        <div class="form-label">关联岗位</div>
        <div class="form-ctrl">
          <div class="scope-box position-scope">
            <button class="btn btn-sm scope-btn" data-act="pick-scope">选择岗位</button>
            <div class="scope-row">
              <div class="scope-row-v">
                ${g.positionIds.length
                  ? g.positionIds.map((id) => `<span class="tag tag-position">${esc(posName(id))} <button class="btn-link" data-act="drop-pos" data-id="${id}" aria-label="移除岗位 ${esc(posName(id))}" style="font-size:12px;padding:0;">×</button></span>`).join('')
                  : '<span class="scope-empty">未选择</span>'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="form-item">
        <div class="form-label">自动同步</div>
        <div class="form-ctrl">
          <div class="switch-wrap">
            <button class="switch" role="switch" aria-checked="${autoOn}" data-act="toggle-auto" aria-label="自动同步开关" ${syncLocked ? 'disabled' : ''}></button>
            <span class="switch-hint switch-label">${autoOn ? '已开启' : '已关闭'}</span>
            <span class="auto-sync-help">
              <button class="help-icon" type="button" aria-label="查看自动同步说明" aria-describedby="auto-sync-tooltip">?</button>
              <span class="auto-sync-tooltip" id="auto-sync-tooltip" role="tooltip">
                <span class="sync-help-section">
                  <strong>开启自动同步</strong>
                  <span>岗位人员变动时，自动添加或移除对应学员，不支持手动添加学员。</span>
                  <span>未选岗位时，不会自动添加学员。</span>
                </span>
                <span class="sync-help-section">
                  <strong>关闭自动同步</strong>
                  <span>创建时，将所选岗位人员一次性加入名单，之后岗位变动不再同步。</span>
                  <span>后续在第四步「关联学员」手动增删；未选岗位时，也需在此手动添加。</span>
                </span>
                <span class="sync-help-section">创建过程中请勿反复切换，以免学员名单混乱。</span>
              </span>
            </span>
            <span class="hint sync-lock-hint">选中并完成创建后，无法修改。</span>
          </div>
        </div>
      </div>

      <div class="anno">
        <div class="hint">首期关联维度仅「岗位」；部门 / 群组后续再做。一个图谱可关联多个岗位，同一岗位也可被多张图谱关联。</div>
        <div class="hint">自动同步＝现在这套岗位强绑定；手动＝只在初始化时按岗给名单，之后纯手动增改。</div>
      </div>
    `;
  }

  /* --- 第二步 --- */
  function renderStep2() {
    const g = S.graphs[S.selectedGraphId];
    return `
      <div class="form-item">
        <div class="form-label">岗位意义</div>
        <div class="form-ctrl"><textarea class="textarea learner-display-hint" data-act="field" data-field="briefing" placeholder="该部分信息将在学员端展示">${esc(g.briefing)}</textarea>
</div>
      </div>
      <div class="form-item">
        <div class="form-label">岗位职责</div>
        <div class="form-ctrl"><textarea class="textarea" data-act="field" data-field="duty">${esc(g.duty)}</textarea></div>
      </div>
      <div class="anno"><div class="hint">沿用现有步骤位置与样式，不重新设计业务。</div></div>`;
  }

  /* --- 第三步：三级标签栏，末级不固定层级 --- */
  function renderStep3() {
    const g = S.graphs[S.selectedGraphId];
    const rootNodes = g.tagTree || [];

    // 每栏新增均从资源侧栏选择，挂载到该栏的明确父节点。
    const colHead = (title, parentNm, parentId, level) => `<div class="tag-col-head">
      <div class="tag-col-title">${esc(title)}</div>
      ${level>1 ? `<div class="tag-parent">上一级标签：<span class="tag-parent-val">${esc(parentNm || '未选择')}</span></div>` : ''}
      <div class="tag-col-bar"><span class="tag-col-ops">
        <button class="btn btn-sm btn-primary" data-act="tag-new" data-level="${level}" data-parent="${parentId || ''}" ${level>1&&!parentId?'disabled':''}>新增</button>
        <button class="btn-link tag-clear" data-act="tag-clear" data-parent="${parentId || ''}" ${level>1&&!parentId?'disabled':''}>清空</button>
      </span></div>
    </div>`;

    // 一栏节点列表
    const chips = (nodes, parentId) => {
      if (!nodes.length) {
        return '<div class="tag-empty">暂无标签</div>';
      }      const list = nodes.map((n) => `<span class="tag-chip ${ui.tagActive === n.id || ui.tagActive2 === n.id ? 'is-active' : ''}" data-act="${parentId && parentId !== null ? 'tag-pick2' : 'tag-pick'}" data-id="${n.id}" role="button" tabindex="0">
        ${esc(n.nm)}<button class="tag-chip-x" data-act="tag-del" data-id="${n.id}" aria-label="删除标签 ${esc(n.nm)}">×</button>
      </span>`).join('');
      return list;
    };

    // 当前选中的一级 / 二级节点
    const l1 = rootNodes.find((n) => n.id === ui.tagActive) || null;
    const l2 = l1 && l1.children ? (l1.children.find((n) => n.id === ui.tagActive2) || null) : null;

    const arrow = (on) => `<div class="tag-arrow${on ? ' is-on' : ''}" data-act="tag-jump" data-id="${on ? on.id : ''}" aria-hidden="true">»</div>`;

    const col3 = l2 && l2.children && l2.children.length
      ? `<div class="tag-list">${chips(l2.children, l2.id)}</div>`
      : (l2
        ? `<div class="tag-list">${chips([], l2.id)}</div>`
        : '<div class="tag-empty is-idle">请先选择上一级标签</div>');

    return `
      <div class="anno"><div class="notice notice-info"><span class="notice-icon">i</span>
        <div>末级不固定为第三级：某个标签一旦<b>没有下级</b>即为末级；四步之间不强制三级齐全。删除上级标签会连带删除其下级。</div>
      </div></div>
      <div class="tag-cols">
        <div class="tag-col">
          ${colHead('一级标签', '', null, 1)}
          <div class="tag-list">${chips(rootNodes, null)}</div>
        </div>
        ${arrow(l1)}
        <div class="tag-col ${l1 ? '' : 'is-idle'}">
          ${colHead('二级标签', l1 ? l1.nm : '未选择', l1 ? l1.id : null, 2)}
          <div class="tag-list" data-level="2">
            ${l1
              ? chips(l1.children || [], l1.id)
              : '<div class="tag-empty is-idle">请先选择一级标签</div>'}
          </div>
        </div>
        ${arrow(l2)}
        <div class="tag-col ${l2 ? '' : 'is-idle'}">
          ${colHead('三级标签', l2 ? l2.nm : '未选择', l2 ? l2.id : null, 3)}
          ${col3}
        </div>
      </div>`;
  }

  /* --- 第四步：已选标签 × 适用层级 × 正式学习内容 --- */
  function renderStep4() {
    const g = S.graphs[S.selectedGraphId];
    const leaves = G.leafTags(g.tagTree);
    if (!g.step4) g.step4 = {};
    // 首次进入：用一个末级标签挂上示例内容，避免整页空态（对齐截图的「已选」两条）
    if (!Object.keys(g.step4).length && leaves.length) {
      const seed = G.defaultStep4Content[S.selectedGraphId];
      if (seed) g.step4[leaves[0].id] = { levels: ['L2'], items: seed.map((s) => ({ ...s })) };
    }
    if (!leaves.some((t) => t.id === ui.s4Tag)) ui.s4Tag = leaves.length ? leaves[0].id : null;
    const cur = leaves.find((t) => t.id === ui.s4Tag) || null;

    // 已选标签左栏：全部末级标签，按搜索与层级筛选后展示
    const sideKw = String(ui.s4SideKw || '').trim();
    const lvFilter = ui.s4FilterLevel || 'all';
    const shownLeaves = leaves.filter((t) => {
      if (sideKw && !t.nm.includes(sideKw)) return false;
      if (lvFilter !== 'all') {
        const lv = (g.step4[t.id] && g.step4[t.id].levels) || [];
        if (!lv.includes(lvFilter)) return false;
      }
      return true;
    });
    const leftList = shownLeaves.length
      ? shownLeaves.map((t) => `<button class="s4-tag ${ui.s4Tag === t.id ? 'is-active' : ''}" data-act="s4-pick-tag" data-id="${t.id}">
          <span class="s4-tag-dot"></span>${esc(t.nm)}
        </button>`).join('')
      : (leaves.length
        ? '<div class="placeholder-empty">没有匹配的标签</div>'
        : '<div class="placeholder-empty">尚未配置标签<br><span style="font-size:12px;">请先在第二步添加</span></div>');

    // 层级选择
    const levels = ['L1', 'L2', 'L3', 'L4', 'L5'];
    const chosen = (cur && g.step4[cur.id] && g.step4[cur.id].levels) || [];
    const levelBtns = levels.map((L) => `<button class="s4-level ${chosen.includes(L) ? 'is-on' : ''}"
      data-act="s4-level" data-lv="${L}" aria-pressed="${chosen.includes(L)}">${L}</button>`).join('');

    return `
      <div class="s4-wrap">
        <aside class="s4-side">
          <div class="s4-side-title">已选标签</div>
          <div class="s4-side-search">
            <input class="input" placeholder="请输入" data-act="s4-kw-side" value="${esc(ui.s4SideKw || '')}" style="height:30px;">
            <span class="pos-side-search-icon" aria-hidden="true">⌕</span>
          </div>
          <div class="s4-side-filter">
            <select class="select-native" data-act="s4-filter-level" style="height:30px;width:100%;font-size:12px;">
              <option value="all" ${(ui.s4FilterLevel || 'all') === 'all' ? 'selected' : ''}>层级筛选：全部</option>
              ${levels.map((L) => `<option value="${L}" ${ui.s4FilterLevel === L ? 'selected' : ''}>层级筛选：${L}</option>`).join('')}
            </select>
          </div>
          <div class="s4-side-list">${leftList}</div>
        </aside>

        <div class="s4-main">
          ${cur && g.builderSuggestions?.find(x=>x.tagId===cur.id)?.text ? `<div class="notice notice-info"><div>学习内容建议：${esc(g.builderSuggestions.find(x=>x.tagId===cur.id).text)}</div></div>` : ''}
          <div class="s4-block">
            <div class="s4-block-head">
              <div class="s4-block-title">选择标签适用层级</div>
              <a class="s4-link" href="javascript:void(0)" data-act="s4-level-help">配置标签适用层级和职级对应关系</a>
            </div>
            <div class="s4-levels">${levelBtns}</div>
            <div class="s4-hint">提示：选择了标签适用层级后，该图谱关联的岗位下的学员，将根据标签适用层级的职级判断对其是否展示该标签。若未选择，则该标签对图谱关联的岗位下所有学员展示。</div>
          </div>

          ${window.GP_CONFIG.renderFormal(extensionContext())}
          ${window.GP_CONFIG.renderInformal(extensionContext())}
        </div>
      </div>`;
  }

  /* --- 第四步：关联学员 --- */
  function renderStep5() {
    const gid = S.selectedGraphId;
    const g = S.graphs[gid];
    if (g.autoAssociate !== false) runSync(gid,{includeDraft:true});
    else if (!g.manualSeeded && g.positionIds.length) seedOnceFromPositions(gid);
    const members = G.effectiveMembers(S, gid);
    if (ui.memberList?.gid !== gid) ui.memberList = { gid, selected: new Set(), dept: '', keyword: '' };
    const list = ui.memberList;
    const effectiveIds = new Set(members.map(m => m.userId));
    list.selected = new Set([...list.selected].filter(id => effectiveIds.has(id)));
    const filtered = members.filter(m => {
      const p = S.persons.find(p => p.userId === m.userId);
      return (!list.dept || p.deptId === list.dept) && (!list.keyword || [p.employeeCode, p.userName, p.loginName].some(v => String(v || '').toLowerCase().includes(list.keyword.toLowerCase())));
    });
    list.visibleIds = filtered.map(m => m.userId);
    const allSelected = filtered.length > 0 && filtered.every(m => list.selected.has(m.userId));

    let rows = filtered.map((m) => {
      const p = S.persons.find((x) => x.userId === m.userId) || {};
      return `<tr data-uid="${m.userId}">
        <td><input type="checkbox" data-act="member-select" data-uid="${m.userId}" aria-label="选择 ${esc(p.userName)}" ${list.selected.has(m.userId) ? 'checked' : ''}></td>
        <td class="mono">${esc(p.employeeCode || '')}</td>
        <td>${esc(p.userName || m.userId)}</td>
        <td>${esc(p.loginName || '—')}</td>
        <td>${esc(p.deptName || '')}</td>
        <td>${esc((p.positionIds || []).map(posName).join('、') || '—')}</td>
        ${g.autoAssociate === false ? `<td><button class="btn-link danger" data-act="remove-member" data-uid="${m.userId}">移出</button></td>` : ''}
      </tr>`;
    }).join('');

    if (!filtered.length) {
      rows = `<tr><td colspan="${g.autoAssociate === false ? 7 : 6}"><div class="empty"><div class="empty-title">${members.length ? '暂无符合条件的人员' : '暂无关联学员'}</div></div></td></tr>`;
    }

    return `
      <div class="toolbar member-toolbar">
        ${g.autoAssociate === false ? '<button class="btn btn-primary" data-act="open-picker">添加人员</button><button class="btn" data-act="member-import-open">导入人员</button>' : ''}
        ${g.autoAssociate === false ? `<button class="btn" data-act="member-remove-selected" ${list.selected.size ? '' : 'disabled'}>移出人员</button>` : ''}
        <div class="spacer"></div>
        <div class="member-filters">
          <select class="select-native" data-act="member-dept" aria-label="部门查询"><option value="">部门查询</option>${G.departments.map(d => `<option value="${d.id}" ${list.dept === d.id ? 'selected' : ''}>${esc(d.nm)}</option>`).join('')}</select>
          <input class="input" data-act="member-keyword" aria-label="工号/姓名/用户名" placeholder="工号/姓名/用户名" value="${esc(list.keyword)}">
          <button class="btn btn-primary" data-act="member-filter">筛选</button>
        </div>
      </div>

      <div class="table-wrap"><table class="tbl member-table">
        <thead><tr><th style="width:48px;"><input type="checkbox" data-act="member-select-all" aria-label="选择当前筛选结果全部人员" ${allSelected ? 'checked' : ''} ${filtered.length ? '' : 'disabled'}></th><th>工号</th><th>姓名</th><th>用户名</th><th>部门</th><th>岗位</th>${g.autoAssociate === false ? '<th style="width:80px;">操作</th>' : ''}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    `;
  }

  /* ================= 评分导入 ================= */
  function renderImport() {
    const rows = ui.importPreview;
    const exec = ui.importExecResult;
    const hasError = rows && rows.some((r) => r.errors.length);
    const errors=rows?.filter(r=>r.errors.length).length || 0;
    const dirty=rows?.filter(r=>r.dirty).length || 0;
    const filtered=(rows || []).filter(r=>ui.importFilter==='error'?r.errors.length:ui.importFilter==='valid'?!r.errors.length:true);

    let table = '';
    if (!rows) {
      table = `<div class="empty"><div class="empty-title">暂无待导入数据</div>
        <div>按上方三步：选学员下载模板，填好新成绩后上传，在这里核对、修改并提交。</div></div>`;
    } else {
      // 列与下载模板一致；文件未填的核对字段用系统数据补齐。
      table = `<div class="table-wrap"><table class="tbl import-table">
        <thead><tr>
          <th style="width:52px;">行号</th><th>工号</th><th>姓名</th><th>用户名</th><th>部门</th><th>岗位</th><th>一级标签</th><th>二级标签</th><th>三级标签</th>
          <th class="num">最新成绩</th><th class="num" style="width:96px;">新成绩</th><th style="min-width:200px;">校验</th>
        </tr></thead>
        <tbody>
          ${filtered.map((r) => { const p = S.persons.find(x => x.userId === r.userId) || {}; const path = r.pathInput || window.GP_IMPORT.tagPath(r.graphId, r.tagId); return `<tr class="${r.dirty ? 'row-dirty' : r.errors.length ? 'row-error' : ''}" data-row="${r.rowNo}">
            <td class="num">${r.sourceLine || r.rowNo}</td>
            <td class="mono">${esc(r.employeeCode || p.employeeCode || '—')}</td>
            <td>${esc(r.userNameInput || p.userName || '—')}</td>
            <td class="mono">${esc(r.loginInput || p.loginName || '—')}</td>
            <td>${esc(r.deptInput || p.deptName || '—')}</td>
            <td>${esc(r.postInput || (p.positionIds || []).map(posName).join('、') || '—')}</td>
            <td>${esc(path[0] || '—')}</td><td>${esc(path[1] || '—')}</td><td>${esc(path[2] || '—')}</td>
            <td class="num">${r.latest == null ? '<span class="import-muted">未导入</span>' : r.latest}</td>
            <td class="num"><input class="input import-score-input" data-act="import-score" data-row="${r.rowNo}" value="${esc(r.scoreInput ?? (Number.isFinite(r.score) ? r.score : ''))}" inputmode="decimal" aria-label="第 ${r.sourceLine || r.rowNo} 行新成绩" ${exec ? 'disabled' : ''}></td>
            <td style="font-size:12px;">${r.dirty
              ? '<span class="import-dirty">已修改，待校验</span>'
              : r.errors.length
                ? '<span style="color:#ff4d4f;">' + r.errors.map(esc).join('；') + '</span>'
                : '<span style="color:#52c41a;">通过</span>'}${!exec && (r.dirty || r.errors.length) ? `<button class="btn-link import-row-check" data-act="import-revalidate-row" data-row="${r.rowNo}">重新校验</button>` : ''}</td>
          </tr>`; }).join('')}
        </tbody>
      </table>${!filtered.length ? '<div class="empty">当前分类没有数据</div>' : ''}</div>`;
    }

    return `
      <header class="gp-head import-head"><div class="page-title-with-back"><button class="page-back" data-act="go" data-page="list" aria-label="返回图谱中心" title="返回图谱中心"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5 7 12l7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button><h1 class="gp-head-title">评分数据导入</h1><span class="import-graph-name">${esc(graphName(S.selectedGraphId))}</span><span class="auto-sync-help import-help">
            <button class="help-icon" type="button" aria-label="查看文件要求与导入规则" aria-describedby="import-rules-tooltip">?</button>
            <span class="auto-sync-tooltip" id="import-rules-tooltip" role="tooltip">
              <span class="sync-help-section"><strong>文件要求</strong><span>用本页「下载模板」得到的 Excel 表格填写，保存后直接上传即可（也支持 .csv）。</span><span>文件不超过 2 MB，最多 500 行。</span></span>
              <span class="sync-help-section"><strong>怎么填</strong><span>模板按所选学员和本图谱的标签生成。只填最后一列「新成绩」，其他列不用改；新成绩留空的行不更新。以工号和标签匹配，只能导入到下载它的图谱。</span></span>
              <span class="sync-help-section"><strong>导入规则</strong><span>直接覆盖：末级标签能力分取导入值。再次导入替换上次导入值，不累加。课程与学习进度保持不变。</span></span>
              <span class="sync-help-section">本地示例采用 0–100 分。Excel 格式、客户量表及生产批量上限待确认。</span>
            </span></span></div>
        <div class="gp-head-ops"><button class="btn" data-act="import-history-open">导入记录${importHistoryList().length ? `（${importHistoryList().length}）` : ''}</button><button class="btn" data-act="import-load">加载演示数据</button></div>
      </header>
      <section class="import-content">
        ${renderImportSteps()}
        <input type="file" data-act="import-file" accept=".xlsx,.csv" aria-label="选择评分表格文件" hidden>
        ${ui.importReading ? '<div class="notice notice-info import-loading" role="status"><span class="import-spinner" aria-hidden="true"></span>正在读取并校验文件…</div>' : ''}
        ${ui.importSubmitting ? `<div class="notice notice-info import-loading" role="status"><span class="import-spinner" aria-hidden="true"></span>正在提交 ${(ui.importPreview || []).filter(r => !r.errors.length).length} 行成绩，请稍候…</div>` : ''}
        ${ui.importFileError ? `<div class="notice notice-error" role="alert">${esc(ui.importFileError)}</div>` : ''}
        ${rows ? `<div class="import-preview-tabs" aria-label="预览分类">${[['all','全部',rows.length],['error','错误',errors],['valid','通过',rows.length-errors]].map(([id,label,count])=>`<button class="btn btn-sm ${(!ui.importFilter&&id==='all')||ui.importFilter===id?'btn-primary':''}" data-act="import-filter" data-filter="${id}">${label}（${count}）</button>`).join('')}${hasError?'<button class="btn btn-sm" data-act="import-export-errors">导出错误明细</button>':''}${ui.importSkipped ? `<span class="import-muted">新成绩未填 ${ui.importSkipped} 行，不更新</span>` : ''}${exec?'':`<span class="import-table-ops">${hasError || dirty ? `<span class="import-submit-hint">${dirty ? '还有修改未校验' : '还有错误未处理'}，全部通过后才能提交</span>` : ''}<button class="btn btn-sm" data-act="import-revalidate-all">重新校验</button><button class="btn btn-sm btn-primary" data-act="import-execute" ${hasError || dirty || ui.importReading || ui.importSubmitting ? 'aria-disabled="true" disabled' : ''}>提交（${rows.length - errors} 行）</button></span>`}</div>` : ''}
        ${dirty && !exec ? `<div class="notice notice-warn"><span class="notice-icon">!</span>
          <div>有 ${dirty} 行分数已修改尚未校验，请点「重新校验」。</div></div>` : ''}
        ${hasError && !exec ? `<div class="notice notice-error"><span class="notice-icon">×</span>
          <div>共 ${errors} 行校验未通过。分数问题可直接在表格中修改，改完后重新校验。</div></div>` : ''}
        ${exec ? renderExecResult(exec) : ''}
        ${exec ? '' : table}
        ${rows ? `<div class="import-actions">
          <button class="btn" data-act="import-clear">清空预览</button>
        </div>` : ''}
        ${ui.importConfirm && rows && !hasError && !exec ? `<section class="import-confirm" aria-label="确认提交"><h3>确认提交 ${rows.length} 行评分？</h3><p>能力分将直接取导入值，覆盖原结果；已有导入分将被本次值替换。课程及学习记录保持不变。</p><button class="btn btn-primary" data-act="import-confirm-execute">确认提交</button><button class="btn" data-act="import-cancel-execute">返回核对</button></section>` : ''}
      </section>
      ${ui.importHistoryDrawer ? renderImportHistory() : ''}

      ${renderFormulaCard()}
      ${ui.importScope?.picker ? renderImportPicker() : ''}
    `;
  }

  // 第一步选学员；默认本图谱全部有效关联学员。
  function importMembers() {
    return G.effectiveMembers(S, S.selectedGraphId).map(m => S.persons.find(p => p.userId === m.userId)).filter(Boolean);
  }
  function importScope() {
    return ui.importScope ||= { mode: 'all', selected: [], picker: null };
  }
  function importScopeIds() {
    const sc = importScope(), all = importMembers().map(p => p.userId);
    return sc.mode === 'all' ? all : sc.selected.filter(id => all.includes(id));
  }
  function renderImportSteps() {
    const sc = importScope(), all = importMembers(), ids = importScopeIds();
    return `<ol class="import-steps" aria-label="导入步骤">
      <li><b><i>1</i>选择学员，下载模板</b>
        <div class="import-scope" role="radiogroup" aria-label="下载范围">
          <label><input type="radio" name="import-scope" data-act="import-scope-mode" value="all" ${sc.mode === 'all' ? 'checked' : ''}>全部关联学员（${all.length} 人）</label>
          <label><input type="radio" name="import-scope" data-act="import-scope-mode" value="some" ${sc.mode === 'some' ? 'checked' : ''}>部分学员${sc.mode === 'some' ? `（已选 ${ids.length} 人）` : ''}</label>
          ${sc.mode === 'some' ? '<button class="btn-link" data-act="import-pick-open">选择学员</button>' : ''}
        </div>
        <button class="btn btn-sm" data-act="import-template" ${ids.length ? '' : 'disabled'}>下载模板</button></li>
      <li><b><i>2</i>填写新成绩，上传文件</b><span>只填最后一列「新成绩」，其他列不用改。</span>
        <div class="import-upload-row"><button class="btn btn-sm btn-primary" data-act="import-choose" ${ui.importReading ? 'disabled' : ''}>上传文件</button>${ui.importSource ? `<span class="import-file-name" title="${esc(ui.importSource)}">${esc(ui.importSource)}</span>` : ''}</div></li>
      <li><b><i>3</i>核对、修改并提交</b><span>错误可在表格中直接改，重新校验全部通过后提交。</span></li>
    </ol>`;
  }
  function renderImportPicker() {
    const pk = importScope().picker, kw = (pk.kw || '').trim().toLowerCase();
    const list = importMembers().filter(p => (!pk.dept || p.deptId === pk.dept) && (!kw || [p.userName, p.employeeCode].some(v => String(v).toLowerCase().includes(kw))));
    const depts = [...new Map(importMembers().map(p => [p.deptId, p.deptName])).entries()];
    return `<div class="modal-mask"><section class="modal mgmt-modal import-pick" role="dialog" aria-modal="true" aria-labelledby="import-pick-title">
      <div class="modal-head"><h2 id="import-pick-title">选择学员</h2><button type="button" data-act="import-pick-cancel" aria-label="关闭">×</button></div>
      <div class="modal-body">
        <div class="import-pick-filter"><input class="input" data-act="import-pick-kw" placeholder="搜索姓名或工号" value="${esc(pk.kw || '')}" aria-label="搜索学员">
          <select class="select-native" data-act="import-pick-dept" aria-label="按部门筛选"><option value="">全部部门</option>${depts.map(([id, nm]) => `<option value="${esc(id)}" ${pk.dept === id ? 'selected' : ''}>${esc(nm)}</option>`).join('')}</select>
          <button class="btn btn-sm" data-act="import-pick-all" ${list.length ? '' : 'disabled'}>全选当前结果</button><button class="btn btn-sm" data-act="import-pick-none" ${pk.draft.length ? '' : 'disabled'}>清空</button></div>
        <div class="import-pick-list">${list.map(p => `<label class="import-pick-row"><input type="checkbox" data-act="import-pick-toggle" data-uid="${esc(p.userId)}" ${pk.draft.includes(p.userId) ? 'checked' : ''}><b>${esc(p.userName)}</b><span class="mono">${esc(p.employeeCode)}</span><span>${esc(p.deptName || '')}</span><span>${esc((p.positionIds || []).map(posName).join('、'))}</span></label>`).join('') || '<div class="empty">没有符合条件的学员</div>'}</div>
      </div>
      <div class="modal-foot"><span class="import-pick-count">已选 ${pk.draft.length} 人</span><button class="btn" data-act="import-pick-cancel">取消</button><button class="btn btn-primary" data-act="import-pick-confirm" ${pk.draft.length ? '' : 'disabled'}>确定</button></div>
    </section></div>`;
  }

  function renderExecResult(exec) {
    return `<div class="notice ${exec.fail ? 'notice-warn' : 'notice-success'}" style="margin-bottom:12px;">
      <span class="notice-icon">${exec.fail ? '!' : '✓'}</span>
      <div><b>执行完成</b>（${esc(exec.execAt)}）：成功 <b>${exec.ok}</b> 行，失败 <b>${exec.fail}</b> 行。
      ${exec.fail ? '请查看下方失败原因。' : ''}</div>
    </div>
    <div class="table-wrap" style="margin-bottom:14px;"><table class="tbl import-table">
      <thead><tr><th style="width:52px;">行号</th><th>工号</th><th>姓名</th><th>一级标签</th><th>二级标签</th><th>三级标签</th><th class="num">新成绩</th><th>结果</th><th class="num">当前能力分</th></tr></thead>
      <tbody>${exec.results.map((r) => { const path = r.pathInput || window.GP_IMPORT.tagPath(r.graphId, r.tagId); return `<tr class="${r.status === 'failed' ? 'row-error' : ''}">
        <td class="num">${r.sourceLine || r.rowNo}</td>
        <td class="mono">${esc(r.employeeCode || personCode(r.userId) || '—')}</td>
        <td>${esc(r.userNameInput || r.personName || '—')}</td>
        <td>${esc(path[0] || '—')}</td><td>${esc(path[1] || '—')}</td><td>${esc(path[2] || '—')}</td>
        <td class="num">${esc(Number.isFinite(r.score) ? r.score : r.scoreInput || '—')}</td>
        <td>${r.status === 'success'
          ? '<span style="color:#52c41a;">成功</span>'
          : '<span style="color:#ff4d4f;">失败：' + esc(r.reason) + '</span>'}</td>
        <td class="num" style="font-weight:700;">${r.status === 'success' ? r.current : '—'}</td>
      </tr>`; }).join('')}</tbody>
    </table></div>`;
  }

  function renderFormulaCard() {
    return `<div class="card anno"><div class="card-head"><h2>计算规则（按 SPEC 第 6 节）</h2>
    </div><div class="card-body">
      <table class="tbl">
        <thead><tr><th>演示条件</th><th class="num">当前能力分</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td>后测 80、90，导入 100</td><td class="num"><b>100</b></td><td>直接取导入值，后测不参与计算</td></tr>
          <tr><td>上例重新导入 70</td><td class="num"><b>70</b></td><td>以最新导入值为准，旧导入 100 不再生效</td></tr>
          <tr><td>后测真实 0，导入 60</td><td class="num"><b>60</b></td><td>取导入值；原后测记录独立保留</td></tr>
          <tr><td>导入后后测变化</td><td class="num"><b>不变</b></td><td>导入值保持，直到下次导入</td></tr>
        </tbody>
      </table>
      <div class="anno"><div class="hint">导入方式只有直接覆盖。未导入过的标签仍按有效后测计算。课程进度与真实学习记录完全不变。</div></div>
    </div></div>`;
  }

  /* ================= 学员仪表盘 ================= */
  /* 真实对齐：cockpit/src/views/gp/personal/light/
     index.vue       → 88px 头部（标题居中 + 右侧 查询/切换学员）
     mainContent.vue → NewUserInfo(h120) + 行1/h472(2:1:1) + 行2/h472(2:2:2) + 学课数据统计
     NewUserInfo     → 头像+姓名 / 部门·岗位·性别·工号·职级·关联图谱 / 切换 / 更新数据
     切换图谱：真实为 a-popover 下拉，本轮按要求改为弹窗（见 TECH-STACK §12.7）
  */

  // 学员在某张图下的末级标签得分（复用评分公式）
  function pdScores(gid, uid) {
    const g = S.graphs[gid];
    if (!g) return [];
    return G.leafTags(g.tagTree || []).map((t) => {
      const linked = G.accessibleGraphs(S, uid).some(x=>x.graphId===gid);
      const s = linked && scores.find((x) => x.graphId === gid && x.userId === uid && x.tagId === t.id);
      const r = s ? G.computeScore(s) : { value: null };
      return { id: t.id, nm: t.nm, val: r.value, parent: pdL1Of(g, t.id) };
    });
  }

  // 某末级标签所属一级标签名
  function pdL1Of(g, leafId) {
    let hit = '';
    (g.tagTree || []).forEach((l1) => {
      (l1.children || []).forEach((l2) => {
        const leaves = l2.children && l2.children.length ? l2.children : [l2];
        leaves.forEach((lf) => { if (lf.id === leafId) hit = l1.nm; });
      });
      if ((l1.children || []).length === 0 && l1.id === leafId) hit = l1.nm;
    });
    return hit;
  }

  // 一级标签均分
  function pdByL1(list) {
    const m = {};
    list.forEach((t) => {
      if (t.val === null || t.val === undefined) return;
      if (!m[t.parent]) m[t.parent] = { nm: t.parent, vals: [], leaves: [] };
      m[t.parent].vals.push(t.val);
      m[t.parent].leaves.push(t);
    });
    return Object.values(m).map((x) => ({
      nm: x.nm,
      val: Math.round((x.vals.reduce((a, b) => a + b, 0) / x.vals.length) * 10) / 10,
      leaves: x.leaves,
    }));
  }

  // 综合指数与历史评分（真实：positionComprehensiveAbility + recentHistoryScore）
  function pdOverall(gid, uid) {
    const list = pdScores(gid, uid).filter((t) => t.val !== null);
    const all = pdScores(gid, uid);
    const vals = list.map((t) => t.val);
    const total = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
    const members = G.effectiveMembers(S, gid);
    const lows = [], highs = [];
    members.forEach((m) => {
      const v = pdScores(gid, m.userId).filter((t) => t.val !== null).map((t) => t.val);
      if (!v.length) return;
      lows.push(Math.min.apply(null, v));
      highs.push(Math.max.apply(null, v));
    });
    lows.sort((a, b) => a - b);
    highs.sort((a, b) => b - a);
    // 名次：按总分降序
    const ranked = members
      .map((m) => {
        const v = pdScores(gid, m.userId).filter((t) => t.val !== null).map((t) => t.val);
        return { userId: m.userId, nm: personName(m.userId), total: v.length ? v.reduce((a, b) => a + b, 0) / v.length : -1 };
      })
      .filter((x) => x.total >= 0)
      .sort((a, b) => b.total - a.total);
    let myRank = 0;
    ranked.forEach((x, i) => { if (x.userId === uid) myRank = i + 1; });
    // 历史评分：6 个月
    const months = [];
    const nowM = 10;
    for (let i = 5; i >= 0; i -= 1) {
      const m = nowM - i;
      const seed = (total || 40) + ((i * 7) % 13) - 6;
      months.push({ month: (m > 0 ? m : m + 12) + '月', myScore: Math.max(0, Math.min(100, Math.round(seed))), current: i === 0 });
    }
    return {
      total,
      lowest: lows.length ? lows[0] : 0,
      highest: highs.length ? highs[0] : 0,
      average: total,
      myRank,
      totalCount: ranked.length,
      covered: list.length,
      tagTotal: all.length,
      ranked,
      months,
      suggest: total >= 80 ? '当前能力表现优于多数同事，建议承担带教任务并拓展跨岗位能力。'
        : total >= 60 ? '得分处于中等水平，有一定的上升空间，需要进一步深化和拓展在特定领域的专业知识和技能。'
          : '当前得分偏低，需要加强基础能力培养，学习专门的培训和资源，以加强基本技能和知识。',
    };
  }

  // 学员在某图下的学习统计
  function pdStudy(gid, uid) {
    const p = progress.find((x) => x.graphId === gid && x.userId === uid);
    const total = p ? p.total : 0;
    const done = p ? p.done : 0;
    const tags = pdScores(gid, uid);
    const finished = tags.filter((t) => t.val !== null).length;
    return {
      rate: tags.length ? Math.round((finished / tags.length) * 100) : 0,
      tagCount: tags.length,
      finishTagCount: finished,
      courseDown: total,
      courseFinish: done,
      examDown: Math.max(1, Math.round(total / 2)),
      examFinish: Math.max(0, Math.round(done / 2)),
      dispatchCourseNum: total,
      studyingCourseNum: Math.max(0, total - done - 1),
      finishCourseNum: done,
      finishExamNum: Math.max(0, Math.round(done / 2)),
      usedToolNum: (uid.charCodeAt(uid.length - 1) || 3) % 7 + 1,
    };
  }

  function clearLearnerContext() {
    Object.keys(ui).filter(key => key.startsWith('learner') && key !== 'learnerTab').forEach(key => delete ui[key]);
  }

  function renderDashboard() {
    if (!window.GP_LEARNER) return renderPersonalDashboard();
    return window.GP_LEARNER.render(extensionContext());
  }

  function renderPersonalDashboard() {
    const uid = S.studentUserId;
    const list = learnerGraphs();
    const P = S.persons.find((x) => x.userId === uid) || {};
    if (!list.length) {
      return `<div class="pd-shell">
        <div class="pd-top"><div class="pd-top-title">岗位能力仪表盘</div>
          <div class="pd-top-ops">
            <button class="pd-btn" data-act="pd-choose-user">选择学员</button>
          </div>
        </div>
        <div class="pd-user">
          <div class="pd-user-left"><div class="pd-avatar">${esc((P.userName || '?').slice(0, 1))}</div>
            <div class="pd-user-main"><div class="pd-user-name">${esc(P.userName || '未选择学员')}</div>
              <div class="pd-user-fields"><span class="pd-field fix"><span class="pd-field-k">工号：</span><span class="pd-field-v">${esc(P.employeeCode || '—')}</span></span></div>
            </div></div>
          <div class="pd-reset" data-act="pd-choose-user">选择学员</div>
        </div>
        <div class="cp-card pd-stat"><div class="cp-card-body"><div class="pd-nodata" style="height:320px">
          <div style="font-size:15px;color:rgba(0,0,0,.55)">暂无关联图谱，请联系管理员添加图谱</div>
          <div>可访问图谱需同时满足：有效人员关联 + 图谱启用 + 账号权限</div>
        </div></div></div>
        ${ui.pdGraphModal ? renderPdGraphModal(list) : ''}
      </div>`;
    }
    const curId = ui.dashboardGraphId && list.some((x) => x.graphId === ui.dashboardGraphId) ? ui.dashboardGraphId : list[0].graphId;
    ui.dashboardGraphId = curId;
    const g = S.graphs[curId];
    const raw = pdScores(curId, uid);
    const l1s = pdByL1(raw);
    if (!ui.pdL1 || !l1s.some((x) => x.nm === ui.pdL1)) ui.pdL1 = l1s.length ? l1s[0].nm : null;
    const l2s = (l1s.find((x) => x.nm === ui.pdL1) || { leaves: [] }).leaves;
    if (!ui.pdL2 || !l2s.some((x) => x.nm === ui.pdL2)) ui.pdL2 = l2s.length ? l2s[0].nm : null;
    const O = pdOverall(curId, uid);
    const ST = pdStudy(curId, uid);
    const rel = l2s.map((t) => ({ nm: t.nm, val: t.val === null ? 0 : t.val }));

    const pick = ui.pdGraphPick || curId;

    return `<div class="pd-shell">
      <div class="pd-row">
        ${card('岗位能力综合指数', renderPdScore(O), 'pd-f2')}
        ${card('岗位细分能力相对指数', renderPdRelative(rel, (P.userName || '?').slice(0, 1)), 'pd-f1')}
        ${card('学习进度', renderPdProgress(ST), 'pd-f1')}
      </div>

      <div class="pd-row">
        ${card('一级能力标签动态数据', renderPdRadar(l1s), 'pd-f2')}
        ${card('二级能力标签动态数据', `<div class="pd-tag-head"><span>所选一级能力标签：</span><span class="pd-tag-chip">${esc(ui.pdL1 || '—')}</span></div>
          <div class="pd-chart-body">${renderPdL2Chart(l2s)}</div>`, 'pd-f2')}
        ${card('能力标签动态数据', `<div class="pd-tag-head"><span>所选能力标签：</span><span class="pd-tag-chip">${esc(ui.pdL2 || '—')}</span></div>
          <div style="flex:1;min-height:0">${renderPdTagRank(O, ui.pdL2)}</div>`, 'pd-f2')}
      </div>

      ${renderPdStat(ST, curId, uid)}

      ${ui.pdRankOpen ? renderPdRankPopover(O, P.userName) : ''}

    </div>`;
  }

  // 卡片外壳（复用驾驶舱 cp-card 规格：65px 标题行）
  function card(title, body, cls) {
    return `<div class="cp-card ${cls || ''}">
      <div class="cp-card-head"><div class="cp-card-title">${esc(title)}</div><div class="cp-card-extra"></div></div>
      <div class="cp-card-body" style="flex:1;min-height:0;display:flex;flex-direction:column">${body}</div>
    </div>`;
  }

  /* ---- NewUserInfo 学员信息条 ---- */
  function renderPdUser(P, g, list, curId) {
    const f = (k, v, cls) => (v ? `<span class="pd-field ${cls || ''}"><span class="pd-field-k">${k}：</span><span class="pd-field-v">${esc(v)}</span></span>` : '');
    const dept = P.deptName || '';
    const pos = P.positionIds && P.positionIds.length
      ? P.positionIds.map((pid) => {
        const hit = (G.positions || []).find((x) => x.id === pid);
        return hit ? hit.nm : '';
      }).filter(Boolean).join(' / ')
      : '';
    return `<div class="pd-user">
      <div class="pd-user-left">
        <div class="pd-avatar">${esc((P.userName || '?').slice(0, 1))}</div>
        <div class="pd-user-main">
          <div class="pd-user-name">${esc(P.userName || '未选择学员')}</div>
          <div class="pd-user-fields">
            ${f('部门', dept)}
            ${f('岗位', pos)}
            ${f('性别', P.gender || '男', 'fix')}
            ${f('工号', P.employeeCode, 'fix')}
            ${f('职级', P.rankName || 'P5')}
            <span class="pd-field graph"><span class="pd-field-k">关联图谱：</span><span class="pd-field-v">${esc(g.name)}</span></span>
            <span class="pd-switch" data-act="pd-open-graph" title="共 ${list.length} 张可访问图谱">⇄ 切换</span>
          </div>
        </div>
      </div>
      <div class="pd-reset" data-act="pd-refresh" title="重算整张图谱的统计（真实接口只传 graphId）">更新数据 ⟳</div>
    </div>`;
  }

  /* ---- ① 岗位能力综合指数：240° 仪表 + 三条指针（ScoreCompare） ---- */
  function renderPdScore(O) {
    return `<div class="pd-score-wrap">
      <div class="pd-score-left">
        <div class="pd-gauge">${svgPdGauge(O)}</div>
        <div class="pd-history">
          <div class="pd-history-t">历史评分</div>
          ${svgPdHistory(O.months)}
        </div>
      </div>
      <div class="pd-score-right">
        <div class="pd-rank">
          <div class="pd-rank-ico">★</div>
          <span class="pd-rank-label">学员排名：</span>
          <span class="pd-rank-num"><b>${O.myRank || 0}</b><i>/${O.totalCount || 0}</i></span>
          <button class="pd-rank-more" data-act="pd-rank">›</button>
        </div>
        <div class="pd-suggest">
          <div class="pd-suggest-ico">💡</div>
          <div class="pd-suggest-t">发展建议：</div>
          <div class="pd-suggest-c">${esc(O.suggest)}</div>
        </div>
      </div>
    </div>`;
  }

  // 240° 仪表：startAngle 210 → endAngle -30；进度径向渐变 #C2CCE4 → #133F9E
  function svgPdGauge(O) {
    const w = 300, h = 246, cx = w / 2, cy = 128, r = 92;
    const A0 = 210, A1 = -30;
    const rad = (d) => (d * Math.PI) / 180;
    const pt = (ang, rr) => [cx + rr * Math.cos(rad(ang)), cy + rr * Math.sin(rad(ang))];
    const arc = (from, to, rr, wd, color, cap) => {
      const p0 = pt(from, rr), p1 = pt(to, rr);
      const large = Math.abs(to - from) > 180 ? 1 : 0;
      return `<path d="M ${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A ${rr} ${rr} 0 ${large} 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}"
        fill="none" stroke="${color}" stroke-width="${wd}" stroke-linecap="${cap || 'round'}"/>`;
    };
    // 起点 210° 顺时针扫到 -30°（共 240°）
    const sweep = (pct) => A0 - ((A0 - A1) * Math.max(0, Math.min(100, pct))) / 100;
    let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    s += `<defs><linearGradient id="pdg1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#C2CCE4"/><stop offset="1" stop-color="#133F9E"/></linearGradient></defs>`;
    // 底层弧（radius 65%、宽 4）
    s += arc(A0, A1, r, 4, '#C2CCE4');
    // 进度弧（radius 55%、宽 4）—— 用同一半径近似，视觉差异极小
    if (O.total > 0) s += arc(A0, sweep(O.total), r - 12, 8, 'url(#pdg1)');
    // 25 段刻度（splitLine.distance:-45 → 半径 r-18，长度 6）
    for (let i = 0; i <= 25; i += 1) {
      const ang = A0 - ((A0 - A1) * i) / 25;
      const a = pt(ang, r - 22), b = pt(ang, r - 28);
      s += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#C2CCE4" stroke-width="1" stroke-linecap="round"/>`;
    }
    // 中心文案
    s += `<text x="${cx}" y="${cy - 12}" text-anchor="middle" font-size="12" fill="#cccccc">总分</text>`;
    s += `<text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="32" font-weight="500" fill="#333333">${O.total}</text>`;
    s += `<text x="${cx + 26}" y="${cy + 26}" text-anchor="start" font-size="12" fill="#8c8c8c">分</text>`;
    // 三条指针：只画弧上的空心圆点 + 短径向刻度，不画穿过圆心的长臂（避免压住中心数字）
    const marks = [
      { v: O.lowest, nm: '最低分', c: '#C2CCE4', dy: 14 },
      { v: O.average, nm: '平均分', c: '#133F9E', dy: 2 },
      { v: O.highest, nm: '最高分', c: '#ED726E', dy: -10 },
    ];
    marks.forEach((mk) => {
      const ang = sweep(mk.v);
      const rr = r - 12;
      const dot = pt(ang, rr);
      // 只在圆点附近画一小段径向短线，指向外侧
      const near = pt(ang, rr - 14);
      s += `<line x1="${near[0].toFixed(1)}" y1="${near[1].toFixed(1)}" x2="${dot[0].toFixed(1)}" y2="${dot[1].toFixed(1)}"
        stroke="${mk.c}" stroke-width="2" opacity="0.75" stroke-linecap="round"/>`;
      s += `<circle cx="${dot[0].toFixed(1)}" cy="${dot[1].toFixed(1)}" r="6" fill="#fff" stroke="${mk.c}" stroke-width="3"/>`;
      // 标签：在圆点外侧沿半径方向外推
      const out = pt(ang, rr + 20);
      const right = Math.cos(rad(ang)) >= 0;
      const lx = out[0] + (right ? 2 : -2);
      const ly = out[1] + mk.dy;
      s += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${right ? 'start' : 'end'}" font-size="11" fill="rgba(0,0,0,.45)">${mk.nm} ${mk.v}</text>`;
    });
    s += '</svg>';
    return s;
  }

  // 历史评分：8 根柱 + 灰底（HistoryScore：barWidth 14，圆角 4，当前月 #EABFC3）
  function svgPdHistory(months) {
    const w = 300, h = 100, pad = 8, n = months.length;
    const bw = 14, gap = (w - pad * 2 - n * bw) / Math.max(1, n - 1);
    let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    months.forEach((m, i) => {
      const x = pad + i * (bw + gap);
      const bh = Math.max(2, (h - 22) * (m.myScore / 100));
      const color = m.current ? '#EABFC3' : i % 2 === 0 ? '#133F9E' : '#C1CCE6';
      s += `<rect x="${x.toFixed(1)}" y="2" width="${bw}" height="${h - 20}" rx="4" fill="#F5F5F5"/>`;
      s += `<rect x="${x.toFixed(1)}" y="${(h - 18 - bh).toFixed(1)}" width="${bw}" height="${bh.toFixed(1)}" rx="4" fill="${color}"/>`;
      s += `<text x="${(x + bw / 2).toFixed(1)}" y="${h - 5}" text-anchor="middle" font-size="10" fill="rgba(0,0,0,.45)">${m.month}</text>`;
      s += `<text x="${(x + bw / 2).toFixed(1)}" y="${(h - 22 - bh).toFixed(1)}" text-anchor="middle" font-size="9" fill="#bbbbbb">${m.myScore}</text>`;
    });
    s += '</svg>';
    return s;
  }

  /* ---- ② 岗位细分能力相对指数：横向堆叠条（RelativeAbility） ---- */
  function renderPdRelative(list, code) {
    if (!list.length) return '<div class="pd-nodata">暂无数据</div>';
    const w = 320, top = 24, bottom = 26, left = 68, right = 28;
    // 行数少时放大行高撑满卡片，避免只显示一两条时大片留白
    const n = list.length;
    const rowH = n <= 3 ? 66 : n <= 6 ? 46 : 38;
    const h = top + n * rowH + bottom;
    const iw = w - left - right;
    const maxV = 100;
    let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    s += `<defs><clipPath id="pdrelclip"><rect x="0" y="0" width="${w}" height="${h}"/></clipPath></defs>`;
    s += `<g clip-path="url(#pdrelclip)">`;
    list.forEach((it, i) => {
      const y = top + i * rowH;
      const bh = Math.min(26, Math.round(rowH * 0.5));
      const full = iw * (Math.max(0, Math.min(100, it.val)) / maxV);
      // 灰底全长条（底层 silent bar，长度 = 最大值）
      s += `<rect x="${left}" y="${y}" width="${iw}" height="${bh}" fill="#F0F0F0"/>`;
      // 单段：低/中/高按 35/65 阈值切色，但这里只有一个人的分数 → 用当前值着色
      const seg = it.val < 35 ? '#133F9E' : it.val < 65 ? '#C1CCE6' : '#ED726E';
      if (it.val > 0) {
        s += `<rect x="${left}" y="${y}" width="${full.toFixed(1)}" height="${bh}" fill="#133F9E"/>`;
        // 当前值标签（markPoint）：白底描边圆角，落在分段中点
        const lx = left + full / 2;
        const label = `${code}:${it.val}`;
        const lw = 10 + label.length * 6.2;
        s += `<rect x="${(lx - lw / 2).toFixed(1)}" y="${(y - 14).toFixed(1)}" width="${lw.toFixed(1)}" height="18" fill="#fff" stroke="#C2CCE4" rx="2"/>`;
        s += `<text x="${lx.toFixed(1)}" y="${(y - 1).toFixed(1)}" text-anchor="middle" font-size="11" fill="rgba(0,0,0,.85)">${esc(label)}</text>`;
      } else {
        s += `<text x="${(left + 8)}" y="${(y + 15)}" font-size="11" fill="rgba(0,0,0,.35)">暂无数据</text>`;
      }
      // y 轴标签（超 5 字截断）
      const nm = it.nm.length > 5 ? it.nm.slice(0, 5) + '...' : it.nm;
      s += `<text x="${left - 8}" y="${(y + bh / 2 + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="rgba(0,0,0,.65)">${esc(nm)}</text>`;
    });
    s += '</g></svg>';
    // 图例：低/中/高分区
    const lg = `<div style="display:flex;gap:10px;justify-content:center;font-size:11px;color:rgba(0,0,0,.45);padding:2px 0 6px;flex-wrap:wrap">
      <span><i style="display:inline-block;width:8px;height:8px;background:#133F9E;margin-right:4px"></i>低分区(35分以下)</span>
      <span><i style="display:inline-block;width:8px;height:8px;background:#C1CCE6;margin-right:4px"></i>中分区(35-65)</span>
      <span><i style="display:inline-block;width:8px;height:8px;background:#ED726E;margin-right:4px"></i>高分区(65分及以上)</span>
    </div>`;
    return `<div style="flex:1;display:flex;flex-direction:column;min-height:0">
      <div style="flex:1;display:flex;align-items:center;justify-content:center;min-height:0">${s}</div>
      ${lg}</div>`;
  }

  /* ---- ③ 学习进度：270° 环 + 两条下发/完成横条 ---- */
  function renderPdProgress(ST) {
    const pct = ST.tagCount ? Math.round((ST.finishTagCount / ST.tagCount) * 100) : 0;
    const bar = (title, down, finish) => {
      const p = down ? Math.round((finish / down) * 100) : 0;
      return `<div class="pd-sbar">
        <div class="pd-sbar-head"><span>${esc(title)}</span><span class="v">${down}/${finish}</span></div>
        <div class="pd-sbar-track"><div class="pd-sbar-fill" style="width:${Math.max(0, Math.min(100, p))}%"></div></div>
      </div>`;
    };
    return `<div class="pd-prog">
      <div class="pd-prog-top">
        ${svgPdRing(ST.rate)}
        <div class="pd-prog-nums">
          <div class="blk"><div class="k">下发标签数</div><div class="v">${ST.tagCount}</div></div>
          <div class="blk"><div class="k">完成标签数</div><div class="v">${ST.finishTagCount}</div></div>
        </div>
      </div>
      <div class="pd-prog-bars">
        ${bar('下发/完成课程数量', ST.courseDown, ST.courseFinish)}
        ${bar('下发/完成考试数量', ST.examDown, ST.examFinish)}
      </div>
    </div>`;
  }

  // 270° 环：startAngle 90 → endAngle -270，宽 14，渐变 #C2CCE4 → #133F9E
  function svgPdRing(pct) {
    const w = 160, h = 160, cx = 80, cy = 80, r = 58, sw = 14;
    const rad = (d) => (d * Math.PI) / 180;
    const pt = (a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
    const p0 = pt(90), p1 = pt(-270 + 360);
    let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    s += `<defs><linearGradient id="pdring" x1="0" y1="1" x2="1" y2="1">
      <stop offset="0" stop-color="#C2CCE4"/><stop offset="1" stop-color="#133F9E"/></linearGradient></defs>`;
    const arc = (pctv, color) => {
      const a1 = 90 - 270 * (Math.max(0, Math.min(100, pctv)) / 100);
      const e = pt(a1);
      return `<path d="M ${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A ${r} ${r} 0 1 1 ${e[0].toFixed(1)} ${e[1].toFixed(1)}"
        fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
    };
    s += arc(100, '#EDF1F8');
    if (pct > 0) s += arc(pct, 'url(#pdring)');
    s += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="30" font-weight="500" fill="#333333">${pct}</text>`;
    s += `<text x="${cx + 22}" y="${cy + 2}" text-anchor="start" font-size="12" fill="#8c8c8c">%</text>`;
    s += `<text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="12" fill="#8c8c8c">当前进度</text>`;
    s += '</svg>';
    return s;
  }

  /* ---- ④ 一级能力标签动态数据：雷达（前测虚线 + 后测实线） ---- */
  function renderPdRadar(l1s) {
    // 雷达至少 3 个轴才有面积；一级标签不足 3 个时用末级标签补齐，避免退化成一条线
    let axes = l1s.slice();
    if (axes.length < 3) {
      const gid = ui.dashboardGraphId;
      const raw = pdScores(gid, S.studentUserId).filter((t) => t.val !== null && !axes.some((a) => a.nm === t.nm));
      axes = axes.concat(raw.map((t) => ({ nm: t.nm, val: t.val, leaves: [t] }))).slice(0, Math.max(5, axes.length));
    }
    if (!axes.length) return '<div class="pd-nodata">暂无数据</div>';
    const w = 392, h = 344, cx = w / 2, cy = 152, R = 92;
    const n = Math.max(3, axes.length);
    const rad = (d) => (d * Math.PI) / 180;
    const ang = (i) => -90 + (360 / n) * i;
    const pt = (i, v) => {
      const rr = (R * Math.max(0, Math.min(100, v))) / 100;
      return [cx + rr * Math.cos(rad(ang(i))), cy + rr * Math.sin(rad(ang(i)))];
    };
    const poly = (getv) => axes.map((t, i) => pt(i, getv(t)).map((x) => x.toFixed(1)).join(',')).join(' ');
    let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    // 4 层网格
    [25, 50, 75, 100].forEach((lv) => {
      const pts = axes.map((t, i) => pt(i, lv).map((x) => x.toFixed(1)).join(',')).join(' ');
      s += `<polygon points="${pts}" fill="none" stroke="#f0f0f0" stroke-width="1"/>`;
    });
    // 轴线
    axes.forEach((t, i) => {
      const p = pt(i, 100);
      s += `<line x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}" stroke="#e9e9e9" stroke-width="1"/>`;
    });
    // 后测（实线 #133F9E + 浅粉面积）
    s += `<polygon points="${poly((t) => t.val)}" fill="#FCE9E9" stroke="#133F9E" stroke-width="1.5" stroke-linejoin="round"/>`;
    // 前测（虚线 #F38E2C，用 val-8 模拟前测差值）
    s += `<polygon points="${poly((t) => Math.max(0, t.val - 8))}" fill="none" stroke="#F38E2C" stroke-width="1.5"
      stroke-dasharray="4 8" stroke-linecap="round" stroke-linejoin="round"/>`;
    // 轴名（当前一级标签高亮描边胶囊）
    axes.forEach((t, i) => {
      const a = ang(i);
      const lx = cx + (R + 22) * Math.cos(rad(a));
      const ly = cy + (R + 22) * Math.sin(rad(a));
      const on = t.nm === ui.pdL1;
      const anchor = Math.abs(Math.cos(rad(a))) < 0.3 ? 'middle' : Math.cos(rad(a)) > 0 ? 'start' : 'end';
      // 正上方轴名放在顶点上侧，避免与顶点胶囊重叠
      const dy = Math.sin(rad(a)) < -0.8 ? -12 : 4;
      if (on) {
        const tw = t.nm.length * 12 + 12;
        const bx = anchor === 'middle' ? lx - tw / 2 : anchor === 'start' ? lx - 4 : lx - tw + 4;
        s += `<rect x="${bx.toFixed(1)}" y="${(ly + dy - 14).toFixed(1)}" width="${tw}" height="24" rx="12" fill="none" stroke="#133F9E"/>`;
      }
      s += `<text x="${lx.toFixed(1)}" y="${(ly + dy).toFixed(1)}" text-anchor="${anchor}" font-size="12" fill="${on ? '#133F9E' : '#8c8c8c'}"
        style="cursor:pointer" data-act="pd-l1" data-nm="${esc(t.nm)}">${esc(t.nm)}</text>`;
    });
    // 图例
    s += `<line x1="${cx - 62}" y1="${h - 28}" x2="${cx - 52}" y2="${h - 28}" stroke="#F38E2C" stroke-width="2" stroke-dasharray="4 8"/>
      <text x="${cx - 44}" y="${h - 24}" font-size="12" fill="rgba(0,0,0,.45)">前测</text>
      <line x1="${cx + 8}" y1="${h - 28}" x2="${cx + 18}" y2="${h - 28}" stroke="#133F9E" stroke-width="2"/>
      <text x="${cx + 26}" y="${h - 24}" font-size="12" fill="rgba(0,0,0,.45)">后测</text>`;
    s += '</svg>';
    return `<div class="pd-radar-wrap" style="flex:1;display:flex;align-items:center;justify-content:center;min-height:0">${s}</div>`;
  }

  /* ---- ⑤ 二级能力标签动态数据：前测虚线 + 后测柱（ScrollBarChart） ---- */
  function renderPdL2Chart(l2s) {
    if (!l2s.length) return '<div class="pd-nodata">暂无数据</div>';
    const w = 392, h = 320, left = 34, right = 12, top = 16, bottom = 70;
    const iw = w - left - right, ih = h - top - bottom;
    const n = Math.max(1, l2s.length);
    const slot = iw / n;
    const bw = n <= 4 ? 26 : Math.min(14, slot / 3);
    const y = (v) => top + ih * (1 - Math.max(0, Math.min(100, v)) / 100);
    let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    // 网格 + y 轴
    [0, 25, 50, 75, 100].forEach((lv) => {
      s += `<line x1="${left}" y1="${y(lv).toFixed(1)}" x2="${w - right}" y2="${y(lv).toFixed(1)}" stroke="rgba(0,0,0,.06)" stroke-width="1"/>`;
      s += `<text x="${left - 6}" y="${(y(lv) + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#8c8c8c">${lv}</text>`;
    });
    l2s.forEach((t, i) => {
      const cxp = left + slot * i + slot / 2;
      const v = t.val === null ? 0 : t.val;
      if (v > 0) {
        s += `<rect x="${(cxp - bw / 2).toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw}" height="${(top + ih - y(v)).toFixed(1)}" rx="3" fill="#133F9E"/>`;
      }
      // 前测虚线点 + 连线段
      const pv = Math.max(0, v - 8);
      s += `<line x1="${(cxp - bw * 1.1).toFixed(1)}" y1="${y(pv).toFixed(1)}" x2="${(cxp + bw * 1.1).toFixed(1)}" y2="${y(pv).toFixed(1)}" stroke="#F38E2C" stroke-width="2" stroke-dasharray="4 8" stroke-linecap="round"/>`;
      // x 轴标签（当前二级标签胶囊高亮）；超过 4 字分两行，胶囊框同步加高
      const on = t.nm === ui.pdL2;
      const lines = t.nm.length > 4 ? [t.nm.slice(0, 4), t.nm.slice(4, 8)] : [t.nm];
      const ty = top + ih + 20;
      if (on) {
        const tw = Math.max.apply(null, lines.map((s) => s.length)) * 11 + 16;
        const th = lines.length > 1 ? 34 : 22;
        s += `<rect x="${(cxp - tw / 2).toFixed(1)}" y="${(ty - 12).toFixed(1)}" width="${tw}" height="${th}" rx="11" fill="none" stroke="#133F9E"/>`;
      }
      s += `<text x="${cxp.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" font-size="11" fill="${on ? '#133F9E' : '#8c8c8c'}"
        style="cursor:pointer" data-act="pd-l2" data-nm="${esc(t.nm)}">${lines
        .map((ln, li) => `<tspan x="${cxp.toFixed(1)}" dy="${li === 0 ? 0 : 13}">${esc(ln)}</tspan>`).join('')}</text>`;
    });
    s += `<line x1="${left}" y1="${(top + ih).toFixed(1)}" x2="${w - right}" y2="${(top + ih).toFixed(1)}" stroke="rgba(0,0,0,.06)"/>`;
    s += `<line x1="${left + 40}" y1="${h - 8}" x2="${left + 52}" y2="${h - 8}" stroke="#F38E2C" stroke-width="2" stroke-dasharray="4 8"/>
      <text x="${left + 58}" y="${h - 4}" font-size="11" fill="rgba(0,0,0,.45)">前测</text>
      <rect x="${left + 110}" y="${h - 13}" width="8" height="8" rx="2" fill="#133F9E"/>
      <text x="${left + 124}" y="${h - 4}" font-size="11" fill="rgba(0,0,0,.45)">后测</text>`;
    s += '</svg>';
    return s;
  }

  /* ---- ⑥ 能力标签动态数据：Top / Last 双列（TagRankList） ---- */
  // 真实语义（getGroupRank）：按「当前所选标签」在全组的得分排名，不是按总分
  function pdTagRanked(gid, tagNm) {
    const members = G.effectiveMembers(S, gid);
    const arr = members.map((m) => {
      const hit = pdScores(gid, m.userId).find((t) => t.nm === tagNm);
      return { userId: m.userId, nm: personName(m.userId), val: hit && hit.val !== null ? hit.val : -1 };
    }).filter((x) => x.val >= 0).sort((a, b) => b.val - a.val);
    return arr;
  }

  function renderPdTagRank(O, tagNm) {
    const list = tagNm ? pdTagRanked(ui.dashboardGraphId, tagNm) : (O.ranked || []).slice();
    if (!list.length) return '<div class="pd-nodata">暂无数据</div>';
    const total = list.length;
    // 人数少时按「奇偶分列」，避免 Top 满 5 人 Last 空掉；人数多时按前后各 5 人
    const half = total >= 8 ? Math.ceil(total / 2) : Math.ceil(total / 2);
    const top = list.slice(0, Math.min(5, half));
    const last = total > half ? list.slice(half).slice(-5).reverse() : [];
    const badge = (rank) => (rank <= 3 ? `<div class="pd-badge b${rank}">${rank}</div>` : `<div class="pd-badge bd">${rank}</div>`);
    const col = (title, arr, offset) => `<div class="pd-rank-col">
      <div class="pd-rank-col-h">${title}</div>
      <div class="pd-rank-col-body">
        ${arr.map((x, i) => `<div class="pd-rank-line">${badge(offset + i + 1)}<span class="pd-rank-nm">${esc(x.nm)}</span>
          <span class="pd-rank-val">${x.val === undefined ? '' : x.val}</span></div>`).join('')}
      </div></div>`;
    return `<div class="pd-rank-cols">
      ${col('Top', top, 0)}
      ${col('Last', last.length ? last : list.slice(-Math.min(3, total)).reverse(), Math.max(half, total - last.length))}
    </div>`;
  }

  /* ---- ⑧ 排行榜弹层（RankList） ---- */
  function renderPdRankPopover(O, myName) {
    const list = (O.ranked || []).slice();
    const half = Math.ceil(list.length / 2);
    const top = list.slice(0, Math.min(5, half));
    const last = list.length > half ? list.slice(Math.max(half, list.length - 5)).reverse() : [];
    const badge = (rank) => (rank <= 3 ? `<div class="pd-badge b${rank}">${rank}</div>` : `<div class="pd-badge bd">${rank}</div>`);
    const col = (title, arr, offset) => `<div class="pd-rank-col">
      <div class="pd-rank-col-h">${title}</div>
      <div class="pd-rank-col-body">${arr.map((x, i) => `<div class="pd-rank-line">${badge(offset + i + 1)}<span>${esc(x.nm)}</span></div>`).join('')}</div>
    </div>`;
    return `<div class="pd-rk-mask" data-act="pd-rank-close">
      <div class="pd-rk" style="top:420px;right:120px" data-stop="1">
        <div class="pd-rk-head"><b>排行榜</b><button class="pd-rk-close" data-act="pd-rank-close">✕</button></div>
        <div class="pd-rk-body">
          <div class="pd-rk-cols">
            ${col('Top', top, 0)}
            ${col('Last', last, Math.max(0, list.length - last.length))}
          </div>
          <div class="pd-rk-mine"><b>学员排名：</b>
            <em>${O.myRank || 0}</em><span>${esc(myName || '')}</span></div>
        </div>
      </div>
    </div>`;
  }

  /* ---- ⑨ 学课数据统计 ---- */
  function renderPdStat(ST, gid, uid) {
    const g = S.graphs[gid];
    const leaves = G.leafTags(g.tagTree || []);
    const size = 10;
    const total = Math.max(ST.courseDown, 1);
    const rows = leaves.slice((ui.pdPage - 1) * size, ui.pdPage * size).map((t, i) => {
      const done = i % 3 === 0;
      const rate = done ? 100 : (i * 17) % 90;
      return `<tr>
        <td>${esc(t.nm)} · 第 ${i + 1} 课</td>
        <td><span class="pd-tag-cell">${esc(t.nm)}</span></td>
        <td>${i % 2 === 0 ? '必修' : '选修'}</td>
        <td>${rate}%</td>
        <td>${(i % 4) + 1}.0</td>
        <td>${(i % 3) + 1}</td>
        <td>2026-09-${String(10 + i).padStart(2, '0')} 14:${String(10 + i * 3).padStart(2, '0')}</td>
        <td>${rate === 100 ? `2026-09-${String(12 + i).padStart(2, '0')} 16:20` : '--'}</td>
      </tr>`;
    }).join('');
    const pages = Math.ceil(leaves.length / size);
    return `<div class="cp-card pd-stat">
      <div class="cp-card-head"><div class="cp-card-title">学课数据统计</div><div class="cp-card-extra"></div></div>
      <div class="cp-card-body pd-stat-body">
        <div class="pd-panels">
          <div class="pd-panel"><div class="pd-panel-ico">📘</div><div class="pd-panel-txt">
            <div class="k">下发/学习/完成课程数量</div>
            <div class="v">${ST.dispatchCourseNum}/${ST.studyingCourseNum}/${ST.finishCourseNum}</div></div></div>
          <div class="pd-panel"><div class="pd-panel-ico">📝</div><div class="pd-panel-txt">
            <div class="k">完成考试数量</div><div class="v">${ST.finishExamNum}</div></div></div>
          <div class="pd-panel"><div class="pd-panel-ico">🧰</div><div class="pd-panel-txt">
            <div class="k">绩效支持工具使用次数</div><div class="v">${ST.usedToolNum}</div></div></div>
        </div>
        <div class="pd-stat-toolbar">
          <div>明细</div>
          <button class="btn btn-ghost btn-sm" data-act="pd-export">导出</button>
        </div>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>课程名称</th><th>来源标签</th><th>课程类型</th><th>课程进度</th><th>课程学时</th><th>课程学分</th><th>最近学习时间</th><th>完成课程时间</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="8" style="text-align:center;color:rgba(0,0,0,.35)">暂无数据</td></tr>'}</tbody>
        </table></div>
        ${pages > 1 ? `<div class="pager" style="margin-top:12px;justify-content:center">
          ${Array.from({ length: pages }, (_, i) => `<button class="pg ${ui.pdPage === i + 1 ? 'on' : ''}" data-act="pd-page" data-n="${i + 1}">${i + 1}</button>`).join('')}
        </div>` : ''}
      </div></div>`;
  }

  /* ---- 切换学员 / 切换图谱 弹窗 ---- */
  // 全公司浏览只扩展学员端选图，不改变有效关联、导入资格或统计名单。
  function learnerGraphs() {
    const person = S.persons.find(p => p.userId === S.studentUserId);
    const associated = G.accessibleGraphs(S, S.studentUserId);
    return Object.values(S.graphs).filter(g => g.status === 'enabled').map(g => ({
      graphId:g.id, name:g.name, related:(g.positionIds || []).some(id => (person?.positionIds || []).includes(id)),
      associated:associated.some(x => x.graphId === g.id), order:g.order || 0
    })).sort((a,b) => Number(b.related)-Number(a.related) || a.order-b.order || a.name.localeCompare(b.name, 'zh-CN'));
  }

  function renderPdGraphModal() {
    const keyword = (ui.pdGraphQuery || '').trim().toLowerCase();
    const list = learnerGraphs().filter(x => !keyword || x.name.toLowerCase().includes(keyword));
    const pages = Math.max(1, Math.ceil(list.length / 5));
    ui.pdGraphPage = Math.max(1, Math.min(ui.pdGraphPage || 1, pages));
    const pageRows = list.slice((ui.pdGraphPage-1)*5, ui.pdGraphPage*5);
    const tabId = pageRows.some(x=>x.graphId===ui.pdGraphPick) ? ui.pdGraphPick : pageRows[0]?.graphId;
    const rows = pageRows.map(x => {
      const O = x.associated ? pdOverall(x.graphId, S.studentUserId) : null;
      return `<button type="button" class="pd-gm-item ${x.graphId === ui.pdGraphPick ? 'on' : ''}" role="radio" tabindex="${x.graphId===tabId?0:-1}" aria-checked="${x.graphId === ui.pdGraphPick}" data-act="pd-pick-graph" data-gid="${esc(x.graphId)}">
        <span class="pd-gm-radio"></span><span class="pd-gm-info"><span class="pd-gm-name">${esc(x.name)}${x.graphId === ui.dashboardGraphId ? '<span class="cur">当前</span>' : ''}${x.related ? '<span class="pd-gm-related">本岗位</span>' : ''}</span></span>
        ${O && O.covered ? `<span class="pd-gm-score"><b>${O.total}</b><span>胜任力指数</span></span>` : ''}</button>`;
    }).join('');
    return `<div class="pd-gm-mask" data-act="pd-gm-mask"><section class="pd-gm" data-stop="1" role="dialog" aria-modal="true" aria-labelledby="pd-gm-title">
      <div class="pd-gm-head"><b id="pd-gm-title">切换图谱</b><button class="pd-gm-close" data-act="pd-close-graph" aria-label="关闭切换图谱">✕</button></div>
      <div class="pd-gm-search"><input class="input" aria-label="搜索图谱" placeholder="搜索图谱名称" data-act="pd-graph-key" value="${esc(ui.pdGraphKey || '')}"><button class="btn" data-act="pd-graph-search">查询</button></div>
      <div class="pd-gm-list" role="radiogroup" aria-label="图谱列表">${rows || '<div class="pd-gm-empty">未找到符合条件的图谱</div>'}</div>
      <div class="pd-gm-pagination"><span>共 ${list.length} 张</span><button class="btn btn-sm" data-act="pd-graph-page" data-n="${ui.pdGraphPage-1}" ${ui.pdGraphPage<=1?'disabled':''} aria-label="上一页图谱">‹</button><span>${ui.pdGraphPage} / ${pages}</span><button class="btn btn-sm" data-act="pd-graph-page" data-n="${ui.pdGraphPage+1}" ${ui.pdGraphPage>=pages?'disabled':''} aria-label="下一页图谱">›</button></div>
      <div class="pd-gm-foot"><span class="pd-gm-picked">${ui.pdGraphPick ? '已选：'+esc(graphName(ui.pdGraphPick)) : ''}</span><button class="btn btn-ghost" data-act="pd-close-graph">取消</button><button class="btn btn-primary" data-act="pd-apply-graph" ${!learnerGraphs().some(x=>x.graphId===ui.pdGraphPick)?'disabled':''}>确定</button></div>
    </section></div>`;
  }

  function renderProgressCard(graphId, uid) {
    const p = progress.find((x) => x.graphId === graphId && x.userId === uid);
    return `<div class="card"><div class="card-head"><h2>课程进度（评分导入不得改动）</h2>
      <div class="extra"><span class="tag tag-neutral">只读</span></div>
    </div><div class="card-body">
      <div class="stats">
        <div class="stat"><div class="k">已完成课程</div><div class="v">${p ? p.done : 0}</div><div class="d">共 ${p ? p.total : 0} 门</div></div>
        <div class="stat"><div class="k">进度</div><div class="v">${p ? Math.round((p.done / p.total) * 100) : 0}%</div><div class="d">真实学习记录</div></div>
      </div>
      <div class="hint">D07 明确：课程进度与真实学习记录完全不变。导入只更新「有效导入评分」。</div>
    </div></div>`;
  }

  /* ================= 管理驾驶舱 ================= */
  /* 真实对齐：cockpit/src/views/gp/group/light/
     index.vue  → 头部（标题 / 头像+工号 / 更新数据）
     mainContent.vue → 左 302px 筛选栏 + 右侧 9 个 BoxCard
     BoxCard 视图 = 65px 标题行 + 内容区，卡片间距 16px，行内卡片高 407px / 472px
  */

  // 取一组人 + 一组图谱的标签得分聚合
  function cpTagScores(gpIds, userIds) {
    const map = {};
    (gpIds || []).forEach((gid) => {
      const g = S.graphs[gid];
      if (!g) return;
      G.leafTags(g.tagTree || []).forEach((t) => {
        if (!map[t.id]) map[t.id] = { id: t.id, nm: t.nm, level1: t.nm, vals: [] };
      });
    });
    scores.forEach((s) => {
      if (!gpIds.includes(s.graphId) || !userIds.includes(s.userId)) return;
      if (ui.cpConfigId && !G.accessibleGraphs(S,s.userId).some(g=>g.graphId===s.graphId)) return;
      const v = G.computeScore(s).value;
      if (v === null || v === undefined) return;
      if (!map[s.tagId]) return;
      map[s.tagId].vals.push(v);
    });
    // 一级标签 = 该图谱下末级标签的父级归并
    (gpIds || []).forEach((gid) => {
      const g = S.graphs[gid];
      if (!g) return;
      (g.tagTree || []).forEach((l1) => {
        (l1.children || []).forEach((l2) => {
          const leaves = l2.children && l2.children.length ? l2.children : [l2];
          leaves.forEach((lf) => {
            if (map[lf.id]) map[lf.id].level1 = l1.nm;
          });
        });
      });
    });
    return Object.values(map).filter((t) => t.vals.length).map((t) => ({
      id: t.id, nm: t.nm, level1: t.level1,
      avg: G.round1(t.vals.reduce((a, b) => a + b, 0) / t.vals.length),
      count: t.vals.length,
    }));
  }

  // 按一级标签归并
  function cpLevel1(gpIds, userIds) {
    const leaves = cpTagScores(gpIds, userIds);
    const map = {};
    leaves.forEach((t) => {
      if (!map[t.level1]) map[t.level1] = { nm: t.level1, vals: [], ids: [] };
      map[t.level1].vals.push(t.avg);
      map[t.level1].ids.push(t.id);
    });
    return Object.values(map).map((x) => ({
      nm: x.nm, ids: x.ids,
      avg: G.round1(x.vals.reduce((a, b) => a + b, 0) / x.vals.length),
    }));
  }

  function activeCockpitConfig() {
    return (window.GP_COCKPIT_ADMIN?.getPublished(extensionContext()) || []).find(x=>x.id===ui.cpConfigId) || null;
  }

  // 当前驾驶舱范围
  function cpScope() {
    if (ui.cpConfigId) {
      const config=activeCockpitConfig();
      if(!config) return {gids:[],uids:[]};
      const uids=config.userIds.filter(id=>S.persons.some(p=>p.userId===id));
      const gids=[...new Set(config.indicators.map(x=>x.graphId))].filter(id=>S.graphs[id]?.status==='enabled');
      return {gids,uids};
    }
    const tab = ui.cpTab;
    const checkedOf = (key) => (ui.cpChecked[key] || []);
    const gids = [];
    const uids = [];
    Object.keys(S.graphs).forEach((gid) => {
      const members = G.effectiveMembers(S, gid);
      members.forEach((m) => {
        const p = S.persons.find((x) => x.userId === m.userId);
        if (!p) return;
        let hit = false;
        if (tab === 'ORGANIZATION') hit = checkedOf('d:' + p.deptId).includes(gid);
        else if (tab === 'GROUP') hit = (p.groupIds || []).some((g) => checkedOf('g:' + g).includes(gid));
        else if (tab === 'POSITION') hit = (p.positionIds || []).some((x) => checkedOf('p:' + x).includes(gid));
        else hit = checkedOf('gp:' + gid).includes(gid);
        if (!hit) return;
        if (!gids.includes(gid)) gids.push(gid);
        if (!uids.includes(m.userId)) uids.push(m.userId);
      });
    });
    return { gids, uids };
  }

  // 左侧筛选分组（部门 / 群组 / 岗位 / 图谱 四棵树）
  function cpGroups() {
    const tab = ui.cpTab;
    const allGids = Object.keys(S.graphs);
    const pick = (gpId) => `<label class="cp-gp-line"><input type="checkbox" data-act="cp-gp" data-key="{{K}}" data-gid="${gpId}" {{CK}}><span>${esc(S.graphs[gpId].name)}·${G.effectiveMembers(S, gpId).length}人</span></label>`;

    const rows = [];
    if (tab === 'ORGANIZATION') {
      G.departments.forEach((d) => {
        const sub = [];
        (function walk(nodes, prefix) {
          nodes.forEach((n) => {
            const ps = S.persons.filter((p) => p.deptId === n.id || p.deptId.startsWith(n.id + '-'));
            const ids = {};
            ps.forEach((p) => { G.accessibleGraphs(S, p.userId).forEach((g) => { ids[g.graphId] = 1; }); });
            const gpIds = Object.keys(ids).filter((g) => allGids.includes(g));
            sub.push({ key: 'd:' + n.id, name: n.nm, gpIds });
            if (n.sn && n.sn.length) walk(n.sn, prefix + '  ');
          });
        })([d], '');
        rows.push(sub);
      });
    } else if (tab === 'GROUP') {
      G.groups.forEach((g) => {
        const ps = S.persons.filter((p) => (p.groupIds || []).includes(g.id));
        const ids = {};
        ps.forEach((p) => { G.accessibleGraphs(S, p.userId).forEach((x) => { ids[x.graphId] = 1; }); });
        rows.push([{ key: 'g:' + g.id, name: g.nm, gpIds: Object.keys(ids).filter((x) => allGids.includes(x)) }]);
      });
    } else if (tab === 'POSITION') {
      G.positions.forEach((p) => {
        const ps = S.persons.filter((x) => (x.positionIds || []).includes(p.id));
        const ids = {};
        ps.forEach((x) => { G.accessibleGraphs(S, x.userId).forEach((y) => { ids[y.graphId] = 1; }); });
        rows.push([{ key: 'p:' + p.id, name: p.nm, gpIds: Object.keys(ids).filter((x) => allGids.includes(x)) }]);
      });
    } else {
      rows.push(allGids.map((gid) => ({ key: 'gp:' + gid, name: S.graphs[gid].name, gpIds: [gid] })));
    }

    const flat = [].concat.apply([], rows).filter((r) => r.gpIds.length);
    const html = flat.map((r) => {
      const checked = ui.cpChecked[r.key] || [];
      const all = r.gpIds.length && r.gpIds.every((g) => checked.includes(g));
      const some = checked.length && !all;
      const lines = r.gpIds.map((gid) => pick(gid)
        .replace('{{K}}', r.key)
        .replace('{{CK}}', checked.includes(gid) ? 'checked' : '')).join('');
      return `<div class="cp-grp">
        <label class="cp-grp-head">
          <input type="checkbox" data-act="cp-grp" data-key="${r.key}" ${all ? 'checked' : ''} ${some ? 'data-indet="1"' : ''}>
          <span>${esc(r.name)}</span>
        </label>
        <div class="cp-grp-sub">涉及图谱</div>
        ${lines}
      </div>`;
    }).join('');

    return html || '<div class="empty" style="padding:24px 0;">当前分类下暂无可用于驾驶舱的图谱</div>';
  }

  // 右侧各卡数据
  function cpData(sc) {
    const { gids, uids } = sc;
    const lv1 = cpLevel1(gids, uids);
    const leaves = cpTagScores(gids, uids);

    // KAI / BAI：一级标签按均分降序，取前 N 与后 N
    const sorted = lv1.slice().sort((a, b) => b.avg - a.avg);
    let kai = sorted.slice(0, Math.min(4, sorted.length)).map((t) => ({
      name: t.nm, target: Math.min(100, Math.round(t.avg + 12)), current: t.avg,
      warning: Math.max(0, Math.round(t.avg - 18)),
    }));
    let bai = sorted.slice(-Math.min(4, sorted.length)).map((t) => ({
      name: t.nm, target: Math.min(100, Math.round(t.avg + 15)), current: t.avg,
      warning: Math.max(0, Math.round(t.avg - 14)),
    }));

    const config=activeCockpitConfig();
    if(config) {
      const metricItems=type=>config.indicators.filter(x=>x.type===type && gids.includes(x.graphId)).map(x=>{
        const flatten=nodes=>(nodes||[]).flatMap(n=>[n,...flatten(n.children)]);
        const tag=flatten(S.graphs[x.graphId].tagTree).find(t=>t.id===x.tagId);
        if(!tag) return null;
        const ids=G.leafTags([tag]).map(t=>t.id);
        const values=uids.flatMap(uid=>pdScores(x.graphId,uid).filter(t=>ids.includes(t.id)&&t.val!==null).map(t=>t.val));
        if(!values.length) return {name:tag.nm+'（暂无评分）',target:0,current:0,warning:0};
        const avg=G.round1(values.reduce((a,b)=>a+b,0)/values.length);
        return {name:tag.nm,target:Math.min(100,Math.round(avg+12)),current:avg,warning:Math.max(0,Math.round(avg-18))};
      }).filter(Boolean);
      kai=metricItems('KAI'); bai=metricItems('BAI');
    }

    // 各部门能力数据
    const deptMap = {};
    uids.forEach((uid) => {
      const p = S.persons.find((x) => x.userId === uid);
      if (!p) return;
      const mine = config ? gids.flatMap(gid=>pdScores(gid,uid).filter(t=>t.val!==null).map(t=>({avg:t.val}))) : leaves.filter((t) => {
        const own = scores.filter((s) => s.userId === uid && gids.includes(s.graphId) && s.tagId === t.id);
        return own.length;
      });
      if (!deptMap[p.deptName]) deptMap[p.deptName] = [];
      mine.forEach((t) => deptMap[p.deptName].push(t.avg));
    });
    const deptChart = Object.keys(deptMap).filter(k=>deptMap[k].length).map((k) => {
      const vs = deptMap[k];
      const avg = Math.round(vs.reduce((a, b) => a + b, 0) / vs.length);
      return { name: k, target: Math.min(100, avg + 12), current: avg, warning: Math.max(0, avg - 15) };
    });

    // 核心成员岗位能力指数
    const userChart = uids.map((uid) => {
      const vals = [];
      scores.forEach((s) => {
        if (s.userId !== uid || !gids.includes(s.graphId)) return;
        if(config && !G.accessibleGraphs(S,uid).some(g=>g.graphId===s.graphId)) return;
        const v = G.computeScore(s).value;
        if (v !== null && v !== undefined) vals.push(v);
      });
      const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      return { userId:uid, hasScore:vals.length>0, name: personName(uid), target: Math.min(100, avg + 10), current: avg, warning: Math.max(0, avg - 16) };
    }).filter((x) => config ? x.hasScore : x.current > 0);

    const coreChart=config ? userChart.filter(x=>config.coreIds.includes(x.userId)) : userChart;

    // 综合分：最高 / 最低 / 平均
    const userAvgList = userChart.map((x) => x.current);
    const comp = userAvgList.length
      ? { lowest: Math.min.apply(null, userAvgList), highest: Math.max.apply(null, userAvgList),
          total: Math.round(userAvgList.reduce((a, b) => a + b, 0) / userAvgList.length) }
      : { lowest: 0, highest: 0, total: 0 };

    // 历史评分：近 6 期
    const months = ['4月', '5月', '6月', '7月', '8月', '9月'];
    const history = months.map((m, i) => ({
      month: m,
      score: Math.max(30, Math.min(100, comp.total - (months.length - 1 - i) * 3 + (i % 2 ? 1 : -1) * 2)),
      current: i === months.length - 1,
    }));

    // 细分能力指数：一级标签三段分布
    const rel = lv1.map((t) => ({
      name: t.nm,
      low: Math.max(1, Math.round((100 - t.avg) * 0.9)),
      mid: Math.max(1, Math.round(t.avg * 0.55)),
      high: Math.max(1, Math.round(t.avg * 0.45)),
      avg: t.avg,
    }));

    // 学习进度
    const inScope = progress.filter((p) => gids.includes(p.graphId) && uids.includes(p.userId) && (!config || G.accessibleGraphs(S,p.userId).some(g=>g.graphId===p.graphId)));
    const tagCount = inScope.reduce((a, b) => a + b.total, 0);
    const finishTagCount = inScope.reduce((a, b) => a + b.done, 0);
    const courseTotal = inScope.length * 3;
    const examTotal = inScope.length * 1;
    const courseDone = Math.round(tagCount ? (finishTagCount / Math.max(1, tagCount)) * courseTotal : 0);
    const examDone = Math.round(tagCount ? (finishTagCount / Math.max(1, tagCount)) * examTotal : 0);

    // 能力预警：低于预警线的三项
    const warn = leaves.filter((t) => t.avg < 60).sort((a, b) => a.avg - b.avg).slice(0, 6);
    const warnDim = [];
    if (warn.length) {
      warnDim.push({ dimension: 'TAG', name: '能力项', items: warn.map((t) => ({ nm: t.nm, level: t.avg < 45 ? 1 : t.avg < 52 ? 2 : 3 })) });
    }
    const warnDept = deptChart.filter((d) => d.current < 60);
    if (warnDept.length) {
      warnDim.push({ dimension: 'ORG', name: '部门', items: warnDept.map((d) => ({ nm: d.name, level: d.current < 45 ? 1 : 2 })) });
    }
    const warnUser = coreChart.filter((u) => u.current < 60);
    if (warnUser.length) {
      warnDim.push({ dimension: 'USER', name: '核心成员', items: warnUser.map((u) => ({ nm: u.name, level: u.current < 45 ? 1 : 2 })) });
    }

    return { lv1, leaves, kai, bai, deptChart, userChart, coreChart, comp, history, rel, warnDim,
      prog: { rate: tagCount ? Math.round((finishTagCount / tagCount) * 100) : 0, tagCount, finishTagCount },
      course: { title: '下发/完成课程数量', down: courseTotal, finish: courseDone, progress: courseTotal ? Math.round((courseDone / courseTotal) * 100) : 0 },
      exam: { title: '下发/完成考试数量', down: examTotal, finish: examDone, progress: examTotal ? Math.round((examDone / examTotal) * 100) : 0 },
    };
  }

  /* --- SVG 图表：全部按真实 echarts 配置的配色与形态复刻 --- */
  function svgLineDot(items, w, h) {
    // BarWithCircle：细竖条（目标渐变） + 空心圆点（现状 #ED726E） + 虚线（预警 #FF6969）
    const pad = { l: 34, r: 14, t: 16, b: 40 };
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    const n = Math.max(1, items.length);
    const slot = iw / n;
    const y = (v) => pad.t + ih - (v / 100) * ih;
    let g = '';
    [0, 25, 50, 75, 100].forEach((tick) => {
      g += `<line x1="${pad.l}" y1="${y(tick)}" x2="${w - pad.r}" y2="${y(tick)}" stroke="rgba(0,0,0,.10)" stroke-dasharray="3 4"/>`
        + `<text x="${pad.l - 8}" y="${y(tick) + 4}" text-anchor="end" font-size="10" fill="rgba(0,0,0,.45)">${tick}</text>`;
    });
    g += `<line x1="${pad.l}" y1="${pad.t + ih}" x2="${w - pad.r}" y2="${pad.t + ih}" stroke="rgba(0,0,0,.15)"/>`;
    items.forEach((it, i) => {
      const cx = pad.l + slot * i + slot / 2;
      g += `<rect x="${cx - 2}" y="${y(it.target)}" width="4" height="${pad.t + ih - y(it.target)}" fill="url(#cpGrad)" rx="2"/>`;
      g += `<circle cx="${cx}" cy="${y(it.target)}" r="5" fill="#133F9E"/>`;
      g += `<circle cx="${cx}" cy="${y(it.current)}" r="5" fill="#fff" stroke="#ED726E" stroke-width="2.5"/>`;
      g += `<circle cx="${cx}" cy="${y(it.warning)}" r="3" fill="#FF6969"/>`;
      const label = it.name.length > 5 ? it.name.slice(0, 5) + '…' : it.name;
      g += `<text x="${cx}" y="${pad.t + ih + 18}" text-anchor="middle" font-size="10" fill="rgba(0,0,0,.65)">${esc(label)}</text>`;
    });
    return `<svg class="cp-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs>`
      + `<linearGradient id="cpGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#133F9E"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>${g}</svg>`;
  }

  function svgBgBar(items, w, h) {
    // BarWithBgBar：粗底条 #C1CCE6 + 细前景条 #133F9E + 虚线预警
    const pad = { l: 30, r: 14, t: 14, b: 42 };
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    const n = Math.max(1, items.length);
    // 人少时不铺满，避免单根柱子被拉到正中显得空旷
    const slot = n <= 4 ? Math.min(iw / n, 160) : iw / n;
    const offset = n <= 4 ? (iw - slot * n) / 2 : 0;
    const barW = Math.min(26, slot * 0.5);
    const y = (v) => pad.t + ih - (v / 100) * ih;
    let g = '';
    [0, 25, 50, 75, 100].forEach((tick) => {
      g += `<line x1="${pad.l}" y1="${y(tick)}" x2="${w - pad.r}" y2="${y(tick)}" stroke="rgba(0,0,0,.09)" stroke-dasharray="3 4"/>`
        + `<text x="${pad.l - 8}" y="${y(tick) + 4}" text-anchor="end" font-size="10" fill="rgba(0,0,0,.45)">${tick}</text>`;
    });
    g += `<line x1="${pad.l}" y1="${pad.t + ih}" x2="${w - pad.r}" y2="${pad.t + ih}" stroke="rgba(0,0,0,.15)"/>`;
    items.forEach((it, i) => {
      const cx = pad.l + offset + slot * i + slot / 2;
      g += `<rect x="${cx - barW / 2}" y="${y(it.target)}" width="${barW}" height="${Math.max(0, pad.t + ih - y(it.target))}" fill="#C1CCE6" rx="4"/>`;
      const inner = barW * 0.5;
      g += `<rect x="${cx - inner / 2}" y="${y(it.current)}" width="${inner}" height="${Math.max(0, pad.t + ih - y(it.current))}" fill="#133F9E" rx="2"/>`;
      g += `<circle cx="${cx + barW / 2 + 6}" cy="${y(it.warning)}" r="2.5" fill="#FF6969"/>`;
      const label = it.name.length > 6 ? it.name.slice(0, 6) + '…' : it.name;
      g += `<text x="${cx}" y="${pad.t + ih + 18}" text-anchor="middle" font-size="10" fill="rgba(0,0,0,.65)">${esc(label)}</text>`;
    });
    return `<svg class="cp-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${g}</svg>`;
  }

  // 学习进度环形仪表（Progress：270° 圆环 + 132px 尺寸 + 渐变色）
  function svgGauge(pct, size) {
    const r = size / 2 - 9;
    const circ = 2 * Math.PI * r;
    const arc = circ * 0.75;
    const on = arc * Math.min(100, Math.max(0, pct)) / 100;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#EDF0F8" stroke-width="14"
        stroke-dasharray="${arc} ${circ}" transform="rotate(135 ${size / 2} ${size / 2})"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#133F9E" stroke-width="14" stroke-linecap="round"
        stroke-dasharray="${on} ${circ}" transform="rotate(135 ${size / 2} ${size / 2})"/>
      <text x="${size / 2}" y="${size / 2 + 2}" text-anchor="middle" font-size="27" font-weight="500" fill="#333">${pct}<tspan font-size="12">%</tspan></text>
      <text x="${size / 2}" y="${size / 2 + 22}" text-anchor="middle" font-size="11" fill="#8c8c8c">当前进度</text>
    </svg>`;
  }

  // 单条横向进度（SingleBar：14px 高圆角条 + 渐变）
  function svgSingleBar(pct) {
    return `<svg class="cp-single-bar" viewBox="0 0 200 14" preserveAspectRatio="none">
      <rect x="0" y="0" width="200" height="14" rx="7" fill="#f5f5f5"/>
      <rect x="0" y="0" width="${Math.min(200, 2 * pct)}" height="14" rx="7" fill="url(#cpBarGrad)"/>
      <defs><linearGradient id="cpBarGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#D4E0FD"/><stop offset="1" stop-color="#133FA0"/></linearGradient></defs>
    </svg>`;
  }

  // 半环对比（ScoreCompare：圆环 240°，中心平均分，弧上打最低/最高两个点，下方图例给值）
  function svgScoreCompare(comp) {
    const w = 300, h = 196, cx = w / 2, cy = 122, r = 82;
    const at = (pct) => {
      const deg = 150 + (240 * pct / 100);
      const a = (deg * Math.PI) / 180;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    const p0 = at(0), p100 = at(100);
    let g = `<path d="M ${p0[0]} ${p0[1]} A ${r} ${r} 0 1 1 ${p100[0]} ${p100[1]}" fill="none" stroke="#EDF0F8" stroke-width="14" stroke-linecap="round"/>`;
    const fp = at(Math.max(0, Math.min(100, comp.total)));
    g += `<path d="M ${p0[0]} ${p0[1]} A ${r} ${r} 0 1 1 ${fp[0]} ${fp[1]}" fill="none" stroke="#133F9E" stroke-width="14" stroke-linecap="round"/>`;
    // 弧上两个标记点，不加文字（避免在窄角处相撞）
    [[comp.lowest, '#C2CCE4'], [comp.highest, '#ED726E']].forEach(([v, c]) => {
      const pt = at(Math.max(1, Math.min(99, v)));
      g += `<circle cx="${pt[0]}" cy="${pt[1]}" r="5.5" fill="#fff" stroke="${c}" stroke-width="3"/>`;
    });
    g += `<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="32" font-weight="500" fill="#133F9E">${comp.total}</text>`;
    g += `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="11" fill="rgba(0,0,0,.45)">团队平均分</text>`;
    // 下方图例：最低 / 最高带数值，横向排布不重叠
    const ly = h - 10;
    g += `<circle cx="${cx - 56}" cy="${ly - 4}" r="4" fill="#fff" stroke="#C2CCE4" stroke-width="2.5"/>`;
    g += `<text x="${cx - 46}" y="${ly}" font-size="10" fill="rgba(0,0,0,.55)">最低分 ${comp.lowest}</text>`;
    g += `<circle cx="${cx + 22}" cy="${ly - 4}" r="4" fill="#fff" stroke="#ED726E" stroke-width="2.5"/>`;
    g += `<text x="${cx + 32}" y="${ly}" font-size="10" fill="rgba(0,0,0,.55)">最高分 ${comp.highest}</text>`;
    return `<svg class="cp-svg" viewBox="0 0 ${w} ${h}">${g}</svg>`;
  }

  // 历史评分柱（HistoryScore：100px 高，偶数 #133F9E 奇数 #C1CCE6，当前期 #EABFC3）
  function svgHistory(list) {
    const w = 300, h = 100, pad = { l: 8, r: 8, t: 10, b: 22 };
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    const n = list.length, slot = iw / n, bw = 14;
    let g = '';
    list.forEach((it, i) => {
      const cx = pad.l + slot * i + slot / 2;
      const bh = Math.max(4, (it.score / 100) * ih);
      const color = it.current ? '#EABFC3' : (i % 2 === 0 ? '#133F9E' : '#C1CCE6');
      g += `<rect x="${cx - bw / 2}" y="${pad.t}" width="${bw}" height="${ih}" rx="4" fill="#F5F5F5"/>`;
      g += `<rect x="${cx - bw / 2}" y="${pad.t + ih - bh}" width="${bw}" height="${bh}" rx="4" fill="${color}"/>`;
      g += `<text x="${cx}" y="${pad.t + ih - bh - 4}" text-anchor="middle" font-size="9" fill="rgba(0,0,0,.35)">${it.score}</text>`;
      g += `<text x="${cx}" y="${h - 6}" text-anchor="middle" font-size="10" fill="rgba(0,0,0,.55)">${esc(it.month)}</text>`;
    });
    return `<svg class="cp-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${g}</svg>`;
  }

  // 相对能力堆叠条（RelativeAbility：low/mid/high 三段横向堆叠）
  function svgRelative(list) {
    const rowH = 26, w = 360;
    const h = rowH * list.length + 8;
    const maxV = Math.max.apply(null, list.map((x) => x.low + x.mid + x.high).concat([1]));
    const left = 68, right = 34;
    let g = '';
    list.forEach((it, i) => {
      const y = 4 + i * rowH;
      const total = it.low + it.mid + it.high;
      const full = (total / maxV) * (w - left - right);
      const wl = (it.low / total) * full;
      const wm = (it.mid / total) * full;
      const wh = (it.high / total) * full;
      const label = it.name.length > 5 ? it.name.slice(0, 5) + '…' : it.name;
      g += `<text x="0" y="${y + 14}" font-size="10" fill="rgba(0,0,0,.65)">${esc(label)}</text>`;
      g += `<rect x="${left}" y="${y + 5}" width="${wl}" height="12" fill="#C1CCE6" rx="2"/>`;
      g += `<rect x="${left + wl}" y="${y + 5}" width="${wm}" height="12" fill="#8FA3CC"/>`;
      g += `<rect x="${left + wl + wm}" y="${y + 5}" width="${wh}" height="12" fill="#133F9E" rx="2"/>`;
      g += `<text x="${w - 4}" y="${y + 14}" text-anchor="end" font-size="10" fill="#133F9E" font-weight="500">${it.avg}</text>`;
    });
    // 三段图例
    const ly = h - 2;
    g += `<rect x="${left}" y="${ly - 8}" width="8" height="8" fill="#C1CCE6" rx="1"/><text x="${left + 12}" y="${ly}" font-size="9" fill="rgba(0,0,0,.45)">低</text>`;
    g += `<rect x="${left + 32}" y="${ly - 8}" width="8" height="8" fill="#8FA3CC" rx="1"/><text x="${left + 44}" y="${ly}" font-size="9" fill="rgba(0,0,0,.45)">中</text>`;
    g += `<rect x="${left + 64}" y="${ly - 8}" width="8" height="8" fill="#133F9E" rx="1"/><text x="${left + 76}" y="${ly}" font-size="9" fill="rgba(0,0,0,.45)">高</text>`;
    return `<svg class="cp-svg" viewBox="0 0 ${w} ${h + 12}">${g}</svg>`;
  }

  // 一级标签雷达（RadarChart：前测 #133F9E / 后测 #ED726E，多边形底 #E7EEFE / #FCE9E9）
  function svgRadar(list) {
    const size = 240, c = size / 2, R = 78;
    const n = Math.max(3, list.length);
    const pt = (i, ratio) => {
      const a = (-90 + (360 / n) * i) * Math.PI / 180;
      return [c + R * ratio * Math.cos(a), c + R * ratio * Math.sin(a)];
    };
    let g = '';
    [0.25, 0.5, 0.75, 1].forEach((ring) => {
      const pts = list.map((_, i) => pt(i, ring).join(',')).join(' ');
      g += `<polygon points="${pts}" fill="none" stroke="rgba(0,0,0,.10)"/>`;
    });
    list.forEach((_, i) => {
      const p = pt(i, 1);
      g += `<line x1="${c}" y1="${c}" x2="${p[0]}" y2="${p[1]}" stroke="rgba(0,0,0,.08)"/>`;
    });
    const shape = (key, fill, stroke) => {
      const pts = list.map((it, i) => pt(i, Math.max(0.05, (it[key] || 0) / 100)).join(',')).join(' ');
      return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
    };
    g += shape('post', '#E7EEFE', '#133F9E');
    g += shape('pre', '#FCE9E9', '#ED726E');
    list.forEach((it, i) => {
      const p = pt(i, 1.22);
      const label = it.nm.length > 5 ? it.nm.slice(0, 5) + '…' : it.nm;
      g += `<text x="${p[0]}" y="${p[1] + 3}" text-anchor="middle" font-size="10" fill="rgba(0,0,0,.65)">${esc(label)}</text>`;
    });
    return `<svg viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
  }

  // 二级标签条形（ScrollBarChart：横向滚动的柱，可选高亮）
  function svgScrollBar(list, activeNm) {
    const w = 300, h = 250;
    const n = list.length || 1;
    const slot = n <= 4 ? Math.min(70, (w - 60) / n) : Math.max(18, Math.min(40, (w - 40) / n));
    const offset = n <= 4 ? ((w - 60) - slot * n) / 2 : 0;
    const ih = h - 60;
    const bw = n <= 4 ? 22 : 10;
    let g = '';
    list.forEach((it, i) => {
      const cx = 30 + offset + slot * i + slot / 2;
      const bh = Math.max(3, (it.avg / 100) * ih);
      const on = it.nm === activeNm;
      g += `<rect x="${cx - bw / 2}" y="${8 + ih - bh}" width="${bw}" height="${bh}" rx="4" fill="${on ? '#133F9E' : '#C3CCE4'}"/>`;
      g += `<text x="${cx}" y="${8 + ih - bh - 6}" text-anchor="middle" font-size="10" fill="${on ? '#133F9E' : 'rgba(0,0,0,.45)'}">${it.avg}</text>`;
      const lb = it.nm.length > 5 ? it.nm.slice(0, 5) : it.nm;
      g += `<text x="${cx}" y="${8 + ih + 16}" text-anchor="middle" font-size="9" fill="rgba(0,0,0,.55)" transform="rotate(28 ${cx} ${8 + ih + 16})">${esc(lb)}</text>`;
    });
    return `<svg class="cp-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${g}</svg>`;
  }

  function renderCockpit() {
    const config=activeCockpitConfig();
    const published=window.GP_COCKPIT_ADMIN?.getPublished(extensionContext()) || [];
    const cockpitLabel = config ? ({group:'团队',organization:'组织',busSeq:'业务序列'}[config.type] || '团队') : '团队';
    const sc = cpScope();
    const D = cpData(sc);
    const has = sc.uids.length > 0 && sc.gids.length > 0;

    const card = (title, body, cls, extra) => `<div class="cp-card ${cls || ''}">
      <div class="cp-card-head"><div class="cp-card-title" title="${esc(title)}">${esc(title)}</div>
        <div class="cp-card-extra">${extra || ''}</div></div>
      <div class="cp-card-body">${body}</div></div>`;

    const gear = '<button class="cp-gear" data-act="cp-warn-setting" title="预警设置">⚙</button>';
    const tip = (t) => `<span class="cp-tip" data-act="cp-tip" data-tip="${esc(t)}">?</span>`;

    // 左栏
    const tabs = [['ORGANIZATION', '按部门'], ['GROUP', '按群组'], ['POSITION', '按岗位'], ['GP', '图谱']];
    const sidebar = ui.cpConfigId && !config ? `<div class="cp-left"><div class="cp-left-head">驾驶舱不可用</div><div class="cp-config-summary"><p>请重新选择已发布的驾驶舱。</p><button class="btn" data-act="go" data-page="cockpitAdmin">前往配置管理</button></div></div>` : config ? `<div class="cp-left"><div class="cp-left-head">${esc(config.name)}</div><div class="cp-config-summary"><p>管理者：${esc(personName(config.managerId))}</p><p>所含学员：${sc.uids.length} 人</p><p>核心人员：${config.coreIds.filter(id=>sc.uids.includes(id)).length} 人</p><p>驾驶舱指标：${config.indicators.length} 项</p><button class="btn" data-act="cp-view-config">查看配置</button></div><div class="cp-left-tbl"><table class="tbl"><thead><tr><th>工号</th><th>姓名</th></tr></thead><tbody>${sc.uids.map(uid=>{const p=S.persons.find(x=>x.userId===uid);return `<tr><td>${esc(p.employeeCode)}</td><td>${esc(p.userName)}</td></tr>`;}).join('')}</tbody></table></div></div>` : `<div class="cp-left">
      <div class="cp-left-head">我的团队</div>
      <div class="cp-tabs">${tabs.map(([k, lb]) => `<button class="cp-tab ${ui.cpTab === k ? 'is-on' : ''}" data-act="cp-tab" data-k="${k}">${lb}</button>`).join('')}</div>
      <div class="cp-left-scroll">${cpGroups()}</div>
      <div class="cp-left-ops">
        <button class="btn btn-sm btn-primary" data-act="cp-filter">筛 选</button>
        <button class="btn btn-sm btn-ghost" data-act="cp-reset">重 置</button>
      </div>
      <div class="cp-left-divider"></div>
      <div class="cp-left-sub">筛选所含学员</div>
      <div class="cp-left-search">
        <input class="input" placeholder="姓名/工号" data-act="cp-kw" value="${esc(ui.cpKeyword || '')}">
      </div>
      <div class="cp-left-tbl">
        <table class="tbl tbl-sm"><thead><tr><th>姓名</th><th>工号</th><th>部门</th></tr></thead>
        <tbody>${(sc.uids.length ? sc.uids : []).slice(0, 6).map((uid) => {
          const p = S.persons.find((x) => x.userId === uid) || {};
          return `<tr><td>${esc(p.userName || '')}</td><td class="mono">${esc(p.employeeCode || '')}</td><td>${esc(p.deptName || '')}</td></tr>`;
        }).join('') || '<tr><td colspan="3"><div class="empty">请从上方选择范围</div></td></tr>'}</tbody></table>
      </div>
    </div>`;

    // 能力预警 + 发展建议（仅当有预警时出现）
    let warnBlock = '';
    if (has && D.warnDim.length) {
      const strong = '<strong>以下分项低于预警线，请重点关注！</strong>';
      const dims = D.warnDim.map((d) => `<div class="cp-warn-col">
        <div class="cp-warn-col-head">${d.dimension === 'TAG' ? '◈' : d.dimension === 'ORG' ? '▤' : '◉'} ${esc(d.name)}</div>
        <div class="cp-warn-col-body">${d.items.map((it) => `<div class="cp-warn-row"><span class="cp-warn-nm" title="${esc(it.nm)}">${esc(it.nm)}</span><span class="cp-warn-lv lv${it.level}">${it.level === 1 ? '高' : it.level === 2 ? '中' : '低'}</span></div>`).join('')}</div>
      </div>`).join('');
      warnBlock = `<div class="cp-row">
        ${card('能力预警', `<div class="cp-warn-bar">⚠ ${strong}</div><div class="cp-warn-cols">${dims}</div>`, 'cp-h407')}
        ${card('发展建议', `<div class="cp-sugg">
          <div class="cp-sugg-item"><div class="cp-sugg-text">您的团队在以下能力项中得分为 <b>&lt; 60</b>，处于较低水平，需要进行基础能力培养，学习专门的培训和资源，以加强基本技能和知识。</div>
            <div class="cp-chips">${D.warnDim[0].items.slice(0, 3).map((x) => `<span class="cp-chip hot">${esc(x.nm)}</span>`).join('')}<span class="cp-chip hot">基础能力培养</span><span class="cp-chip hot">加强基本技能</span></div></div>
          <div class="cp-sugg-item"><div class="cp-sugg-text">得分为 [60, 80)，处于中等水平，有一定的上升空间，需要进一步深化和拓展在特定领域的专业知识和技能。</div>
            <div class="cp-chips"><span class="cp-chip">深化和拓展</span><span class="cp-chip">鼓励团队参与培训</span></div></div>
        </div>`, 'cp-h407')}
      </div>`;
    }

    // 关键能力 / 基础能力
    const kaiBai = has ? `<div class="cp-row">
      ${card(cockpitLabel+'关键能力指标', `<div class="cp-cap-desc">业务达成的关键团队能力指标（变革中"新增"能力或业务达成"瓶颈"能力）${tip(config ? '来自已发布驾驶舱中配置的 KAI' : '取均分最高的一级标签')}</div>${svgLineDot(D.kai, 480, 300)}`, 'cp-h407', gear)}
      ${card(cockpitLabel+'基础能力指标', `<div class="cp-cap-desc">基础能力业务指标</div>${svgLineDot(D.bai, 480, 300)}`, 'cp-h407', gear)}
    </div>` : '';

    // 各部门 / 核心成员
    const deptCore = has ? `<div class="cp-row">
      ${card('各部门能力数据', svgBgBar(D.deptChart, 980, 300), 'cp-h407', gear)}
    </div>
    <div class="cp-row">
      ${card('核心'+cockpitLabel+'成员岗位能力指数', svgBgBar(D.coreChart.slice(0, 8), 980, 300), 'cp-h407', gear)}
    </div>` : '';

    // 三卡：综合分 / 细分能力 / 学习进度
    const tri = has ? `<div class="cp-row cp-row-3">
      ${card('岗位能力综合指数团队平均分', `<div class="cp-cap-desc">该总分平均分为所选多个图谱的学员总分的平均分 ${tip('多图各自计算总分后取平均')}</div>
        <div class="cp-score-wrap">${svgScoreCompare(D.comp)}</div>
        <div class="cp-history"><div class="cp-history-label">历史评分</div>${svgHistory(D.history)}</div>`, 'cp-h472')}
      ${card('团队细分能力指数', `<div class="cp-cap-desc">此模块一级标签包含所选多个图谱的一级标签</div>
        <div class="cp-rel-wrap">${svgRelative(D.rel)}</div>`, 'cp-h472')}
      ${card('学习进度', `<div class="cp-cap-desc">此模块包括所选多个图谱中所有标签的学习进度</div>
        <div class="cp-prog">
          <div class="cp-prog-gauge">${svgGauge(D.prog.rate, 132)}</div>
          <div class="cp-prog-nums">
            <div><div class="cp-prog-k">下发标签数</div><div class="cp-prog-v">${D.prog.tagCount}</div></div>
            <div><div class="cp-prog-k">完成标签数</div><div class="cp-prog-v">${D.prog.finishTagCount}</div></div>
          </div>
        </div>
        <div class="cp-bars">
          <div class="cp-bar-row"><span class="cp-bar-icon">▤</span><div class="cp-bar-main"><div class="cp-bar-head"><span>${D.course.title}</span><b>${D.course.down}/${D.course.finish}</b></div>${svgSingleBar(D.course.progress)}</div></div>
          <div class="cp-bar-row"><span class="cp-bar-icon">◫</span><div class="cp-bar-main"><div class="cp-bar-head"><span>${D.exam.title}</span><b>${D.exam.down}/${D.exam.finish}</b></div>${svgSingleBar(D.exam.progress)}</div></div>
        </div>`, 'cp-h472')}
    </div>` : '';

    // 雷达 / 二级条形 / 排名
    const tag1 = ui.cpTrendTag || (D.lv1[0] && D.lv1[0].nm) || '';
    const radarList = D.lv1.map((t) => ({ nm: t.nm, pre: Math.max(10, t.avg - 12), post: t.avg }));
    const sub2 = D.leaves.filter((t) => t.level1 === tag1).slice(0, 10);
    const rankTag = ui.cpRankTag || (D.leaves[0] && D.leaves[0].nm) || '';
    const ranked = D.userChart.slice().sort((a, b) => b.current - a.current);
    // 人数少时 Top / Last 不重复展示同一人：一半归 Top，一半归 Last
    const half = Math.ceil(ranked.length / 2);
    const topList = ranked.slice(0, Math.min(5, half));
    const lastList = ranked.length > half
      ? ranked.slice(Math.max(half, ranked.length - 5))
      : [];

    const trip = has ? `<div class="cp-row cp-row-3">
      ${card('一级能力标签动态数据', `<div class="cp-cap-desc">此模块一级标签包含所选多个图谱的一级标签，可选择展示的一级标签</div>
        <div class="cp-radar-wrap">${svgRadar(radarList)}</div>`, 'cp-h472',
        `<select class="select-sm" data-act="cp-quarter"><option>当前</option><option>上季度</option><option>去年同期</option></select>`)}
      ${card('二级能力标签动态数据', `<div class="cp-tagsel"><span class="cp-tagsel-k">所选一级能力标签：</span><span class="cp-tagsel-v">${esc(tag1 || '—')}</span></div>
        <div class="cp-scrollwrap">${svgScrollBar(sub2, (sub2[0] || {}).nm)}</div>`, 'cp-h472',
        `<select class="select-sm" data-act="cp-quarter-" data-k="2"><option>当前</option><option>上季度</option></select>`)}
      ${card('能力标签排名', `<div class="cp-tagsel"><span class="cp-tagsel-k">所选能力标签：</span><span class="cp-tagsel-v">${esc(rankTag || '—')}</span></div>
        <div class="cp-rank">
          <div class="cp-rank-col"><div class="cp-rank-head">Top</div>${topList.length ? topList.map((u, i) => `<div class="cp-rank-row"><span class="cp-rank-no n${i + 1}">${i + 1}</span><span class="cp-rank-nm">${esc(u.name)}</span><span class="cp-rank-sc">${u.current}</span></div>`).join('') : '<div class="cp-rank-row"><span class="cp-rank-nm" style="color:var(--text-45);">暂无可排名学员</span></div>'}</div>
          <div class="cp-rank-col"><div class="cp-rank-head">Last</div>${lastList.length ? lastList.map((u, i) => {
            const no = ranked.length - lastList.length + i + 1;
            return `<div class="cp-rank-row"><span class="cp-rank-no">${no}</span><span class="cp-rank-nm">${esc(u.name)}</span><span class="cp-rank-sc">${u.current}</span></div>`;
          }).join('') : '<div class="cp-rank-row"><span class="cp-rank-nm" style="color:var(--text-45);">仅 ' + ranked.length + ' 人，无末位区间</span></div>'}</div>
        </div>`, 'cp-h472')}
    </div>` : '';

    // 学习数据统计
    const statCards = [
      { label: '完成/学习/下发课程数量', value: `${D.course.finish}/${Math.round(D.course.down * 0.7)}/${D.course.down}` },
      { label: '完成/下发考试数量', value: `${D.exam.finish}/${D.exam.down}` },
      { label: '绩效支持工具使用次数', value: D.prog.tagCount ? Math.round(D.prog.tagCount * 1.6) : 0 },
    ];
    const statisRows = sc.uids.map((uid) => {
      const p = S.persons.find((x) => x.userId === uid) || {};
      const u = D.userChart.find((x) => x.userId === uid) || { current: config ? '—' : 0 };
      const pr = progress.filter((x) => x.userId === uid && sc.gids.includes(x.graphId) && (!config || G.accessibleGraphs(S,uid).some(g=>g.graphId===x.graphId)));
      const tot = pr.reduce((a, b) => a + b.total, 0);
      const don = pr.reduce((a, b) => a + b.done, 0);
      return `<tr>
        <td>${esc(p.userName || '')}</td><td>${esc(p.deptName || '')}</td>
        <td>${esc((p.positionIds || []).map(posName).join('、'))}</td>
        <td>${esc((p.groupIds || []).map(groupName).join('、') || '—')}</td>
        <td>${esc(sc.gids.filter(gid=>!config||G.accessibleGraphs(S,uid).some(g=>g.graphId===gid)).map(graphName).join('、') || '—')}</td>
        <td class="num" style="font-weight:700;color:#133f9e;">${u.current}</td>
        <td class="num">${Math.round(don * 0.6)}/${Math.round(tot * 0.8)}/${tot}</td>
        <td class="num">${don}/${tot}</td>
        <td class="num">${Math.round(don * 1.6)}</td>
        <td class="cp-op" data-act="cp-to-person">查看</td>
      </tr>`;
    }).join('');

    const statis = `<div class="cp-row">${card('学习数据统计', `
      <div class="cp-stat-panels">${statCards.map((s) => `<div class="cp-stat"><div class="cp-stat-icon">▣</div><div><div class="cp-stat-k">${esc(s.label)}</div><div class="cp-stat-v">${s.value}</div></div></div>`).join('')}</div>
      <div class="cp-statis-head"><div>学员数据统计</div>
        <div class="cp-statis-ops"><span>部门：</span>
          <select class="select-sm"><option>请选择</option>${G.departments.map((d) => `<option>${esc(d.nm)}</option>`).join('')}</select>
          <button class="btn btn-sm btn-primary">筛 选</button>
          <button class="btn btn-sm btn-ghost">导出</button>
        </div></div>
      <div class="table-wrap"><table class="tbl tbl-sm">
        <thead><tr><th>学员名称</th><th>部门</th><th>岗位</th><th>群组</th><th>关联图谱</th><th class="num">岗位能力综合指数</th><th class="num">完成/学习/下发课程</th><th class="num">完成/下发考试</th><th class="num">浏览工具次数</th><th>个人仪表盘</th></tr></thead>
        <tbody>${statisRows || '<tr><td colspan="10"><div class="empty">请从左侧选择筛选范围</div></td></tr>'}</tbody>
      </table></div>`, '')}</div>`;

    return `
      <div class="cp-shell">
        <div class="cp-top">
          <div class="cp-top-user">
            <div class="cp-avatar">团</div>
            <div><div class="cp-top-name">${esc(config ? personName(config.managerId) : '张明')}</div><div class="cp-top-code"><span class="dim">工号：</span>${esc(config ? S.persons.find(p=>p.userId===config.managerId)?.employeeCode || '—' : 'T2024001')}</div></div>
          </div>
          <div class="cp-top-title">${esc(config?.name || '团队能力驾驶舱')}</div>
          <div class="cp-top-ops"><select class="select-native cp-config-select" data-act="cp-select-config" aria-label="选择驾驶舱"><option value="">按图谱筛选</option>${ui.cpConfigId && !config ? `<option value="${esc(ui.cpConfigId)}" selected disabled>驾驶舱已停用或删除</option>` : ''}${published.map(x=>`<option value="${esc(x.id)}" ${x.id===ui.cpConfigId?'selected':''}>${esc(x.name)}</option>`).join('')}</select><button class="btn btn-sm btn-ghost cp-refresh" data-act="cp-refresh">更新数据 ↻</button></div>
        </div>
        ${sidebar}
        <div class="cp-right">
          <div class="cp-right-inner">
            ${has ? '' : `<div class="cp-empty-tip">${ui.cpConfigId ? config ? '驾驶舱暂无可展示的已启用图谱，请检查配置。' : '该驾驶舱已停用或删除，请重新选择驾驶舱。' : '左侧「我的团队」尚未选择任何范围。勾选任一部门 / 群组 / 岗位下的图谱后，右侧卡片开始计算。'}</div>`}
            ${warnBlock}${kaiBai}${deptCore}${tri}${trip}${statis}
          </div>
        </div>
      </div>`;
  }

  /* ================= 无有效图谱学员 ================= */
  function noGraphRows() {
    const keyword = String(ui.noGraphKeyword || '').trim().toLowerCase();
    return S.persons.filter(p => G.accessibleGraphs(S, p.userId).length === 0
      && (!keyword || [p.userName, p.employeeCode, p.deptName].some(value => String(value || '').toLowerCase().includes(keyword))));
  }

  function renderNoGraph() {
    const state = ui.noGraphState || 'normal';
    const keyword = ui.noGraphKeyword || '';
    const rows = noGraphRows();
    let body;
    if (state === 'loading') {
      body = '<div class="loading" role="status"><div class="spin"></div><div>正在加载学员名单…</div></div>';
    } else if (state === 'fail') {
      body = '<div class="empty" role="alert"><div class="empty-title">学员名单加载失败</div><button class="btn" data-act="no-graph-retry">重新加载</button></div>';
    } else if (state === 'empty' || !rows.length) {
      const searched = Boolean(keyword.trim());
      body = `<div class="empty"><div class="empty-title">${searched ? '未找到符合条件的学员' : '当前学员均已关联有效图谱'}</div>
        ${searched ? '<div>请尝试其他姓名、工号或部门。</div><button class="btn" data-act="no-graph-reset">清空搜索</button>' : ''}</div>`;
    } else {
      body = `<div class="table-wrap"><table class="tbl no-graph-table"><thead><tr><th style="width:56px;">序号</th><th>工号</th><th>姓名</th><th>部门</th><th>岗位</th></tr></thead>
        <tbody>${rows.map((p, i) => `<tr data-uid="${esc(p.userId)}"><td>${i + 1}</td><td class="mono">${esc(p.employeeCode)}</td><td>${esc(p.userName)}</td><td>${esc(p.deptName)}</td><td>${(p.positionIds || []).map(posName).map(esc).join('、') || '—'}</td></tr>`).join('')}</tbody></table></div>`;
    }
    return `<header class="gp-head no-graph-head"><div class="page-title-with-back"><button class="page-back" data-act="go" data-page="list" aria-label="返回图谱中心" title="返回图谱中心"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5 7 12l7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button><h1 class="gp-head-title">无有效图谱学员</h1></div>
      <div class="gp-head-ops"><button class="btn btn-primary" data-act="no-graph-export" ${state !== 'normal' || !rows.length ? 'disabled' : ''}>导出</button></div></header>
      <section class="no-graph-content"><div class="toolbar"><input class="input" data-act="no-graph-search" aria-label="搜索无图谱学员" placeholder="搜索姓名、工号或部门" value="${esc(keyword)}"></div>${body}</section>`;
  }

  /* ================= 覆盖层：抽屉 / 弹窗 / 提示 ================= */
  function renderOverlays() {
    let html = window.GP_BUILDER?.render(builderContext()) || '';
    if (ui.sidebarOpen) html += renderPicker();
    if (ui.lcPicker) html += window.GP_CONFIG.renderPicker(extensionContext());
    if (ui.page === 'dashboard' && ui.pdGraphModal) html += renderPdGraphModal();
    if (ui.modal) html += renderModal();
    if (ui.popover) html += `<div class="popover" id="gp-popover" role="dialog"><div class="pop-title">自动同步说明</div><div>${ui.popover.text}</div></div>`;
    html += window.GP_REMIX?.renderOverlays(extensionContext()) || '';
    html += `<div class="toast-stack">${ui.toasts.map((t) => `<div class="toast ${t.type}">${esc(t.msg)}</div>`).join('')}</div>`;
    return html;
  }

  /* --- 选人抽屉：结构按 tbc-antd CustomSelectModal(USER 预设) --- */
  function renderPicker() {
    const f = ui.pickerFilter;
    const PAGE = 10;
    const gid = S.selectedGraphId;
    const bucket = S.rel[gid] || {};
    const picked = Array.from(ui.pickerSel);

    // 待选：按搜索 + 当前树节点过滤
    let list = S.persons.slice();
    const kw = String(f.keyword || '').trim();
    if (kw) list = list.filter((p) => p.userName.includes(kw) || p.employeeCode.includes(kw) || (p.userNamePinyin || '').includes(kw.toLowerCase()));
    if (f.nodeId) {
      if (f.tree === 'POSITION') list = list.filter((p) => (p.positionIds || []).includes(f.nodeId));
      if (f.tree === 'GROUP') list = list.filter((p) => (p.groupIds || []).includes(f.nodeId));
      if (f.tree === 'ORGANIZATION') {
        list = f.includeChild === false
          ? list.filter((p) => p.deptId === f.nodeId)
          : list.filter((p) => p.deptId === f.nodeId || p.deptId.startsWith(f.nodeId + '-'));
      }
    }
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    const pg = Math.min(Math.max(1, ui.pickerPage || 1), pages);
    const pageRows = list.slice((pg - 1) * PAGE, pg * PAGE);

    // 左树：部门（含子部门）/ 岗位 / 群组 三个折叠区
    const openD = f.openOrg !== false;
    const openP = !!f.openPos;
    const openG = !!f.openGrp;
    const caret = (on) => `<span class="pick-caret">${on ? '▾' : '▸'}</span>`;

    const deptTree = G.departments.map((d) => {
      const on = f.nodeId === d.id;
      const kids = (d.sn || []).map((s) => {
        const onS = f.nodeId === s.id;
        return `<button class="pick-node is-child ${onS ? 'active' : ''}" data-act="pick-node" data-tree="ORGANIZATION" data-id="${s.id}">
          <span class="pick-dot"></span>${esc(s.nm)}</button>`;
      }).join('');
      return `<button class="pick-node ${on ? 'active' : ''}" data-act="pick-node" data-tree="ORGANIZATION" data-id="${d.id}">
          <span class="pick-dot"></span>${esc(d.nm)}</button>${kids}`;
    }).join('');

    const posTree = G.positions.map((p) => `<button class="pick-node ${f.nodeId === p.id && f.tree === 'POSITION' ? 'active' : ''}"
      data-act="pick-node" data-tree="POSITION" data-id="${p.id}"><span class="pick-dot"></span>${esc(p.nm)}</button>`).join('');

    const grpTree = G.groups.map((g) => `<button class="pick-node ${f.nodeId === g.id && f.tree === 'GROUP' ? 'active' : ''}"
      data-act="pick-node" data-tree="GROUP" data-id="${g.id}"><span class="pick-dot"></span>${esc(g.nm)}</button>`).join('');

    const pager = (cur, total, act) => `<div class="pick-pager">
      <span class="pick-size">10条/页</span>
      <button class="pos-page" data-act="${act}" data-page="${cur - 1}" ${cur <= 1 ? 'disabled' : ''} aria-label="上一页">‹</button>
      <span class="pick-pagebox">${total ? cur : 0}</span>
      <span class="pick-pagesep">/</span>
      <span class="pick-pagetotal">${total}</span>
      <button class="pos-page" data-act="${act}" data-page="${cur + 1}" ${cur >= total ? 'disabled' : ''} aria-label="下一页">›</button>
    </div>`;

    return `<div class="modal-mask pick-mask" data-act="mask-close">
      <div class="modal pos-modal user-modal" role="dialog" aria-modal="true" aria-labelledby="usr-title" data-stop="1">
        <div class="pos-head">
          <h3 id="usr-title">选择学员</h3>
          <button class="close" data-act="picker-cancel" aria-label="关闭">×</button>
        </div>
        <div class="pos-body">
          <div class="pos-side">
            <div class="pos-side-head">
              <span class="pos-side-title">组织范围</span>
              <label class="pos-child-toggle">
                <input type="checkbox" class="cb" data-act="picker-include-child" ${f.includeChild !== false ? 'checked' : ''}>
                <span>包含子部门</span>
              </label>
            </div>
            <div class="pos-side-search">
              <input class="input" placeholder="请输入关键字" data-act="picker-tree-kw" value="${esc(f.treeKw || '')}" style="height:30px;">
              <span class="pos-side-search-icon" aria-hidden="true">⌕</span>
            </div>
            <div class="pos-side-tree">
              <button class="pick-group" data-act="pick-fold" data-fold="org">${caret(openD)}部门</button>
              ${openD ? deptTree : ''}
              <button class="pick-group" data-act="pick-fold" data-fold="pos">${caret(openP)}岗位</button>
              ${openP ? posTree : ''}
              <button class="pick-group" data-act="pick-fold" data-fold="grp">${caret(openG)}群组</button>
              ${openG ? grpTree : ''}
            </div>
          </div>

          <div class="pos-main">
            <div class="pos-main-search">
              <select class="select-native pick-mode" data-act="picker-mode" style="height:32px;width:150px;">
                <option value="normal" ${(f.mode || 'normal') === 'normal' ? 'selected' : ''}>待选</option>
                <option value="disabled" ${f.mode === 'disabled' ? 'selected' : ''}>待选（含已关联）</option>
              </select>
              <input class="input" placeholder="请输入搜索关键字" data-act="picker-search" value="${esc(f.keyword || '')}" style="height:32px;">
              <button class="btn btn-primary btn-sm" data-act="picker-search-go">查询</button>
            </div>

            <div class="usr-picked">
              <span class="usr-picked-label">已选 <b>${picked.length}</b> 人</span>
              <div class="usr-picked-chips">
                ${picked.length
                  ? picked.map((uid) => `<span class="usr-chip">${esc(personName(uid))}<button class="usr-chip-x" data-act="picker-untoggle" data-uid="${uid}" aria-label="移除 ${esc(personName(uid))}">×</button></span>`).join('')
                  : '<span class="usr-picked-empty">勾选下方列表添加学员</span>'}
              </div>
              <button class="btn-link pick-clear" data-act="picker-clear" ${picked.length ? '' : 'disabled'}>移除全部</button>
            </div>

            <div class="pos-table-wrap">
              <table class="tbl pos-tbl pick-tbl">
                <thead><tr>
                  <th style="width:44px;"></th>
                  <th style="width:120px;">工号</th>
                  <th style="width:110px;">姓名</th>
                  <th>部门</th>
                  <th style="width:100px;">是否已关联</th>
                </tr></thead>
                <tbody>
                  ${pageRows.map((p) => {
                    const isPicked = ui.pickerSel.has(p.userId);
                    const r = bucket[p.userId];
                    const isIn = r && !r.excluded && r.sources.length > 0;
                    const disabled = isIn;
                    return `<tr class="${isPicked ? 'pos-row-on' : ''}">
                      <td><input type="checkbox" class="cb" data-act="picker-toggle" data-uid="${p.userId}"
                        ${isPicked ? 'checked' : ''} ${disabled ? 'disabled' : ''} aria-label="选择 ${esc(p.userName)}"></td>
                      <td class="mono">${esc(p.employeeCode)}</td>
                      <td>${esc(p.userName)}</td>
                      <td class="pos-dept">${esc(p.deptName || G.deptName(p.deptId) || '—')}</td>
                      <td class="pos-used">${isIn ? '是' : '否'}</td>
                    </tr>`;
                  }).join('') || '<tr><td colspan="5"><div class="empty">无匹配人员</div></td></tr>'}
                </tbody>
              </table>
            </div>

            <div class="pos-foot-pager">
              <div class="pos-picked-hint">共 <b>${list.length}</b> 人，已选 <b>${picked.length}</b> 人</div>
              <div class="pos-pager">${pager(pg, pages, 'picker-page')}</div>
            </div>
          </div>
        </div>
        <div class="pos-actions">
          <button class="btn" data-act="picker-cancel">取消</button>
          <button class="btn btn-primary" data-act="picker-confirm">确认</button>
        </div>
      </div>
    </div>`;
  }

  /* --- 确认弹窗 --- */
  function renderModal() {
    const m = ui.modal;
    if (m.type === 'member-import') {
      return `<div class="modal-mask"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="member-import-title">
        <h3 id="member-import-title">导入人员</h3>
        <p>上传用 Excel 填好的表格，只需一列“工号”。保存时请在 Excel 中选择「另存为」→「CSV UTF-8（逗号分隔）」。导入已有账号，不会创建新账号。</p>
        <div class="toolbar"><button class="btn" data-act="member-import-template">下载模板</button><input type="file" data-act="member-import-file" accept=".csv,text/csv" aria-label="选择人员CSV文件" ${m.loading ? 'disabled' : ''}></div>
        ${m.loading ? '<p role="status">正在读取文件…</p>' : ''}
        ${m.errors?.length ? `<div class="hint warn" role="alert">${m.errors.map(esc).join('<br>')}</div>` : ''}
        ${m.uids?.length ? `<p>已识别 ${m.uids.length} 人：${m.uids.map(personName).map(esc).join('、')}</p>` : ''}
        <div class="modal-foot"><button class="btn" data-act="modal-cancel">取消</button><button class="btn btn-primary" data-act="modal-confirm" ${m.loading || !m.uids?.length || m.errors?.length ? 'disabled' : ''}>确认导入</button></div>
      </div></div>`;
    }
    if (m.type === 'remove') {
      return `<div class="modal-mask"><div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="mdl-title">
        <h3 id="mdl-title"><span class="modal-icon">⚠</span>确认移除所选学员？</h3>
        <p>将移除：<b>${m.uids.map(personName).map(esc).join('、')}</b></p>
        <ul>
          <li>移除后不能查看此图谱</li>
          <li>历史学习与考试记录保留</li>
          <li>自动关联人员不会自动补回</li>
        </ul>
        <div class="modal-foot">
          <button class="btn" data-act="modal-cancel">取消</button>
          <button class="btn btn-danger" data-act="modal-confirm">确认移除</button>
        </div>
      </div></div>`;
    }
    if (m.type === 'pos-sync-confirm') {
      const more = (m.after > (m.names || []).length) ? ` 等 ${m.after} 人` : '';
      const nameLine = (m.names || []).length ? (m.names.map(esc).join('、') + more) : '（按新岗位无人命中）';
      return `<div class="modal-mask"><div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="pos-sync-title">
        <h3 id="pos-sync-title">确认按岗位替换学员名单？</h3>
        <p>开启自动同步时，编辑岗位会按岗位全量替换学员名单。</p>
        <p>当前有效 <b>${m.before}</b> 人 → 预计 <b>${m.after}</b> 人</p>
        <p style="font-size:13px;color:rgba(0,0,0,.55)">预计名单：${nameLine}</p>
        <div class="modal-foot">
          <button class="btn" data-act="modal-cancel">取消</button>
          <button class="btn btn-primary" data-act="pos-sync-ok">确认替换</button>
        </div>
      </div></div>`;
    }
    if (m.type === 'scope-pick') return renderScopePickModal(m);
    if (m.type === 'pick-student') return renderPickStudentModal(m);
    if (m.type === 'tag-pick') return renderTagPickDrawer(m);
    if (m.type === 's4-add') return renderS4AddModal(m);
    return '';
  }

  /* --- 第四步「新增」：从内容库勾选 --- */
  function renderS4AddModal(m) {
    const g = S.graphs[S.selectedGraphId];
    const cur = (ui.s4Tag && g.step4[ui.s4Tag] && g.step4[ui.s4Tag].items) || [];
    const kw = String(m.kw || '').trim();
    const list = G.courseLibrary.filter((c) => c.kind === m.kind && (!kw || c.nm.includes(kw)));
    return `<div class="modal-mask"><div class="modal s4-modal" role="dialog" aria-modal="true" aria-labelledby="s4-add-title">
      <div class="s4-modal-head"><h3 id="s4-add-title">新增${esc(m.kind)}</h3>
        <button class="close" data-act="s4-add-close" aria-label="关闭">×</button></div>
      <div class="s4-modal-body">
        <div class="s4-modal-search">
          <input class="input" placeholder="搜索${esc(m.kind)}名称" data-act="s4-add-kw" value="${esc(m.kw || '')}" style="height:32px;">
        </div>
        <div class="s4-modal-list">
          ${list.length ? list.map((c) => {
            const already = cur.some((p) => p.id === c.id);
            const on = m.picked.includes(c.id);
            return `<label class="s4-modal-row ${already ? 'is-disabled' : ''} ${on ? 'is-on' : ''}">
              <input type="checkbox" class="cb" data-act="s4-add-tick" data-id="${c.id}" ${on ? 'checked' : ''} ${already ? 'disabled' : ''}>
              <span class="s4-modal-nm">${esc(c.nm)}</span>
              ${already ? '<span class="s4-modal-flag">已添加</span>'
                : (c.required ? '<span class="s4-modal-flag is-req">默认必学</span>' : '')}
            </label>`;
          }).join('') : '<div class="placeholder-empty">没有匹配的内容</div>'}
        </div>
      </div>
      <div class="s4-modal-foot">
        <span class="s4-modal-count">已选 ${m.picked.length} 项</span>
        <button class="btn" data-act="s4-add-close">取消</button>
        <button class="btn btn-primary" data-act="s4-add-confirm">确定</button>
      </div>
    </div></div>`;
  }

  function tagLibraryOptions(catId, includeChild) {
    const removed = ui.mgmt?.deletedTagIds || [];
    const base = G.categoryOptions(catId, includeChild).filter(t => !removed.includes(t.id));
    return catId === 'tc-uncat' ? [...base, ...(ui.mgmt?.tags || []).filter(t => t.custom)] : base;
  }

  /* --- 添加标签：抽屉（左分类树 / 中待选 / 右已选） --- */
  function renderTagPickDrawer(m) {
    const PAGE = 10;
    const treeHtml = G.tagCategories.map((c) => {
      const open = m.catId === c.id || (c.children || []).some((x) => x.id === m.catId);
      const kids = (c.children || []).filter(x => !(ui.mgmt?.deletedTagIds || []).includes(x.id)).map((x) => `<button class="tagx-tree-node is-child ${m.catId === x.id ? 'active' : ''}"
          data-act="tagx-cat" data-id="${x.id}"><span class="tagx-caret is-leaf"></span>${esc(x.nm)}</button>`).join('');
      return `<button class="tagx-tree-node ${m.catId === c.id ? 'active' : ''}" data-act="tagx-cat" data-id="${c.id}">
          <span class="tagx-caret">${kids ? (open ? '▾' : '▸') : ''}</span>${esc(c.nm)}
        </button>${open ? kids : ''}`;
    }).join('');

    const opts = tagLibraryOptions(m.catId, m.includeChild);
    const kw = String(m.kw || '').trim().toLowerCase();
    const pool = opts.filter((o) => !kw || o.nm.toLowerCase().includes(kw));
    const pages = Math.max(1, Math.ceil(pool.length / PAGE));
    const pg = Math.min(Math.max(1, m.page || 1), pages);
    const pageItems = pool.slice((pg - 1) * PAGE, pg * PAGE);

    const sel = m.selected || [];
    const selPages = Math.max(1, Math.ceil(sel.length / PAGE));
    const spg = Math.min(Math.max(1, m.selPage || 1), selPages);
    const selItems = sel.slice((spg - 1) * PAGE, spg * PAGE);

    const pager = (cur, total, act) => `<div class="tagx-pager">
      <span class="tagx-size">10条/页</span>
      <button class="pos-page" data-act="${act}" data-page="${cur - 1}" ${cur <= 1 ? 'disabled' : ''} aria-label="上一页">‹</button>
      <span class="tagx-pagebox">${cur}</span>
      <span class="tagx-pagesep">/</span>
      <span class="tagx-pagetotal">${total}</span>
      <button class="pos-page" data-act="${act}" data-page="${cur + 1}" ${cur >= total ? 'disabled' : ''} aria-label="下一页">›</button>
    </div>`;

    return `<div class="modal-mask tagx-mask"><div class="tagx" role="dialog" aria-modal="true" aria-labelledby="tagx-title">
      <div class="tagx-head"><h3 id="tagx-title">添加标签</h3>
        <button class="close" data-act="tagx-close" aria-label="关闭">×</button></div>
      <div class="tagx-body">
        <div class="tagx-side">
          <div class="tagx-side-head">
            <span class="tagx-side-title">标签分类</span>
            <label class="pos-child-toggle">
              <input type="checkbox" class="cb" data-act="tagx-include-child" ${m.includeChild ? 'checked' : ''}>
              <span>包含子类</span>
            </label>
          </div>
          <div class="pos-side-search">
            <input class="input" placeholder="请输入关键字" data-act="tagx-cat-kw" value="${esc(m.catKw || '')}" style="height:30px;">
            <span class="pos-side-search-icon" aria-hidden="true">⌕</span>
          </div>
          <div class="tagx-tree">${treeHtml}</div>
        </div>

        <div class="tagx-mid">
          <div class="tagx-search">
            <input class="input" placeholder="请输入搜索关键字" data-act="tagx-kw" value="${esc(m.kw || '')}" style="height:32px;">
            <button class="btn btn-primary btn-sm" data-act="tagx-search">查询</button>
          </div>
          <div class="tagx-scroll">
            ${pageItems.map((o) => `<label class="tagx-row ${sel.some((s) => s.id === o.id) ? 'is-on' : ''}">
              <input type="checkbox" class="cb" data-act="tagx-tick" data-id="${o.id}" ${sel.some((s) => s.id === o.id) ? 'checked' : ''}>
              <span>${esc(o.nm)}</span>
            </label>`).join('') || '<div class="tagx-empty">该分类下暂无标签</div>'}
          </div>
          ${pager(pg, pages, 'tagx-page')}
        </div>

        <div class="tagx-ops">
          <button class="tagx-move" data-act="tagx-add" aria-label="移入已选">移入 ›</button>
          <button class="tagx-move" data-act="tagx-remove" aria-label="移出已选">‹ 移出</button>
          <button class="tagx-move is-primary" data-act="tagx-add-all">全选 ›</button>
          <button class="tagx-move is-primary" data-act="tagx-remove-all">‹ 清空</button>
        </div>

        <div class="tagx-right">
          <div class="tagx-right-head">已选（<span class="tagx-selcount">${String(sel.length).padStart(2, '0')}</span>）</div>
          <div class="tagx-scroll">
            ${selItems.map((o) => `<label class="tagx-row is-on">
              <input type="checkbox" class="cb" data-act="tagx-untick" data-id="${o.id}" checked>
              <span>${esc(o.nm)}</span>
            </label>`).join('') || '<div class="tagx-empty">尚未选择标签</div>'}
          </div>
          ${pager(spg, selPages, 'tagx-selpage')}
        </div>
      </div>
      <div class="tagx-foot">
        <button class="btn" data-act="tagx-close">取消</button>
        <button class="btn btn-primary" data-act="tagx-confirm">保存</button>
      </div>
    </div></div>`;
  }

  /* --- 选择学员：切换登录学员（复用 .pos-modal 骨架与表格样式） --- */
  function renderPickStudentModal(m) {
    const kw = String(m.kw || '').trim();
    const rows = S.persons.filter((p) => !kw || p.userName.includes(kw) || String(p.employeeCode || '').includes(kw));
    return `<div class="modal-mask"><div class="modal pos-modal stu-modal" role="dialog" aria-modal="true" aria-labelledby="stu-title">
      <div class="pos-head">
        <h3 id="stu-title">选择学员</h3>
        <button class="close" data-act="modal-cancel" aria-label="关闭">×</button>
      </div>
      <div class="pos-main" style="padding:16px 20px 0;">
        <div class="pos-main-search">
          <input class="input" placeholder="请输入姓名或工号" data-act="pd-student-kw" value="${esc(m.kw || '')}" style="height:32px;">
          <button class="btn btn-primary btn-sm" data-act="pd-student-search">查询</button>
        </div>
        <div class="pos-table-wrap" style="max-height:360px;">
          <table class="tbl pos-tbl stu-tbl">
            <thead><tr><th style="width:120px;">工号</th><th style="width:110px;">姓名</th><th>部门</th><th style="width:96px;">操作</th></tr></thead>
            <tbody>
              ${rows.map((p) => `<tr class="${p.userId === S.studentUserId ? 'pos-row-on' : ''}">
                <td class="mono">${esc(p.employeeCode || '')}</td>
                <td>${esc(p.userName)}</td>
                <td class="pos-dept">${esc(p.deptName || '—')}</td>
                <td><button class="btn-link" data-act="pd-student-pick" data-uid="${p.userId}">${p.userId === S.studentUserId ? '当前' : '切换'}</button></td>
              </tr>`).join('') || '<tr><td colspan="4"><div class="empty">无匹配学员</div></td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="anno"><div class="hint">切换后整页数据按新学员重算，图谱范围随之变化。</div></div>
      </div>
      <div class="pos-actions">
        <button class="btn" data-act="modal-cancel">取消</button>
      </div>
    </div></div>`;
  }

  /* --- 关联范围弹窗：岗位 / 群组 共用一个组件，页签区分显示 --- */
  function renderScopePickModal(m) {
    const g = S.graphs[S.selectedGraphId];
    const st = m;
    const tab = st.tab === 'GROUP' ? 'GROUP' : 'POSITION';
    const posDraft = st.posDraft || g.positionIds.slice();
    const grpDraft = st.grpDraft || g.groupIds.slice();

    /* ---- 岗位页签：左分类树 + 右岗位表 ---- */
    const PAGE_SIZE = 5;
    const posRows = G.filterPositions({ catId: st.catId, includeChild: st.includeChild, keyword: st.kw });
    const posPages = Math.max(1, Math.ceil(posRows.length / PAGE_SIZE));
    const posPage = Math.min(Math.max(1, st.page || 1), posPages);
    const posPageRows = posRows.slice((posPage - 1) * PAGE_SIZE, posPage * PAGE_SIZE);

    const treeRows = G.positionCategories.filter((c) => {
      const ck = String(st.catKw || '').trim();
      return !ck || c.nm.includes(ck);
    }).map((c) => {
      const depth = c.parent ? 1 : 0;
      const hasChild = G.positionCategories.some((x) => x.parent === c.id);
      return `<button class="pos-tree-node ${st.catId === c.id ? 'active' : ''} ${depth ? 'is-child' : ''}" data-act="pos-cat" data-id="${c.id}"
          style="padding-left:${10 + depth * 22}px;" aria-current="${st.catId === c.id ? 'true' : 'false'}">
          ${hasChild ? '<span class="pos-tree-caret">▾</span>' : '<span class="pos-tree-dash">·</span>'}
          <span class="pos-tree-txt">${esc(c.nm)}</span>
        </button>`;
    }).join('');

    const pageBtns = [];
    for (let i = 1; i <= posPages; i += 1) {
      pageBtns.push(`<button class="pos-page ${i === posPage ? 'active' : ''}" data-act="pos-page" data-page="${i}">${i}</button>`);
    }

    const posTable = `<table class="tbl pos-tbl" data-kind="pos">
      <thead><tr>
        <th style="width:44px;"></th>
        <th>岗位名称</th>
        <th style="width:150px;">部门</th>
        <th style="width:96px;">是否已使用</th>
      </tr></thead>
      <tbody>
        ${posPageRows.map((p) => {
          const checked = posDraft.includes(p.id);
          const used = isUsedPos(p.id, S.selectedGraphId);
          return `<tr class="${checked ? 'pos-row-on' : ''}">
            <td><input type="checkbox" class="cb" data-act="pos-toggle" data-id="${p.id}" ${checked ? 'checked' : ''} aria-label="选择 ${esc(p.nm)}"></td>
            <td>${esc(p.nm)}</td>
            <td class="pos-dept">${esc(G.deptName(p.deptId))}</td>
            <td class="pos-used">${used ? '是' : '否'}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="4"><div class="empty">该分类下暂无岗位</div></td></tr>'}
      </tbody>
    </table>`;

    /* ---- 群组页签：单列（本类型没有分类层级，不摆空树） ---- */
    const grpKw = String(st.grpKw || '').trim();
    const grpRows = G.groups.filter((x) => !grpKw || x.nm.includes(grpKw));
    const grpCount = (gid) => S.persons.filter((p) => (p.groupIds || []).includes(gid)).length;
    const grpTable = `<table class="tbl pos-tbl" data-kind="grp">
      <thead><tr>
        <th style="width:44px;"></th>
        <th>群组名称</th>
        <th style="width:150px;">成员数</th>
        <th style="width:96px;">是否已使用</th>
      </tr></thead>
      <tbody>
        ${grpRows.map((x) => {
          const checked = grpDraft.includes(x.id);
          const used = isUsedGroup(x.id);
          return `<tr class="${checked ? 'pos-row-on' : ''}">
            <td><input type="checkbox" class="cb" data-act="grp-toggle" data-id="${x.id}" ${checked ? 'checked' : ''} aria-label="选择 ${esc(x.nm)}"></td>
            <td>${esc(x.nm)}</td>
            <td class="pos-dept">${grpCount(x.id)} 人</td>
            <td class="pos-used">${used ? '是' : '否'}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="4"><div class="empty">无匹配群组</div></td></tr>'}
      </tbody>
    </table>`;

    return `<div class="modal-mask"><div class="modal pos-modal scope-modal" role="dialog" aria-modal="true" aria-labelledby="pos-title">
      <div class="pos-head">
        <h3 id="pos-title">选择岗位</h3>
        <button class="close" data-act="modal-cancel" aria-label="关闭">×</button>
      </div>
      <div class="scope-tabs" role="tablist">
        <button class="scope-tab active" role="tab" aria-selected="true"
          data-act="scope-tab" data-tab="POSITION">岗位<span class="scope-tab-num">${posDraft.length}</span></button>
        <button class="scope-tab" role="tab" aria-selected="false" disabled title="首期不做，后续开放">群组（后续）</button>
      </div>
      <div class="pos-body ${tab === 'GROUP' ? 'is-single' : ''}">
        ${tab === 'POSITION' ? `<div class="pos-side">
          <div class="pos-side-head">
            <span class="pos-side-title">岗位分类</span>
            <label class="pos-child-toggle">
              <input type="checkbox" class="cb" data-act="pos-include-child" ${st.includeChild ? 'checked' : ''}>
              <span>包含子类</span>
            </label>
          </div>
          <div class="pos-side-search">
            <input class="input" placeholder="请输入关键字" data-act="pos-cat-kw" value="${esc(st.catKw || '')}" style="height:30px;">
            <span class="pos-side-search-icon" aria-hidden="true">⌕</span>
          </div>
          <div class="pos-side-tree">${treeRows}</div>
        </div>` : ''}
        <div class="pos-main">
          <div class="pos-main-search">
            ${tab === 'POSITION'
              ? `<input class="input" placeholder="请输入" data-act="pos-kw" value="${esc(st.kw || '')}" style="height:32px;">
                 <button class="btn btn-primary btn-sm" data-act="pos-search">查询</button>`
              : `<input class="input" placeholder="请输入群组名称" data-act="grp-kw" value="${esc(st.grpKw || '')}" style="height:32px;">
                 <button class="btn btn-primary btn-sm" data-act="grp-search">查询</button>`}
          </div>
          <div class="pos-table-wrap">${tab === 'POSITION' ? posTable : grpTable}</div>
          <div class="pos-foot-pager">
            <div class="pos-picked-hint">
              ${tab === 'POSITION'
                ? `已选 <b>${posDraft.length}</b> 个岗位`
                : `已选 <b>${grpDraft.length}</b> 个群组`}
              <span class="pos-picked-sep">·</span>
              <span class="pos-picked-total">本图谱共 ${posDraft.length} 岗位 / ${grpDraft.length} 群组</span>
            </div>
            ${tab === 'POSITION' ? `<div class="pos-pager">
              <button class="pos-page" data-act="pos-page" data-page="${posPage - 1}" ${posPage <= 1 ? 'disabled' : ''} aria-label="上一页">‹</button>
              ${pageBtns.join('')}
              <button class="pos-page" data-act="pos-page" data-page="${posPage + 1}" ${posPage >= posPages ? 'disabled' : ''} aria-label="下一页">›</button>
              <span class="pos-pagesize">${PAGE_SIZE} 条/页</span>
            </div>` : ''}
          </div>
        </div>
      </div>
      <div class="pos-actions">
        <button class="btn" data-act="modal-cancel">取消</button>
        <button class="btn btn-primary" data-act="pos-confirm">确认</button>
      </div>
    </div></div>`;
  }

  /** 该岗位是否已被任何图谱使用（用于「是否已使用」列） */
  function isUsedPos(posId, selfGid) {
    return Object.keys(S.graphs).some((gid) => (S.graphs[gid].positionIds || []).includes(posId));
  }

  /** 该群组是否已被任何图谱使用 */
  function isUsedGroup(grpId) {
    return Object.keys(S.graphs).some((gid) => (S.graphs[gid].groupIds || []).includes(grpId));
  }

  function positionPopover() {
    const el = document.querySelector('[data-act="help-auto"]') || document.querySelector('[data-act="help"]');
    const pv = document.getElementById('gp-popover');
    if (!el || !pv) return;
    const r = el.getBoundingClientRect();
    pv.style.left = Math.min(r.left, window.innerWidth - 380) + 'px';
    pv.style.top = r.bottom + 8 + 'px';
  }

  /* ================= 动作分发 ================= */
  function bind(root) {
    root.addEventListener('change', e => {
      const input = e.target.closest('[data-act="member-import-file"]');
      if (input) readMemberImport(input);
    });
    if (root.dataset.bound) return;
    root.dataset.bound = 'true';
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', e => { const t = e.target.closest('[data-act]'); if(t?.dataset.act==='import-file'){readImportFile(t);return;} if(t?.dataset.act==='import-score'||t?.dataset.act==='import-pick-kw'){render();return;} if(t?.dataset.act==='import-pick-dept'){const pk=importScope().picker;if(pk){pk.dept=t.value;render();}return;} if (t && t.dataset.act.startsWith('rx-') && window.GP_REMIX?.change(t.dataset.act,t,extensionContext())) return; if (t && t.dataset.act.startsWith('ca-')) window.GP_COCKPIT_ADMIN?.change(t.dataset.act,t,extensionContext()); if (t && t.dataset.act.startsWith('mgmt-')) window.GP_MANAGEMENT?.change(t.dataset.act, t, extensionContext()); });
    root.addEventListener('keydown', onKey);
  }

  function onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if ((act.startsWith('rx-') || act === 'mgmt-import' || act === 'mgmt-enable') && window.GP_REMIX?.action(act, t, extensionContext())) return;
    if (act.startsWith('ca-') && window.GP_COCKPIT_ADMIN?.action(act,t,extensionContext())) return;
    if (act.startsWith('builder-') && window.GP_BUILDER?.handle(act,t,builderContext())) return;
    if ((act.startsWith('s4-') || act.startsWith('lc-')) && window.GP_CONFIG?.action(act, t, extensionContext())) return;
    if (act.startsWith('mgmt-') && window.GP_MANAGEMENT?.action(act, t, extensionContext())) return;
    if (act.startsWith('learner-') && window.GP_LEARNER?.action(act, t, extensionContext())) return;

    // 抽屉遮罩关闭，但点内容不关
    if (act === 'mask-close' && e.target.closest('[data-stop]')) return;

    switch (act) {
      case 'open-cockpit-config': ui.cpConfigId=t.dataset.id; ui.page='cockpit'; ui.cpKeyword=''; render(); break;
      case 'cp-select-config': break;
      case 'cp-view-config': ui.page='cockpitAdmin'; window.GP_COCKPIT_ADMIN?.action('ca-view',{dataset:{id:ui.cpConfigId}},extensionContext()); break;
      case 'go': e.preventDefault(); ui.page = t.dataset.page; ui.modal = null; ui.sidebarOpen = false; ui.pdGraphModal = false; ui.pdRankOpen = false; ui.lcPicker=null; render(); break;

      /* ---- 光谱列表 ---- */
      case 'open-graph': {
        S.selectedGraphId = t.dataset.gid;
        S.currentStep = 1;
        ui.modal = null;
        ui.page = 'create';
        ui.lastAction = '进入光谱：' + S.graphs[t.dataset.gid].name;
        render(); break;
      }
      case 'open-import': {
        ui.importLoadToken=(ui.importLoadToken||0)+1; ui.importReading=false; ui.importSource=''; ui.importFileError=''; ui.importFilter='all'; ui.importConfirm=false;
        S.selectedGraphId = t.dataset.gid;
        ui.importPreview = null;
        ui.importExecResult = null;
        ui.importScope = { mode: 'all', selected: [], picker: null }; ui.importSkipped = 0;
        ui.page = 'import';
        ui.lastAction = '打开发起评分导入：' + S.graphs[t.dataset.gid].name;
        render(); break;
      }
      case 'toggle-status-row': {
        const gid = t.dataset.gid;
        const g = S.graphs[gid];
        g.status = g.status === 'enabled' ? 'disabled' : 'enabled';
        g.enabledAt = g.status === 'enabled' ? new Date().toISOString().slice(0, 10) : g.enabledAt;
        ui.lastAction = (g.status === 'enabled' ? '启用' : '停用') + '光谱：' + g.name;
        toast(g.status === 'enabled' ? `已启用「${g.name}」` : `已停用「${g.name}」，配置与既有事实保留`, g.status === 'enabled' ? 'success' : 'warning');
        render(); break;
      }
      case 'create-graph': {
        const id = newGraph();
        S.selectedGraphId = id;
        S.currentStep = 1;
        ui.page = 'create';
        ui.lastAction = '新建光谱';
        render(); break;
      }
      case 'list-search': break;
      case 'reset': resetAll(); break;
      case 'review-tools': ui.reviewToolsOpen = !ui.reviewToolsOpen; syncPresentation(); break;
      case 'toggle-anno': ui.showAnno = !ui.showAnno; syncPresentation(); break;
      case 'enter-demo':
        ui.annoBeforeDemo = ui.showAnno; ui.demoMode = true; syncPresentation();
        document.querySelector('[data-act="exit-demo"]').focus({ preventScroll: true }); break;
      case 'exit-demo':
        ui.demoMode = false; ui.showAnno = ui.annoBeforeDemo; syncPresentation();
        document.querySelector('[data-act="review-tools"]').focus({ preventScroll: true }); break;

      case 'step': { const next = Number(t.dataset.step); if (next < 1 || next > STEPS.length) break; S.currentStep = next; render(); break; }
      case 'pick-scope':
      case 'pick-pos':
      case 'pick-group': {
        const g = S.graphs[S.selectedGraphId];
        // 首期仅岗位；群组入口保留但强制落到岗位页签
        ui.modal = {
          type: 'scope-pick',
          tab: 'POSITION',
          catId: 'c-all', includeChild: true, catKw: '', kw: '', grpKw: '',
          page: 1,
          posDraft: g.positionIds.slice(),
          grpDraft: g.groupIds.slice(),
        };
        if (act === 'pick-group') toast('首期关联维度仅岗位，群组后续开放', 'info');
        render(); break;
      }
      case 'scope-tab': {
        if (!ui.modal || ui.modal.type !== 'scope-pick') break;
        ui.modal.tab = t.dataset.tab === 'GROUP' ? 'GROUP' : 'POSITION';
        render(); break;
      }
      case 'grp-search': {
        if (!ui.modal || ui.modal.type !== 'scope-pick') break;
        const inp = document.querySelector('[data-act="grp-kw"]');
        ui.modal.grpKw = inp ? inp.value : '';
        render(); break;
      }
      case 'grp-toggle': {
        if (!ui.modal || ui.modal.type !== 'scope-pick') break;
        const id = t.dataset.id;
        const d = ui.modal.grpDraft;
        if (t.checked) { if (!d.includes(id)) d.push(id); }
        else { const i = d.indexOf(id); if (i >= 0) d.splice(i, 1); }
        render(); break;
      }

      /* ---- 关联范围弹窗：岗位页签 ---- */
      case 'pos-cat': {
        if (!ui.modal || ui.modal.type !== 'scope-pick') break;
        ui.modal.catId = t.dataset.id;
        ui.modal.page = 1;
        render(); break;
      }
      case 'pos-include-child': {
        if (!ui.modal || ui.modal.type !== 'scope-pick') break;
        ui.modal.includeChild = t.checked;
        ui.modal.page = 1;
        render(); break;
      }
      case 'pos-search': {
        if (!ui.modal || ui.modal.type !== 'scope-pick') break;
        const inp = document.querySelector('[data-act="pos-kw"]');
        ui.modal.kw = inp ? inp.value : '';
        ui.modal.page = 1;
        render(); break;
      }
      case 'pos-page': {
        if (!ui.modal || ui.modal.type !== 'scope-pick') break;
        const p = Number(t.dataset.page);
        if (!p || p < 1) break;
        ui.modal.page = p;
        render(); break;
      }
      case 'pos-toggle': {
        if (!ui.modal || ui.modal.type !== 'scope-pick') break;
        const id = t.dataset.id;
        const d = ui.modal.posDraft;
        if (t.checked) { if (!d.includes(id)) d.push(id); }
        else { const i = d.indexOf(id); if (i >= 0) d.splice(i, 1); }
        render(); break;
      }
      case 'pos-confirm': {
        if (!ui.modal || ui.modal.type !== 'scope-pick') break;
        const g = S.graphs[S.selectedGraphId];
        const nextPos = ui.modal.posDraft.slice();
        const prevPos = g.positionIds.slice();
        const changed = nextPos.length !== prevPos.length || nextPos.some((id) => !prevPos.includes(id));
        if (g.autoAssociate !== false && changed) {
          const previewHits = S.persons.filter((p) => p.positionIds.some((id) => nextPos.includes(id)));
          const before = G.effectiveMembers(S, S.selectedGraphId).length;
          ui.modal = {
            type: 'pos-sync-confirm',
            nextPos,
            before,
            after: previewHits.length,
            names: previewHits.slice(0, 8).map((p) => p.userName),
          };
          render(); break;
        }
        g.positionIds = nextPos;
        const np = g.positionIds.length;
        ui.modal = null;
        if (g.autoAssociate !== false) {
          runSync(S.selectedGraphId, { includeDraft: true });
          toast(`已保存岗位并同步名单：${np} 个岗位`, np ? 'success' : 'warning');
        } else {
          toast(`已更新岗位展示（${np} 个）；人员不同步，请到「关联学员」维护`, 'info');
        }
        render(); break;
      }
      case 'pos-sync-ok': {
        if (!ui.modal || ui.modal.type !== 'pos-sync-confirm') break;
        const g = S.graphs[S.selectedGraphId];
        g.positionIds = ui.modal.nextPos.slice();
        ui.modal = null;
        const r = runSync(S.selectedGraphId, { includeDraft: true });
        toast(`岗位已更新，学员名单按岗全量替换：+${r.added.length} / -${r.removed.length}`, 'success');
        render(); break;
      }
      case 'drop-pos': {
        const g = S.graphs[S.selectedGraphId];
        const nextPos = g.positionIds.filter((x) => x !== t.dataset.id);
        if (g.autoAssociate !== false) {
          const previewHits = S.persons.filter((p) => p.positionIds.some((id) => nextPos.includes(id)));
          ui.modal = {
            type: 'pos-sync-confirm',
            nextPos,
            before: G.effectiveMembers(S, S.selectedGraphId).length,
            after: previewHits.length,
            names: previewHits.slice(0, 8).map((p) => p.userName),
          };
          render(); break;
        }
        g.positionIds = nextPos;
        toast('已移除岗位展示；人员不同步', 'info');
        render(); break;
      }

      /* ---- 第三步：三级标签栏 ---- */
      case 'tag-pick': {
        const id = t.dataset.id;
        if (ui.tagActive !== id) { ui.tagActive = id; ui.tagActive2 = null; }
        else { ui.tagActive = null; ui.tagActive2 = null; }
        render(); break;
      }
      case 'tag-pick2': {
        const id = t.dataset.id;
        ui.tagActive2 = ui.tagActive2 === id ? null : id;
        render(); break;
      }
      case 'tag-jump': {
        if (!t.dataset.id) break;
        if (ui.tagActive && t.dataset.id === ui.tagActive) ui.tagActive2 = null;
        render(); break;
      }
      case 'tag-clear': {
        const parentId = t.dataset.parent || null;
        const tree = S.graphs[S.selectedGraphId].tagTree;
        if (!parentId) { tree.length = 0; ui.tagActive = null; ui.tagActive2 = null; }
        else { (function walk(ns){ ns.forEach((n)=>{ if(n.id===parentId) n.children=[]; else if(n.children) walk(n.children); }); })(tree); if(parentId===ui.tagActive) ui.tagActive2 = null; }
        G.relabelTree(tree);
        toast('已清空该级标签');
        render(); break;
      }
      case 'tag-del': {
        const id = t.dataset.id;
        const tree = S.graphs[S.selectedGraphId].tagTree;
        (function walk(ns){ const i = ns.findIndex((n)=>n.id===id); if(i>=0){ ns.splice(i,1); return true; } return ns.some((n)=>n.children&&walk(n.children)); })(tree);
        G.relabelTree(tree);
        if (ui.tagActive === id) { ui.tagActive = null; ui.tagActive2 = null; }
        if (ui.tagActive2 === id) ui.tagActive2 = null;
        toast('已删除标签（含其下级）');
        render(); break;
      }
      case 'tag-new':
      case 'tag-open-add': {
        const l1 = (S.graphs[S.selectedGraphId].tagTree || []).find((n) => n.id === ui.tagActive);
        const l2 = l1 && l1.children ? (l1.children.find((n) => n.id === ui.tagActive2) || null) : null;
        const level = Number(t.dataset.level) || (l2 ? 3 : l1 ? 2 : 1);
        const parent = t.dataset.act === 'tag-new' ? (t.dataset.parent || null) : (l2?.id || l1?.id || null);
        if (level>1 && !parent) { toast('请先选择上一级标签', 'warning'); break; }
        ui.modal = {
          type: 'tag-pick', catId: 'tc-custom', includeChild: true, catKw: '', kw: '',
          page: 1, selPage: 1,
          selected: [],
          targetParent: parent,
          level: String(level),
        };
        render(); break;
      }

      /* ---- 添加标签抽屉 ---- */
      case 'tagx-close': ui.modal = null; render(); break;
      case 'tagx-cat': {
        if (!ui.modal || ui.modal.type !== 'tag-pick') break;
        ui.modal.catId = t.dataset.id; ui.modal.page = 1; render(); break;
      }
      case 'tagx-include-child': {
        if (!ui.modal || ui.modal.type !== 'tag-pick') break;
        ui.modal.includeChild = t.checked; ui.modal.page = 1; render(); break;
      }
      case 'tagx-search': {
        if (!ui.modal || ui.modal.type !== 'tag-pick') break;
        const i = document.querySelector('[data-act="tagx-kw"]');
        ui.modal.kw = i ? i.value : ''; ui.modal.page = 1; render(); break;
      }
      case 'tagx-page': {
        if (!ui.modal || ui.modal.type !== 'tag-pick') break;
        const p = Number(t.dataset.page); if (!p || p < 1) break;
        ui.modal.page = p; render(); break;
      }
      case 'tagx-selpage': {
        if (!ui.modal || ui.modal.type !== 'tag-pick') break;
        const p = Number(t.dataset.page); if (!p || p < 1) break;
        ui.modal.selPage = p; render(); break;
      }
      case 'tagx-tick': {
        if (!ui.modal || ui.modal.type !== 'tag-pick') break;
        const id = t.dataset.id;
        const pool = tagLibraryOptions(ui.modal.catId, ui.modal.includeChild);
        const opt = pool.find((o) => o.id === id) || { id, nm: id };
        if (t.checked) { if (!ui.modal.selected.some((s) => s.id === id)) ui.modal.selected.push(opt); }
        else ui.modal.selected = ui.modal.selected.filter((s) => s.id !== id);
        render(); break;
      }
      case 'tagx-untick': {
        if (!ui.modal || ui.modal.type !== 'tag-pick') break;
        ui.modal.selected = ui.modal.selected.filter((s) => s.id !== t.dataset.id);
        render(); break;
      }
      case 'tagx-add': {
        if (!ui.modal || ui.modal.type !== 'tag-pick') break;
        const pool = tagLibraryOptions(ui.modal.catId, ui.modal.includeChild);
        const checked = Array.from(document.querySelectorAll('[data-act="tagx-tick"]:checked')).map((x) => x.dataset.id);
        checked.forEach((id) => {
          const o = pool.find((x) => x.id === id);
          if (o && !ui.modal.selected.some((s) => s.id === o.id)) ui.modal.selected.push(o);
        });
        render(); break;
      }
      case 'tagx-add-all': {
        if (!ui.modal || ui.modal.type !== 'tag-pick') break;
        const kw = String(ui.modal.kw || '').trim().toLowerCase();
        tagLibraryOptions(ui.modal.catId, ui.modal.includeChild)
          .filter((o) => !kw || o.nm.toLowerCase().includes(kw))
          .forEach((o) => { if (!ui.modal.selected.some((s) => s.id === o.id)) ui.modal.selected.push(o); });
        render(); break;
      }
      case 'tagx-remove': {
        if (!ui.modal || ui.modal.type !== 'tag-pick') break;
        const checked = Array.from(document.querySelectorAll('[data-act="tagx-untick"]:checked')).map((x) => x.dataset.id);
        ui.modal.selected = ui.modal.selected.filter((s) => !checked.includes(s.id));
        render(); break;
      }
      case 'tagx-remove-all': {
        if (!ui.modal || ui.modal.type !== 'tag-pick') break;
        ui.modal.selected = []; render(); break;
      }
      case 'tagx-confirm': {
        if (!ui.modal || ui.modal.type !== 'tag-pick') break;
        const picked = ui.modal.selected.slice();
        if (!picked.length) { toast('请至少选择一个标签', 'warning'); break; }
        const g = S.graphs[S.selectedGraphId];
        const parentId = ui.modal.targetParent || null;
        G.addTagNodes(g.tagTree, parentId, picked.map((p) => ({ id: 'tt-' + p.id + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nm: p.nm })));
        G.relabelTree(g.tagTree);
        ui.modal = null;
        toast(`已添加 ${picked.length} 个标签`);
        render(); break;
      }

      /* ---- 第四步：标签适用层级与正式学习内容 ---- */
      case 's4-pick-tag': ui.s4Tag = t.dataset.id; ui.s4Kw = ''; render(); break;
      case 's4-tab': ui.s4Tab = t.dataset.kind; ui.s4Kw = ''; render(); break;
      case 's4-level': {
        const g = S.graphs[S.selectedGraphId];
        const id = ui.s4Tag; if (!id) break;
        if (!g.step4[id]) g.step4[id] = { levels: [], items: [] };
        const L = t.dataset.lv;
        const arr = g.step4[id].levels;
        const i = arr.indexOf(L);
        if (i >= 0) arr.splice(i, 1); else arr.push(L);
        render(); break;
      }
      case 's4-add': {
        const g = S.graphs[S.selectedGraphId];
        const id = ui.s4Tag; if (!id) break;
        if (!g.step4[id]) g.step4[id] = { levels: [], items: [] };
        const c = G.courseLibrary.find((x) => x.id === t.dataset.id);
        if (c && !g.step4[id].items.some((p) => p.id === c.id)) {
          g.step4[id].items.push({ id: c.id, nm: c.nm, required: !!c.required });
        }
        render(); break;
      }
      case 's4-del': {
        const g = S.graphs[S.selectedGraphId];
        const id = ui.s4Tag; if (!id || !g.step4[id]) break;
        g.step4[id].items = g.step4[id].items.filter((p) => p.id !== t.dataset.id);
        render(); break;
      }
      case 's4-toggle-req': {
        const g = S.graphs[S.selectedGraphId];
        const id = ui.s4Tag; if (!id || !g.step4[id]) break;
        const it = g.step4[id].items.find((p) => p.id === t.dataset.id);
        if (it) it.required = !it.required;
        render(); break;
      }
      case 's4-clear': {
        const g = S.graphs[S.selectedGraphId];
        const id = ui.s4Tag; if (!id || !g.step4[id]) break;
        const kind = ui.s4Tab || '课程';
        // 只清当前页签类型，其余类型保留
        g.step4[id].items = g.step4[id].items.filter((p) => {
          const hit = G.courseLibrary.find((c) => c.id === p.id);
          return hit ? hit.kind !== kind : true;
        });
        toast(`已清空该标签的${kind}`);
        render(); break;
      }
      case 's4-open-add': {
        ui.modal = { type: 's4-add', kind: ui.s4Tab, kw: '', picked: [] };
        render(); break;
      }
      case 's4-level-help': {
        toast('示例：L1–L2 职级可见该标签，L3 及以上不展示');
        break;
      }
      case 's4-add-close': ui.modal = null; render(); break;
      case 's4-add-tick': {
        if (!ui.modal || ui.modal.type !== 's4-add') break;
        const id = t.dataset.id;
        if (t.checked) { if (!ui.modal.picked.includes(id)) ui.modal.picked.push(id); }
        else ui.modal.picked = ui.modal.picked.filter((x) => x !== id);
        render(); break;
      }
      case 's4-add-confirm': {
        if (!ui.modal || ui.modal.type !== 's4-add') break;
        const g = S.graphs[S.selectedGraphId];
        const id = ui.s4Tag;
        if (!id) { ui.modal = null; render(); break; }
        if (!g.step4[id]) g.step4[id] = { levels: [], items: [] };
        ui.modal.picked.forEach((cid) => {
          const c = G.courseLibrary.find((x) => x.id === cid);
          if (c && !g.step4[id].items.some((p) => p.id === c.id)) {
            g.step4[id].items.push({ id: c.id, nm: c.nm, required: !!c.required });
          }
        });
        const n = ui.modal.picked.length;
        ui.modal = null;
        toast(n ? `已添加 ${n} 项` : '未选择任何内容', n ? 'success' : 'warning');
        render(); break;
      }

      case 'drop-group': {
        const g = S.graphs[S.selectedGraphId];
        g.groupIds = g.groupIds.filter((x) => x !== t.dataset.id);
        toast('首期不使用群组关联；已移除展示', 'info');
        render(); break;
      }
      case 'toggle-auto': toggleAuto(); break;
      case 'help-auto': openAutoHelp(t); break;
      case 'save-draft': saveDraft(); break;
      case 'sync-now': syncNow(); break;
      case 'step1-next': step1Next(); break;
      case 'close-create': {
        ui.lastAction = '关闭配置流程（未保存的编辑不留存）';
        toast('已关闭配置流程（本次未保存的编辑不保留）');
        ui.page = 'list';
        render();
        break;
      }

      case 'member-select': {
        if (t.checked) ui.memberList.selected.add(t.dataset.uid); else ui.memberList.selected.delete(t.dataset.uid);
        render(); break;
      }
      case 'member-select-all': {
        ui.memberList.visibleIds.forEach(id => t.checked ? ui.memberList.selected.add(id) : ui.memberList.selected.delete(id));
        render(); break;
      }
      case 'member-remove-selected': {
        if (!ui.memberList.selected.size) break;
        ui.modal = { type: 'remove', uids: [...ui.memberList.selected] }; render(); break;
      }
      case 'member-filter': {
        ui.memberList.dept = document.querySelector('[data-act="member-dept"]').value;
        ui.memberList.keyword = document.querySelector('[data-act="member-keyword"]').value.trim();
        render(); break;
      }
      case 'member-import-open': {
        if (S.graphs[S.selectedGraphId].autoAssociate !== false) break;
        ui.modal = { type: 'member-import', uids: [], errors: [] }; render(); break;
      }
      case 'member-import-template': importCsvDownload('人员导入模板.csv', [['工号'], [S.persons[0].employeeCode]]); break;
      case 'open-picker': ui.sidebarOpen = true; ui.pickerSel = new Set(); ui.pickerPage = 1; ui.pickerFilter = { keyword: '', tree: 'ORGANIZATION', nodeId: null, includeChild: true, openOrg: true, openPos: false, openGrp: false, mode: 'normal', treeKw: '' }; render(); break;
      case 'picker-cancel': ui.sidebarOpen = false; render(); break;
      case 'picker-include-child': ui.pickerFilter.includeChild = !!t.checked; ui.pickerPage = 1; render(); break;
      case 'pick-fold': {
        const k = t.dataset.fold;
        if (k === 'org') ui.pickerFilter.openOrg = !(ui.pickerFilter.openOrg !== false);
        if (k === 'pos') ui.pickerFilter.openPos = !ui.pickerFilter.openPos;
        if (k === 'grp') ui.pickerFilter.openGrp = !ui.pickerFilter.openGrp;
        render(); break;
      }
      case 'picker-search-go': {
        const i = document.querySelector('[data-act="picker-search"]');
        ui.pickerFilter.keyword = i ? i.value : '';
        ui.pickerPage = 1;
        render(); break;
      }
      case 'picker-page': {
        const p = Number(t.dataset.page); if (!p || p < 1) break;
        ui.pickerPage = p; render(); break;
      }
      case 'picker-add': {
        const checked = Array.from(document.querySelectorAll('[data-act="picker-toggle"]:checked')).map((x) => x.dataset.uid);
        checked.forEach((uid) => {
          const r = S.rel[S.selectedGraphId] && S.rel[S.selectedGraphId][uid];
          if (r && r.excluded) return;
          ui.pickerSel.add(uid);
        });
        render(); break;
      }
      case 'picker-add-all': {
        const gid = S.selectedGraphId;
        const ids = Array.from(document.querySelectorAll('[data-act="picker-toggle"]')).map((x) => x.dataset.uid);
        ids.forEach((uid) => {
          const r = S.rel[gid] && S.rel[gid][uid];
          if (!(r && r.excluded)) ui.pickerSel.add(uid);
        });
        render(); break;
      }
      case 'picker-remove': {
        const checked = Array.from(document.querySelectorAll('[data-act="picker-untoggle"]:checked')).map((x) => x.dataset.uid);
        checked.forEach((uid) => ui.pickerSel.delete(uid));
        render(); break;
      }
      case 'picker-remove-all': ui.pickerSel = new Set(); render(); break;
      /* ---- 驾驶舱 ---- */
      case 'cp-tab': ui.cpTab = t.dataset.k; render(); break;
      case 'cp-filter': {
        const sc = cpScope();
        if (!sc.uids.length) toast('请先在左侧勾选要纳入驾驶舱的图谱', 'warn');
        else toast(`已纳入 ${sc.gids.length} 个图谱、${sc.uids.length} 名学员`, 'success');
        break;
      }
      case 'cp-reset': ui.cpChecked = {}; ui.cpKeyword = ''; render(); toast('筛选条件已重置', 'info'); break;
      case 'cp-refresh': toast('数据已更新（原型演示，数据不变）', 'success'); break;
      case 'cp-warn-setting': toast('预警设置：打开阈值配置弹窗（原型未展开）', 'info'); break;
      case 'cp-tip': toast(t.dataset.tip, 'info'); break;
      case 'cp-to-person': ui.page = 'dashboard'; render(); break;
      case 'cp-quarter': ui.cpQuarter = t.value; render(); break;
      case 'picker-toggle': {
        const uid = t.dataset.uid;
        if (ui.pickerSel.has(uid)) ui.pickerSel.delete(uid); else ui.pickerSel.add(uid);
        render(); break;
      }
      case 'picker-untoggle': ui.pickerSel.delete(t.dataset.uid); render(); break;
      case 'picker-clear': ui.pickerSel = new Set(); render(); break;
      case 'picker-clear-node': ui.pickerFilter.nodeId = null; render(); break;
      case 'pick-node': {
        const same = ui.pickerFilter.nodeId === t.dataset.id;
        ui.pickerFilter.nodeId = same ? null : t.dataset.id;
        ui.pickerFilter.tree = t.dataset.tree;
        render(); break;
      }
      case 'picker-confirm': confirmPicker(); break;

      case 'remove-member': ui.modal = { type: 'remove', uids: [t.dataset.uid] }; render(); break;
      case 'modal-cancel': ui.modal = null; toast('已取消，未修改任何关系或排除状态'); render(); break;
      case 'modal-confirm': confirmModal(); break;
      case 'readd': readd(t.dataset.uid); break;

      case 'student-graph': ui.dashboardGraphId = t.dataset.gid; render(); break;
      case 'switch-student': break;
      /* ---- 学员仪表盘 ---- */
      case 'pd-open-graph': {
        const list = learnerGraphs();
        ui.pdGraphPage = 1; ui.pdGraphKey = ''; ui.pdGraphQuery = '';
        ui.pdGraphPick = ui.dashboardGraphId || (list[0] && list[0].graphId);
        ui.pdGraphModal = true;
        render(); document.querySelector('[data-act="pd-graph-key"]')?.focus(); break;
      }
      case 'pd-graph-search': ui.pdGraphQuery = ui.pdGraphKey || ''; ui.pdGraphPage = 1; render(); break;
      case 'pd-graph-page': ui.pdGraphPage = Number(t.dataset.n); render(); break;
      case 'pd-close-graph': ui.pdGraphModal = false; render(); document.querySelector('[data-act="pd-open-graph"]')?.focus(); break;
      case 'pd-gm-mask':
        if (e.target.closest('[data-stop]')) return;
        ui.pdGraphModal = false; render(); break;
      case 'pd-pick-graph': ui.pdGraphPick = t.dataset.gid; render(); break;
      case 'pd-apply-graph': {
        if (!learnerGraphs().some(x=>x.graphId===ui.pdGraphPick)) { toast('请选择一张已启用的图谱', 'warn'); break; }
        const changed = ui.pdGraphPick !== ui.dashboardGraphId;
        ui.dashboardGraphId = ui.pdGraphPick;
        clearLearnerContext();
        ui.pdGraphModal = false;
        ui.pdL1 = null; ui.pdL2 = null; ui.pdPage = 1;
        render();
        toast(changed ? '已切换图谱' : '未变更图谱', changed ? 'success' : 'info');
        break;
      }
      case 'pd-choose-user': ui.modal = { type: 'pick-student', kw: '' }; render(); break;
      case 'pd-student-kw': break;
      case 'pd-student-search': {
        if (!ui.modal || ui.modal.type !== 'pick-student') break;
        const inp = document.querySelector('[data-act="pd-student-kw"]');
        ui.modal.kw = inp ? inp.value : '';
        render(); break;
      }
      case 'pd-student-pick': {
        const uid = t.dataset.uid;
        if (!uid) break;
        S.studentUserId = uid;
        clearLearnerContext();
        ui.dashboardGraphId = null;
        ui.pdL1 = null; ui.pdL2 = null; ui.pdPage = 1;
        ui.modal = null;
        render();
        toast(`已切换为 ${personName(uid)}`, 'success');
        break;
      }
      case 'pd-l1': ui.pdL1 = t.dataset.nm; ui.pdL2 = null; render(); break;
      case 'pd-l2': ui.pdL2 = t.dataset.nm; render(); break;
      case 'pd-rank': ui.pdRankOpen = true; render(); break;
      case 'pd-rank-close': ui.pdRankOpen = false; render(); break;
      case 'pd-page': ui.pdPage = Number(t.dataset.n); render(); break;
      case 'pd-refresh': toast('已请求重算本图谱统计（真实接口只传 graphId，非单学员）', 'success'); break;
      case 'pd-export': {
        const g = S.graphs[ui.dashboardGraphId];
        const rows = [['课程名称', '来源标签', '课程类型', '课程进度', '课程学时', '课程学分', '最近学习时间', '完成课程时间']];
        const csv = '\ufeff' + rows.map((r) => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${personName(S.studentUserId)}-${g ? g.name : ''}学课数据统计.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        toast('已导出学课数据统计（原型为表头空表）', 'success');
        break;
      }
      case 'cockpit-graph': break;

      case 'no-graph-reset': ui.noGraphKeyword = ''; render(); break;
      case 'no-graph-retry': ui.noGraphState = 'normal'; render(); break;
      case 'no-graph-export': exportCsv(); break;

      case 'toggle-status': toggleStatus(); break;

      /* ---- 评分导入 ---- */
      case 'import-load': {
        ui.importLoadToken=(ui.importLoadToken||0)+1; ui.importReading=false; ui.importSource='演示数据（含校验错误示例）'; ui.importFileError=''; ui.importFilter='all'; ui.importConfirm=false;
        ui.importExecResult = null;
        ui.importPreview = window.GP_IMPORT.preview(window.GP_IMPORT.IMPORT_TEMPLATE);
        const errs = ui.importPreview.filter((r) => r.errors.length).length;
        ui.lastAction = '生成导入预览';
        toast(errs ? `预览已生成：${errs} 行有错误，可在表格中修改后重新校验` : '预览已生成：全部通过', errs ? 'warning' : 'success');
        render();
        break;
      }
      case 'import-clear': ui.importLoadToken=(ui.importLoadToken||0)+1; ui.importPreview=null; ui.importExecResult=null; ui.importSource=''; ui.importFileError=''; ui.importConfirm=false; render(); break;
      case 'import-choose': document.querySelector('[data-act="import-file"]')?.click(); break;
      case 'import-filter': ui.importFilter=t.dataset.filter; render(); break;
      case 'import-export-errors': exportImportErrors(); break;
      case 'import-execute': if(ui.importPreview && !ui.importExecResult && !ui.importPreview.some(r=>r.errors.length||r.dirty)) {ui.importConfirm=true;render();} break;
      case 'import-history-open': ui.importHistoryDrawer = true; render(); break;
      case 'import-history-close': if (t.classList.contains('import-drawer-mask') && e.target.closest('.import-drawer')) break; ui.importHistoryDrawer = false; render(); break;
      case 'import-history-download': {
        const h = importHistoryList().find(x => x.id === t.dataset.id); if (!h) break;
        const rows = [['工号','姓名','一级标签','二级标签','三级标签','导入前','新成绩','结果','原因'],
          ...h.items.map(it => [it.code || '', it.name || '', it.path[0] || '', it.path[1] || '', it.path[2] || '', it.before == null ? '未导入' : it.before, Number.isFinite(Number(it.score)) && it.score !== '' ? Number(it.score) : (it.score ?? ''), it.status === 'success' ? '成功' : '失败', it.reason || ''])];
        importXlsxDownload(`导入明细-${graphName(S.selectedGraphId)}-${h.at.replace(/[\/:]/g, '').replace(/\s+/g, '-')}.xlsx`, rows, [12, 10, 14, 14, 16, 10, 10, 8, 40]);
        break;
      }
      case 'import-scope-mode': { const sc = importScope(); sc.mode = t.value === 'some' ? 'some' : 'all'; if (sc.mode === 'some' && !sc.selected.length) sc.picker = { draft: [], kw: '', dept: '' }; render(); break; }
      case 'import-pick-open': { const sc = importScope(); sc.picker = { draft: sc.selected.slice(), kw: '', dept: '' }; render(); break; }
      case 'import-pick-toggle': { const pk = importScope().picker; if (pk) { const id = t.dataset.uid; pk.draft = t.checked ? [...new Set([...pk.draft, id])] : pk.draft.filter(x => x !== id); render(); } break; }
      case 'import-pick-all': { const pk = importScope().picker; if (pk) { [...document.querySelectorAll('[data-act="import-pick-toggle"]')].forEach(el => { if (!pk.draft.includes(el.dataset.uid)) pk.draft.push(el.dataset.uid); }); render(); } break; }
      case 'import-pick-none': { const pk = importScope().picker; if (pk) { pk.draft = []; render(); } break; }
      case 'import-pick-cancel': { const sc = importScope(); sc.picker = null; if (sc.mode === 'some' && !sc.selected.length) sc.mode = 'all'; render(); break; }
      case 'import-pick-confirm': { const sc = importScope(); if (sc.picker?.draft.length) { sc.selected = sc.picker.draft.slice(); sc.picker = null; sc.mode = 'some'; render(); } break; }
      case 'import-revalidate-row': if(ui.importPreview && !ui.importExecResult){ui.importPreview=window.GP_IMPORT.revalidate(ui.importPreview, Number(t.dataset.row));ui.importConfirm=false;render();} break;
      case 'import-revalidate-all': if(ui.importPreview && !ui.importExecResult){ui.importPreview=window.GP_IMPORT.revalidate(ui.importPreview);ui.importConfirm=false;const e=ui.importPreview.filter(r=>r.errors.length).length;toast(e?`重新校验完成：仍有 ${e} 行错误`:'重新校验完成：全部通过',e?'warning':'success');render();} break;
      case 'import-cancel-execute': ui.importConfirm=false;render();break;
      case 'import-confirm-execute': if(ui.importConfirm && !ui.importSubmitting){
        ui.importConfirm=false;
        const delay=ui.importSubmitDelay ?? 900;
        if(!delay){doImportExecute();break;}
        ui.importSubmitting=true;render();
        setTimeout(()=>{ui.importSubmitting=false;if(ui.page==='import'&&ui.importPreview)doImportExecute();else render();},delay);
      } break;
      case 'import-template': downloadTemplate(); break;
    }
  }

  function onInput(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'import-pick-kw') { const pk = importScope().picker; if (pk) pk.kw = t.value; return; }
    if (act === 'import-score') {
      const row = ui.importPreview?.find(r => r.rowNo === Number(t.dataset.row));
      if (row && !ui.importExecResult) { row.scoreInput = t.value; row.score = window.GP_IMPORT.parseScore(t.value); row.dirty = true; ui.importConfirm = false; }
      return;
    }
    if (act.startsWith('rx-') && window.GP_REMIX?.input(act, t, extensionContext())) return;
    if (act==='cp-select-config') { ui.cpConfigId=t.value||null; ui.cpKeyword=''; render(); return; }
    if (act.startsWith('ca-') && window.GP_COCKPIT_ADMIN?.input(act,t,extensionContext())) return;
    if (act === 'pd-graph-key') { ui.pdGraphKey = t.value; return; }
    if (act.startsWith('lc-') && window.GP_CONFIG?.input(act,t,extensionContext())) return;
    if (act.startsWith('mgmt-') && window.GP_MANAGEMENT?.input(act, t, extensionContext())) return;
    if (act.startsWith('learner-') && window.GP_LEARNER?.input(act, t, extensionContext())) return;
    if (act === 'field') {
      S.graphs[S.selectedGraphId][t.dataset.field] = t.value;
    } else if (act === 'list-search') {
      ui.listKeyword = t.value;
      render();
      const box = document.querySelector('[data-act="list-search"]');
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    } else if (act === 'picker-search') {
      ui.pickerFilter.keyword = t.value;
      ui.pickerPage = 1;
      render();
      const box = document.querySelector('[data-act="picker-search"]');
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    } else if (act === 'picker-tree-kw') {
      ui.pickerFilter.treeKw = t.value;
      render();
      const b = document.querySelector('[data-act="picker-tree-kw"]');
      if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    } else if (act === 'picker-mode') {
      ui.pickerFilter.mode = t.value;
      render();
    } else if (act === 'no-graph-search') {
      ui.noGraphKeyword = t.value;
      render();
      const box = document.querySelector('[data-act="no-graph-search"]');
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    } else if (act === 'pos-cat-kw' && ui.modal && ui.modal.type === 'scope-pick') {
      ui.modal.catKw = t.value;
      ui.modal.page = 1;
      render();
      const box = document.querySelector('[data-act="pos-cat-kw"]');
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    } else if (act === 'pos-kw' && ui.modal && ui.modal.type === 'scope-pick') {
      // 右侧关键字仅记录，点「查询」生效（对齐截图交互）
      ui.modal.kw = t.value;
    } else if (act === 'tagx-cat-kw' && ui.modal && ui.modal.type === 'tag-pick') {
      ui.modal.catKw = t.value;
      ui.modal.page = 1;
      render();
      const b = document.querySelector('[data-act="tagx-cat-kw"]');
      if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    } else if (act === 'tagx-kw' && ui.modal && ui.modal.type === 'tag-pick') {
      ui.modal.kw = t.value;
    } else if (act === 's4-kw-side') {
      ui.s4SideKw = t.value;
      render();
      const b = document.querySelector('[data-act="s4-kw-side"]');
      if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    } else if (act === 's4-filter-level') {
      ui.s4FilterLevel = t.value;
      render();
    } else if (act === 's4-add-kw' && ui.modal && ui.modal.type === 's4-add') {
      ui.modal.kw = t.value;
      render();
      const b = document.querySelector('[data-act="s4-add-kw"]');
      if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    }
  }

  function onKey(e) {
    const control = e.target.closest('[data-act]');
    if (ui.pdGraphModal && ['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(e.key) && control?.dataset.act==='pd-pick-graph') {
      const buttons=[...document.querySelectorAll('.pd-gm-item')], index=buttons.indexOf(control), delta=['ArrowDown','ArrowRight'].includes(e.key)?1:-1;
      ui.pdGraphPick=buttons[(index+delta+buttons.length)%buttons.length].dataset.gid; render();
      document.querySelector('.pd-gm-item.on')?.focus(); e.preventDefault(); return;
    }
    if (ui.pdGraphModal && e.key==='Tab') {
      const controls=[...document.querySelectorAll('.pd-gm button:not(:disabled):not([tabindex="-1"]), .pd-gm input')], first=controls[0], last=controls[controls.length-1];
      if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();return;}
      if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();return;}
    }
    if (e.key === 'Enter' && control?.dataset.act === 'pd-graph-key') { ui.pdGraphQuery = ui.pdGraphKey || ''; ui.pdGraphPage = 1; render(); e.preventDefault(); return; }
    if (e.key === 'Enter' && control?.dataset.act === 'lc-picker-key') { window.GP_CONFIG.action('lc-picker-search', control, extensionContext()); e.preventDefault(); return; }
    if (control && e.key === 'Enter' && control.dataset.act.startsWith('learner-')) {
      const act = control.dataset.act === 'learner-node-key' ? 'learner-node-query' : control.dataset.act === 'learner-content-key' ? 'learner-search' : control.dataset.act;
      if (window.GP_LEARNER?.action(act, control, extensionContext())) { e.preventDefault(); return; }
    }
    if (control && e.key === 'Enter' && control.dataset.act === 'mgmt-name') { window.GP_MANAGEMENT.action('mgmt-query',control,extensionContext()); e.preventDefault(); return; }

    if (e.key === 'Escape') {
      if (ui.importHistoryDrawer) { ui.importHistoryDrawer=false;render();return; }
      if (ui.importConfirm) { ui.importConfirm=false;render();return; }
      if (ui.cockpitAdmin?.confirmDelete) { ui.cockpitAdmin.confirmDelete=null; render(); return; }
      if (ui.pdGraphModal) { ui.pdGraphModal=false; render(); document.querySelector('[data-act="pd-open-graph"]')?.focus(); return; }
      if (ui.lcPicker) { ui.lcPicker=null; render(); return; }
      if (ui.learnerDetail) { ui.learnerDetail=null; render(); return; }
      if (ui.mgmt?.modal) { ui.mgmt.modal = null; render(); return; }

      if (ui.modal) { ui.modal = null; toast('已取消，未修改任何关系或排除状态'); render(); }
      else if (ui.popover) { ui.popover = null; render(); }
      else if (ui.sidebarOpen) { ui.sidebarOpen = false; render(); }
    }

  }

  /* keydown 绑在 document 上：Esc 时焦点可能在 body 上，不能只依赖 #app 冒泡 */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (ui.importHistoryDrawer) { ui.importHistoryDrawer=false;render();return; }
      if (ui.importConfirm) { ui.importConfirm=false;render();return; }
      if (ui.cockpitAdmin?.confirmDelete) { ui.cockpitAdmin.confirmDelete=null; render(); return; }
      if (ui.pdGraphModal) { ui.pdGraphModal=false; render(); document.querySelector('[data-act="pd-open-graph"]')?.focus(); return; }
      if (ui.lcPicker) { ui.lcPicker=null; render(); return; }
      if (ui.learnerDetail) { ui.learnerDetail=null; render(); return; }
      if (ui.mgmt?.modal) { ui.mgmt.modal=null; render(); return; }

      if (ui.modal) { ui.modal = null; toast('已取消，未修改任何关系或排除状态'); render(); return; }
      if (ui.popover) { ui.popover = null; render(); return; }
      if (ui.sidebarOpen) { ui.sidebarOpen = false; render(); }
    }
  });

  /* ================= 业务动作 ================= */


  function openAutoHelp(el) {
    const text = '默认开启自动同步：岗位与图谱强绑定，岗位人员变动按原规则自动下发 / 回收。关闭后与岗位彻底解绑：若创建时选了岗位，仅首次把该岗人员一次性灌进学员列表（可手动删减），保存后人员固定；之后加减人只走「关联学员」。关闭时前端仍可展示岗位，但人员下发不跟岗位。请勿反复切换，否则数据易乱。首期关联维度仅岗位。';
    ui.popover = { target: el, text: esc(text) };
    render();
    setTimeout(positionPopover, 0);
  }

  function toggleAuto() {
    const g = S.graphs[S.selectedGraphId];
    if (g.autoSyncLocked || g.status !== 'draft') return;
    const turningOn = g.autoAssociate === false;
    if (turningOn) {
      g.autoAssociate = true;
      g.manualSeeded = false;
      ui.lastAction = '自动同步已开启';
      if (!g.positionIds.length) {
        toast('已开启自动同步；尚未选岗位，不会自动下发', 'warning');
      } else {
        const r = runSync(S.selectedGraphId, { includeDraft: true });
        toast(`已开启：按岗位同步名单（+${r.added.length} / -${r.removed.length}）。请勿反复切换。`, 'success');
      }
    } else {
      g.autoAssociate = false;
      ui.lastAction = '自动同步已关闭';
      if (g.positionIds.length && !g.manualSeeded) {
        const r = seedOnceFromPositions(S.selectedGraphId);
        const n = G.effectiveMembers(S, S.selectedGraphId).length;
        toast(`已关闭自动同步：已按岗一次性灌入，当前 ${n} 人，之后请手动维护`, 'warning');
      } else {
        toast('已关闭自动同步：人员固定，之后仅「关联学员」手动增改', 'warning');
      }
    }
    render();
  }

  function saveDraft() {
    const g = S.graphs[S.selectedGraphId];
    if (!String(g.name || '').trim()) {
      toast('请填写图谱名称', 'error');
      return;
    }
    if (g.autoAssociate !== false) {
      runSync(S.selectedGraphId,{includeDraft:true});
    } else if (!g.manualSeeded && g.positionIds.length) {
      seedOnceFromPositions(S.selectedGraphId);
    }
    const count=G.effectiveMembers(S,S.selectedGraphId).length;
    if (g.status === 'enabled') g.pendingUpdate = true;
    ui.lastAction = '保存配置 ' + new Date().toLocaleTimeString('zh-CN');
    if(S.currentStep===STEPS.length) { g.autoSyncLocked = true; ui.page='list'; }
    const status=g.status==='enabled'?'请在列表点击“更新”':g.status==='draft'?'图谱未启用，启用后学员可见':'图谱已停用';
    toast(`配置已保存，已关联 ${count} 名学员；${status}`,'success');
    render();
  }

  function syncNow() {
    const g = S.graphs[S.selectedGraphId];
    if (g.autoAssociate === false) {
      toast('自动同步已关闭，未做按岗增删；请到「关联学员」手动维护', 'warning');
      render();
      return;
    }
    const r = runSync(S.selectedGraphId);
    ui.lastAction = '同步成员';
    toast(`同步完成：新增 ${r.added.length} 人，移除 ${r.removed.length} 人，跳过已排除 ${r.skippedExcluded.length} 人`, 'success');
    render();
  }

  /** 新建一张空白光谱（草稿、自动同步默认开） */
  function newGraph() {
    const ids = Object.keys(S.graphs);
    let n = ids.length + 1;
    while (S.graphs['G' + n]) n += 1;
    const id = 'G' + n;
    S.graphs[id] = {
      id,
      order: Math.max(...ids.map((k) => S.graphs[k].order || 0), 0) + 1,
      name: '未命名光谱 ' + n,
      positionIds: [],
      groupIds: [],
      autoAssociate: true,
      manualSeeded: false,
      status: 'draft',
      contentVersion: 'v1',
      tagTree: JSON.parse(JSON.stringify(G.graphs.A.tagTree)),
      briefing: '',
      duty: '',
    };
    S.rel[id] = {};
    return id;
  }

  /** 第一步「下一步」：必填校验通过才进入第二步 */
  function step1Next() {
    const g = S.graphs[S.selectedGraphId];
    if (!String(g.name || '').trim()) {
      toast('请填写图谱名称', 'error');
      const el = document.querySelector('[data-act="field"][data-field="name"]');
      if (el) el.focus();
      return;
    }
    ui.lastAction = '第一步 → 下一步';
    S.currentStep = 2;
    render();
  }

  function confirmPicker() {
    const gid = S.selectedGraphId;
    const uids = Array.from(ui.pickerSel);
    if (!uids.length) { toast('未选择任何人员', 'warning'); return; }
    let readded = 0;
    uids.forEach((uid) => {
      const r = rel(gid, uid);
      if (r.excluded) { r.excluded = false; readded++; }
      addSource(gid, uid, 'manual', '手动添加');
    });
    ui.sidebarOpen = false;
    ui.pickerSel = new Set();
    ui.lastAction = '手动加入 ' + uids.length + ' 人';
    toast(`已手动加入 ${uids.length} 人` + (readded ? `，其中 ${readded} 人解除排除` : ''), 'success');
    render();
  }

  function confirmModal() {
    const m = ui.modal;
    if (!m) return;
    if (m.type === 'member-import') {
      if (m.loading || !m.uids?.length || m.errors.length || S.graphs[S.selectedGraphId].autoAssociate !== false) return;
      ui.pickerSel = new Set(m.uids);
      ui.modal = null;
      confirmPicker();
      return;
    }
    if (m.type === 'remove') {
      const gid = S.selectedGraphId;
      m.uids.forEach((uid) => {
        const r = rel(gid, uid);
        r.excluded = true;
        r.retained = false;
        r.sources = [];       // 取消有效关系
      });
      ui.lastAction = '移除并排除 ' + m.uids.length + ' 人';
      toast(`已移除 ${m.uids.length} 人并标人工排除；学习与考试记录保留`, 'success');
    } else if (m.type === 'scope-pick') {
      toast('已更新关联范围');
    }
    ui.modal = null;
    render();
  }

  function readd(uid) {
    const gid = S.selectedGraphId;
    const r = rel(gid, uid);
    r.excluded = false;
    r.retained = false;
    addSource(gid, uid, 'manual', '手动添加');
    ui.lastAction = '重新加入 ' + personName(uid);
    toast(`已重新加入 ${personName(uid)}，解除人工排除`, 'success');
    render();
  }

  function toggleStatus() {
    const g = S.graphs[S.selectedGraphId];
    g.status = g.status === 'enabled' ? 'disabled' : 'enabled';
    if (g.status === 'enabled') {
      const r = runSync(S.selectedGraphId);
      toast(`已启用，按当前开关与来源重新处理：补入 ${r.added.length} 人（已排除者不复活）`, 'success');
    } else {
      toast('已停用：不再自动分配或允许学员进入，配置与事实保留', 'warning');
    }
    ui.lastAction = g.status === 'enabled' ? '启用图谱' : '停用图谱';
    render();
  }

  /** 图谱状态标签（草稿 / 已启用 / 已停用） */
  function statusTag(g) {
    if (g.status === 'enabled') return '<span class="tag tag-enabled">已启用</span>';
    if (g.status === 'draft') return '<span class="tag tag-neutral">草稿</span>';
    return '<span class="tag tag-disabled">已停用</span>';
  }

  /* --- CSV 导出（用原生 Blob + 下载，不手写 CSV 解析器） --- */
  function exportCsv() {
    const st = ui.noGraphState || 'normal';
    if (st !== 'normal') { toast('当前不是正常结果状态，不导出', 'error'); return; }
    const rows = noGraphRows();
    const header = ['工号', '姓名', '部门', '岗位'];
    const lines = [header.join(',')];
    rows.forEach((p) => {
      lines.push([
        p.employeeCode, p.userName, p.deptName,
        p.positionIds.map(posName).join('、'),
      ].map(csvCell).join(','));
    });
    const csv = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '无有效图谱学员_模拟_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ui.lastAction = '导出 CSV ' + rows.length + ' 行';
    toast(`已导出 ${rows.length} 行（模拟数据）`, 'success');
    render();
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function parseMemberImport(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
    const cell = line => line.trim().replace(/^"([^",]*)"$/, '$1');
    if (cell(lines[0]) !== '工号') throw new Error('首行应为“工号”，请使用下载模板。');
    const uids = new Set(), errors = [];
    lines.slice(1).forEach((line, i) => {
      if (!line.trim()) return;
      const code = cell(line);
      const matches = S.persons.filter(p => p.employeeCode === code);
      if (matches.length !== 1) errors.push(`第 ${i + 2} 行：工号“${code}”${matches.length ? '匹配到多名人员' : '不存在'}`);
      else uids.add(matches[0].userId);
    });
    if (!uids.size && !errors.length) errors.push('请在“工号”表头下填写至少一名人员。');
    return { uids: [...uids], errors };
  }

  async function readMemberImport(input) {
    const file = input.files?.[0];
    if (!file) return;
    const modal = ui.modal;
    modal.loading = true; modal.uids = []; modal.errors = []; render();
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error('只能上传 .csv 格式的表格。用 Excel 编辑的文件，请选择「另存为」→「CSV UTF-8（逗号分隔）」后再上传。');
      const text = await file.text();
      if (text.includes('\uFFFD')) throw new Error('文件里的中文无法识别。请在 Excel 中选择「另存为」→「CSV UTF-8（逗号分隔）」后重新上传。');
      Object.assign(modal, parseMemberImport(text));
    } catch (error) { modal.errors = [error.message]; }
    finally { modal.loading = false; if (ui.modal === modal) render(); }
  }

  /* ---- 导入执行 ---- */
  function recordImportHistory(res) {
    const gid = S.selectedGraphId;
    S.importHistory ||= {};
    const list = S.importHistory[gid] ||= [];
    list.unshift({
      id: 'h' + Date.now().toString(36) + list.length,
      at: new Date().toLocaleString('zh-CN', { hour12: false }),
      file: ui.importSource || '—',
      actor: ui.actor.userName,
      people: new Set(res.results.map(r => r.userId).filter(Boolean)).size,
      ok: res.ok, fail: res.fail, skipped: ui.importSkipped || 0,
      items: res.results.map(r => ({
        code: r.employeeCode || personCode(r.userId), name: r.userNameInput || r.personName || '',
        path: r.pathInput || window.GP_IMPORT.tagPath(r.graphId, r.tagId),
        before: r.latest == null ? null : r.latest, score: Number.isFinite(r.score) ? r.score : r.scoreInput,
        status: r.status, reason: r.reason || '',
      })),
    });
  }

  function importHistoryList() { return (S.importHistory || {})[S.selectedGraphId] || []; }
  function renderImportHistory() {
    const list = importHistoryList();
    const card = h => `<article class="import-record" data-history="${esc(h.id)}">
        <div class="import-record-top"><b>${esc(h.at)}</b>${h.fail ? '<span class="import-history-tag warn">部分失败</span>' : '<span class="import-history-tag ok">成功</span>'}</div>
        <div class="import-record-file" title="${esc(h.file)}">${esc(h.file)}</div>
        <div class="import-record-meta"><span>${esc(h.actor)}</span><span>涉及学员 <b>${h.people}</b></span><span>写入 <b>${h.ok}</b></span><span>未填跳过 <b>${h.skipped}</b></span><span>失败 <b>${h.fail}</b></span></div>
        <button class="btn-link" data-act="import-history-download" data-id="${esc(h.id)}">下载明细</button>
      </article>`;
    return `<div class="modal-mask import-drawer-mask" data-act="import-history-close">
      <aside class="import-drawer" role="dialog" aria-modal="true" aria-labelledby="import-drawer-title">
        <header class="import-drawer-head"><h2 id="import-drawer-title">导入记录</h2>
          <button type="button" class="import-drawer-close" data-act="import-history-close" aria-label="关闭导入记录">×</button></header>
        <div class="import-drawer-body">${list.length ? list.map(card).join('') : '<div class="import-history-empty">还没有导入记录。提交后会在这里留下记录，可随时查看每次写入了哪些成绩。</div>'}</div>
      </aside>
    </div>`;
  }

  function doImportExecute() {
    const rows = ui.importPreview;
    if (!rows) return;
    if (rows.some((r) => r.errors.length || r.dirty)) { toast('还有错误或未校验的修改，不能提交', 'error'); return; }
    const res = window.GP_IMPORT.execute(rows, ui.showFailMode);
    ui.importExecResult = res;
    recordImportHistory(res);
    ui.lastAction = `执行导入：成功 ${res.ok} / 失败 ${res.fail}`;
    toast(res.fail ? `执行结束：成功 ${res.ok} 行，失败 ${res.fail} 行` : `执行成功 ${res.ok} 行`, res.fail ? 'warning' : 'success');
    render();
  }

  async function readImportFile(input) {
    const file=input.files?.[0];if(!file)return;
    const ticket=ui.importLoadToken=(ui.importLoadToken||0)+1;
    ui.importPreview=null;ui.importExecResult=null;ui.importConfirm=false;ui.importFilter='all';ui.importFileError='';ui.importSkipped=0;ui.importSource=file.name;ui.importReading=true;render();
    try {
      const ext=(file.name.match(/\.([^.]+)$/)?.[1]||'').toLowerCase();
      if(ext==='xls')throw new Error('暂不支持旧版 .xls 文件，请在 Excel 中另存为 .xlsx 后上传。');
      if(!['xlsx','csv'].includes(ext))throw new Error('请上传 Excel 表格（.xlsx），也支持 .csv 文件。');
      if(file.size>2*1024*1024)throw new Error('文件超过本地演示的 2 MB 上限，请拆分后重试。');
      let rows;
      if(ext==='xlsx'){
        const book=await window.GP_BUILDER_DOCUMENT.parseWorkbook(file,{maxRows:1000,maxText:500000});
        if(ticket!==ui.importLoadToken||ui.page!=='import')return;
        rows=window.GP_IMPORT.parseSheets(book.sheets,{graphId:S.selectedGraphId});
      } else {
        const content=await file.text();
        if(content.includes('\uFFFD'))throw new Error('文件里的中文无法识别，建议直接上传 Excel 表格（.xlsx）。');
        if(ticket!==ui.importLoadToken||ui.page!=='import')return;
        rows=window.GP_IMPORT.parseCsv(content,{graphId:S.selectedGraphId});
      }
      ui.importSkipped=rows.skipped||0;
      ui.importPreview=window.GP_IMPORT.preview(rows);
    } catch(error) { if(ticket===ui.importLoadToken&&ui.page==='import')ui.importFileError=error.message || '文件读取失败，请重新选择。'; }
    finally { if(ticket===ui.importLoadToken&&ui.page==='import'){ui.importReading=false;render();} }
  }

  function importCsvDownload(name, lines) {
    const safe=value=>{const v=String(value==null?'':value);return csvCell(/^[\t\r\n ]*[=+@-]/.test(v)?"'"+v:v);};
    const blob=new Blob(['\uFEFF'+lines.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('已发起文件下载');
  }

  function importXlsxDownload(name, rowsOrSheets, widths) {
    const book=Array.isArray(rowsOrSheets[0]?.rows)?window.GP_IMPORT.toXlsx(rowsOrSheets):window.GP_IMPORT.toXlsx('评分导入',rowsOrSheets,widths);
    const url=URL.createObjectURL(book),link=document.createElement('a');
    link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('已发起文件下载');
  }

  function downloadTemplate() {
    const ids=importScopeIds();
    if(!ids.length){toast('请先选择学员','warning');return;}
    importXlsxDownload(`评分导入模板-${graphName(S.selectedGraphId)}.xlsx`,window.GP_IMPORT.templateSheets(S.selectedGraphId,ids));
  }

  function exportImportErrors() {
    const rows=(ui.importPreview||[]).filter(r=>r.errors.length);if(!rows.length)return;
    const lines=[['工号','姓名','一级标签','二级标签','三级标签','新成绩','原文件行号','错误原因']];
    rows.forEach(r=>{const path=r.pathInput||window.GP_IMPORT.tagPath(r.graphId,r.tagId);lines.push([r.employeeCode||personCode(r.userId),r.userNameInput||r.personName||'',path[0]||'',path[1]||'',path[2]||'',Number.isFinite(r.score)?r.score:r.scoreInput||'',r.sourceLine||r.rowNo,r.errors.join('；')]);});
    importXlsxDownload('评分导入错误明细.xlsx',lines,[12,10,14,14,16,10,12,48]);
  }

  function personOfName(uid) {
    return S.persons.find((p) => p.userId === uid);
  }

  /* 驾驶舱：左栏复选框（分组全选 / 单图勾选） */
  document.addEventListener('change', (e) => {
    const t = e.target.closest('[data-act="cp-grp"], [data-act="cp-gp"]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'cp-grp') {
      const key = t.dataset.key;
      const tab = ui.cpTab;
      // 该分组的全部 gpId：从当前渲染的分组里取（用 DOM 内同级 .cp-gp-line 反查）
      const grp = t.closest('.cp-grp');
      const gids = Array.from(grp.querySelectorAll('[data-act="cp-gp"]')).map((x) => x.dataset.gid);
      ui.cpChecked[key] = t.checked ? gids.slice() : [];
      render();
    } else {
      const key = t.dataset.key;
      const gid = t.dataset.gid;
      const cur = new Set(ui.cpChecked[key] || []);
      if (t.checked) cur.add(gid); else cur.delete(gid);
      ui.cpChecked[key] = Array.from(cur);
      render();
    }
  });

  /* select 的 change 事件单独代理 */
  document.addEventListener('change', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'switch-student') { S.studentUserId = t.value; ui.dashboardGraphId = null; render(); }
    else if (act === 'cockpit-graph') { ui.cockpitGraphId = t.value; render(); }
  });

  /* ================= 启动 ================= */
  resetAll();
  window.GP_UI = { get state() { return S; }, get ui() { return ui; }, get scores() { return scores; }, runSync };
})();
