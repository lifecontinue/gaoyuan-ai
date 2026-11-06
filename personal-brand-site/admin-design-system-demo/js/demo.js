const JOBS = [
  { id: 1, name: "学习发展经理", code: "JOB-L&D-001", dept: "学习发展部", band: "M2–M3", headcount: 4, on: true, updated: "2026-10-28 14:12" },
  { id: 2, name: "课程运营专员", code: "JOB-OPS-014", dept: "学习发展部", band: "P2–P3", headcount: 8, on: true, updated: "2026-10-21 09:40" },
  { id: 3, name: "组织发展顾问", code: "JOB-OD-003", dept: "人力资源中心", band: "M3–M4", headcount: 2, on: true, updated: "2026-09-16 18:02" },
  { id: 4, name: "培训讲师（内训）", code: "JOB-TR-021", dept: "学习发展部", band: "P3–P4", headcount: 6, on: true, updated: "2026-11-02 11:18" },
  { id: 5, name: "胜任力建模专家", code: "JOB-CM-008", dept: "人力资源中心", band: "M3–M4", headcount: 1, on: false, updated: "2026-08-07 16:55" },
  { id: 6, name: "产品培训经理", code: "JOB-PD-011", dept: "产品研发中心", band: "M2–M3", headcount: 3, on: true, updated: "2026-10-30 10:06" },
  { id: 7, name: "销售赋能专员", code: "JOB-SE-019", dept: "销售管理部", band: "P2–P3", headcount: 5, on: true, updated: "2026-11-04 08:33" },
  { id: 8, name: "测评项目经理", code: "JOB-AS-006", dept: "人力资源中心", band: "M2–M3", headcount: 2, on: true, updated: "2026-09-29 15:21" },
  { id: 9, name: "学习设计师", code: "JOB-ID-012", dept: "学习发展部", band: "P3–P4", headcount: 4, on: true, updated: "2026-10-12 13:47" },
  { id: 10, name: "校园招聘专员", code: "JOB-HR-030", dept: "人力资源中心", band: "P1–P2", headcount: 3, on: false, updated: "2026-07-19 09:11" },
  { id: 11, name: "数字化学习运营", code: "JOB-DL-017", dept: "学习发展部", band: "P3–P4", headcount: 2, on: true, updated: "2026-11-01 17:28" },
  { id: 12, name: "区域培训主管", code: "JOB-RG-009", dept: "销售管理部", band: "M1–M2", headcount: 7, on: true, updated: "2026-10-08 12:04" },
];

const TREE_META = {
  job: { title: "岗位管理", desc: "系统设置案例模板：筛选 → 工具栏 → 表格 → 底栏「已选 N 条」左 / 分页右。点「编辑」开 md 640 抽屉，点「查看」开 xl 960 抽屉。" },
  "job-path": { title: "岗位发展通道", desc: "同一骨架：左树即时筛选。本页仍用岗位列表示意。" },
  "rank-path": { title: "职级发展通道", desc: "同一骨架。点击行可打开抽屉表单。" },
  competency: { title: "胜任力管理", desc: "系统设置-有标签形态。表格操作列为文字链接。" },
  qualify: { title: "任职资格管理", desc: "列表底栏保持已选条数，勿省略。" },
  assess: { title: "测评中心", desc: "案例库可复用课程/考试/直播同一壳。" },
  idp: { title: "个人发展计划", desc: "白卡片 + 灰壳底，padding 24。" },
  sys: { title: "系统设置", desc: "点击行打开 md/xl 抽屉，对照案例「抽屉表单宽度」。" },
};

const NAV_LABEL = {
  home: "首页",
  org: "组织管理",
  exam: "考试管理",
  course: "课程管理",
  community: "学习社区",
  eval: "评估调研",
  resource: "资源管理",
  setting: "平台设置",
};

const state = {
  page: 1,
  pageSize: 10,
  selected: new Set(),
  filter: { name: "", code: "", dept: "", status: "" },
  tree: "job",
  tab: "list",
  pendingDeleteId: null,
};

