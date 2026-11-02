/* Launch Sync · localStorage + /api/launch-sync-state (xlx Sync pattern) */
(function () {
  "use strict";

  const STORAGE_KEY = "launch-sync-state-v1";
  const STATE_API = "/api/launch-sync-state";
  const SEED = window.LAUNCH_SYNC_SEED;
  if (!SEED) {
    console.error("LAUNCH_SYNC_SEED missing");
    return;
  }

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

  /** @type {{features: any[], hiddenApps: string[], meta: object}} */
  let state = loadLocal();
  let remotePushInFlight = null;
  let remotePushTimer = null;
  let dragId = null;

  function emptyState() {
    return {
      features: JSON.parse(JSON.stringify(SEED.features)),
      hiddenApps: [],
      meta: { storageKey: STORAGE_KEY },
    };
  }

  function normalize(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return emptyState();
    const features = Array.isArray(data.features) && data.features.length
      ? data.features
      : JSON.parse(JSON.stringify(SEED.features));
    return {
      features,
      hiddenApps: Array.isArray(data.hiddenApps) ? data.hiddenApps.map(String) : [],
      meta: data.meta && typeof data.meta === "object" ? data.meta : { storageKey: STORAGE_KEY },
    };
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      return normalize(JSON.parse(raw));
    } catch (e) {
      console.warn("loadLocal failed", e);
      return emptyState();
    }
  }

  function persistLocal() {
    state.meta = state.meta || {};
    state.meta.storageKey = STORAGE_KEY;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function saveState(opts) {
    const silent = opts && opts.silent;
    state.meta = state.meta || {};
    state.meta.updatedAt = new Date().toISOString();
    try {
      persistLocal();
      if (!silent) setSaveHint("本机已存 · " + formatLocal(new Date()), true);
    } catch (e) {
      toast("本机保存失败");
      console.error(e);
      return;
    }
    scheduleRemotePush();
  }

  function scheduleRemotePush() {
    clearTimeout(remotePushTimer);
    remotePushTimer = setTimeout(() => {
      pushRemote();
    }, 500);
  }

  function pushRemote(override) {
    clearTimeout(remotePushTimer);
    const toSend = override || state;
    remotePushInFlight = fetch(STATE_API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toSend),
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("PUT " + res.status);
        const data = await res.json();
        if (data && data.updatedAt && toSend === state) {
          state.meta = state.meta || {};
          state.meta.updatedAt = data.updatedAt;
          try {
            persistLocal();
          } catch (_) {}
        }
        const when = data && data.updatedAt ? new Date(data.updatedAt) : new Date();
        setSaveHint("已同步云端 · " + formatLocal(when), true);
        return data;
      })
      .catch((err) => {
        console.warn("pushRemote failed", err);
        setSaveHint("本机已存 · 云端失败", false);
        return null;
      });
    return remotePushInFlight;
  }

  function formatLocal(d) {
    try {
      return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
    } catch (_) {
      return d.toISOString();
    }
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2400);
  }

  function setSaveHint(text, ok) {
    ["#saveHint", "#dockHint"].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      el.textContent = text;
      el.classList.remove("ok", "bad");
      if (ok === true) el.classList.add("ok");
      if (ok === false) el.classList.add("bad");
    });
  }

  function parseYMD(s) {
    const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function toYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function addDays(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }

  function dayDiff(a, b) {
    return Math.round((b - a) / 86400000);
  }

  function todayShanghai() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    return parseYMD(get("year") + "-" + get("month") + "-" + get("day"));
  }

  function ganttRange() {
    let start = parseYMD(SEED.ganttStart) || todayShanghai();
    let end = parseYMD(SEED.ganttEnd) || addDays(start, 45);
    state.features.forEach((f) => {
      const s = parseYMD(f.start);
      const e = parseYMD(f.end) || parseYMD(f.ddl);
      if (s && s < start) start = s;
      if (e && e > end) end = e;
    });
    return { start, end, days: dayDiff(start, end) + 1 };
  }

  function visibleFeatures() {
    const hidden = new Set(state.hiddenApps || []);
    return state.features.filter((f) => !hidden.has(f.app));
  }

  function allApps() {
    const set = new Set(SEED.apps || []);
    state.features.forEach((f) => f.app && set.add(f.app));
    return Array.from(set);
  }

  function ddlClass(ddl) {
    const d = parseYMD(ddl);
    if (!d) return "";
    const t = todayShanghai();
    const diff = dayDiff(t, d);
    if (diff < 0) return "ddl-over";
    if (diff <= 3) return "ddl-soon";
    return "";
  }

  function renderChips() {
    const box = $("#appChips");
    const hidden = new Set(state.hiddenApps || []);
    box.innerHTML = allApps()
      .map((app) => {
        const on = !hidden.has(app);
        return `<button type="button" class="chip ${on ? "on" : "off"}" data-app="${escapeAttr(app)}">${escapeHtml(app)}</button>`;
      })
      .join("");
    $$(".chip", box).forEach((btn) => {
      btn.addEventListener("click", () => {
        const app = btn.getAttribute("data-app");
        const set = new Set(state.hiddenApps || []);
        if (set.has(app)) set.delete(app);
        else set.add(app);
        state.hiddenApps = Array.from(set);
        saveState();
        renderAll();
      });
    });
  }

  function renderList() {
    const body = $("#demandBody");
    const list = visibleFeatures();
    $("#listCount").textContent = "显示 " + list.length + " / 共 " + state.features.length;
    body.innerHTML = list
      .map((f) => {
        const pri = state.features.findIndex((x) => x.id === f.id) + 1;
        return `<tr draggable="true" data-id="${escapeAttr(f.id)}">
          <td><span class="drag-handle" title="拖拽排序">⋮⋮</span></td>
          <td>${pri}</td>
          <td class="name-cell"><span class="title">${escapeHtml(f.name)}</span>${
            f.jiraId ? `<span class="jira">${escapeHtml(f.jiraId)}</span>` : ""
          }</td>
          <td><span class="app-badge app-${escapeAttr(f.app)}">${escapeHtml(f.app)}</span></td>
          <td><input class="cell" data-field="status" value="${escapeAttr(f.status || "")}" /></td>
          <td><input class="cell" type="date" data-field="start" value="${escapeAttr(f.start || "")}" /></td>
          <td><input class="cell" type="date" data-field="end" value="${escapeAttr(f.end || "")}" /></td>
          <td><input class="cell ${ddlClass(f.ddl)}" type="date" data-field="ddl" value="${escapeAttr(f.ddl || "")}" /></td>
          <td><input class="cell person" data-field="frontend" value="${escapeAttr(f.frontend || "")}" placeholder="前端" /></td>
          <td><input class="cell person" data-field="backend" value="${escapeAttr(f.backend || "")}" placeholder="后端" /></td>
          <td><input class="cell person" data-field="qa" value="${escapeAttr(f.qa || "")}" placeholder="测试" /></td>
        </tr>`;
      })
      .join("");

    $$("tr", body).forEach((tr) => {
      tr.addEventListener("dragstart", (e) => {
        dragId = tr.getAttribute("data-id");
        tr.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", dragId);
      });
      tr.addEventListener("dragend", () => {
        tr.classList.remove("dragging");
        $$("tr", body).forEach((r) => r.classList.remove("drag-over"));
        dragId = null;
      });
      tr.addEventListener("dragover", (e) => {
        e.preventDefault();
        tr.classList.add("drag-over");
      });
      tr.addEventListener("dragleave", () => tr.classList.remove("drag-over"));
      tr.addEventListener("drop", (e) => {
        e.preventDefault();
        tr.classList.remove("drag-over");
        const fromId = e.dataTransfer.getData("text/plain") || dragId;
        const toId = tr.getAttribute("data-id");
        if (!fromId || !toId || fromId === toId) return;
        reorder(fromId, toId);
      });
    });

    $$("input.cell", body).forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.closest("tr").getAttribute("data-id");
        const field = input.getAttribute("data-field");
        const feat = state.features.find((x) => x.id === id);
        if (!feat) return;
        feat[field] = input.value;
        if (field === "end" && feat.ddl && feat.ddl < feat.end) feat.ddl = feat.end;
        saveState();
        renderAll();
      });
    });
  }

  function reorder(fromId, toId) {
    const from = state.features.findIndex((x) => x.id === fromId);
    const to = state.features.findIndex((x) => x.id === toId);
    if (from < 0 || to < 0) return;
    const [item] = state.features.splice(from, 1);
    state.features.splice(to, 0, item);
    saveState();
    renderAll();
  }

  function renderGantt() {
    const root = $("#gantt");
    const { start, days } = ganttRange();
    const today = todayShanghai();
    const list = visibleFeatures();
    const dayWidth = 22;
    const axisDays = Array.from({ length: days }, (_, i) => addDays(start, i));

    const axisHtml =
      `<div class="gantt-head gantt-axis">` +
      `<div class="gantt-label">需求</div>` +
      `<div class="gantt-track-cell"><div class="gantt-days" style="grid-template-columns:repeat(${days}, ${dayWidth}px)">` +
      axisDays
        .map((d) => {
          const cls = [
            "gantt-day",
            d.getDay() === 1 ? "mon" : "",
            toYMD(d) === toYMD(today) ? "today" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const label = d.getDate() === 1 || d.getDay() === 1 ? d.getMonth() + 1 + "/" + d.getDate() : String(d.getDate());
          return `<div class="${cls}">${label}</div>`;
        })
        .join("") +
      `</div></div></div>`;

    const rows = list
      .map((f, idx) => {
        const pri = state.features.findIndex((x) => x.id === f.id) + 1;
        const s = parseYMD(f.start) || start;
        const e = parseYMD(f.end) || parseYMD(f.ddl) || addDays(s, 3);
        let left = dayDiff(start, s);
        let width = Math.max(1, dayDiff(s, e) + 1);
        if (left < 0) {
          width += left;
          left = 0;
        }
        if (left + width > days) width = days - left;
        const todayLeft = dayDiff(start, today);
        return (
          `<div class="gantt-row" data-id="${escapeAttr(f.id)}">` +
          `<div class="gantt-label"><span class="pri">${pri}</span><span>${escapeHtml(f.name)}</span></div>` +
          `<div class="gantt-track-cell"><div class="gantt-days" style="grid-template-columns:repeat(${days}, ${dayWidth}px);position:relative">` +
          axisDays.map((d) => `<div class="gantt-day ${toYMD(d) === toYMD(today) ? "today" : ""}"></div>`).join("") +
          (todayLeft >= 0 && todayLeft < days
            ? `<div class="today-line" style="left:${todayLeft * dayWidth + dayWidth / 2}px"></div>`
            : "") +
          `<div class="bar ${escapeAttr(f.app)}" data-id="${escapeAttr(f.id)}" style="left:${left * dayWidth}px;width:${Math.max(width, 1) * dayWidth - 4}px" title="${escapeAttr(
            (f.start || "") + " → " + (f.end || "") + " DDL " + (f.ddl || "")
          )}"><span class="handle l" data-edge="start"></span>${escapeHtml(f.jiraId || f.app)}<span class="handle r" data-edge="end"></span></div>` +
          `</div></div></div>`
        );
      })
      .join("");

    root.innerHTML = axisHtml + rows;
    bindGanttDrag(dayWidth, start);
  }

  function bindGanttDrag(dayWidth, rangeStart) {
    $$(".bar", $("#gantt")).forEach((bar) => {
      let mode = null; // move | start | end
      let originX = 0;
      let originStart = null;
      let originEnd = null;
      const id = bar.getAttribute("data-id");

      const onMove = (e) => {
        if (!mode) return;
        const feat = state.features.find((x) => x.id === id);
        if (!feat) return;
        const dx = e.clientX - originX;
        const dDays = Math.round(dx / dayWidth);
        if (mode === "move") {
          const span = dayDiff(originStart, originEnd);
          const ns = addDays(originStart, dDays);
          feat.start = toYMD(ns);
          feat.end = toYMD(addDays(ns, span));
        } else if (mode === "start") {
          let ns = addDays(originStart, dDays);
          if (ns > originEnd) ns = originEnd;
          feat.start = toYMD(ns);
        } else if (mode === "end") {
          let ne = addDays(originEnd, dDays);
          if (ne < originStart) ne = originStart;
          feat.end = toYMD(ne);
          if (!feat.ddl || parseYMD(feat.ddl) < ne) feat.ddl = feat.end;
        }
        // live update positions without full re-render of list
        const startD = parseYMD(feat.start);
        const endD = parseYMD(feat.end);
        const left = Math.max(0, dayDiff(rangeStart, startD));
        const width = Math.max(1, dayDiff(startD, endD) + 1);
        bar.style.left = left * dayWidth + "px";
        bar.style.width = Math.max(width, 1) * dayWidth - 4 + "px";
        bar.title = (feat.start || "") + " → " + (feat.end || "") + " DDL " + (feat.ddl || "");
      };

      const onUp = () => {
        if (!mode) return;
        mode = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        saveState();
        renderAll();
      };

      bar.addEventListener("pointerdown", (e) => {
        if (e.target.classList.contains("handle")) {
          mode = e.target.getAttribute("data-edge") === "start" ? "start" : "end";
        } else {
          mode = "move";
        }
        const feat = state.features.find((x) => x.id === id);
        originX = e.clientX;
        originStart = parseYMD(feat.start);
        originEnd = parseYMD(feat.end) || originStart;
        e.preventDefault();
        bar.setPointerCapture(e.pointerId);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
    });
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function renderAll() {
    renderChips();
    renderList();
    renderGantt();
  }

  async function syncToPm() {
    clearTimeout(remotePushTimer);
    state.meta = state.meta || {};
    state.meta.updatedAt = new Date().toISOString();
    try {
      persistLocal();
    } catch (e) {
      toast("本机保存失败");
      return;
    }
    const data = await pushRemote();
    if (data) toast("已同步，project management 可读取");
    else toast("云端同步失败，请稍后重试");
  }

  async function hydrateFromRemote() {
    try {
      const res = await fetch(STATE_API, { cache: "no-store" });
      if (!res.ok) throw new Error("GET " + res.status);
      const remote = normalize(await res.json());
      const remoteAt = remote.meta && remote.meta.updatedAt ? Date.parse(remote.meta.updatedAt) : 0;
      const localAt = state.meta && state.meta.updatedAt ? Date.parse(state.meta.updatedAt) : 0;
      const remoteEmpty = !remote.features || !remote.features.length;
      const localEmpty = !state.features || !state.features.length;

      if (!remoteEmpty && (localEmpty || remoteAt > localAt)) {
        state = remote;
        try {
          persistLocal();
        } catch (_) {}
        setSaveHint("已同步云端 · " + formatLocal(new Date(remoteAt || Date.now())), true);
        return;
      }
      if (!localEmpty && (remoteEmpty || !remoteAt)) {
        setSaveHint("本机已存 · 同步中…");
        await pushRemote();
        return;
      }
      if (localAt) setSaveHint("本机已存 · " + formatLocal(new Date(localAt)), true);
    } catch (err) {
      console.warn("hydrateFromRemote failed", err);
      const localAt = state.meta && state.meta.updatedAt ? Date.parse(state.meta.updatedAt) : 0;
      if (localAt) setSaveHint("本机已存 · 云端未连", false);
      else setSaveHint("标记本机缓存 · 云端未连", false);
    }
  }

  function bindChrome() {
    $("#btnSync").addEventListener("click", syncToPm);
    $("#btnSyncDock").addEventListener("click", syncToPm);
    $("#btnShowAllApps").addEventListener("click", () => {
      state.hiddenApps = [];
      saveState();
      renderAll();
    });
    $("#btnResetSeed").addEventListener("click", () => {
      if (!confirm("恢复为今日种子数据？本机与随后同步都会覆盖当前编辑。")) return;
      state = emptyState();
      state.meta.updatedAt = new Date().toISOString();
      persistLocal();
      pushRemote().then((data) => {
        toast(data ? "已恢复并同步" : "已恢复本机 · 云端失败");
        renderAll();
      });
      renderAll();
    });
  }

  bindChrome();
  renderAll();
  hydrateFromRemote().then(renderAll);
})();
