/* 光谱汇报页 · localStorage + /api/guangpu-report-feedback（沿用 xlx-marks 同步模式） */
(function () {
  const STORAGE_KEY = "guangpu-report-feedback-v1";
  const API = "/api/guangpu-report-feedback";
  const D = window.GPR_DATA;
  const KIND_LABEL = { demo: "演示", proto: "原型", check: "与用户核对", bg: "背景" };
  const STATUS = [
    ["", "我的判断"],
    ["ok", "认可"],
    ["ask", "待确认"],
    ["no", "有异议"],
  ];

  let fb = loadLocal();
  let pushTimer = null;

  renderQuickLinks();
  renderTimeline();
  renderTable("#adminScript", D.adminScript);
  renderTable("#learnerScript", D.learnerScript);
  renderTable("#blockers", D.blockers, (row) => [levelBadge(row[0]), row[1], row[2], row[3]]);
  renderTable("#glossary", D.glossary);
  renderTable("#linear", D.linear, (row) => [row[0], row[1], row[2], row[3] || "暂无"]);
  document.querySelector("#adminShortPath").textContent = D.adminShortPath;
  document.querySelectorAll("a[data-link]").forEach((a) => {
    a.href = D.links[a.dataset.link];
    a.target = "_blank";
    a.rel = "noopener";
  });
  bindGeneral();
  document.querySelector("#btnSync").addEventListener("click", syncNow);
  document.querySelector("#btnExportMd").addEventListener("click", copyMarkdown);
  hydrateFromRemote();

  // —— render ——

  function renderQuickLinks() {
    const items = [
      ["Feature List 可标记", "featureList"],
      ["甬道图", "flow"],
      ["Step3 Doc", "step3Doc"],
      ["Step4 Doc", "step4Doc"],
      ["能力导入 F1–F6", "importDoc"],
      ["Drive 文件夹", "drive"],
    ];
    document.querySelector("#quickLinks").innerHTML = items
      .map(([label, key]) => `<a href="${D.links[key]}" target="_blank" rel="noopener">${label}</a>`)
      .join("");
  }

  function renderTimeline() {
    const host = document.querySelector("#timeline");
    host.innerHTML = D.timeline.map(nodeHtml).join("");
    host.querySelectorAll(".fb").forEach(bindNodeFeedback);
  }

  function nodeHtml(n) {
    const kinds = n.kinds.map((k) => `<span class="kind ${k}">${KIND_LABEL[k]}</span>`).join("");
    const points = n.points.map((p) => `<li>${esc(p)}</li>`).join("");
    const links = (n.links || [])
      .map(([label, key]) => `<a href="${D.links[key]}" target="_blank" rel="noopener">${label}</a>`)
      .join("");
    const refs = (n.refs || [])
      .map((r) => `<div class="refs">${esc(r.label)}：<code>${esc(r.path)}</code></div>`)
      .join("");
    const open = n.open.length ? `<ul class="open">${n.open.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : "";
    const options = STATUS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
    return `
      <li class="node ${n.state}">
        <div class="card">
          <div class="node-head">
            <span class="node-date">${esc(n.date)}</span>
            <span class="node-title">${esc(n.title)}</span>
            <span class="node-kinds">${kinds}</span>
          </div>
          <ul class="points">${points}</ul>
          ${links ? `<div class="links">${links}</div>` : ""}
          ${refs}
          ${open}
          <div class="fb" data-id="${n.id}">
            <select aria-label="我的判断">${options}</select>
            <textarea rows="1" placeholder="反馈 / 补充（可空）"></textarea>
          </div>
        </div>
      </li>`;
  }

  function renderTable(sel, rows, mapRow) {
    const body = document.querySelector(sel + " tbody");
    body.innerHTML = rows
      .map((row) => {
        const cells = mapRow ? mapRow(row) : row.map(esc);
        return "<tr>" + cells.map((c) => `<td>${c}</td>`).join("") + "</tr>";
      })
      .join("");
  }

  function levelBadge(level) {
    const cls = level === "P0" || level === "P1" ? level : "open";
    return `<span class="lvl ${cls}">${esc(level)}</span>`;
  }

  // —— feedback binding ——

  function bindNodeFeedback(el) {
    const id = el.dataset.id;
    const sel = el.querySelector("select");
    const ta = el.querySelector("textarea");
    const onChange = () => {
      fb.nodes[id] = { status: sel.value, note: ta.value };
      sel.dataset.v = sel.value;
      save();
    };
    sel.addEventListener("change", onChange);
    ta.addEventListener("input", onChange);
  }

  function bindGeneral() {
    document.querySelector("#generalNote").addEventListener("input", (e) => {
      fb.general.note = e.target.value;
      save();
    });
  }

  function fillInputs() {
    document.querySelectorAll(".fb").forEach((el) => {
      const v = fb.nodes[el.dataset.id] || {};
      const sel = el.querySelector("select");
      sel.value = v.status || "";
      sel.dataset.v = sel.value;
      el.querySelector("textarea").value = v.note || "";
    });
    document.querySelector("#generalNote").value = fb.general.note || "";
  }

  // —— storage & sync ——

  function empty() {
    return { nodes: {}, general: {}, meta: {} };
  }

  function normalize(d) {
    const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
    d = obj(d);
    return { nodes: obj(d.nodes), general: obj(d.general), meta: obj(d.meta) };
  }

  function loadLocal() {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    } catch (_) {
      return empty();
    }
  }

  function persistLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fb));
    } catch (_) {
      setHint("本机保存失败（浏览器禁用存储）", false);
    }
  }

  function updatedAt(d) {
    const t = Date.parse(d.meta.updatedAt || "");
    return Number.isFinite(t) ? t : 0;
  }

  function isEmpty(d) {
    return !Object.keys(d.nodes).length && !d.general.note && !updatedAt(d);
  }

  function save() {
    fb.meta.updatedAt = new Date().toISOString();
    persistLocal();
    setHint("本机已存 · 同步中…");
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 600);
  }

  async function push() {
    clearTimeout(pushTimer);
    try {
      const res = await fetch(API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fb),
        cache: "no-store",
      });
      if (!res.ok) throw new Error("PUT " + res.status);
      const data = await res.json();
      if (data.updatedAt) {
        fb.meta.updatedAt = data.updatedAt;
        persistLocal();
      }
      setHint("已同步云端 · " + fmt(new Date(data.updatedAt || Date.now())), true);
      return true;
    } catch (err) {
      console.warn("push failed", err);
      setHint("本机已存 · 云端同步失败", false);
      return false;
    }
  }

  async function hydrateFromRemote() {
    fillInputs();
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (!res.ok) throw new Error("GET " + res.status);
      const remote = normalize(await res.json());
      if (!isEmpty(remote) && (isEmpty(fb) || updatedAt(remote) > updatedAt(fb))) {
        fb = remote;
        persistLocal();
        fillInputs();
        setHint("已载入云端 · " + fmt(new Date(updatedAt(remote))));
      } else if (!isEmpty(fb) && updatedAt(fb) > updatedAt(remote)) {
        await push();
      } else {
        setHint(isEmpty(fb) ? "反馈会自动保存并同步" : "已同步云端 · " + fmt(new Date(updatedAt(fb))));
      }
    } catch (err) {
      console.warn("hydrate failed", err);
      setHint(isEmpty(fb) ? "云端未连 · 反馈先存本机" : "本机已存 · 云端未连");
    }
  }

  async function syncNow() {
    fb.meta.updatedAt = new Date().toISOString();
    persistLocal();
    setHint("同步中…");
    const ok = await push();
    if (!ok) alert("云端同步失败，反馈已存本机，可点「复制 Markdown」发给我。");
  }

  // —— export ——

  function toMarkdown() {
    const label = Object.fromEntries(STATUS);
    const lines = ["# 光谱汇报 · 反馈", "", "更新：" + (fb.meta.updatedAt ? fmt(new Date(fb.meta.updatedAt)) : "暂无"), ""];
    D.timeline.forEach((n) => {
      const v = fb.nodes[n.id];
      if (!v || (!v.status && !v.note)) return;
      lines.push(`- **${n.date} ${n.title}**：${v.status ? label[v.status] : "未判断"}${v.note ? " — " + v.note : ""}`);
    });
    if (lines.length === 4) lines.push("- 节点反馈：暂无");
    lines.push("", "## 整体", fb.general.note || "暂无");
    return lines.join("\n");
  }

  async function copyMarkdown() {
    const md = toMarkdown();
    try {
      await navigator.clipboard.writeText(md);
      setHint("Markdown 已复制", true);
    } catch (_) {
      prompt("复制以下内容：", md);
    }
  }

  // —— utils ——

  function setHint(text, ok) {
    const el = document.querySelector("#saveHint");
    el.textContent = text;
    el.classList.toggle("ok", ok === true);
    el.classList.toggle("err", ok === false);
  }

  function fmt(d) {
    return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }
})();