const els = {
  tbody: document.getElementById("job-tbody"),
  empty: document.getElementById("empty-state"),
  selectedN: document.getElementById("selected-n"),
  clearSel: document.getElementById("btn-clear-sel"),
  checkAll: document.getElementById("check-all"),
  pageTotal: document.getElementById("page-total"),
  pageNums: document.getElementById("page-nums"),
  pagePrev: document.getElementById("page-prev"),
  pageNext: document.getElementById("page-next"),
  pageSize: document.getElementById("page-size"),
  pageJump: document.getElementById("page-jump"),
  drawer: document.getElementById("drawer"),
  mask: document.getElementById("mask"),
  drawerTitle: document.getElementById("drawer-title"),
  drawerBody: document.getElementById("drawer-body"),
  drawerFoot: document.getElementById("drawer-foot"),
  message: document.getElementById("message"),
  pop: document.getElementById("popconfirm"),
  spec: document.getElementById("spec-strip"),
  crumb: document.getElementById("crumb-current"),
  pageTitle: document.getElementById("page-title"),
  pageDesc: document.getElementById("page-desc"),
};

function filtered() {
  return JOBS.filter((row) => {
    const { name, code, dept, status } = state.filter;
    if (name && !row.name.includes(name)) return false;
    if (code && !row.code.toLowerCase().includes(code.toLowerCase())) return false;
    if (dept && row.dept !== dept) return false;
    if (status === "on" && !row.on) return false;
    if (status === "off" && row.on) return false;
    return true;
  });
}

function pageSlice(rows) {
  const start = (state.page - 1) * state.pageSize;
  return rows.slice(start, start + state.pageSize);
}

function toast(text) {
  els.message.textContent = text;
  els.message.classList.add("is-show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.message.classList.remove("is-show"), 1800);
}

function renderTable() {
  const rows = filtered();
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / state.pageSize));
  if (state.page > pages) state.page = pages;
  const slice = pageSlice(rows);

  els.tbody.innerHTML = "";
  els.empty.hidden = slice.length > 0;

  slice.forEach((row) => {
    const tr = document.createElement("tr");
    if (state.selected.has(row.id)) tr.classList.add("is-checked");
    tr.innerHTML = `
      <td class="col-check"><input class="ads-checkbox" type="checkbox" data-id="${row.id}" ${state.selected.has(row.id) ? "checked" : ""} aria-label="选择 ${row.name}" /></td>
      <td>${row.name}</td>
      <td>${row.code}</td>
      <td>${row.dept}</td>
      <td>${row.band}</td>
      <td>${row.headcount}</td>
      <td>${row.on ? '<span class="ads-tag ads-tag-success">启用</span>' : '<span class="ads-tag ads-tag-default">停用</span>'}</td>
      <td>${row.updated}</td>
      <td class="col-ops">
        <div class="ops">
          <button class="ads-btn ads-btn-text" type="button" data-act="edit" data-id="${row.id}">编辑</button>
          <button class="ads-btn ads-btn-text" type="button" data-act="view" data-id="${row.id}">查看</button>
          <button class="ads-btn ads-btn-text" type="button" data-act="del" data-id="${row.id}">删除</button>
        </div>
      </td>`;
    els.tbody.appendChild(tr);
  });

  const n = state.selected.size;
  els.selectedN.textContent = String(n);
  els.clearSel.hidden = n === 0;
  const visibleIds = slice.map((r) => r.id);
  els.checkAll.checked = visibleIds.length > 0 && visibleIds.every((id) => state.selected.has(id));
  els.checkAll.indeterminate = visibleIds.some((id) => state.selected.has(id)) && !els.checkAll.checked;

  els.pageTotal.textContent = `共 ${total} 条`;
  els.pageNums.innerHTML = "";
  for (let i = 1; i <= pages; i += 1) {
    if (pages > 5 && i > 3 && i < pages) {
      if (i === 4) {
        const dots = document.createElement("span");
        dots.textContent = "…";
        els.pageNums.appendChild(dots);
      }
      if (i !== pages) continue;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `page-btn${i === state.page ? " is-active" : ""}`;
    btn.textContent = String(i);
    btn.addEventListener("click", () => {
      state.page = i;
      renderTable();
    });
    els.pageNums.appendChild(btn);
  }
  els.pagePrev.disabled = state.page <= 1;
  els.pageNext.disabled = state.page >= pages;
  els.pageJump.value = String(state.page);
}

function closeDrawer() {
  els.drawer.classList.remove("is-open");
  els.mask.classList.remove("is-open");
  setTimeout(() => {
    els.drawer.hidden = true;
  }, 220);
}

function openDrawer({ title, xl, body, foot }) {
  els.drawer.hidden = false;
  els.drawerTitle.textContent = title;
  els.drawer.classList.toggle("is-xl", Boolean(xl));
  els.drawerBody.innerHTML = body;
  els.drawerFoot.innerHTML = foot;
  requestAnimationFrame(() => {
    els.drawer.classList.add("is-open");
    els.mask.classList.add("is-open");
  });
  const first = els.drawer.querySelector("input, textarea, select, button");
  if (first) first.focus();
}

