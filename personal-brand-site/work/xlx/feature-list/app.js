/* Feature List 标记 / 备注 · localStorage 持久化 */
(function () {
  "use strict";

  const STORAGE_KEY = "xlx-feature-list-marks-v1";
  const D = window.XLX_FEATURE_DATA;
  if (!D) {
    console.error("XLX_FEATURE_DATA missing");
    return;
  }

  /** @type {Record<string, object>} */
  let marks = loadMarks();

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

  function loadMarks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { features: {}, stages: {}, appendix: {}, meta: {} };
      const parsed = JSON.parse(raw);
      return {
        features: parsed.features || {},
        stages: parsed.stages || {},
        appendix: parsed.appendix || {},
        meta: parsed.meta || {},
      };
    } catch (e) {
      console.warn("loadMarks failed", e);
      return { features: {}, stages: {}, appendix: {}, meta: {} };
    }
  }

  function saveMarks() {
    marks.meta = marks.meta || {};
    marks.meta.updatedAt = new Date().toISOString();
    marks.meta.storageKey = STORAGE_KEY;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
      flashSave();
    } catch (e) {
      toast("保存失败（localStorage 可能满或禁用）");
      console.error(e);
    }
  }

  function flashSave() {
    const el = $("#saveHint");
    if (!el) return;
    el.textContent = "已保存 · " + formatLocal(new Date());
    el.classList.add("saved");
    clearTimeout(flashSave._t);
    flashSave._t = setTimeout(() => el.classList.remove("saved"), 1500);
  }

  function formatLocal(d) {
    // Asia/Shanghai display
    try {
      return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
    } catch (_) {
      return d.toISOString();
    }
  }

  function toast(msg) {
    let el = $("#toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function allFeatures() {
    const list = [];
    D.sections.forEach((sec) => {
      sec.features.forEach((f) => {
        list.push({ ...f, sectionId: sec.id, role: sec.role, sectionTitle: sec.title });
      });
    });
    return list;
  }

  function getFeatMark(id) {
    if (!marks.features[id]) {
      const feat = allFeatures().find((f) => f.id === id);
      marks.features[id] = {
        judge: feat ? D.defaultJudgeFromNeed(feat.need) : "",
        read: false,
        confirm: false,
        note: "",
        priorityOverride: "",
      };
    }
    return marks.features[id];
  }

  function ensureAllDefaults() {
    allFeatures().forEach((f) => getFeatMark(f.id));
  }

  function badgePri(p) {
    const raw = (p || "—").trim();
    if (raw === "P0") return '<span class="badge badge-p0">P0</span>';
    if (raw === "P1") return '<span class="badge badge-p1">P1</span>';
    if (raw === "P2") return '<span class="badge badge-p2">P2</span>';
    if (raw === "建议") return '<span class="badge badge-suggest">建议</span>';
    return '<span class="badge badge-dash">—</span>';
  }

  function badgeNeed(need) {
    const n = String(need || "");
    if (n.includes("明确不做")) return '<span class="badge badge-clear-no">明确不做</span>';
    if (n.includes("建议项")) return '<span class="badge badge-suggest">建议项</span>';
    if (n.startsWith("否") || n === "否") return '<span class="badge badge-no">否</span>';
    if (n.includes("是") || n.includes("部分→是")) return '<span class="badge badge-yes">' + escapeHtml(n) + "</span>";
    return '<span class="badge badge-partial">' + escapeHtml(n) + "</span>";
  }

  function badgeStatus(status) {
    const s = String(status || "");
    let cls = "badge-status-部分";
    if (s.startsWith("有")) cls = "badge-status-有";
    else if (s.startsWith("无")) cls = "badge-status-无";
    else if (s.includes("部分")) cls = "badge-status-部分";
    return '<span class="badge ' + cls + '">' + escapeHtml(s) + "</span>";
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function judgeOptionsHtml(selected) {
    return D.judgeOptions
      .map(
        (o) =>
          '<option value="' +
          escapeHtml(o.value) +
          '"' +
          (o.value === selected ? " selected" : "") +
          ">" +
          escapeHtml(o.label) +
          "</option>"
      )
      .join("");
  }

  function priOverrideHtml(selected) {
    return D.priorityOptions
      .map(
        (p) =>
          '<option value="' +
          escapeHtml(p) +
          '"' +
          (p === selected ? " selected" : "") +
          ">" +
          (p === "" ? "（原优先级）" : escapeHtml(p)) +
          "</option>"
      )
      .join("");
  }

  function effectivePri(feat, mark) {
    return (mark.priorityOverride && mark.priorityOverride !== "") ? mark.priorityOverride : feat.priority;
  }

  function needCategory(need) {
    const n = String(need || "");
    if (n.includes("明确不做")) return "明确不做";
    if (n.includes("建议项")) return "建议项";
    if (n.startsWith("否")) return "否";
    if (n.includes("是") || n.includes("部分→是")) return "是";
    return "其他";
  }

  function renderTop12() {
    const ul = $("#topList");
    if (!ul) return;
    ul.innerHTML = D.top12
      .map((item, i) => {
        const ids = item.ids
          .map((id) => '<a href="#' + id + '">' + escapeHtml(id) + "</a>")
          .join("");
        return (
          '<li class="top-item">' +
          "<span>" +
          (i + 1) +
          ".</span>" +
          badgePri(item.pri) +
          '<span class="ids">' +
          ids +
          "</span>" +
          '<span class="text">' +
          escapeHtml(item.text) +
          "</span>" +
          "</li>"
        );
      })
      .join("");
  }

  function featureRowHtml(feat) {
    const m = getFeatMark(feat.id);
    const statusHtml =
      badgeStatus(feat.status) +
      (feat.statusDetail
        ? '<span class="muted-detail">' + escapeHtml(feat.statusDetail) + "</span>"
        : "");
    return (
      '<tr id="' +
      escapeHtml(feat.id) +
      '" data-id="' +
      escapeHtml(feat.id) +
      '" data-role="' +
      escapeHtml(feat.role) +
      '" data-pri="' +
      escapeHtml(effectivePri(feat, m)) +
      '" data-need="' +
      escapeHtml(needCategory(feat.need)) +
      '" data-judge="' +
      escapeHtml(m.judge || "") +
      '" data-confirm="' +
      (m.confirm ? "1" : "0") +
      '" data-has-note="' +
      (m.note && m.note.trim() ? "1" : "0") +
      '" class="' +
      (m.confirm ? "confirmed " : "") +
      (m.read ? "" : "unread-dim") +
      '">' +
      '<td class="col-id">' +
      escapeHtml(feat.id) +
      "</td>" +
      '<td class="col-name">' +
      escapeHtml(feat.name) +
      "</td>" +
      '<td class="col-status">' +
      statusHtml +
      "</td>" +
      '<td class="col-req">' +
      escapeHtml(feat.requirement) +
      "</td>" +
      '<td class="col-need">' +
      badgeNeed(feat.need) +
      "</td>" +
      '<td class="col-sug">' +
      escapeHtml(feat.suggestion) +
      "</td>" +
      '<td class="col-pri">' +
      badgePri(feat.priority) +
      "</td>" +
      '<td class="col-judge col-mark">' +
      '<select class="cell-select js-judge" data-id="' +
      escapeHtml(feat.id) +
      '" title="我的判定">' +
      judgeOptionsHtml(m.judge || "") +
      "</select>" +
      "</td>" +
      '<td class="col-checks col-mark">' +
      '<div class="check-group">' +
      '<label><input type="checkbox" class="js-read" data-id="' +
      escapeHtml(feat.id) +
      '"' +
      (m.read ? " checked" : "") +
      "> 已阅</label>" +
      '<label><input type="checkbox" class="js-confirm" data-id="' +
      escapeHtml(feat.id) +
      '"' +
      (m.confirm ? " checked" : "") +
      "> 确认进 Step3</label>" +
      "</div></td>" +
      '<td class="col-pri-ov col-mark">' +
      '<select class="cell-select js-pri" data-id="' +
      escapeHtml(feat.id) +
      '" title="优先级覆盖">' +
      priOverrideHtml(m.priorityOverride || "") +
      "</select>" +
      "</td>" +
      '<td class="col-note col-mark">' +
      '<textarea class="cell-textarea js-note" data-id="' +
      escapeHtml(feat.id) +
      '" placeholder="备注…">' +
      escapeHtml(m.note || "") +
      "</textarea>" +
      "</td>" +
      "</tr>"
    );
  }

  function tableHeader() {
    return (
      "<thead><tr>" +
      "<th>#</th><th>功能点</th><th>原型现状</th><th>心连心要求</th><th>需调整</th><th>调整建议</th><th>优先级</th>" +
      "<th>我的判定</th><th>勾选</th><th>优先级覆盖</th><th>备注</th>" +
      "</tr></thead>"
    );
  }

  function renderSections() {
    const host = $("#sectionsHost");
    if (!host) return;
    host.innerHTML = D.sections
      .map((sec) => {
        const rows = sec.features.map((f) => featureRowHtml({ ...f, role: sec.role })).join("");
        return (
          '<section class="block" data-section="' +
          escapeHtml(sec.id) +
          '" data-role="' +
          escapeHtml(sec.role) +
          '">' +
          '<div class="block-head js-toggle">' +
          '<span class="chev">▼</span>' +
          "<h2>" +
          escapeHtml(sec.title) +
          '</h2><span class="count">' +
          sec.features.length +
          " 条</span></div>" +
          '<div class="block-body"><div class="table-wrap"><table class="feat">' +
          tableHeader() +
          "<tbody>" +
          rows +
          "</tbody></table></div></div></section>"
        );
      })
      .join("");
  }

  function renderStages() {
    const tbody = $("#stageBody");
    if (!tbody) return;
    tbody.innerHTML = D.stages
      .map((s) => {
        const m = marks.stages[s.id] || { note: "" };
        return (
          "<tr data-stage-id=\"" +
          escapeHtml(s.id) +
          '">' +
          "<td>" +
          escapeHtml(s.name) +
          "</td>" +
          "<td>" +
          escapeHtml(s.meet) +
          "</td>" +
          "<td>" +
          escapeHtml(s.conclusion) +
          "</td>" +
          '<td><textarea class="cell-textarea js-stage-note" data-id="' +
          escapeHtml(s.id) +
          '" placeholder="阶段备注…">' +
          escapeHtml(m.note || "") +
          "</textarea></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderAppendix() {
    const tbody = $("#appendixBody");
    if (!tbody) return;
    tbody.innerHTML = D.appendix
      .map((a) => {
        const m = marks.appendix[a.id] || { note: "" };
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(a.name) +
          "</td>" +
          "<td>" +
          escapeHtml(a.note) +
          "</td>" +
          '<td><textarea class="cell-textarea js-app-note" data-id="' +
          escapeHtml(a.id) +
          '" placeholder="可选备注…">' +
          escapeHtml(m.note || "") +
          "</textarea></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderSkipOk() {
    const ul = $("#skipList");
    if (!ul) return;
    ul.innerHTML = D.skipOk.map((t) => "<li>" + escapeHtml(t) + "</li>").join("");
  }

  function updateStats() {
    const feats = allFeatures();
    ensureAllDefaults();
    let confirmed = 0;
    let withNote = 0;
    let read = 0;
    const byJudge = {};
    D.judgeOptions.forEach((o) => {
      if (o.value) byJudge[o.value] = 0;
    });
    byJudge["（未判定）"] = 0;

    feats.forEach((f) => {
      const m = getFeatMark(f.id);
      if (m.confirm) confirmed++;
      if (m.note && m.note.trim()) withNote++;
      if (m.read) read++;
      const j = m.judge || "";
      if (!j) byJudge["（未判定）"]++;
      else if (byJudge[j] !== undefined) byJudge[j]++;
      else byJudge[j] = 1;
    });

    const el = $("#stats");
    if (!el) return;
    const parts = [
      '<span class="stat">合计 <strong>' + feats.length + "</strong></span>",
      '<span class="stat">已阅 <strong>' + read + "</strong></span>",
      '<span class="stat">已确认 Step3 <strong class="n-ok">' + confirmed + "</strong></span>",
      '<span class="stat">有备注 <strong>' + withNote + "</strong></span>",
    ];
    Object.keys(byJudge).forEach((k) => {
      if (byJudge[k] > 0) {
        parts.push(
          '<span class="stat">' + escapeHtml(k) + " <strong>" + byJudge[k] + "</strong></span>"
        );
      }
    });
    el.innerHTML = parts.join("");
  }

  function applyFilters() {
    const role = $("#filterRole").value;
    const pri = $("#filterPri").value;
    const need = $("#filterNeed").value;
    const judge = $("#filterJudge").value;
    const onlyNoNote = $("#filterNoNote").checked;
    const onlyUnconfirm = $("#filterUnconfirm").checked;
    const q = ($("#filterSearch").value || "").trim().toLowerCase();

    let visible = 0;
    $$("table.feat tbody tr").forEach((tr) => {
      const id = tr.dataset.id;
      const feat = allFeatures().find((f) => f.id === id);
      const m = getFeatMark(id);
      let show = true;

      if (role && tr.dataset.role !== role) show = false;
      if (pri) {
        const ep = effectivePri(feat, m);
        if (pri === "—" || pri === "-") {
          if (ep !== "—" && ep !== "-" && ep !== "") show = false;
        } else if (ep !== pri) show = false;
      }
      if (need && needCategory(feat.need) !== need) show = false;
      if (judge !== "") {
        if (judge === "__empty__") {
          if (m.judge) show = false;
        } else if ((m.judge || "") !== judge) show = false;
      }
      if (onlyNoNote && m.note && m.note.trim()) show = false;
      if (onlyUnconfirm && m.confirm) show = false;

      if (q) {
        const hay = [
          feat.id,
          feat.name,
          feat.status,
          feat.statusDetail,
          feat.requirement,
          feat.need,
          feat.suggestion,
          feat.priority,
          m.note,
          m.judge,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) show = false;
      }

      tr.classList.toggle("hidden", !show);
      if (show) visible++;
    });

    // Hide empty section blocks when filtering
    $$("[data-section]").forEach((block) => {
      const any = $$("tbody tr:not(.hidden)", block).length > 0;
      block.style.display = any ? "" : "none";
    });

    const visEl = $("#visibleCount");
    if (visEl) visEl.textContent = "当前可见 " + visible + " 条";
  }

  function bindEvents() {
    document.body.addEventListener("change", (e) => {
      const t = e.target;
      if (t.classList.contains("js-judge")) {
        const id = t.dataset.id;
        getFeatMark(id).judge = t.value;
        const tr = t.closest("tr");
        if (tr) tr.dataset.judge = t.value;
        saveMarks();
        updateStats();
        applyFilters();
      }
      if (t.classList.contains("js-pri")) {
        const id = t.dataset.id;
        getFeatMark(id).priorityOverride = t.value;
        const feat = allFeatures().find((f) => f.id === id);
        const tr = t.closest("tr");
        if (tr && feat) tr.dataset.pri = effectivePri(feat, getFeatMark(id));
        saveMarks();
        applyFilters();
      }
      if (t.classList.contains("js-read")) {
        const id = t.dataset.id;
        getFeatMark(id).read = t.checked;
        const tr = t.closest("tr");
        if (tr) tr.classList.toggle("unread-dim", !t.checked);
        saveMarks();
        updateStats();
      }
      if (t.classList.contains("js-confirm")) {
        const id = t.dataset.id;
        getFeatMark(id).confirm = t.checked;
        const tr = t.closest("tr");
        if (tr) {
          tr.classList.toggle("confirmed", t.checked);
          tr.dataset.confirm = t.checked ? "1" : "0";
        }
        saveMarks();
        updateStats();
        applyFilters();
      }
      if (t.id && t.id.startsWith("filter")) {
        applyFilters();
      }
    });

    document.body.addEventListener("input", (e) => {
      const t = e.target;
      if (t.classList.contains("js-note")) {
        const id = t.dataset.id;
        getFeatMark(id).note = t.value;
        const tr = t.closest("tr");
        if (tr) tr.dataset.hasNote = t.value.trim() ? "1" : "0";
        // debounce save
        clearTimeout(bindEvents._noteT);
        bindEvents._noteT = setTimeout(() => {
          saveMarks();
          updateStats();
          applyFilters();
        }, 300);
      }
      if (t.classList.contains("js-stage-note")) {
        const id = t.dataset.id;
        marks.stages[id] = marks.stages[id] || {};
        marks.stages[id].note = t.value;
        clearTimeout(bindEvents._stageT);
        bindEvents._stageT = setTimeout(saveMarks, 300);
      }
      if (t.classList.contains("js-app-note")) {
        const id = t.dataset.id;
        marks.appendix[id] = marks.appendix[id] || {};
        marks.appendix[id].note = t.value;
        clearTimeout(bindEvents._appT);
        bindEvents._appT = setTimeout(saveMarks, 300);
      }
      if (t.id === "filterSearch") applyFilters();
    });

    document.body.addEventListener("click", (e) => {
      const head = e.target.closest(".js-toggle");
      if (head) {
        head.closest(".block").classList.toggle("collapsed");
      }
    });

    $("#btnExportJson").addEventListener("click", exportJson);
    $("#btnExportMd").addEventListener("click", exportMd);
    $("#btnImportJson").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", importJson);
    $("#btnClear").addEventListener("click", clearMarks);
    $("#btnExpandAll").addEventListener("click", () => {
      $$(".block").forEach((b) => b.classList.remove("collapsed"));
    });
    $("#btnCollapseAll").addEventListener("click", () => {
      $$(".block").forEach((b) => b.classList.add("collapsed"));
      // keep top open
      const top = $('[data-section="top12"]');
      if (top) top.classList.remove("collapsed");
    });
  }

  function exportJson() {
    ensureAllDefaults();
    const payload = {
      exportedAt: new Date().toISOString(),
      exportedAtShanghai: formatLocal(new Date()),
      storageKey: STORAGE_KEY,
      source: D.meta.title,
      sourceDate: D.meta.date,
      marks: marks,
      featureSnapshot: allFeatures().map((f) => {
        const m = getFeatMark(f.id);
        return {
          id: f.id,
          name: f.name,
          need: f.need,
          priority: f.priority,
          priorityEffective: effectivePri(f, m),
          judge: m.judge,
          read: m.read,
          confirm: m.confirm,
          note: m.note,
          priorityOverride: m.priorityOverride,
        };
      }),
    };
    downloadBlob(
      JSON.stringify(payload, null, 2),
      "xlx-feature-list-marks-" + dateStamp() + ".json",
      "application/json"
    );
    toast("已导出 JSON");
  }

  function exportMd() {
    ensureAllDefaults();
    const lines = [];
    lines.push("# Feature List 标记摘要（仅改过/有备注）");
    lines.push("");
    lines.push("> 导出时间：" + formatLocal(new Date()) + "（Asia/Shanghai）");
    lines.push("> 来源：" + D.meta.title);
    lines.push("");

    const changed = allFeatures().filter((f) => {
      const m = getFeatMark(f.id);
      const def = D.defaultJudgeFromNeed(f.need);
      const judgeChanged = (m.judge || "") !== def;
      return (
        judgeChanged ||
        m.read ||
        m.confirm ||
        (m.note && m.note.trim()) ||
        (m.priorityOverride && m.priorityOverride !== "")
      );
    });

    if (!changed.length) {
      lines.push("_（暂无标记或备注）_");
    } else {
      lines.push("| # | 功能点 | 原优先级 | 我的判定 | 已阅 | 确认Step3 | 优先级覆盖 | 备注 |");
      lines.push("| - | -- | -- | -- | -- | -- | -- | -- |");
      changed.forEach((f) => {
        const m = getFeatMark(f.id);
        lines.push(
          "| " +
            f.id +
            " | " +
            escapeMd(f.name) +
            " | " +
            (f.priority || "—") +
            " | " +
            (m.judge || "—") +
            " | " +
            (m.read ? "是" : "") +
            " | " +
            (m.confirm ? "是" : "") +
            " | " +
            (m.priorityOverride || "") +
            " | " +
            escapeMd((m.note || "").replace(/\n/g, " ")) +
            " |"
        );
      });
    }

    lines.push("");
    lines.push("## 九阶段备注");
    lines.push("");
    D.stages.forEach((s) => {
      const n = (marks.stages[s.id] && marks.stages[s.id].note) || "";
      if (n.trim()) lines.push("- **" + s.name + "**：" + n.replace(/\n/g, " "));
    });
    if (!D.stages.some((s) => marks.stages[s.id] && marks.stages[s.id].note && marks.stages[s.id].note.trim())) {
      lines.push("_（无）_");
    }

    lines.push("");
    lines.push("## 附录备注");
    lines.push("");
    D.appendix.forEach((a) => {
      const n = (marks.appendix[a.id] && marks.appendix[a.id].note) || "";
      if (n.trim()) lines.push("- **" + a.name + "**：" + n.replace(/\n/g, " "));
    });

    downloadBlob(lines.join("\n"), "xlx-feature-list-marks-" + dateStamp() + ".md", "text/markdown");
    toast("已导出 Markdown（" + changed.length + " 条有改动）");
  }

  function escapeMd(s) {
    return String(s).replace(/\|/g, "\\|");
  }

  function dateStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    // local box is Asia/Shanghai
    return (
      d.getFullYear() +
      p(d.getMonth() + 1) +
      p(d.getDate()) +
      "-" +
      p(d.getHours()) +
      p(d.getMinutes())
    );
  }

  function downloadBlob(text, filename, mime) {
    const blob = new Blob([text], { type: mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 500);
  }

  function importJson(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const incoming = data.marks || data;
        if (!incoming.features && !data.featureSnapshot) {
          throw new Error("JSON 中未找到 marks.features");
        }
        if (incoming.features) {
          marks = {
            features: incoming.features || {},
            stages: incoming.stages || {},
            appendix: incoming.appendix || {},
            meta: incoming.meta || {},
          };
        } else if (data.featureSnapshot) {
          // restore from snapshot array
          marks = { features: {}, stages: data.marks && data.marks.stages || {}, appendix: data.marks && data.marks.appendix || {}, meta: {} };
          data.featureSnapshot.forEach((row) => {
            marks.features[row.id] = {
              judge: row.judge || "",
              read: !!row.read,
              confirm: !!row.confirm,
              note: row.note || "",
              priorityOverride: row.priorityOverride || "",
            };
          });
        }
        saveMarks();
        renderAll();
        toast("已导入标记");
      } catch (err) {
        console.error(err);
        toast("导入失败：" + err.message);
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function clearMarks() {
    if (!confirm("确定清空本机全部标记与备注？此操作不可撤销（可先导出 JSON 备份）。")) return;
    marks = { features: {}, stages: {}, appendix: {}, meta: {} };
    localStorage.removeItem(STORAGE_KEY);
    ensureAllDefaults();
    saveMarks();
    renderAll();
    toast("已清空本地标记");
  }

  function renderAll() {
    ensureAllDefaults();
    renderTop12();
    renderSkipOk();
    renderSections();
    renderStages();
    renderAppendix();
    updateStats();
    applyFilters();
    const hint = $("#saveHint");
    if (hint && marks.meta && marks.meta.updatedAt) {
      hint.textContent = "上次保存 · " + formatLocal(new Date(marks.meta.updatedAt));
    }
  }

  function initMeta() {
    $("#docLink").href = D.meta.docUrl;
    $("#planLink").href = D.meta.planUrl;
    $("#driveLink").href = D.meta.driveUrl;
    $("#swimLink").href = D.meta.swimlaneRel;
    const sub = $("#pageSub");
    if (sub) sub.textContent = D.meta.date + " · " + D.meta.purpose;
  }

  function init() {
    initMeta();
    renderAll();
    bindEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
