/* 三份样式共用这份数据。改文案改这里；改外观改对应 html 里的 CSS。 */
const FILTERS = [["all", "全部"], ["eval", "评估"], ["normal", "调查"]];
const GROUPS = [
  ["eval", "评估 · 给讲师、员工、课程打分并排名"],
  ["normal", "调查 · 收集意见和反馈，按题统计"],
];
const SCENES = [
  { id: "teach", type: "eval", name: "讲师授课评估", line: "给讲师打分并排名", meta: "带计分题 · 评测关系" },
  { id: "r360", type: "eval", name: "360 度能力评估", line: "多关系加权打分", meta: "带关系权重 · 综合排名" },
  { id: "course", type: "eval", name: "课程开发评审", line: "评审课程方案质量", meta: "带计分题" },
  { id: "post", type: "eval", name: "岗位能力评估", line: "评估岗位胜任力", meta: "带计分题" },
  { id: "blankEval", type: "eval", name: "空白评估型调查", line: "不带题目，自行添加", meta: "空白模板", blank: true },
  { id: "need", type: "normal", name: "培训需求调研", line: "收集培训需求", meta: "普通统计" },
  { id: "after", type: "normal", name: "课后满意度调查", line: "课后反馈", meta: "普通统计" },
  { id: "staff", type: "normal", name: "员工满意度调查", line: "员工体验", meta: "普通统计" },
  { id: "info", type: "normal", name: "信息收集", line: "通用信息登记", meta: "普通统计" },
  { id: "blankNormal", type: "normal", name: "空白普通调查", line: "不带题目，自行添加", meta: "空白模板", blank: true },
];

const state = { f: "all", sel: "teach" };
const byId = (id) => SCENES.find((s) => s.id === id);

function paint() {
  const root = document.getElementById("stage");
  const list = SCENES.filter((s) => state.f === "all" || s.type === state.f);
  if (list.length && !list.some((s) => s.id === state.sel)) state.sel = list[0].id;
  const current = byId(state.sel);
  const groups = state.f === "all" ? GROUPS : GROUPS.filter((g) => g[0] === state.f);
  root.innerHTML = `
    <p class="banner">样式预览，只看外观。改字号、颜色、间距：打开本页 &lt;style&gt; 顶部的 :root。</p>
    <button class="back" type="button">‹ 返回调查列表</button>
    <section class="hero">
      <h2>这次想做什么？</h2>
      <p>选一个场景，题目、计分方式和流程会提前带好，进去后都能改。也可以从空白开始。</p>
      <div class="steps"><span class="on"><b>1</b> 选场景</span><span><b>2</b> 编辑问卷</span><span><b>3</b> 选对象或学员</span><span><b>4</b> 设置并发布</span></div>
    </section>
    <div class="chips" role="tablist">
      ${FILTERS.map(([k, t]) => `<button type="button" data-f="${k}" class="${state.f === k ? "on" : ""}" role="tab" aria-selected="${state.f === k}">${t}</button>`).join("")}
    </div>
    <div class="grid">
      ${groups.map(([k, title]) => `<h3 class="group">${title}</h3>${list.filter((s) => s.type === k).map((s) => `
        <button type="button" class="card${s.blank ? " blank" : ""}${s.id === state.sel ? " on" : ""}" data-id="${s.id}" aria-pressed="${s.id === state.sel}">
          <b>${s.name}</b><p>${s.line}</p><span class="meta">${s.meta}</span>
        </button>`).join("")}`).join("")}
    </div>
    <div class="dock">
      <div><strong>已选：${current ? current.name : "未选择"}</strong><p>${current && current.blank ? "接下来：进入第 1 步编辑问卷（自行添加题目）。演示数据。" : "接下来：进入第 1 步编辑问卷（可改题、计分、必答）。演示数据。"}</p></div>
      <button class="go" type="button">用这个场景开始</button>
    </div>`;
  root.querySelectorAll("[data-f]").forEach((b) => { b.onclick = () => { state.f = b.dataset.f; paint(); }; });
  root.querySelectorAll("[data-id]").forEach((b) => { b.onclick = () => { state.sel = b.dataset.id; paint(); }; });
  root.querySelector(".back").onclick = () => { state.f = "all"; state.sel = "teach"; paint(); };
  root.querySelector(".go").onclick = () => {
    const note = root.querySelector(".dock p");
    note.textContent = "样式稿停在这一步。选定样式后，再接到编辑问卷。";
  };
}
paint();