function formFields(row, readonly) {
  const dis = readonly ? "disabled" : "";
  const on = row ? row.on : true;
  return `
    <div class="form-row">
      <div class="form-item">
        <label><span class="req">*</span>岗位名称</label>
        <div class="form-control">
          <input class="ads-input" name="name" ${dis} value="${row ? row.name : ""}" placeholder="请输入岗位名称" />
        </div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-item">
        <label><span class="req">*</span>岗位编码</label>
        <div class="form-control">
          <input class="ads-input" name="code" ${dis} value="${row ? row.code : ""}" placeholder="请输入编码" />
        </div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-item">
        <label>所属部门</label>
        <div class="form-control">
          <select class="ads-select" name="dept" ${dis}>
            <option ${!row || row.dept === "人力资源中心" ? "selected" : ""}>人力资源中心</option>
            <option ${row && row.dept === "学习发展部" ? "selected" : ""}>学习发展部</option>
            <option ${row && row.dept === "产品研发中心" ? "selected" : ""}>产品研发中心</option>
            <option ${row && row.dept === "销售管理部" ? "selected" : ""}>销售管理部</option>
          </select>
        </div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-item">
        <label>职级带宽</label>
        <div class="form-control">
          <input class="ads-input" name="band" ${dis} value="${row ? row.band : ""}" placeholder="例如 M2–M3" />
        </div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-item">
        <label>启用状态</label>
        <div class="form-control">
          <div class="switch-row">
            <button class="ads-switch" type="button" role="switch" aria-checked="${on}" ${readonly ? "disabled" : ""} id="sw-on"></button>
            <span>${on ? "启用" : "停用"}</span>
          </div>
          <p class="field-note">关闭后该岗位对学员端不可见，历史学习记录仍保留。</p>
        </div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-item">
        <label>岗位说明</label>
        <div class="form-control">
          <textarea class="ads-textarea" name="desc" ${dis} placeholder="请输入岗位职责与任职要求">${row ? `${row.name}负责学习项目运营、课程迭代与效果评估，协同业务部门落地年度培训计划。` : ""}</textarea>
        </div>
      </div>
    </div>`;
}

function openEdit(row) {
  openDrawer({
    title: row ? "编辑岗位" : "新增岗位",
    xl: false,
    body: formFields(row, false),
    foot: `
      <button class="ads-btn ads-btn-default" type="button" data-close="1">取消</button>
      <button class="ads-btn ads-btn-primary" type="button" id="btn-save">确定</button>`,
  });
  bindSwitch();
  els.drawerFoot.querySelector("#btn-save").addEventListener("click", () => {
    closeDrawer();
    toast("保存成功");
  });
}

function openView(row) {
  openDrawer({
    title: "查看岗位",
    xl: true,
    body: `
      <h3 class="section-title">基础信息</h3>
      ${formFields(row, true)}
      <h3 class="section-title">任职要求</h3>
      <div class="form-row">
        <div class="form-item">
          <label>学历要求</label>
          <div class="form-control"><input class="ads-input" disabled value="本科及以上" /></div>
        </div>
        <div class="form-item">
          <label>工作年限</label>
          <div class="form-control"><input class="ads-input" disabled value="3 年及以上" /></div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-item">
          <label>核心胜任力</label>
          <div class="form-control">
            <span class="ads-tag ads-tag-primary">学习设计</span>
            <span class="ads-tag ads-tag-primary">项目运营</span>
            <span class="ads-tag ads-tag-primary">数据分析</span>
          </div>
        </div>
      </div>`,
    foot: `<button class="ads-btn ads-btn-default" type="button" data-close="1">关闭</button>
           <button class="ads-btn ads-btn-primary" type="button" id="btn-to-edit">编辑</button>`,
  });
  els.drawerFoot.querySelector("#btn-to-edit").addEventListener("click", () => openEdit(row));
}

function bindSwitch() {
  const sw = document.getElementById("sw-on");
  if (!sw) return;
  sw.addEventListener("click", () => {
    const next = sw.getAttribute("aria-checked") !== "true";
    sw.setAttribute("aria-checked", String(next));
    sw.nextElementSibling.textContent = next ? "启用" : "停用";
  });
}

function byId(id) {
  return JOBS.find((j) => j.id === Number(id));
}

document.getElementById("filter-form").addEventListener("submit", (e) => {
  e.preventDefault();
  state.filter = {
    name: document.getElementById("f-name").value.trim(),
    code: document.getElementById("f-code").value.trim(),
    dept: document.getElementById("f-dept").value,
    status: document.getElementById("f-status").value,
  };
  state.page = 1;
  renderTable();
});

