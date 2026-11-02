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

  function cloneSeedFeature(seed) {
    return JSON.parse(JSON.stringify(seed));
  }

  function mergeMissingSeedFeatures(features) {
    const list = Array.isArray(features) ? features.filter((f) => f && typeof f === "object") : [];
    const have = new Set();
    list.forEach((f) => {
      if (f.id) have.add(String(f.id));
    });
    (SEED.features || []).forEach((seed) => {
      if (!seed || !seed.id) return;
      if (have.has(String(seed.id))) return;
      list.push(cloneSeedFeature(seed));
      have.add(String(seed.id));
    });
    applySeedStatusFixes(list);
    applySeedDetailFields(list);
    return list;
  }

  function seedByIdMap() {
    const map = new Map();
    (SEED.features || []).forEach((seed) => {
      if (seed && seed.id) map.set(String(seed.id), seed);
    });
    return map;
  }

  function applySeedStatusFixes(features) {
    const seedById = seedByIdMap();
    features.forEach((f) => {
      const seed = seedById.get(String(f.id || ""));
      if (!seed) return;
      const cur = String(f.status || "").trim();
      if (seed.status === "Done（已上线）" && /^(待关单|已完成|已关闭|In Review)?$/.test(cur)) {
        f.status = seed.status;
      }
    });
    return features;
  }

  function applySeedDetailFields(features) {
    const seedById = seedByIdMap();
    features.forEach((f) => {
      const seed = seedById.get(String(f.id || ""));
      if (!seed) return;
      if (!dash(f.description) && dash(seed.description)) f.description = seed.description;
      if (!dash(f.desc) && dash(seed.desc) && !dash(f.description)) f.description = seed.desc;
      if (!dash(f.feishuUrl) && dash(seed.feishuUrl)) f.feishuUrl = seed.feishuUrl;
      if (!dash(f.jiraUrl) && dash(seed.jiraUrl)) f.jiraUrl = seed.jiraUrl;
      if (!dash(f.jiraUrl)) f.jiraUrl = jiraBrowseUrl(f.jiraId);
    });
    return features;
  }

  function jiraBrowseUrl(jiraId) {
    const id = dash(jiraId);
    if (!id) return "";
    if (/^https?:\/\//i.test(id)) return id;
    return "https://21tb-jira.21tb.com/browse/" + id;
  }

  function normalize(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return emptyState();
    const incoming = Array.isArray(data.features) && data.features.length
      ? data.features
      : JSON.parse(JSON.stringify(SEED.features));
    return {
      features: mergeMissingSeedFeatures(incoming),
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
    return state.features.filter((f) => f && !hidden.has(f.app));
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

  const BUCKETS = [
    { id: "d1103", label: "11-03" },
    { id: "d1106", label: "11-06" },
    { id: "mid", label: "中旬 11-13~15" },
    { id: "eom", label: "月底 11-27~30" },
    { id: "dec", label: "12月+" },
    { id: "done", label: "已上线/逾期" },
  ];
  const STATUS_OPTIONS = ["待方案", "待开发", "进行中", "已提测", "In Review", "Done（已上线）"];
  const LAUNCHED_STATUS = /待关单|已上线|已完成|已关闭|Done/;

  function statusSelectHtml(value) {
    const cur = String(value || "");
    const opts = STATUS_OPTIONS.slice();
    if (cur && opts.indexOf(cur) < 0) opts.unshift(cur);
    const options = opts
      .map((o) => {
        const selected = o === cur ? " selected" : "";
        return `<option value="${escapeAttr(o)}"${selected}>${escapeHtml(o)}</option>`;
      })
      .join("");
    return `<select class="cell" data-field="status">${options}</select>`;
  }

  function ddlBucket(feat) {
    const status = String((feat && feat.status) || "");
    const d = parseYMD(feat && feat.ddl);
    const today = todayShanghai();
    if (LAUNCHED_STATUS.test(status) || (d && d < today)) return "done";
    if (!d) return "none";
    const md = toYMD(d).slice(5);
    if (d.getFullYear() > today.getFullYear() || d.getMonth() + 1 >= 12) return "dec";
    if (md === "11-03") return "d1103";
    if (md === "11-06") return "d1106";
    if (md >= "11-13" && md <= "11-15") return "mid";
    if (md >= "11-27" && md <= "11-30") return "eom";
    if (md <= "11-04") return "d1103";
    if (md <= "11-12") return "d1106";
    if (md <= "11-20") return "mid";
    if (md <= "11-30") return "eom";
    return "dec";
  }

  function dash(v) {
    const s = String(v == null ? "" : v).trim();
    return s || "";
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
    ensureLegend();
    body.innerHTML = list
      .map((f) => {
        const pri = state.features.findIndex((x) => x.id === f.id) + 1;
        const bucket = ddlBucket(f);
        return `<tr draggable="true" data-id="${escapeAttr(f.id)}" data-bucket="${escapeAttr(bucket)}">
          <td><span class="drag-handle" title="拖拽排序">⋮⋮</span></td>
          <td>${pri}</td>
          <td class="name-cell"><button type="button" class="title" data-open-id="${escapeAttr(f.id)}">${escapeHtml(f.name)}</button>${
            dash(f.jiraId)
              ? `<span class="jira">${escapeHtml(f.jiraId)}</span>`
              : `<span class="jira empty">无 Jira</span>`
          }</td>
          <td><span class="app-badge app-${escapeAttr(f.app)}">${escapeHtml(f.app)}</span></td>
          <td>${statusSelectHtml(f.status)}</td>
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
        if (e.target.closest("input, select, button, textarea")) {
          e.preventDefault();
          return;
        }
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

    $$("input.cell, select.cell", body).forEach((input) => {
      input.addEventListener("pointerdown", (e) => e.stopPropagation());
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

    $$(".title", body).forEach((btn) => {
      btn.addEventListener("pointerdown", (e) => e.stopPropagation());
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openDetail(btn.getAttribute("data-open-id"));
      });
    });
  }

  function ensureLegend() {
    const host = $("#listCount") && $("#listCount").closest(".panel-hd");
    if (!host) return;
    let el = $("#bucketLegend");
    if (!el) {
      el = document.createElement("div");
      el.id = "bucketLegend";
      el.className = "bucket-legend";
      host.appendChild(el);
    }
    el.innerHTML = BUCKETS.map(
      (b) =>
        `<span class="swatch ${b.id}"><i class="dot"></i>${escapeHtml(b.label)}</span>`
    ).join("");
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
        const bucket = ddlBucket(f);
        return (
          `<div class="gantt-row" data-id="${escapeAttr(f.id)}" data-bucket="${escapeAttr(bucket)}">` +
          `<div class="gantt-label"><span class="pri">${pri}</span><button type="button" class="gantt-name" data-open-id="${escapeAttr(f.id)}">${escapeHtml(f.name)}</button></div>` +
          `<div class="gantt-track-cell"><div class="gantt-days" style="grid-template-columns:repeat(${days}, ${dayWidth}px);position:relative">` +
          axisDays.map((d) => `<div class="gantt-day ${toYMD(d) === toYMD(today) ? "today" : ""}"></div>`).join("") +
          (todayLeft >= 0 && todayLeft < days
            ? `<div class="today-line" style="left:${todayLeft * dayWidth + dayWidth / 2}px"></div>`
            : "") +
          `<div class="bar bucket-${escapeAttr(bucket)}" data-id="${escapeAttr(f.id)}" style="left:${left * dayWidth}px;width:${Math.max(width, 1) * dayWidth - 4}px" title="${escapeAttr(
            (f.start || "") + " → " + (f.end || "") + " DDL " + (f.ddl || "")
          )}"><span class="handle l" data-edge="start"></span>${escapeHtml(f.jiraId || f.app)}<span class="handle r" data-edge="end"></span></div>` +
          `</div></div></div>`
        );
      })
      .join("");

    root.innerHTML = axisHtml + rows;
    bindGanttDrag(dayWidth, start);
    $$(".gantt-name", root).forEach((btn) => {
      btn.addEventListener("click", () => openDetail(btn.getAttribute("data-open-id")));
    });
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

  function featureSig(list) {
    return (list || [])
      .map((f) => {
        const id = f && f.id ? String(f.id) : "";
        const status = f && f.status ? String(f.status) : "";
        const desc = f && f.description ? String(f.description).length : 0;
        const feishu = f && f.feishuUrl ? "1" : "0";
        const jira = f && (f.jiraUrl || f.jiraId) ? "1" : "0";
        return id + ":" + status + ":" + desc + ":" + feishu + ":" + jira;
      })
      .join("|");
  }

  async function persistIfSeedPatched(beforeCount, beforeSig) {
    const patched =
      (state.features || []).length !== beforeCount ||
      featureSig(state.features) !== beforeSig;
    if (!patched) return false;
    try {
      persistLocal();
    } catch (_) {}
    await pushRemote();
    return true;
  }

  async function hydrateFromRemote() {
    try {
      const res = await fetch(STATE_API, { cache: "no-store" });
      if (!res.ok) throw new Error("GET " + res.status);
      const raw = await res.json();
      const rawList = Array.isArray(raw && raw.features) ? raw.features : [];
      const rawCount = rawList.length;
      const rawSig = featureSig(rawList);
      const remote = normalize(raw);
      const remoteAt = remote.meta && remote.meta.updatedAt ? Date.parse(remote.meta.updatedAt) : 0;
      const localAt = state.meta && state.meta.updatedAt ? Date.parse(state.meta.updatedAt) : 0;
      const remoteEmpty = !remote.features || !remote.features.length;
      const localEmpty = !state.features || !state.features.length;

      if (!remoteEmpty && (localEmpty || remoteAt > localAt)) {
        state = remote;
      } else {
        state.features = mergeMissingSeedFeatures(state.features);
      }

      if (await persistIfSeedPatched(rawCount, rawSig)) {
        setSaveHint("已同步云端 · 已补种子需求", true);
        return;
      }
      if (!localEmpty && (remoteEmpty || !remoteAt)) {
        setSaveHint("本机已存 · 同步中…");
        await pushRemote();
        return;
      }
      if (remoteAt) setSaveHint("已同步云端 · " + formatLocal(new Date(remoteAt)), true);
      else if (localAt) setSaveHint("本机已存 · " + formatLocal(new Date(localAt)), true);
    } catch (err) {
      console.warn("hydrateFromRemote failed", err);
      state.features = mergeMissingSeedFeatures(state.features);
      try {
        persistLocal();
      } catch (_) {}
      const localAt = state.meta && state.meta.updatedAt ? Date.parse(state.meta.updatedAt) : 0;
      if (localAt) setSaveHint("本机已存 · 云端未连", false);
      else setSaveHint("标记本机缓存 · 云端未连", false);
    }
  }

  function ensureDrawer() {
    if ($("#detailOverlay")) return;
    const wrap = document.createElement("div");
    wrap.id = "detailOverlay";
    wrap.className = "drawer-overlay";
    wrap.hidden = true;
    wrap.innerHTML =
      `<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="detailTitle">` +
      `<div class="drawer-hd"><h2 id="detailTitle"></h2>` +
      `<button type="button" class="drawer-close" id="detailClose" aria-label="关闭">×</button></div>` +
      `<div class="drawer-body" id="detailBody"></div></aside>`;
    document.body.appendChild(wrap);
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) closeDetail();
    });
    $("#detailClose", wrap).addEventListener("click", closeDetail);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !wrap.hidden) closeDetail();
    });
  }

  function detailRow(label, valueHtml, empty) {
    return (
      `<div class="drawer-row"><dt>${escapeHtml(label)}</dt>` +
      `<dd class="${empty ? "empty" : ""}">${empty ? escapeHtml(valueHtml) : valueHtml}</dd></div>`
    );
  }

  function detailTextRow(label, value, emptyLabel) {
    const text = dash(value);
    if (!text) return detailRow(label, emptyLabel || "—", true);
    return detailRow(label, escapeHtml(text), false);
  }

  function feishuLabel(url) {
    try {
      const u = new URL(url);
      const last = decodeURIComponent((u.pathname || "").split("/").filter(Boolean).pop() || "");
      if (last && last.length <= 24 && !/^[A-Za-z0-9]{10,}$/.test(last)) return last;
    } catch (_) {}
    return "打开飞书文档";
  }

  function openDetail(id) {
    ensureDrawer();
    const feat = state.features.find((x) => x.id === id);
    if (!feat) return;
    $("#detailTitle").textContent = feat.name || "需求";
    const bucket = BUCKETS.find((b) => b.id === ddlBucket(feat));
    const note = dash(feat.note) || dash(feat.notes);
    const desc = dash(feat.description) || dash(feat.desc);
    const feishu = dash(feat.feishuUrl);
    const jiraUrl = dash(feat.jiraUrl) || jiraBrowseUrl(feat.jiraId);
    const jiraId = dash(feat.jiraId);
    const descHtml = desc
      ? `<div class="drawer-desc">${escapeHtml(desc)}</div>`
      : "暂无描述";
    const feishuHtml = feishu
      ? `<a class="drawer-link" href="${escapeAttr(feishu)}" target="_blank" rel="noopener noreferrer">${escapeHtml(feishuLabel(feishu))}</a>`
      : "暂无飞书文档";
    const jiraHtml = jiraUrl
      ? `<a class="drawer-link" href="${escapeAttr(jiraUrl)}" target="_blank" rel="noopener noreferrer">打开 Jira${jiraId ? " · " + escapeHtml(jiraId) : ""}</a>`
      : "暂无 Jira";
    $("#detailBody").innerHTML =
      detailRow("Jira", jiraHtml, !jiraUrl) +
      detailTextRow("应用", feat.app) +
      detailTextRow("状态", feat.status) +
      detailTextRow("开始", feat.start) +
      detailTextRow("结束", feat.end) +
      detailTextRow("DDL", feat.ddl) +
      detailTextRow("里程碑", bucket ? bucket.label : "") +
      detailTextRow("前端", feat.frontend) +
      detailTextRow("后端", feat.backend) +
      detailTextRow("测试", feat.qa) +
      detailRow("需求描述", descHtml, !desc) +
      detailRow("飞书文档", feishuHtml, !feishu) +
      detailTextRow("备注", note);
    const overlay = $("#detailOverlay");
    overlay.hidden = false;
    $("#detailClose").focus();
  }

  function closeDetail() {
    const overlay = $("#detailOverlay");
    if (!overlay) return;
    overlay.hidden = true;
  }

  function bindChrome() {
    ensureDrawer();
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
