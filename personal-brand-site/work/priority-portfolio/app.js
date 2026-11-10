/* 需求优先组合界面。依赖 core.js；无后端、无外链库。 */
(function () {
  "use strict";

  var Core = window.PortfolioCore;
  var Score = window.PortfolioScore;
  var STORE_KEY = "pp-assessment-v1";
  var NS = "http://www.w3.org/2000/svg";

  var state = {
    raw: null,
    data: null,
    filters: {
      query: "",
      products: null, /* null = 全部产品（图例未关）; [] 表示全部关掉 */
      hiddenProducts: Object.create(null),
      status: "",
      ownership: "",
      quickWinOnly: false,
      viewMode: "all",
      layer: ""
    },
    camera: { k: 1, x: 0, y: 0 },
    hoverId: null,
    pinned: null,
    pinnedLocked: false,
    expandedCell: null,
    visiblePlots: [],
    listLimit: 40,
    clusterProduct: "",
    clusterLimit: 40,
    weights: null,
    overrides: {}
  };

  var els = {};
  function $(id) { return document.getElementById(id); }

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function setText(el, v) {
    if (el) el.textContent = v == null ? "" : String(v);
  }

  function clear(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function svgEl(name, attrs) {
    var n = document.createElementNS(NS, name);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, String(attrs[k]));
      });
    }
    return n;
  }

  function isSafeUrl(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url);
  }

  /* ---------- data load ---------- */
  function injectedDataset() {
    var raw = window.PRIORITY_PORTFOLIO;
    if (!raw) return null;
    return raw;
  }

  function loadDataset() {
    var raw = injectedDataset();
    var normalized = Core.normalize(raw);
    if (!normalized.awaiting) {
      applyData(raw, normalized);
      return Promise.resolve(normalized);
    }
    /* file:// 下 fetch 可能失败，保持等待态即可。 */
    if (typeof fetch !== "function" || location.protocol === "file:") {
      applyData(raw, normalized);
      return Promise.resolve(normalized);
    }
    return fetch("dataset.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("dataset.json " + res.status);
        return res.json();
      })
      .then(function (json) {
        var next = Core.normalize(json);
        if (next.awaiting) applyData(raw, normalized);
        else applyData(json, next);
        return next.awaiting ? normalized : next;
      })
      .catch(function () {
        applyData(raw, normalized);
        return normalized;
      });
  }

  function applyData(raw, data) {
    state.raw = raw;
    state.data = data;
    state.camera = { k: 1, x: 0, y: 0 };
    state.pinned = null;
    state.pinnedLocked = false;
    state.filters.hiddenProducts = Object.create(null);
    renderAll();
  }

  function loadStore() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!raw || typeof raw !== "object") return;
      if (raw.weights) state.weights = Score.cloneWeights(raw.weights);
      if (raw.overrides && typeof raw.overrides === "object") state.overrides = raw.overrides;
    } catch (e) { /* 本地存储不可用时只用建议权重 */ }
  }

  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        kind: "priority-portfolio-personal-assessment",
        note: "个人评估，不会写回飞书或 Linear",
        weights: state.weights,
        overrides: state.overrides
      }));
    } catch (e) { /* 忽略配额或隐私模式 */ }
  }

  function reassess() {
    if (!state.data || state.data.awaiting || !Score) return;
    state.data.items.forEach(function (it) {
      if (it.legacyQuickWin == null) it.legacyQuickWin = !!it.quickWin;
      it.assessment = Score.assessItem(it, state.weights, state.overrides[it.id] || {});
      it.quickWin = it.assessment.quickWin.eligible;
    });
  }

  function coordLabel(it, axis) {
    var a = it.assessment;
    if (!a) return String(it[axis]);
    var side = a[axis];
    if (side.mode === "weighted" && side.value != null) return side.value.toFixed(1);
    return String(it[axis]) + " 旧档";
  }

  function buildWeightControls() {
    if (!Score || !els.weightCost) return;
    function fill(host, ids) {
      clear(host);
      var h = document.createElement("h3");
      h.textContent = ids[0] === "complexity" ? "成本" : "优先级";
      host.appendChild(h);
      ids.forEach(function (id) {
        var def = Score.METRICS.filter(function (m) { return m.id === id; })[0];
        var row = document.createElement("label");
        row.className = "weight-row";
        var name = document.createElement("span");
        name.textContent = def.label;
        var input = document.createElement("input");
        input.type = "range";
        input.min = "0";
        input.max = "100";
        input.step = "1";
        input.dataset.metric = id;
        input.value = String(Math.round(state.weights[id] * 100));
        input.setAttribute("aria-label", def.label + " 建议权重");
        var pct = document.createElement("span");
        pct.className = "num";
        pct.textContent = Math.round(state.weights[id] * 100) + "%";
        input.addEventListener("input", function () {
          var raw = {};
          host.parentNode.querySelectorAll("input[type=range]").forEach(function (el) {
            raw[el.dataset.metric] = Number(el.value);
          });
          state.weights = Score.normalizeWeights(Object.assign({}, state.weights, raw));
          syncWeightInputs();
          saveStore();
          var pinned = state.pinned && state.pinned.type === "item" ? state.pinned.id : "";
          renderAll();
          if (pinned) {
            var item = itemById(pinned);
            if (item) openItem(item, true, null);
          }
        });
        row.appendChild(name);
        row.appendChild(input);
        row.appendChild(pct);
        host.appendChild(row);
      });
    }
    fill(els.weightCost, Score.COST_IDS);
    fill(els.weightPriority, Score.PRIORITY_IDS);
    if (els.weightFormula) setText(els.weightFormula, Score.formulaText());
    syncWeightReadout();
  }

  function syncWeightInputs() {
    document.querySelectorAll("#weight-panel input[type=range]").forEach(function (el) {
      var pct = Math.round(state.weights[el.dataset.metric] * 100);
      el.value = String(pct);
      var label = el.parentNode && el.parentNode.querySelector(".num");
      if (label) label.textContent = pct + "%";
    });
    syncWeightReadout();
  }

  function syncWeightReadout() {
    if (!els.weightReadout || !state.weights) return;
    function line(ids) {
      return ids.map(function (id) {
        var def = Score.METRICS.filter(function (m) { return m.id === id; })[0];
        return def.label + " " + Math.round(state.weights[id] * 100) + "%";
      }).join(" · ");
    }
    setText(els.weightReadout, "当前建议权重。成本：" + line(Score.COST_IDS) + "。优先级：" + line(Score.PRIORITY_IDS) + "。");
  }

  /* ---------- filters & counts ---------- */
  function currentFilters() {
    var hidden = state.filters.hiddenProducts;
    var productIds = state.data.products
      .map(function (p) { return p.id; })
      .filter(function (id) { return !hidden[id]; });
    var select = state.filters.productSelect;
    var products = null;
    if (select) {
      products = productIds.indexOf(select) === -1 ? [] : [select];
    } else {
      products = productIds.length === state.data.products.length ? null : productIds;
    }
    return {
      query: state.filters.query,
      products: products,
      status: state.filters.status,
      ownership: state.filters.ownership,
      quickWinOnly: state.filters.quickWinOnly || state.filters.viewMode === "quickwin",
      viewMode: state.filters.viewMode || "all",
      layer: state.filters.layer || ""
    };
  }

  function visibleItems() {
    return Core.applyFilters(state.data.items, currentFilters());
  }

  /* ---------- header / kpi / filters ---------- */
  function renderMeta() {
    var d = state.data;
    var m = d.meta;
    setText(els.title, m.title);
    document.title = m.title;
    var lede = "高源负责范围内、尚未完成开发的需求。默认展示全部可画图主题，不是只展示正在推进的 38 条。横坐标是开发成本，纵坐标是建议优先级；左上为 Quick win 建议区。";
    lede += m.costScale.disclaimer;
    if (d.awaiting) lede += "数据集尚未注入，本页不用虚构需求填充。";
    else {
      if (m.generatedAt) lede += "数据生成于 " + Core.formatStamp(m.generatedAt, m.timezone) + "。";
      if (m.sourceNote) lede += m.sourceNote;
    }
    setText(els.lede, lede);
    if (d.draft || m.draft || m.status === "draft" || (m.stale && m.staleNote)) {
      els.stale.hidden = false;
      setText(els.stale, m.staleNote || m.sourceNote || "数据稿，不是最终版，尚未发布。");
    } else {
      els.stale.hidden = true;
      setText(els.stale, "");
    }
    var canDownload = !d.awaiting && (d.items.length + d.excludedCompleted.length + d.unscored.length + (d.deferred || []).length) > 0;
    els.btnJson.disabled = !canDownload;
    els.btnCsv.disabled = !canDownload;
  }

  function fillSelect(sel, values, allLabel, current) {
    var prev = current || "";
    clear(sel);
    var opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = allLabel;
    sel.appendChild(opt0);
    values.forEach(function (v) {
      var o = document.createElement("option");
      if (typeof v === "string") {
        o.value = v;
        o.textContent = v;
      } else {
        o.value = v.id;
        o.textContent = v.label;
      }
      sel.appendChild(o);
    });
    sel.value = prev;
    if (sel.value !== prev) sel.value = "";
  }

  function renderFilterControls() {
    var d = state.data;
    var opts = Core.filterOptions(d);
    var enable = !d.awaiting && (d.items.length + d.excludedCompleted.length + d.unscored.length + (d.deferred || []).length) > 0;
    els.query.disabled = !enable;
    els.product.disabled = !enable;
    els.status.disabled = !enable;
    els.ownership.disabled = !enable;
    if (els.layer) els.layer.disabled = !enable;
    if (els.quickwin) els.quickwin.disabled = !enable;
    setViewButtons();
    fillSelect(els.product, opts.products, "全部产品", state.filters.productSelect || "");
    fillSelect(els.status, opts.statuses, "全部状态", state.filters.status);
    fillSelect(els.ownership, opts.ownerships, "全部归属", state.filters.ownership);
    if (els.layer) fillSelect(els.layer, opts.layers || [], "全部分层", state.filters.layer || "");
  }

  function renderCounts() {
    var d = state.data;
    var visible = visibleItems();
    var sum = Core.summarize(d, currentFilters(), visible);
    var advancingAll = d.items.filter(function (it) { return it.inDefaultChart; }).length;
    var rejected = (d.unplottedThemes || []).length;
    var owned = (d.meta.coverage && d.meta.coverage.owned) || (d.meta.sourceStamp && d.meta.sourceStamp.coverageOwned) || 0;
    var missing = (d.meta.coverage && d.meta.coverage.missing && d.meta.coverage.missing.length) || 0;
    if (d.awaiting) {
      setText(els.kpiEvaluable, "—");
      setText(els.kpiQuick, "—");
      if (els.kpiAdvancing) setText(els.kpiAdvancing, "—");
      if (els.kpiRejected) setText(els.kpiRejected, "—");
      if (els.kpiCoverage) setText(els.kpiCoverage, "—");
      setText(els.kpiQuickNote, "未入选不等于低价值，不是已批准排期");
      setText(els.kpiVisibleNote, "默认展示全部可画图主题");
      setText(els.caption, "数据集尚未注入。图和清单会在真实数据到位后填写，不会用占位需求代替。");
      return sum;
    }
    setText(els.kpiEvaluable, String(sum.evaluable));
    setText(els.kpiQuick, String(sum.quickWinsAll));
    if (els.kpiAdvancing) setText(els.kpiAdvancing, String(advancingAll));
    if (els.kpiRejected) setText(els.kpiRejected, String(rejected));
    if (els.kpiCoverage) setText(els.kpiCoverage, String(owned));
    if (els.kpiCoverageNote) setText(els.kpiCoverageNote, "缺口 " + missing);
    setText(els.kpiQuickNote, "须两边都是加权结果，且归属已确认。旧档暂用不算。未入选不等于低价值。");
    if (els.viewQuickwin) els.viewQuickwin.textContent = "Quick win " + sum.quickWinsAll;
    var viewLabel = state.filters.viewMode === "advancing" ? "正在推进、归属明确" : (state.filters.viewMode === "quickwin" ? "仅 Quick win 建议" : "全部可画图");
    setText(els.kpiVisibleNote, "当前图上 " + sum.visible + "（" + viewLabel + "）/ 可画图全集 " + sum.evaluable);
    var extra = "当前是「" + viewLabel + "」，图上 " + sum.visible + " / 可画图 " + sum.evaluable + " · 主题 " + (sum.evaluable + rejected) + " · 否决仅列表 " + rejected + " · 覆盖 " + owned + "，缺口 " + missing + "。否决、现有支持和排除清单始终在下方，不因筛选被当作已经看完。各主题频次不能相加当作客户数。";
    setText(els.caption, extra);
    if (els.chartCount) setText(els.chartCount, "图上 " + sum.visible + " / 可画图 " + sum.evaluable);
    renderQuickWins();
    if (els.countUnplotted) setText(els.countUnplotted, String(rejected));
    if (els.countSupported) setText(els.countSupported, String((d.alreadySupported || []).length));
    if (els.countDuplicate) setText(els.countDuplicate, String((d.duplicateUnmapped || []).length));
    if (els.countUnscored) setText(els.countUnscored, String((d.unscored || []).length));
    if (els.countDeferred) setText(els.countDeferred, String((d.deferred || []).length));
    if (els.countExcluded) setText(els.countExcluded, String((d.excludedCompleted || []).length));
    return sum;
  }

  function renderQuickWins() {
    var box = els.qwList;
    var strip = els.qwStrip;
    if (!box || !strip) return;
    clear(box);
    if (!state.data || state.data.awaiting) {
      strip.hidden = true;
      return;
    }
    var wins = state.data.items.filter(function (it) { return it.assessment && it.assessment.quickWin.eligible; });
    var near = state.data.items.filter(function (it) { return it.assessment && it.assessment.quickWin.legacyNear; });
    strip.hidden = wins.length + near.length === 0;
    if (els.qwRule && Score) setText(els.qwRule, Score.QUICK_WIN.rule);
    function addCard(it, nearMiss) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = nearMiss ? "qw-card is-near" : "qw-card";
      btn.setAttribute("data-id", it.id);
      var strong = document.createElement("strong");
      strong.textContent = it.title;
      var span = document.createElement("span");
      var a = it.assessment;
      span.textContent = (nearMiss ? "旧档落在区间，分项未齐。 " : "") + (it.productLabel || "") + " · 图上 " + coordLabel(it, "cost") + " / " + coordLabel(it, "priority") + " · 旧档 " + it.cost + " / " + it.priority;
      if (nearMiss && a) span.textContent += "。 " + a.quickWin.reasons[0];
      btn.appendChild(strong);
      btn.appendChild(span);
      btn.addEventListener("click", function () {
        if (!nearMiss) setViewMode("quickwin");
        openItem(it, true, null);
      });
      box.appendChild(btn);
    }
    wins.forEach(function (it) { addCard(it, false); });
    near.forEach(function (it) { addCard(it, true); });
  }

  function setViewButtons() {
    var mode = state.filters.viewMode || "all";
    [["view-all","all"],["view-advancing","advancing"],["view-quickwin","quickwin"]].forEach(function (pair) {
      var btn = $(pair[0]);
      if (!btn) return;
      var on = mode === pair[1];
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function setViewMode(mode) {
    state.filters.viewMode = mode;
    state.filters.quickWinOnly = mode === "quickwin";
    state.expandedCell = null;
    state.listLimit = 40;
    state.clusterLimit = 40;
    setViewButtons();
    renderInteractive();
  }

  /* ---------- chart ---------- */
  function chartLayout() {
    var svg = els.chart;
    var box = svg.getBoundingClientRect();
    var w = Math.max(320, box.width || 800);
    var h = Math.max(200, box.height || 540);
    return {
      w: w,
      h: h,
      pad: { l: 52, r: 20, t: 28, b: 46 }
    };
  }

  function scales() {
    var m = state.data.meta;
    return {
      xMin: m.costScale.min - 0.5,
      xMax: m.costScale.max + 0.5,
      yMin: m.priorityScale.min - 0.5,
      yMax: m.priorityScale.max + 0.5,
      cost: m.costScale,
      priority: m.priorityScale,
      qw: m.quickWin
    };
  }

  function project(layout, sc, x, y) {
    var plotW = layout.w - layout.pad.l - layout.pad.r;
    var plotH = layout.h - layout.pad.t - layout.pad.b;
    var px = layout.pad.l + ((x - sc.xMin) / (sc.xMax - sc.xMin)) * plotW;
    var py = layout.pad.t + (1 - (y - sc.yMin) / (sc.yMax - sc.yMin)) * plotH;
    var k = state.camera.k;
    var cx = layout.pad.l + plotW / 2 + state.camera.x;
    var cy = layout.pad.t + plotH / 2 + state.camera.y;
    return {
      x: cx + (px - (layout.pad.l + plotW / 2)) * k,
      y: cy + (py - (layout.pad.t + plotH / 2)) * k
    };
  }

  function inPlot(layout, p) {
    return p.x >= layout.pad.l - 40 && p.x <= layout.w - layout.pad.r + 40 &&
      p.y >= layout.pad.t - 40 && p.y <= layout.h - layout.pad.b + 40;
  }

  function renderChart() {
    var svg = els.chart;
    clear(svg);
    var d = state.data;
    var layout = chartLayout();
    var sc = scales();
    svg.setAttribute("viewBox", "0 0 " + layout.w + " " + layout.h);
    svg.setAttribute("width", String(layout.w));
    svg.setAttribute("height", String(layout.h));

    var defs = svgEl("defs");
    var clip = svgEl("clipPath", { id: "plot-clip" });
    clip.appendChild(svgEl("rect", {
      x: layout.pad.l,
      y: layout.pad.t,
      width: layout.w - layout.pad.l - layout.pad.r,
      height: layout.h - layout.pad.t - layout.pad.b
    }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    /* axes labels stay outside the zoomed clip */
    var xlab = svgEl("text", {
      x: layout.pad.l + (layout.w - layout.pad.l - layout.pad.r) / 2,
      y: layout.h - 8,
      "text-anchor": "middle",
      fill: "#5c5a56",
      "font-size": 12
    });
    xlab.textContent = sc.cost.label + "（" + sc.cost.min + "–" + sc.cost.max + "，" + sc.cost.unit + "）";
    svg.appendChild(xlab);

    var ylab = svgEl("text", {
      x: 16,
      y: layout.pad.t + (layout.h - layout.pad.t - layout.pad.b) / 2,
      "text-anchor": "middle",
      fill: "#5c5a56",
      "font-size": 12,
      transform: "rotate(-90 16 " + (layout.pad.t + (layout.h - layout.pad.t - layout.pad.b) / 2) + ")"
    });
    ylab.textContent = sc.priority.label + "（" + sc.priority.min + "–" + sc.priority.max + "，" + sc.priority.unit + "）";
    svg.appendChild(ylab);

    var g = svgEl("g", { "clip-path": "url(#plot-clip)" });
    svg.appendChild(g);

    function plotRect(x0, y0, x1, y1, fill) {
      var a = project(layout, sc, x0, y0);
      var b = project(layout, sc, x1, y1);
      return svgEl("rect", {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
        fill: fill
      });
    }
    /* 四象限：分界在 3。左上（低成本、高优先）是更值得看的一块，对应 frontier 图里被标出的象限。 */
    g.appendChild(plotRect(sc.xMin, 3, 3, sc.yMax, "#e7f3ec"));
    g.appendChild(plotRect(3, 3, sc.xMax, sc.yMax, "#f6f3ec"));
    g.appendChild(plotRect(sc.xMin, sc.yMin, 3, 3, "#f4f5f7"));
    g.appendChild(plotRect(3, sc.yMin, sc.xMax, 3, "#f8f1f1"));

    var qwRule = Score ? Score.QUICK_WIN : sc.qw;
    var qw0 = project(layout, sc, sc.xMin, qwRule.priorityMin);
    var qw1 = project(layout, sc, qwRule.costMax, sc.yMax);
    g.appendChild(svgEl("rect", {
      x: Math.min(qw0.x, qw1.x),
      y: Math.min(qw0.y, qw1.y),
      width: Math.abs(qw1.x - qw0.x),
      height: Math.abs(qw1.y - qw0.y),
      fill: "#d5ebdf"
    }));

    function cornerLabel(x, y, text, fill, anchor) {
      var p = project(layout, sc, x, y);
      if (p.x < layout.pad.l - 4 || p.x > layout.w - layout.pad.r + 4) return;
      if (p.y < layout.pad.t - 4 || p.y > layout.h - layout.pad.b + 4) return;
      var lab = svgEl("text", {
        x: p.x,
        y: p.y,
        fill: fill,
        "font-size": 12,
        "font-weight": 600,
        "text-anchor": anchor || "start"
      });
      lab.textContent = text;
      g.appendChild(lab);
    }
    cornerLabel(sc.xMin + 0.12, sc.yMax - 0.08, "优先看", "#1e4d32", "start");
    cornerLabel(sc.xMax - 0.12, sc.yMax - 0.08, "择要投入", "#6a5b3a", "end");
    cornerLabel(sc.xMin + 0.12, sc.yMin + 0.28, "有余力再做", "#5c6570", "start");
    cornerLabel(sc.xMax - 0.12, sc.yMin + 0.28, "暂缓", "#7a4a4a", "end");

    /* grid + ticks */
    var ticks = [];
    for (var t = sc.cost.min; t <= sc.cost.max + 0.001; t += 1) ticks.push(t);
    ticks.forEach(function (tick) {
      var p0 = project(layout, sc, tick, sc.yMin);
      var p1 = project(layout, sc, tick, sc.yMax);
      g.appendChild(svgEl("line", {
        x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y,
        stroke: "#e5e5e5", "stroke-width": 1
      }));
    });
    ticks.forEach(function (tick) {
      var p0 = project(layout, sc, sc.xMin, tick);
      var p1 = project(layout, sc, sc.xMax, tick);
      g.appendChild(svgEl("line", {
        x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y,
        stroke: "#e5e5e5", "stroke-width": 1
      }));
    });

    var splitX = project(layout, sc, 3, sc.yMin);
    var splitX2 = project(layout, sc, 3, sc.yMax);
    var splitY = project(layout, sc, sc.xMin, 3);
    var splitY2 = project(layout, sc, sc.xMax, 3);
    g.appendChild(svgEl("line", {
      x1: splitX.x, y1: splitX.y, x2: splitX2.x, y2: splitX2.y,
      stroke: "#0b1f3a", "stroke-width": 1.25, "stroke-opacity": 0.55
    }));
    g.appendChild(svgEl("line", {
      x1: splitY.x, y1: splitY.y, x2: splitY2.x, y2: splitY2.y,
      stroke: "#0b1f3a", "stroke-width": 1.25, "stroke-opacity": 0.55
    }));

    /* baseline (bottom and left of data domain, heavier) */
    var b0 = project(layout, sc, sc.xMin, sc.cost.min ? sc.priority.min : sc.yMin);
    /* left + bottom of the 0.5 padding frame in unzoomed space, but draw domain  min edges */
    var axisOrigin = project(layout, sc, sc.cost.min, sc.priority.min);
    var axisXEnd = project(layout, sc, sc.cost.max, sc.priority.min);
    var axisYEnd = project(layout, sc, sc.cost.min, sc.priority.max);
    g.appendChild(svgEl("line", {
      x1: axisOrigin.x, y1: axisOrigin.y, x2: axisXEnd.x, y2: axisXEnd.y,
      stroke: "#0b1f3a", "stroke-width": 1.5
    }));
    g.appendChild(svgEl("line", {
      x1: axisOrigin.x, y1: axisOrigin.y, x2: axisYEnd.x, y2: axisYEnd.y,
      stroke: "#0b1f3a", "stroke-width": 1.5
    }));

    /* tick labels live outside clip so they stay readable; positions follow zoom if still in view */
    ticks.forEach(function (tick) {
      var px = project(layout, sc, tick, sc.priority.min);
      if (px.x >= layout.pad.l - 8 && px.x <= layout.w - layout.pad.r + 8) {
        var tx = svgEl("text", {
          x: px.x,
          y: layout.h - 28,
          "text-anchor": "middle",
          fill: "#5c5a56",
          "font-size": 12,
          "font-variant": "tabular-nums"
        });
        tx.textContent = String(tick);
        svg.appendChild(tx);
      }
      var py = project(layout, sc, sc.cost.min, tick);
      if (py.y >= layout.pad.t - 8 && py.y <= layout.h - layout.pad.b + 8) {
        var ty = svgEl("text", {
          x: layout.pad.l - 8,
          y: py.y + 4,
          "text-anchor": "end",
          fill: "#5c5a56",
          "font-size": 12,
          "font-variant": "tabular-nums"
        });
        ty.textContent = String(tick);
        svg.appendChild(ty);
      }
    });

    var items = visibleItems();
    var empty = els.chartEmpty;
    if (d.awaiting) {
      empty.hidden = false;
      empty.textContent = "数据集尚未注入。真实需求到位后，气泡会出现在对应的成本与优先级档位上。现在不会用虚构条目填充这张图。";
      state.visiblePlots = [];
      return;
    }
    if (!items.length) {
      empty.hidden = false;
      empty.textContent = d.items.length
        ? "当前筛选下没有可显示的可评估需求。下方清单与审计列表仍可查看，这不是全部需求。"
        : "可评估清单为空。若已完成排除或未评分有记录，见下方独立列表。";
      state.visiblePlots = [];
      return;
    }
    empty.hidden = true;

    var plots = Core.layoutItems(items.map(function (it) {
      var a = it.assessment;
      if (!a || a.plot.x == null || a.plot.y == null) return it;
      return Object.assign({}, it, { cost: a.plot.x, priority: a.plot.y });
    }));
    var extent = Core.frequencyExtent(items);
    var rOpts = items.length > 40
      ? { rMin: 3.2, rMax: 11, rUnknown: 4 }
      : { rMin: 7, rMax: 18, rUnknown: 8 };
    var points = plots.map(function (plot) {
      var p = project(layout, sc, plot.x, plot.y);
      var r = Core.bubbleRadius(plot.item, extent, rOpts);
      return {
        plot: plot,
        item: plot.item,
        px: p.x,
        py: p.y,
        r: r,
        cellKey: plot.cellKey,
        groupSize: plot.groupSize
      };
    });
    state.visiblePlots = points;

    function drawBubbleMark(gB, pt, it) {
      var pending = it.ownershipKey === "ownership_pending";
      var low = (it.confidence || "") === "low";
      var hollow = it.frequencyUnknown || it.frequency === null;
      gB.appendChild(svgEl("circle", {
        cx: pt.px,
        cy: pt.py,
        r: pt.r + 0.7,
        fill: "#ffffff",
        stroke: "none",
        "pointer-events": "none"
      }));
      var circle = svgEl("circle", {
        cx: pt.px,
        cy: pt.py,
        r: pt.r,
        fill: hollow ? "#ffffff" : it.color,
        stroke: it.color,
        "stroke-width": pending || hollow ? 1.6 : 1,
        "stroke-dasharray": pending ? "4 2.5" : null,
        "fill-opacity": hollow ? 1 : (low ? 0.55 : 0.92)
      });
      if (state.pinned && state.pinned.type === "item" && state.pinned.id === it.id) {
        circle.setAttribute("stroke-width", "2.5");
      }
      gB.appendChild(circle);
      if (low) {
        gB.appendChild(svgEl("circle", {
          cx: pt.px,
          cy: pt.py,
          r: Math.max(2.5, pt.r - 3),
          fill: "none",
          stroke: it.color,
          "stroke-width": 1,
          "stroke-dasharray": "1.5 2",
          "pointer-events": "none"
        }));
      }
    }

    var grouped = Object.create(null);
    points.forEach(function (pt, i) {
      var k = pt.cellKey;
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(i);
    });

    var drawOrder = points.map(function (pt, i) { return i; });
    drawOrder.sort(function (a, b) { return points[a].r - points[b].r; });
    drawOrder.forEach(function (i) {
      var pt = points[i];
      if (!inPlot(layout, { x: pt.px, y: pt.py })) return;
      var it = pt.item;
      var gB = svgEl("g", {
        class: (state.pinned && state.pinned.type === "item" && state.pinned.id === it.id) ? "bubble is-selected" : "bubble",
        "data-id": it.id,
        "data-cell": pt.cellKey,
        tabindex: "0",
        role: "button",
        "aria-label": it.title + "，" + it.productLabel + "，成本 " + it.cost + "，优先级 " + it.priority
      });
      drawBubbleMark(gB, pt, it);
      if (state.camera.k >= 2.4 || items.length <= 18) {
        var label = svgEl("text", {
          x: pt.px + pt.r + 4,
          y: pt.py + 4,
          fill: "#0b1f3a",
          "font-size": 11,
          "pointer-events": "none"
        });
        var t = it.title;
        label.textContent = t.length > 14 ? t.slice(0, 13) + "…" : t;
        gB.appendChild(label);
      }
      g.appendChild(gB);
    });

    Object.keys(grouped).forEach(function (key) {
      var idxs = grouped[key];
      if (idxs.length < 8) return;
      var anchor = project(layout, sc, points[idxs[0]].item.cost, points[idxs[0]].item.priority + 0.46);
      if (!inPlot(layout, anchor)) return;
      var ids = idxs.map(function (i) { return points[i].item.id; });
      var badge = svgEl("g", {
        class: "cell-count",
        "data-ids": ids.join(","),
        "data-cell": key,
        tabindex: "0",
        role: "button",
        "aria-label": "同一档 " + idxs.length + " 条，打开清单。散开不是更高成本或更高优先级。"
      });
      badge.appendChild(svgEl("rect", {
        x: anchor.x - 16,
        y: anchor.y - 11,
        width: 32,
        height: 16,
        rx: 3,
        fill: "#ffffff",
        stroke: "#0b1f3a",
        "stroke-width": 1
      }));
      var ct = svgEl("text", {
        x: anchor.x,
        y: anchor.y + 1,
        "text-anchor": "middle",
        fill: "#0b1f3a",
        "font-size": 10,
        "font-variant": "tabular-nums",
        "pointer-events": "none"
      });
      ct.textContent = String(idxs.length);
      badge.appendChild(ct);
      g.appendChild(badge);
    });
  }

  function renderLegend() {
    var box = els.legend;
    clear(box);
    var d = state.data;
    if (d.awaiting || !d.products.length) {
      var hint = document.createElement("span");
      hint.style.color = "#6b6964";
      hint.style.fontSize = "12px";
      hint.textContent = d.awaiting ? "产品图例将随数据集出现，初始会展示全部可评估产品。" : "没有产品图例。";
      box.appendChild(hint);
      appendSizeKey(box);
      return;
    }
    d.products.forEach(function (p) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "legend-item";
      var pressed = !state.filters.hiddenProducts[p.id];
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
      var sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = p.color;
      var count = d.items.filter(function (it) { return it.product === p.id; }).length;
      btn.appendChild(sw);
      var lab = document.createElement("span");
      lab.textContent = p.label + " " + count;
      btn.appendChild(lab);
      btn.addEventListener("click", function () {
        if (state.filters.hiddenProducts[p.id]) delete state.filters.hiddenProducts[p.id];
        else state.filters.hiddenProducts[p.id] = true;
        renderInteractive();
      });
      box.appendChild(btn);
    });
    appendSizeKey(box);
  }

  function appendSizeKey(box) {
    var key = document.createElement("span");
    key.className = "size-key";
    var s1 = document.createElement("i");
    s1.style.width = "8px";
    s1.style.height = "8px";
    var s2 = document.createElement("i");
    s2.style.width = "14px";
    s2.style.height = "14px";
    var s3 = document.createElement("i");
    s3.style.width = "20px";
    s3.style.height = "20px";
    var u = document.createElement("span");
    u.className = "swatch unknown";
    u.style.color = "#0b1f3a";
    key.appendChild(s1);
    key.appendChild(s2);
    key.appendChild(s3);
    var lab = document.createElement("span");
    lab.textContent = "面积与频次成正比";
    key.appendChild(lab);
    key.appendChild(u);
    var ulab = document.createElement("span");
    ulab.textContent = (state.data.meta.frequency && state.data.meta.frequency.unknownLabel) || "频次未知（空心）";
    key.appendChild(ulab);
    var own = document.createElement("span");
    own.textContent = "虚线描边：归属待确认";
    key.appendChild(own);
    var low = document.createElement("span");
    low.textContent = "点线内圈：成本信心低";
    key.appendChild(low);
    box.appendChild(key);
  }

  /* ---------- tables ---------- */
  function emptyRow(table, cols, message) {
    var tb = table.tBodies[0];
    clear(tb);
    var tr = document.createElement("tr");
    tr.className = "empty-row";
    var td = document.createElement("td");
    td.colSpan = cols;
    td.textContent = message;
    tr.appendChild(td);
    tb.appendChild(tr);
  }

  function appendTitleCell(tr, item, th) {
    var td = document.createElement("td");
    td.className = "title";
    td.setAttribute("data-th", th || "需求");
    var wrap = document.createElement("div");
    wrap.className = "title-cell";
    var strong = document.createElement("strong");
    strong.textContent = item.title;
    wrap.appendChild(strong);
    if (item.id) {
      var sub = document.createElement("span");
      sub.textContent = item.id;
      wrap.appendChild(sub);
    }
    td.appendChild(wrap);
    tr.appendChild(td);
  }

  function td(tr, text, cls, th) {
    var cell = document.createElement("td");
    if (cls) cell.className = cls;
    if (th) cell.setAttribute("data-th", th);
    cell.textContent = text == null || text === "" ? "—" : String(text);
    tr.appendChild(cell);
    return cell;
  }

  function renderItemsTable() {
    var table = els.tableItems;
    var items = visibleItems();
    var d = state.data;
    if (d.awaiting) {
      emptyRow(table, 8, "等待数据集注入。");
      setText(els.listSub, "可搜索的完整可评估清单。筛选会同时作用于图和本表，不会把未列出的部分说成已经看完。");
      return;
    }
    var sum = Core.summarize(d, currentFilters(), items);
    setText(els.listSub, "本表 " + items.length + " 条，可评估全集 " + sum.evaluable + " 条。" + sum.filterHint);
    var tb = table.tBodies[0];
    clear(tb);
    if (!items.length) {
      emptyRow(table, 8, d.items.length ? "当前筛选下没有可评估需求。请放宽筛选，或查看下方审计与未评分清单。" : "没有可评估需求。");
      return;
    }
    var shown = items.slice(0, state.listLimit || 40);
    var frag = document.createDocumentFragment();
    shown.forEach(function (it) {
      var tr = document.createElement("tr");
      tr.tabIndex = 0;
      tr.dataset.id = it.id;
      if (state.pinned && state.pinned.type === "item" && state.pinned.id === it.id) tr.className = "is-active";
      appendTitleCell(tr, it, "需求");
      var ptd = td(tr, "", "product", "产品");
      ptd.textContent = "";
      var prod = document.createElement("span");
      prod.className = "prod";
      var sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = it.color;
      prod.appendChild(sw);
      prod.appendChild(document.createTextNode(it.productLabel || it.product || "—"));
      ptd.appendChild(prod);
      td(tr, it.status, "", "状态");
      td(tr, it.ownership, "", "归属");
      td(tr, coordLabel(it, "cost"), "num", "成本");
      td(tr, coordLabel(it, "priority"), "num", "优先级");
      var ftd = td(tr, "", "", "频次");
      ftd.textContent = "";
      if (it.frequencyUnknown) {
        var pill = document.createElement("span");
        pill.className = "pill pill-unknown";
        pill.textContent = d.meta.frequency.unknownLabel;
        ftd.appendChild(pill);
      } else {
        ftd.classList.add("num");
        ftd.textContent = String(it.frequency);
      }
      var note = td(tr, "", "", "说明");
      note.textContent = "";
      if (it.quickWin) {
        var w = document.createElement("span");
        w.className = "pill pill-win";
        w.textContent = d.meta.quickWin.label || "Quick win";
        note.appendChild(w);
      }
      if (it.mergedFrom && it.mergedFrom.length) {
        note.appendChild(document.createTextNode((it.quickWin ? " " : "") + "合并 " + it.mergedFrom.length + " 条"));
      }
      if (!note.childNodes.length) note.textContent = "—";
      frag.appendChild(tr);
    });
    tb.appendChild(frag);
    if (els.listMore) {
      els.listMore.hidden = shown.length >= items.length;
      els.listMore.textContent = "加载更多（已显示 " + shown.length + " / " + items.length + "）";
    }
  }

  function renderAuditTable(table, rows, emptyMsg, reasonKey) {
    if (state.data.awaiting) {
      emptyRow(table, 5, "等待数据集注入。");
      return;
    }
    if (!rows.length) {
      emptyRow(table, 5, emptyMsg);
      return;
    }
    var tb = table.tBodies[0];
    clear(tb);
    var frag = document.createDocumentFragment();
    rows.forEach(function (it) {
      var tr = document.createElement("tr");
      tr.tabIndex = 0;
      tr.dataset.auditId = it.id;
      appendTitleCell(tr, it, "需求");
      td(tr, it.productLabel || it.product, "product", "产品");
      td(tr, it.status, "", "状态");
      td(tr, it.ownership, "", "归属");
      var reason = it.reason || (it.missing && it.missing.length ? it.missing.join("、") : "");
      td(tr, reason, "", reasonKey);
      frag.appendChild(tr);
    });
    tb.appendChild(frag);
  }

  /* ---------- float window ---------- */
  function hideHoverFloat() {
    if (!els.float) return;
    els.float.hidden = true;
    els.float.classList.remove("is-open");
    state.hoverId = null;
  }

  function clearInspector() {
    if (!els.inspectorBody) return;
    if (els.inspectorClose) els.inspectorClose.hidden = true;
    if (els.inspectorTools) els.inspectorTools.hidden = true;
    setText(els.inspectorTitle, "详情与重叠清单");
    if (els.inspectorSub) setText(els.inspectorSub, "悬停看摘要。点击气泡或表格行，详情固定在此栏，可滚动。重叠格会在此列出全部条目。");
    clear(els.inspectorBody);
    var p = document.createElement("p");
    p.className = "inspector-placeholder";
    p.textContent = "尚未选中条目。可从 Quick win、气泡或下方表格进入。";
    els.inspectorBody.appendChild(p);
  }

  function hideFloat() {
    hideHoverFloat();
    state.pinned = null;
    state.pinnedLocked = false;
    state.hoverId = null;
    clearInspector();
  }

  function placeFloat(px, py) {
    var el = els.float;
    el.style.left = "0px";
    el.style.top = "0px";
    el.hidden = false;
    el.classList.add("is-open");
    var w = el.offsetWidth;
    var h = el.offsetHeight;
    var left = px + 16;
    var top = py + 16;
    if (left + w > window.innerWidth - 12) left = Math.max(12, px - w - 12);
    if (top + h > window.innerHeight - 12) top = Math.max(12, window.innerHeight - h - 12);
    el.style.left = left + "px";
    el.style.top = top + "px";
  }

  function itemById(id) {
    var lists = [state.data.items, state.data.unplottedThemes || [], state.data.themes || []];
    for (var l = 0; l < lists.length; l++) {
      var list = lists[l] || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    }
    return null;
  }

  function auditById(id) {
    var lists = [state.data.unscored || [], state.data.deferred || [], state.data.excludedCompleted || []];
    for (var l = 0; l < lists.length; l++) {
      for (var i = 0; i < lists[l].length; i++) if (lists[l][i].id === id) return lists[l][i];
    }
    return null;
  }

  function addKv(parent, label, value, asList) {
    if (!value && value !== 0) return;
    var kv = document.createElement("div");
    kv.className = "kv";
    var dt = document.createElement("dt");
    dt.textContent = label;
    var dd = document.createElement("dd");
    if (asList && Array.isArray(value)) {
      var ul = document.createElement("ul");
      ul.className = "sources";
      value.forEach(function (s) {
        var li = document.createElement("li");
        if (s && s.url && isSafeUrl(s.url)) {
          var a = document.createElement("a");
          a.href = s.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = s.label || s.url;
          li.appendChild(a);
          if (s.type || s.id) {
            li.appendChild(document.createTextNode(" " + [s.type, s.id].filter(Boolean).join(" ")));
          }
        } else {
          li.textContent = typeof s === "string" ? s : (s.label || s.id || "");
        }
        ul.appendChild(li);
      });
      dd.appendChild(ul);
    } else {
      dd.textContent = String(value);
    }
    kv.appendChild(dt);
    kv.appendChild(dd);
    parent.appendChild(kv);
  }

  function fillItemInto(titleEl, metaEl, bodyEl, item, locked) {
    setText(titleEl, item.title);
    clear(metaEl);
    function metaChip(text) {
      var s = document.createElement("span");
      s.textContent = text;
      metaEl.appendChild(s);
    }
    if (item.productLabel) metaChip(item.productLabel);
    if (item.status) metaChip(item.status);
    if (item.ownership) metaChip("归属 " + item.ownership);
    if (item.quickWin) metaChip(state.data.meta.quickWin.label || "Quick win");
    if ((item.confidence || "") === "low") metaChip("成本信心低");
    if (locked) {
      var pin = document.createElement("span");
      pin.className = "pin-flag";
      pin.textContent = "已固定，可滚动查看；关闭或 Escape 可收起";
      metaEl.appendChild(pin);
    }
    var body = bodyEl;
    clear(body);
    addKv(body, "原描述", item.description || "—");
    addKv(body, "合并来源", item.sources && item.sources.length ? item.sources : null, true);
    if (item.mergedFrom && item.mergedFrom.length) addKv(body, "合并自", item.mergedFrom.join("、"));
    addKv(body, "原状态", (item.originalStatuses && item.originalStatuses.length) ? item.originalStatuses.join("、") : (item.status || "—"));
    addKv(body, "开发成本（AI 相对初评）", String(item.cost) + (item.costRationale ? "。" + item.costRationale : "。评分不是工时或排期承诺。"));
    addKv(body, "优先级（AI 相对初评）", String(item.priority) + (item.priorityRationale ? "。" + item.priorityRationale : "。评分不是工时或排期承诺。"));
    addKv(body, "置信度", item.confidence || "—");
    var freqLabel = item.frequencyUnknown
      ? (state.data.meta.frequency.unknownLabel + (item.frequencyEvidence ? "。" + item.frequencyEvidence : "。没有足以计价气泡大小的频次证据。"))
      : (String(item.frequency) + (item.frequencyEvidence ? "。" + item.frequencyEvidence : ""));
    addKv(body, state.data.meta.frequency.label, freqLabel);
    if (item.notes) addKv(body, "备注", item.notes);
    if (item.layer) addKv(body, "分层", item.layer);
    if (item.ownershipNote) addKv(body, "归属说明", item.ownershipNote);
    if (item.originalPriority) addKv(body, "原优先级（不与推荐值混用）", String(item.originalPriority));
    if (item.remainingScope) addKv(body, "剩余范围", item.remainingScope);
    if (item.excludedCompletedParts) addKv(body, "已关闭的子项", item.excludedCompletedParts);
    if (item.customer) addKv(body, "客户", item.customer);
    if (item.eval) addKv(body, "池结论", item.eval);
    addKv(body, "旧版坐标（保留对照）", "成本 " + item.cost + " / 优先级 " + item.priority);
    addKv(body, "原池或 Linear 优先级", item.originalPriority == null || item.originalPriority === "" ? "源数据未记录" : String(item.originalPriority));
    if (locked && item.assessment) renderMetricTable(body, item);
  }

  function renderMetricTable(body, item) {
    var a = item.assessment;
    var head = document.createElement("p");
    head.className = "cluster-meta";
    head.textContent = a.plot.explain + "。成本覆盖 " + Math.round(a.cost.coverage * 100) + "%，区间 " + (a.cost.low == null ? "—" : a.cost.low + "–" + a.cost.high) + "。优先级覆盖 " + Math.round(a.priority.coverage * 100) + "%，区间 " + (a.priority.low == null ? "—" : a.priority.low + "–" + a.priority.high) + "。";
    body.appendChild(head);
    var table = document.createElement("table");
    table.className = "metric-table";
    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    ["指标", "得分", "权重", "贡献", "依据"].forEach(function (label) {
      var th = document.createElement("th");
      th.textContent = label;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tb = document.createElement("tbody");
    a.metrics.forEach(function (m) {
      var tr = document.createElement("tr");
      var name = document.createElement("td");
      name.textContent = m.label;
      var score = document.createElement("td");
      var sel = document.createElement("select");
      sel.setAttribute("aria-label", m.label + " 个人评分");
      var blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "待确认";
      sel.appendChild(blank);
      [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].forEach(function (n) {
        var opt = document.createElement("option");
        opt.value = String(n);
        opt.textContent = Number.isInteger(n) ? String(n) : n.toFixed(1);
        sel.appendChild(opt);
      });
      sel.value = m.score == null ? "" : String(m.score);
      sel.addEventListener("change", function () {
        if (!state.overrides[item.id]) state.overrides[item.id] = {};
        if (sel.value === "") delete state.overrides[item.id][m.id];
        else state.overrides[item.id][m.id] = Number(sel.value);
        saveStore();
        renderAll();
        var again = itemById(item.id);
        if (again) openItem(again, true, null);
      });
      score.appendChild(sel);
      var kind = document.createElement("div");
      kind.textContent = (m.kind === "personal" ? "个人评估" : m.kind === "fact" ? "事实" : m.kind === "estimate" ? "AI 初评" : "待确认") + " · 置信 " + (m.confidence === "none" ? "无" : m.confidence);
      score.appendChild(kind);
      var w = document.createElement("td");
      w.textContent = Math.round(m.weight * 100) + "%";
      var c = document.createElement("td");
      c.textContent = m.contribution == null ? "—" : String(m.contribution);
      var ev = document.createElement("td");
      ev.textContent = m.quote || m.reason || "—";
      tr.appendChild(name);
      tr.appendChild(score);
      tr.appendChild(w);
      tr.appendChild(c);
      tr.appendChild(ev);
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    body.appendChild(table);
    if (item.sources && item.sources.length) {
      var src = document.createElement("p");
      src.className = "cluster-meta";
      item.sources.forEach(function (s, i) {
        if (i) src.appendChild(document.createTextNode(" · "));
        if (s.url) {
          var link = document.createElement("a");
          link.href = s.url;
          link.target = "_blank";
          link.rel = "noreferrer";
          link.textContent = s.label || s.id || s.url;
          src.appendChild(link);
        } else {
          src.appendChild(document.createTextNode(s.label || s.id || "来源"));
        }
      });
      body.appendChild(src);
    }
  }

  function fillItemFloat(item) {
    fillItemInto(els.floatTitle, els.floatMeta, els.floatBody, item, false);
  }

  function fillInspectorItem(item) {
    if (!els.inspectorBody) {
      fillItemFloat(item);
      return;
    }
    if (els.inspectorClose) els.inspectorClose.hidden = false;
    if (els.inspectorTools) els.inspectorTools.hidden = true;
    setText(els.inspectorSub, "条目详情已固定。坐标仍是 AI 相对初评，不是工时。");
    fillItemInto(els.inspectorTitle, els.inspectorMeta || els.floatMeta, els.inspectorBody, item, true);
  }

  function fillAuditFloat(item) {
    setText(els.floatTitle, item.title);
    clear(els.floatMeta);
    function metaChip(text) {
      var s = document.createElement("span");
      s.textContent = text;
      els.floatMeta.appendChild(s);
    }
    if (item.productLabel || item.product) metaChip(item.productLabel || item.product);
    if (item.status) metaChip(item.status);
    if (item.ownership) metaChip("归属 " + item.ownership);
    if (item.eval) metaChip(item.eval);
    if (state.pinnedLocked) {
      var pin = document.createElement("span");
      pin.className = "pin-flag";
      pin.textContent = "已固定，可滚动查看；再点空白或关闭按钮可收起";
      els.floatMeta.appendChild(pin);
    }
    var body = els.floatBody;
    clear(body);
    addKv(body, "原描述", item.description || "—");
    addKv(body, "来源", item.sources && item.sources.length ? item.sources : null, true);
    addKv(body, "原状态", item.status || "—");
    addKv(body, "为何未进入默认气泡", item.reason || (item.missing && item.missing.length ? "缺少：" + item.missing.join("、") : "—"));
    if (item.customer) addKv(body, "客户", item.customer);
    if (item.eval) addKv(body, "池结论", item.eval);
    if (item.appliedAt) addKv(body, "提出时间", item.appliedAt);
    if (item.scope) addKv(body, "纳入范围依据", item.scope);
    if (item.evidence) addKv(body, "证据", item.evidence);
    addKv(body, "成本 / 优先级", "本条没有用于画图的成本或优先级初评，因此不在气泡图上。");
  }

  function clusterItems(ids) {
    return ids.map(itemById).filter(Boolean).filter(function (it) {
      if (!state.clusterProduct) return true;
      return it.product === state.clusterProduct;
    });
  }

  function fillClusterInspector(ids) {
    var all = ids.map(itemById).filter(Boolean);
    var first = all[0];
    var coord = first ? ("成本 " + first.cost + " / 优先级 " + first.priority) : "";
    setText(els.inspectorTitle, "重叠 " + ids.length + " 条");
    setText(els.inspectorSub, coord + "。聚集不是更高分数。点一条查看详情；展开散开只为辨认。");
    if (els.inspectorClose) els.inspectorClose.hidden = false;
    if (els.inspectorTools) els.inspectorTools.hidden = false;
    if (els.inspectorMeta) {
      clear(els.inspectorMeta);
      var s = document.createElement("span");
      s.textContent = coord + " · 未改坐标";
      els.inspectorMeta.appendChild(s);
    }
    if (els.clusterProduct) {
      var products = [];
      var seen = Object.create(null);
      all.forEach(function (it) {
        if (!it.product || seen[it.product]) return;
        seen[it.product] = true;
        products.push({ id: it.product, label: (it.productLabel || it.product) });
      });
      fillSelect(els.clusterProduct, products, "全部产品", state.clusterProduct);
    }
    var items = clusterItems(ids);
    var shown = items.slice(0, state.clusterLimit);
    clear(els.inspectorBody);
    var p = document.createElement("p");
    p.className = "cluster-meta";
    p.textContent = "列出 " + shown.length + " / " + items.length + (state.clusterProduct ? "（已按产品筛选）" : "");
    els.inspectorBody.appendChild(p);
    var ul = document.createElement("ul");
    ul.className = "cluster-list";
    shown.forEach(function (it) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = it.title + " · " + (it.productLabel || "") + " · 频次 " + (it.frequencyUnknown ? "未知" : it.frequency);
      btn.addEventListener("click", function () {
        openItem(it, true, null);
        highlightRow(it.id);
      });
      li.appendChild(btn);
      ul.appendChild(li);
    });
    els.inspectorBody.appendChild(ul);
    if (shown.length < items.length) {
      var more = document.createElement("button");
      more.type = "button";
      more.className = "btn list-more";
      more.textContent = "继续列出（" + shown.length + " / " + items.length + "）";
      more.addEventListener("click", function () {
        state.clusterLimit += 40;
        fillClusterInspector(ids);
      });
      els.inspectorBody.appendChild(more);
    }
  }

  function fillClusterFloat(ids) {
    if (els.inspectorBody) {
      fillClusterInspector(ids);
      return;
    }
    setText(els.floatTitle, "重叠 " + ids.length + " 条需求");
    clear(els.floatMeta);
    var s = document.createElement("span");
    s.textContent = "这些主题落在同一成本与优先级档，聚集并不代表更高成本或更高优先级。";
    els.floatMeta.appendChild(s);
    var body = els.floatBody;
    clear(body);
    var ul = document.createElement("ul");
    ul.className = "cluster-list";
    ids.forEach(function (id) {
      var it = itemById(id);
      if (!it) return;
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = it.title + " · " + (it.productLabel || "");
      btn.addEventListener("click", function () {
        openItem(it, true, null);
        highlightRow(it.id);
      });
      li.appendChild(btn);
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  function openItem(item, lock, ev) {
    state.pinned = { type: "item", id: item.id };
    state.pinnedLocked = !!lock;
    if (lock && item.cost != null && item.priority != null) {
      state.expandedCell = Core.cellKey(item.cost, item.priority);
    }
    if (lock) {
      hideHoverFloat();
      fillInspectorItem(item);
    } else {
      fillItemFloat(item);
      var x = ev && ev.clientX != null ? ev.clientX : window.innerWidth - 24;
      var y = ev && ev.clientY != null ? ev.clientY : 120;
      placeFloat(x, y);
    }
    renderChart();
    highlightRow(item.id);
  }

  function openCluster(ids, lock, ev, cellKey) {
    state.pinned = { type: "cluster", ids: ids };
    state.pinnedLocked = !!lock;
    state.clusterProduct = "";
    state.clusterLimit = 40;
    if (cellKey) state.expandedCell = cellKey;
    else if (ids && ids[0]) {
      var first = itemById(ids[0]);
      if (first) state.expandedCell = Core.cellKey(first.cost, first.priority);
    }
    hideHoverFloat();
    fillClusterFloat(ids);
    if (!els.inspectorBody) placeFloat(ev ? ev.clientX : 80, ev ? ev.clientY : 80);
    renderChart();
  }

  function cssEscape(id) {
    if (window.CSS && CSS.escape) return CSS.escape(id);
    return String(id).replace(/"/g, '\\"');
  }

  function highlightRow(id) {
    var rows = els.tableItems.querySelectorAll("tbody tr");
    rows.forEach(function (row) {
      if (row.dataset.id === id) {
        row.classList.add("is-active");
        var box = els.tableItems.getBoundingClientRect();
        if (row.scrollIntoView && box.top >= 0 && box.bottom <= window.innerHeight) {
          row.scrollIntoView({ block: "nearest" });
        }
      } else row.classList.remove("is-active");
    });
  }

  /* ---------- events ---------- */
  function bind() {
    els.query.addEventListener("input", function () {
      state.filters.query = els.query.value;
      state.listLimit = 40;
      renderInteractive();
    });
    els.product.addEventListener("change", function () {
      state.filters.productSelect = els.product.value || "";
      state.listLimit = 40;
      renderInteractive();
    });
    els.status.addEventListener("change", function () {
      state.filters.status = els.status.value || "";
      renderInteractive();
    });
    els.ownership.addEventListener("change", function () {
      state.filters.ownership = els.ownership.value || "";
      renderInteractive();
    });
    if (els.quickwin) {
      els.quickwin.addEventListener("change", function () {
        state.filters.quickWinOnly = els.quickwin.checked;
        if (els.quickwin.checked) state.filters.viewMode = "quickwin";
        renderInteractive();
      });
    }
    if (els.viewAll) els.viewAll.addEventListener("click", function () { setViewMode("all"); });
    if (els.viewAdvancing) els.viewAdvancing.addEventListener("click", function () { setViewMode("advancing"); });
    if (els.viewQuickwin) els.viewQuickwin.addEventListener("click", function () { setViewMode("quickwin"); });
    if (els.layer) {
      els.layer.addEventListener("change", function () {
        state.filters.layer = els.layer.value || "";
        renderInteractive();
      });
    }
    els.btnJson.addEventListener("click", function () { download("json"); });
    els.btnCsv.addEventListener("click", function () { download("csv"); });
    els.zoomIn.addEventListener("click", function () { zoomBy(1.25, null); });
    els.zoomOut.addEventListener("click", function () { zoomBy(1 / 1.25, null); });
    els.zoomReset.addEventListener("click", function () {
      state.camera = { k: 1, x: 0, y: 0 };
      renderChart();
    });
    els.chart.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      var factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomBy(factor, ev);
    }, { passive: false });

    var dragging = null;
    els.chart.addEventListener("pointerdown", function (ev) {
      if (ev.target.closest && (ev.target.closest(".bubble") || ev.target.closest(".cell-count") || ev.target.closest(".cluster"))) return;
      dragging = { x: ev.clientX, y: ev.clientY, cx: state.camera.x, cy: state.camera.y, id: ev.pointerId };
      els.chart.setPointerCapture(ev.pointerId);
    });
    els.chart.addEventListener("pointermove", function (ev) {
      if (!dragging || dragging.id !== ev.pointerId) return;
      state.camera.x = dragging.cx + (ev.clientX - dragging.x);
      state.camera.y = dragging.cy + (ev.clientY - dragging.y);
      renderChart();
    });
    els.chart.addEventListener("pointerup", function () { dragging = null; });
    els.chart.addEventListener("pointerleave", function () { dragging = null; });

    var hideTimer = null;
    function cancelHide() {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    }
    function scheduleHide() {
      if (state.pinnedLocked) return;
      cancelHide();
      hideTimer = setTimeout(function () {
        if (!state.pinnedLocked) hideFloatAndRefresh();
      }, 600);
    }
    els.chart.addEventListener("pointerover", function (ev) {
      var bubble = ev.target.closest && ev.target.closest(".bubble");
      if (!bubble || state.pinnedLocked) return;
      var item = itemById(bubble.getAttribute("data-id"));
      if (!item) return;
      cancelHide();
      state.hoverId = item.id;
      openItem(item, false, ev);
    });
    els.chart.addEventListener("pointerleave", function (ev) {
      if (els.float.contains(ev.relatedTarget)) {
        cancelHide();
        return;
      }
      scheduleHide();
    });
    els.float.addEventListener("pointerenter", cancelHide);
    els.float.addEventListener("pointerleave", function (ev) {
      if (state.pinnedLocked) return;
      if (els.chart.contains(ev.relatedTarget)) return;
      scheduleHide();
    });
    els.float.addEventListener("click", function () {
      if (state.pinned && !state.pinnedLocked && state.pinned.type === "item") {
        var hoverItem = itemById(state.pinned.id);
        if (hoverItem) openItem(hoverItem, true, null);
      }
    });
    els.chart.addEventListener("click", function (ev) {
      var cluster = ev.target.closest && (ev.target.closest(".cell-count") || ev.target.closest(".cluster"));
      if (cluster) {
        ev.stopPropagation();
        var ids = (cluster.getAttribute("data-ids") || "").split(",").filter(Boolean);
        openCluster(ids, true, ev, cluster.getAttribute("data-cell"));
        return;
      }
      var bubble = ev.target.closest && ev.target.closest(".bubble");
      if (bubble) {
        ev.stopPropagation();
        var item = itemById(bubble.getAttribute("data-id"));
        if (item) openItem(item, true, ev);
      }
    });
    els.chart.addEventListener("keydown", function (ev) {
      var bubble = ev.target.closest && ev.target.closest(".bubble");
      var cluster = ev.target.closest && (ev.target.closest(".cell-count") || ev.target.closest(".cluster"));
      if ((ev.key === "Enter" || ev.key === " ") && (bubble || cluster)) {
        ev.preventDefault();
        if (cluster) {
          var ids = (cluster.getAttribute("data-ids") || "").split(",").filter(Boolean);
          openCluster(ids, true, null, cluster.getAttribute("data-cell"));
        } else {
          var item = itemById(bubble.getAttribute("data-id"));
          if (item) openItem(item, true, null);
        }
      }
    });

    function bindItemTable(table) {
      if (!table) return;
      table.addEventListener("click", function (ev) {
        var tr = ev.target.closest("tr[data-id]");
        if (!tr) return;
        var item = itemById(tr.dataset.id);
        if (item) openItem(item, true, ev);
      });
      table.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        var tr = ev.target.closest("tr[data-id]");
        if (!tr) return;
        ev.preventDefault();
        var item = itemById(tr.dataset.id);
        if (item) openItem(item, true, null);
      });
    }
    function openAudit(item, ev) {
      state.pinned = { type: "audit", id: item.id };
      state.pinnedLocked = true;
      fillAuditFloat(item);
      var x = ev && ev.clientX != null ? ev.clientX : window.innerWidth - 24;
      var y = ev && ev.clientY != null ? ev.clientY : 120;
      placeFloat(x, y);
    }
    function bindAuditTable(table) {
      if (!table) return;
      table.addEventListener("click", function (ev) {
        var tr = ev.target.closest("tr[data-audit-id], tr[data-id]");
        if (!tr) return;
        var id = tr.dataset.auditId || tr.dataset.id;
        var item = itemById(id) || auditById(id);
        if (!item) return;
        if (item.cost != null && item.priority != null) openItem(item, true, ev);
        else openAudit(item, ev);
      });
    }
    bindItemTable(els.tableItems);
    bindItemTable(els.tableUnplotted);
    bindAuditTable(els.tableUnscored);
    bindAuditTable(els.tableDeferred);
    bindAuditTable(els.tableSupported);
    bindAuditTable(els.tableDuplicate);
    bindAuditTable(els.tableExcluded);

    els.floatClose.addEventListener("click", hideFloatAndRefresh);
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") hideFloatAndRefresh();
    });
    document.addEventListener("click", function (ev) {
      if (!state.pinnedLocked) return;
      if (els.float && els.float.contains(ev.target)) return;
      if (els.inspector && els.inspector.contains(ev.target)) return;
      if (ev.target.closest && (ev.target.closest(".bubble") || ev.target.closest(".cell-count") || ev.target.closest(".cluster") || ev.target.closest("tr[data-id]") || ev.target.closest("tr[data-audit-id]") || ev.target.closest(".qw-card") || ev.target.closest(".list-more") || ev.target.closest("details"))) return;
      hideFloatAndRefresh();
    });

    if (els.inspectorClose) els.inspectorClose.addEventListener("click", hideFloatAndRefresh);
    if (els.listMore) {
      els.listMore.addEventListener("click", function () {
        state.listLimit += 40;
        renderItemsTable();
      });
    }
    if (els.clusterProduct) {
      els.clusterProduct.addEventListener("change", function () {
        state.clusterProduct = els.clusterProduct.value || "";
        state.clusterLimit = 40;
        if (state.pinned && state.pinned.type === "cluster") fillClusterInspector(state.pinned.ids);
      });
    }

    window.addEventListener("resize", function () {
      renderChart();
    });
  }

  function hideFloatAndRefresh() {
    hideFloat();
    renderChart();
    highlightRow("");
  }

  function zoomBy(factor, ev) {
    var next = Math.max(1, Math.min(6, state.camera.k * factor));
    if (next === 1 && factor < 1) {
      state.camera = { k: 1, x: 0, y: 0 };
      renderChart();
      return;
    }
    state.camera.k = next;
    renderChart();
  }

  function download(kind) {
    if (!state.data || state.data.awaiting) return;
    var name = "priority-portfolio";
    var stamp = state.data.meta.generatedAt ? state.data.meta.generatedAt.slice(0, 10) : "export";
    var blob, filename;
    if (kind === "json") {
      var payload = state.raw && !Core.awaiting(state.raw) ? state.raw : {
        meta: state.data.meta,
        products: state.data.products,
        items: state.data.items,
        excludedCompleted: state.data.excludedCompleted,
        unscored: state.data.unscored
      };
      blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      filename = name + "-" + stamp + ".json";
    } else {
      blob = new Blob([Core.toCSV(state.data)], { type: "text/csv;charset=utf-8" });
      filename = name + "-" + stamp + ".csv";
    }
    var a = document.createElement("a");
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function productFilterForLists() {
    var f = currentFilters();
    return f.products;
  }

  function renderUnplottedTable() {
    var table = els.tableUnplotted;
    if (!table) return;
    var rows = Core.applyFilters(state.data.unplottedThemes || [], currentFilters());
    if (state.data.awaiting) {
      emptyRow(table, 6, "等待数据集注入。");
      return;
    }
    if (els.unplottedSub) {
      setText(els.unplottedSub, "本表 " + rows.length + " / 否决主题 " + (state.data.unplottedThemes || []).length + " 条。它们不进入气泡图，始终单独列出。");
    }
    if (!rows.length) {
      emptyRow(table, 6, (state.data.unplottedThemes || []).length ? "当前筛选下没有此类主题。" : "没有已评分却未画图的主题。");
      return;
    }
    var tb = table.tBodies[0];
    clear(tb);
    var frag = document.createDocumentFragment();
    rows.forEach(function (it) {
      var tr = document.createElement("tr");
      tr.tabIndex = 0;
      tr.dataset.id = it.id;
      appendTitleCell(tr, it, "需求");
      td(tr, it.productLabel || it.product, "product", "产品");
      td(tr, it.layer || "—", "", "分层");
      td(tr, it.status, "", "状态");
      td(tr, it.cost, "num", "成本");
      td(tr, it.priority, "num", "优先级");
      frag.appendChild(tr);
    });
    tb.appendChild(frag);
  }

  function renderAll() {
    reassess();
    renderMeta();
    renderFilterControls();
    renderInteractive();
  }

  function renderInteractive() {
    renderCounts();
    renderLegend();
    renderChart();
    renderItemsTable();
    renderUnplottedTable();
    var qfilters = currentFilters();
    if (els.tableSupported) {
      renderAuditTable(
        els.tableSupported,
        Core.applyFilters(state.data.alreadySupported || [], { query: qfilters.query, products: productFilterForLists(), status: qfilters.status, ownership: qfilters.ownership }),
        (state.data.alreadySupported || []).length ? "当前搜索下没有现有支持记录。" : "没有现有支持记录。",
        "原因"
      );
    }
    if (els.tableDuplicate) {
      renderAuditTable(
        els.tableDuplicate,
        Core.applyFilters(state.data.duplicateUnmapped || [], { query: qfilters.query, products: productFilterForLists(), status: qfilters.status, ownership: qfilters.ownership }),
        (state.data.duplicateUnmapped || []).length ? "当前搜索下没有未映射的重复记录。" : "没有未映射的重复记录。",
        "原因"
      );
    }
    if (els.sectionUnscored) {
      els.sectionUnscored.hidden = !(state.data.unscored && state.data.unscored.length);
    }
    if (els.sectionDeferred) {
      els.sectionDeferred.hidden = !(state.data.deferred && state.data.deferred.length);
    }
    renderAuditTable(
      els.tableUnscored,
      Core.applyFilters(state.data.unscored || [], { query: qfilters.query, products: productFilterForLists(), status: qfilters.status, ownership: qfilters.ownership }),
      state.data.unscored && state.data.unscored.length ? "当前搜索下没有未匹配记录。完整待评估清单仍在，请清空搜索。" : "没有未匹配待评估条目。",
      "缺什么 / 原因"
    );
    if (els.tableDeferred) {
      renderAuditTable(
        els.tableDeferred,
        Core.applyFilters(state.data.deferred || [], { query: qfilters.query, products: productFilterForLists(), status: qfilters.status, ownership: qfilters.ownership }),
        (state.data.deferred && state.data.deferred.length) ? "当前搜索下没有暂缓/否决记录。完整清单仍在，请清空搜索。" : "没有暂缓或否决分层记录。",
        "原因"
      );
    }
    renderAuditTable(
      els.tableExcluded,
      Core.applyFilters(state.data.excludedCompleted || [], { query: qfilters.query, products: productFilterForLists(), status: qfilters.status, ownership: qfilters.ownership }),
      state.data.excludedCompleted && state.data.excludedCompleted.length ? "当前搜索下没有排除记录。审计清单仍在，请清空搜索。" : "没有记入“已完成开发排除”的条目。",
      "排除原因"
    );
    if (els.unscoredSub) {
      var uhit = Core.applyFilters(state.data.unscored || [], { query: qfilters.query, products: productFilterForLists(), status: qfilters.status, ownership: qfilters.ownership }).length;
      setText(els.unscoredSub, "本表显示 " + uhit + " / 未匹配全集 " + (state.data.unscored || []).length + " 条。这些记录没有成本或优先级，不能画进气泡图。数据稿阶段仍在逐条整理，不可遗漏。");
    }
    if (els.deferredSub) {
      var dhit = Core.applyFilters(state.data.deferred || [], { query: qfilters.query, products: productFilterForLists(), status: qfilters.status, ownership: qfilters.ownership }).length;
      setText(els.deferredSub, "本表显示 " + dhit + " / 分层全集 " + (state.data.deferred || []).length + " 条。");
    }
    if (state.pinned && state.pinned.type === "item" && !itemById(state.pinned.id)) hideFloat();
  }

  ready(function () {
    els.title = $("page-title");
    els.lede = $("page-lede");
    els.stale = $("stale-notice");
    els.btnJson = $("btn-json");
    els.btnCsv = $("btn-csv");
    els.query = $("filter-query");
    els.product = $("filter-product");
    els.status = $("filter-status");
    els.ownership = $("filter-ownership");
    els.quickwin = $("filter-quickwin");
    els.viewAll = $("view-all");
    els.viewAdvancing = $("view-advancing");
    els.viewQuickwin = $("view-quickwin");
    els.chartCount = $("chart-count");
    els.kpiAdvancing = $("kpi-advancing");
    els.kpiRejected = $("kpi-rejected");
    els.kpiCoverage = $("kpi-coverage");
    els.kpiCoverageNote = $("kpi-coverage-note");
    els.tableSupported = $("table-supported");
    els.tableDuplicate = $("table-duplicate");
    els.sectionUnscored = $("section-unscored");
    els.sectionDeferred = $("section-deferred");
    els.caption = $("scope-caption");
    els.kpiEvaluable = $("kpi-evaluable");
    els.kpiQuick = $("kpi-quickwin");
    els.kpiQuickNote = $("kpi-quickwin-note");
    els.kpiVisibleNote = $("kpi-visible-note");
    els.kpiExcluded = $("kpi-excluded");
    els.kpiUnscored = $("kpi-unscored");
    els.kpiDeferred = $("kpi-deferred");
    els.layer = $("filter-layer");
    els.tableUnplotted = $("table-unplotted");
    els.tableDeferred = $("table-deferred");
    els.unscoredSub = $("unscored-sub");
    els.deferredSub = $("deferred-sub");
    els.unplottedSub = $("unplotted-sub");
    els.chart = $("chart");
    els.chartEmpty = $("chart-empty");
    els.legend = $("legend");
    els.zoomIn = $("zoom-in");
    els.zoomOut = $("zoom-out");
    els.zoomReset = $("zoom-reset");
    els.tableItems = $("table-items");
    els.tableExcluded = $("table-excluded");
    els.tableUnscored = $("table-unscored");
    els.listSub = $("list-sub");
    els.float = $("float");
    els.floatTitle = $("float-title");
    els.floatMeta = $("float-meta");
    els.floatBody = $("float-body");
    els.floatClose = $("float-close");
    els.qwStrip = $("qw-strip");
    els.qwList = $("qw-list");
    els.qwRule = $("qw-rule");
    els.inspector = $("inspector");
    els.inspectorTitle = $("inspector-title");
    els.inspectorSub = $("inspector-sub");
    els.inspectorMeta = $("inspector-meta");
    els.inspectorBody = $("inspector-body");
    els.inspectorClose = $("inspector-close");
    els.inspectorTools = $("inspector-tools");
    els.clusterProduct = $("cluster-product");
    els.listMore = $("list-more");
    els.countUnplotted = $("count-unplotted");
    els.countSupported = $("count-supported");
    els.countDuplicate = $("count-duplicate");
    els.countUnscored = $("count-unscored");
    els.countDeferred = $("count-deferred");
    els.countExcluded = $("count-excluded");
    els.weightCost = $("weight-cost");
    els.weightPriority = $("weight-priority");
    els.weightFormula = $("weight-formula");
    els.weightReadout = $("weight-readout");
    state.weights = Score.cloneWeights(Score.DEFAULT_WEIGHTS);
    loadStore();
    buildWeightControls();
    if ($("weight-reset")) $("weight-reset").addEventListener("click", function () {
      state.weights = Score.cloneWeights(Score.DEFAULT_WEIGHTS);
      syncWeightInputs();
      saveStore();
      renderAll();
    });
    if ($("override-reset")) $("override-reset").addEventListener("click", function () {
      state.overrides = {};
      saveStore();
      renderAll();
    });
    if ($("btn-export-assessment")) $("btn-export-assessment").addEventListener("click", function () {
      var payload = {
        kind: "priority-portfolio-personal-assessment",
        note: "个人评估，不会写回飞书或 Linear",
        exportedAt: new Date().toISOString(),
        weights: state.weights,
        overrides: state.overrides
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "priority-portfolio-assessment.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    var importer = $("btn-import-assessment");
    if (importer) importer.addEventListener("change", function () {
      var file = importer.files && importer.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var raw = JSON.parse(String(reader.result || ""));
          if (raw.weights) state.weights = Score.cloneWeights(raw.weights);
          if (raw.overrides && typeof raw.overrides === "object") state.overrides = raw.overrides;
          syncWeightInputs();
          saveStore();
          renderAll();
        } catch (e) { /* 无效 JSON 不改当前评估 */ }
      };
      reader.readAsText(file);
    });
    bind();
    loadDataset();
  });
})();