document.getElementById("btn-reset").addEventListener("click", () => {
  state.filter = { name: "", code: "", dept: "", status: "" };
  state.page = 1;
  setTimeout(renderTable, 0);
});

document.getElementById("btn-create").addEventListener("click", () => openEdit(null));
document.getElementById("btn-import").addEventListener("click", () => toast("导入为示意，未接真实上传"));
document.getElementById("btn-export").addEventListener("click", () => toast("已开始导出当前筛选结果"));
document.getElementById("btn-cols").addEventListener("click", () => toast("列自定义按钮位置对齐 Sketch 案例"));

els.checkAll.addEventListener("change", () => {
  pageSlice(filtered()).forEach((row) => {
    if (els.checkAll.checked) state.selected.add(row.id);
    else state.selected.delete(row.id);
  });
  renderTable();
});

els.clearSel.addEventListener("click", () => {
  state.selected.clear();
  renderTable();
});

els.tbody.addEventListener("click", (e) => {
  const act = e.target.closest("[data-act]");
  if (act) {
    const row = byId(act.dataset.id);
    if (act.dataset.act === "edit") openEdit(row);
    if (act.dataset.act === "view") openView(row);
    if (act.dataset.act === "del") {
      state.pendingDeleteId = row.id;
      const rect = act.getBoundingClientRect();
      els.pop.style.top = `${rect.bottom + 8}px`;
      els.pop.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
      els.pop.classList.add("is-open");
    }
    e.stopPropagation();
    return;
  }
  const box = e.target.closest("input[type=checkbox]");
  if (box) {
    const id = Number(box.dataset.id);
    if (box.checked) state.selected.add(id);
    else state.selected.delete(id);
    renderTable();
    return;
  }
  const tr = e.target.closest("tr");
  if (!tr) return;
  const idBox = tr.querySelector("input[data-id]");
  if (idBox) openEdit(byId(idBox.dataset.id));
});

document.getElementById("pop-cancel").addEventListener("click", () => els.pop.classList.remove("is-open"));
document.getElementById("pop-ok").addEventListener("click", () => {
  const idx = JOBS.findIndex((j) => j.id === state.pendingDeleteId);
  if (idx >= 0) JOBS.splice(idx, 1);
  state.selected.delete(state.pendingDeleteId);
  els.pop.classList.remove("is-open");
  renderTable();
  toast("已删除");
});

els.pagePrev.addEventListener("click", () => {
  if (state.page > 1) {
    state.page -= 1;
    renderTable();
  }
});
els.pageNext.addEventListener("click", () => {
  state.page += 1;
  renderTable();
});
els.pageSize.addEventListener("change", () => {
  state.pageSize = Number(els.pageSize.value);
  state.page = 1;
  renderTable();
});
els.pageJump.addEventListener("change", () => {
  const n = Number(els.pageJump.value);
  if (n >= 1) {
    state.page = n;
    renderTable();
  }
});

document.querySelectorAll(".menu-item[data-nav]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".menu-item[data-nav]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    const key = btn.dataset.nav;
    if (key === "setting") {
      toast("当前页：平台设置 / 岗位管理");
      return;
    }
    toast(`${NAV_LABEL[key]} 未纳入本原型切片，仍停留在系统设置案例`);
  });
});

document.querySelectorAll(".tree-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tree-item").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    const meta = TREE_META[btn.dataset.tree];
    state.tree = btn.dataset.tree;
    els.pageTitle.textContent = meta.title;
    els.pageDesc.textContent = meta.desc;
    els.crumb.textContent = meta.title;
    state.selected.clear();
    state.page = 1;
    renderTable();
  });
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    state.tab = tab.dataset.tab;
    if (state.tab === "list") {
      renderTable();
      return;
    }
    toast("该标签页与列表共用同一骨架，本切片只做岗位管理表");
  });
});

document.getElementById("btn-spec").addEventListener("click", () => {
  els.spec.classList.toggle("is-open");
  document.getElementById("btn-spec").classList.toggle("is-active", els.spec.classList.contains("is-open"));
});

function onCloseDrawer(e) {
  if (e.target.closest("[data-close]") || e.target === els.mask || e.target.closest("#drawer-close")) {
    closeDrawer();
  }
}
els.mask.addEventListener("click", onCloseDrawer);
els.drawer.addEventListener("click", onCloseDrawer);
document.getElementById("drawer-close").addEventListener("click", closeDrawer);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeDrawer();
    els.pop.classList.remove("is-open");
  }
});

renderTable();
