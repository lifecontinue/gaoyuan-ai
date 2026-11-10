/* 需求优先组合：纯函数核心，无 DOM、无网络。浏览器与 Node 均可引用。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PortfolioCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_PRODUCT_COLORS = [
    { key: "光谱", color: "#0B1F3A", labelColor: "#0B1F3A" },
    { key: "调查", color: "#1F6B5C", labelColor: "#1F6B5C" },
    { key: "评估", color: "#8C4A1F", labelColor: "#8C4A1F" },
    { key: "竞赛", color: "#2C5F2D", labelColor: "#2C5F2D" },
    { key: "积分", color: "#8A4B0F", labelColor: "#8A4B0F" },
    { key: "商城", color: "#4A5568", labelColor: "#4A5568" },
    { key: "运营", color: "#6B3A4A", labelColor: "#6B3A4A" },
    { key: "开放平台", color: "#3D5A80", labelColor: "#3D5A80" },
    { key: "AI课堂", color: "#3F5D4A", labelColor: "#3F5D4A" },
    { key: "其他", color: "#5C5C5C", labelColor: "#5C5C5C" }
  ];

  var FALLBACK_COLORS = [
    "#0B1F3A",
    "#1F6B5C",
    "#8C4A1F",
    "#2C5F2D",
    "#8A4B0F",
    "#4A5568",
    "#6B3A4A",
    "#3D5A80",
    "#3F5D4A",
    "#5C5C5C"
  ];

  function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function text(v, fallback) {
    if (v === null || v === undefined) return fallback || "";
    return String(v);
  }

  function trim(v) {
    return text(v).trim();
  }

  function numOrNull(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number" && isFinite(v)) return v;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  function awaiting(raw) {
    if (!raw || !isPlainObject(raw)) return true;
    if (raw.meta && raw.meta.status === "awaiting-dataset") return true;
    var has =
      asArray(raw.items).length +
      asArray(raw.excludedCompleted).length +
      asArray(raw.unscored).length;
    return has === 0 && asArray(raw.products).length === 0;
  }

  function scaleFrom(raw, fallbackLabel) {
    var s = isPlainObject(raw) ? raw : {};
    var min = numOrNull(s.min);
    var max = numOrNull(s.max);
    if (min === null) min = 1;
    if (max === null) max = 5;
    if (max <= min) max = min + 4;
    return {
      min: min,
      max: max,
      label: trim(s.label) || fallbackLabel,
      unit: trim(s.unit) || "AI相对初评",
      disclaimer: trim(s.disclaimer) || "坐标为 AI 相对初评（1–5），不是工时或排期承诺。"
    };
  }

  function defaultMeta() {
    return {
      status: "awaiting-dataset",
      title: "未完成需求优先组合",
      owner: "高源",
      generatedAt: null,
      timezone: "Asia/Shanghai",
      sourceNote: "",
      costScale: scaleFrom(null, "开发成本"),
      priorityScale: scaleFrom(null, "优先级"),
      quickWin: { costMax: 2, priorityMin: 4, label: "Quick win" },
      frequency: { label: "反馈频次", unknownLabel: "频次未知" }
    };
  }

  function normalizeMeta(raw) {
    var base = defaultMeta();
    var m = isPlainObject(raw) ? raw : {};
    var qw = isPlainObject(m.quickWin) ? m.quickWin : {};
    var freq = isPlainObject(m.frequency) ? m.frequency : {};
    var costMax = numOrNull(qw.costMax);
    var priorityMin = numOrNull(qw.priorityMin);
    return {
      status: trim(m.status) || (awaiting({ meta: m, items: [1] }) ? "ready" : base.status),
      title: trim(m.title) || base.title,
      owner: trim(m.owner) || base.owner,
      generatedAt: m.generatedAt ? text(m.generatedAt) : null,
      timezone: trim(m.timezone) || base.timezone,
      sourceNote: trim(m.sourceNote),
      costScale: scaleFrom(m.costScale, "开发成本"),
      priorityScale: scaleFrom(m.priorityScale, "优先级"),
      quickWin: {
        costMax: costMax === null ? 2 : costMax,
        priorityMin: priorityMin === null ? 4 : priorityMin,
        label: trim(qw.label) || "Quick win"
      },
      frequency: {
        label: trim(freq.label) || "反馈频次",
        unknownLabel: trim(freq.unknownLabel) || "频次未知"
      },
      stale: !!m.stale,
      staleNote: trim(m.staleNote),
      draft: !!m.draft,
      priorityMethod: trim(m.priorityMethod),
      costMethod: trim(m.costMethod),
      inaccessibleNote: trim(m.inaccessibleNote),
      stats: isPlainObject(m.stats) ? m.stats : null,
      sourceStamp: isPlainObject(m.sourceStamp) ? m.sourceStamp : null,
      coverage: isPlainObject(m.coverage) ? m.coverage : { owned: 0, missing: [] }
    };
  }

  function guessColor(id, label, index) {
    var blob = (label || "") + " " + (id || "");
    for (var i = 0; i < DEFAULT_PRODUCT_COLORS.length; i++) {
      if (blob.indexOf(DEFAULT_PRODUCT_COLORS[i].key) !== -1) {
        return DEFAULT_PRODUCT_COLORS[i].color;
      }
    }
    return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
  }

  function normalizeProducts(list, items) {
    var seen = Object.create(null);
    var out = [];
    asArray(list).forEach(function (p, i) {
      if (!isPlainObject(p) && typeof p !== "string") return;
      var id = typeof p === "string" ? p : trim(p.id) || trim(p.key) || trim(p.label);
      var label = typeof p === "string" ? p : trim(p.label) || id;
      if (!id) return;
      if (seen[id]) return;
      seen[id] = true;
      var color = typeof p === "string" ? "" : trim(p.color);
      out.push({
        id: id,
        label: label || id,
        color: color || guessColor(id, label, i)
      });
    });
    asArray(items).forEach(function (it) {
      var pid = isPlainObject(it) ? trim(it.product) || trim(it.productId) : "";
      var plabel = isPlainObject(it) ? trim(it.productLabel) || pid : pid;
      if (!pid || seen[pid]) return;
      seen[pid] = true;
      out.push({
        id: pid,
        label: plabel || pid,
        color: guessColor(pid, plabel, out.length)
      });
    });
    return out;
  }

  function normalizeSources(raw) {
    return asArray(raw)
      .map(function (s) {
        if (typeof s === "string") {
          return { type: "", id: "", label: s, url: /^https?:\/\//i.test(s) ? s : "" };
        }
        if (!isPlainObject(s)) return null;
        var url = trim(s.url);
        if (url && !/^https?:\/\//i.test(url)) url = "";
        return {
          type: trim(s.type),
          id: trim(s.id),
          label: trim(s.label) || trim(s.id) || trim(s.type) || (url || "来源"),
          url: url
        };
      })
      .filter(Boolean);
  }

  function normalizeStatuses(raw, fallback) {
    if (Array.isArray(raw)) return raw.map(function (s) { return trim(s); }).filter(Boolean);
    if (raw) return [trim(raw)];
    if (fallback) return [trim(fallback)];
    return [];
  }

  function isQuickWin(cost, priority, rules) {
    if (cost === null || priority === null) return false;
    var r = rules || { costMax: 2, priorityMin: 4 };
    return cost <= r.costMax && priority >= r.priorityMin;
  }

  function frequencyOf(raw) {
    if (!isPlainObject(raw)) return { value: null, unknown: true, evidence: "" };
    var unknownFlag = raw.frequencyUnknown === true || raw.frequency_unknown === true;
    var value = numOrNull(raw.frequency);
    if (value !== null && value < 0) value = null;
    var unknown = unknownFlag || value === null;
    if (unknown) value = null;
    return {
      value: value,
      unknown: unknown,
      evidence: trim(raw.frequencyEvidence || raw.frequency_evidence)
    };
  }

  function normalizeItem(raw, i, productsById, qw) {
    if (!isPlainObject(raw)) return null;
    var id = trim(raw.id) || ("item-" + (i + 1));
    var productId = trim(raw.product) || trim(raw.productId) || "其他";
    var product = productsById[productId] || {
      id: productId,
      label: trim(raw.productLabel) || productId,
      color: guessColor(productId, raw.productLabel, i)
    };
    var cost = numOrNull(raw.cost);
    var priority = numOrNull(raw.priority);
    var freq = frequencyOf(raw);
    var sources = normalizeSources(raw.sources);
    return {
      id: id,
      title: trim(raw.title) || trim(raw.name) || id,
      description: text(raw.description || raw.detail || raw.body || ""),
      product: product.id,
      productLabel: product.label,
      color: raw.color ? trim(raw.color) : product.color,
      status: trim(raw.status),
      ownership: trim(raw.ownership || raw.owner || raw.assignee),
      cost: cost,
      priority: priority,
      frequency: freq.value,
      frequencyUnknown: freq.unknown,
      frequencyEvidence: freq.evidence,
      quickWin: typeof raw.quickWin === "boolean" ? raw.quickWin : isQuickWin(cost, priority, qw),
      layer: trim(raw.layer),
      plottable: raw.plottable !== false,
      inDefaultChart: raw.inDefaultChart === true,
      inFullChart: raw.inFullChart !== false,
      ownershipKey: trim(raw.ownershipKey),
      ownershipNote: trim(raw.ownershipNote),
      oneLiner: trim(raw.oneLiner),
      remainingScope: trim(raw.remainingScope),
      mergeNote: trim(raw.mergeNote),
      excludedCompletedParts: trim(raw.excludedCompletedParts),
      eval: trim(raw.eval),
      customer: trim(raw.customer),
      appliedAt: trim(raw.appliedAt),
      scope: trim(raw.scope),
      evidence: trim(raw.evidence),
      originalPriority: raw.originalPriority,
      costLabel: trim(raw.costLabel),
      priorityLabel: trim(raw.priorityLabel),
      sources: sources,
      originalStatuses: normalizeStatuses(raw.originalStatuses || raw.originalStatus, raw.status),
      costRationale: trim(raw.costRationale || raw.cost_reason),
      priorityRationale: trim(raw.priorityRationale || raw.priority_reason),
      confidence: trim(raw.confidence),
      mergedFrom: asArray(raw.mergedFrom || raw.merged_from).map(function (x) { return trim(x); }).filter(Boolean),
      notes: trim(raw.notes)
    };
  }

  function productIndex(products) {
    var map = Object.create(null);
    products.forEach(function (p) {
      map[p.id] = p;
    });
    return map;
  }

  function normalizeAuditRow(raw, i, kind) {
    if (!isPlainObject(raw)) return null;
    return {
      id: trim(raw.id) || (kind + "-" + (i + 1)),
      title: trim(raw.title) || trim(raw.name) || trim(raw.id) || (kind + " " + (i + 1)),
      product: trim(raw.product) || trim(raw.productId),
      productLabel: trim(raw.productLabel) || trim(raw.product) || "",
      status: trim(raw.status),
      ownership: trim(raw.ownership || raw.owner),
      reason: trim(raw.reason) || trim(raw.missing && asArray(raw.missing).join("、")),
      missing: asArray(raw.missing).map(function (x) { return trim(x); }).filter(Boolean),
      sources: normalizeSources(raw.sources),
      description: text(raw.description || ""),
      eval: trim(raw.eval),
      customer: trim(raw.customer),
      appliedAt: trim(raw.appliedAt),
      scope: trim(raw.scope),
      evidence: trim(raw.evidence),
      layer: trim(raw.layer)
    };
  }

  function normalize(raw) {
    var empty = !raw || !isPlainObject(raw);
    var meta = normalizeMeta(empty ? null : raw.meta);
    var isWait = empty || raw.meta && raw.meta.status === "awaiting-dataset" || awaiting(raw || {});
    if (isWait) meta.status = "awaiting-dataset";
    else if (meta.status === "awaiting-dataset") meta.status = "ready";

    var itemsRaw = empty ? [] : asArray(raw.items);
    var products = normalizeProducts(empty ? [] : raw.products, itemsRaw);
    var byId = productIndex(products);
    var qw = meta.quickWin;
    var items = itemsRaw.map(function (it, i) { return normalizeItem(it, i, byId, qw); }).filter(Boolean);
    var excludedCompleted = asArray(empty ? [] : raw.excludedCompleted).map(function (it, i) {
      return normalizeAuditRow(it, i, "excluded");
    }).filter(Boolean);
    var unscored = asArray(empty ? [] : raw.unscored).map(function (it, i) {
      return normalizeAuditRow(it, i, "unscored");
    }).filter(Boolean);

    // 可评估项必须同时具备成本和优先级；误放入 items 但缺坐标的，改列入未评分。
    var plotted = [];
    items.forEach(function (it) {
      if (it.cost === null || it.priority === null) {
        unscored.push({
          id: it.id,
          title: it.title,
          product: it.product,
          productLabel: it.productLabel,
          status: it.status,
          ownership: it.ownership,
          reason: "缺少成本或优先级评分，不能进入坐标图",
          missing: [it.cost === null ? "cost" : "", it.priority === null ? "priority" : ""].filter(Boolean),
          sources: it.sources,
          description: it.description
        });
      } else {
        plotted.push(it);
      }
    });

    if (raw && raw.meta && raw.meta.status === "draft") meta.status = "draft";
    if (raw && (raw.meta && (raw.meta.draft || raw.meta.sourceNote))) {
      meta.draft = !!raw.meta.draft || meta.status === "draft";
      if (raw.meta.quickWin && raw.meta.quickWin.rule) meta.quickWin.rule = raw.meta.quickWin.rule;
      if (raw.meta.stats) meta.stats = raw.meta.stats;
      if (raw.meta.sourceStamp) meta.sourceStamp = raw.meta.sourceStamp;
    }
    var unplottedThemes = asArray(empty ? [] : raw.unplottedThemes).map(function (it, i) {
      return normalizeItem(it, i, byId, qw) || normalizeAuditRow(it, i, "unplotted");
    }).filter(Boolean);
    var deferred = asArray(empty ? [] : raw.deferred).map(function (it, i) {
      return normalizeAuditRow(it, i, "deferred");
    }).filter(Boolean);
    var alreadySupported = asArray(empty ? [] : raw.alreadySupported).map(function (it, i) {
      return normalizeAuditRow(it, i, "alreadySupported");
    }).filter(Boolean);
    var duplicateUnmapped = asArray(empty ? [] : raw.duplicateUnmapped).map(function (it, i) {
      return normalizeAuditRow(it, i, "duplicateUnmapped");
    }).filter(Boolean);
    var themes = asArray(empty ? [] : raw.themes).map(function (it, i) {
      return normalizeItem(it, i, byId, qw);
    }).filter(Boolean);
    return {
      meta: meta,
      products: products,
      items: plotted,
      unplottedThemes: unplottedThemes,
      excludedCompleted: excludedCompleted,
      unscored: unscored,
      deferred: deferred,
      alreadySupported: alreadySupported,
      duplicateUnmapped: duplicateUnmapped,
      themes: themes.length ? themes : plotted.concat(unplottedThemes),
      awaiting: meta.status === "awaiting-dataset",
      draft: meta.status === "draft" || !!meta.draft
    };
  }

  function unique(arr) {
    var seen = Object.create(null);
    var out = [];
    arr.forEach(function (v) {
      var k = text(v);
      if (!k || seen[k]) return;
      seen[k] = true;
      out.push(k);
    });
    return out;
  }

  function filterOptions(data) {
    return {
      products: data.products.map(function (p) { return { id: p.id, label: p.label, color: p.color }; }),
      statuses: unique(data.items.map(function (it) { return it.status; }).concat(
        data.excludedCompleted.map(function (it) { return it.status; }),
        data.unscored.map(function (it) { return it.status; })
      )),
      ownerships: unique(data.items.map(function (it) { return it.ownership; }).concat(
        data.excludedCompleted.map(function (it) { return it.ownership; }),
        data.unscored.map(function (it) { return it.ownership; }),
        (data.deferred || []).map(function (it) { return it.ownership; }),
        (data.unplottedThemes || []).map(function (it) { return it.ownership; })
      )),
      layers: unique(data.items.map(function (it) { return it.layer; }).concat(
        (data.unplottedThemes || []).map(function (it) { return it.layer; })
      ))
    };
  }

  function textMatch(item, q) {
    if (!q) return true;
    var hay = [
      item.id,
      item.title,
      item.description,
      item.product,
      item.productLabel,
      item.status,
      item.ownership,
      item.costRationale,
      item.priorityRationale,
      item.frequencyEvidence,
      item.reason,
      item.layer,
      item.eval,
      item.customer,
      item.remainingScope,
      item.mergeNote,
      (item.sources || []).map(function (s) { return s.label + " " + s.id + " " + s.url; }).join(" "),
      (item.mergedFrom || []).join(" "),
      (item.originalStatuses || []).join(" ")
    ].join(" ").toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function passesFilters(item, filters) {
    filters = filters || {};
    var q = trim(filters.query).toLowerCase();
    if (q && !textMatch(item, q)) return false;
    if (filters.products && filters.products.length && filters.products.indexOf(item.product) === -1) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.ownership && item.ownership !== filters.ownership) return false;
    if (filters.quickWinOnly && !item.quickWin) return false;
    if (filters.viewMode === "quickwin" && !item.quickWin) return false;
    if (filters.viewMode === "advancing" && !item.inDefaultChart) return false;
    if (filters.layer && (item.layer || "") !== filters.layer) return false;
    return true;
  }

  function applyFilters(items, filters) {
    return asArray(items).filter(function (it) { return passesFilters(it, filters); });
  }

  function summarize(data, filters, visibleItems) {
    var totalEvaluable = data.items.length;
    var visible = asArray(visibleItems);
    var hiddenByFilter = totalEvaluable - visible.length;
    var parts = [];
    parts.push("图上显示 " + visible.length);
    if (filters && filters.quickWinOnly) parts[0] += "（仅 Quick win）";
    parts.push("可评估 " + totalEvaluable);
    if (hiddenByFilter > 0) parts.push("筛选隐藏了 " + hiddenByFilter + " 条可评估项");
    parts.push("已完成开发排除 " + data.excludedCompleted.length);
    parts.push("未匹配待评估 " + data.unscored.length);
    if (data.deferred) parts.push("暂缓/否决分层 " + data.deferred.length);
    if (data.unplottedThemes) parts.push("已评分未入默认气泡 " + data.unplottedThemes.length);
    var claimingAll = hiddenByFilter === 0 && !(filters && filters.quickWinOnly);
    return {
      visible: visible.length,
      evaluable: totalEvaluable,
      hiddenByFilter: hiddenByFilter,
      excludedCompleted: data.excludedCompleted.length,
      unscored: data.unscored.length,
      deferred: (data.deferred || []).length,
      unplottedThemes: (data.unplottedThemes || []).length,
      themes: (data.themes || []).length,
      quickWinsVisible: visible.filter(function (it) { return it.quickWin; }).length,
      quickWinsAll: data.items.filter(function (it) { return it.quickWin; }).length,
      frequencyUnknownVisible: visible.filter(function (it) { return it.frequencyUnknown; }).length,
      frequencyUnknownAll: data.items.filter(function (it) { return it.frequencyUnknown; }).length,
      claimingAll: claimingAll,
      caption: parts.join(" · "),
      filterHint: claimingAll
        ? "当前为可评估项的完整建议范围。已完成排除与未评分不在图上，见下方清单。"
        : "当前不是全部可评估项。已完成排除与未评分始终在下方单独列出，不会因为筛选而被说成已经看过全部。"
    };
  }

  /* 默认落在真实 1–5 坐标上，不把同一档的聚集打散成看起来像不同成本/优先级。 */
  function hashId(id) {
    var h = 0;
    var s = text(id);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  function cellKey(cost, priority) {
    return String(cost) + "|" + String(priority);
  }

  function layoutItems(items) {
    var groups = Object.create(null);
    var out = asArray(items).map(function (it, idx) {
      var key = cellKey(it.cost, it.priority);
      if (!groups[key]) groups[key] = [];
      groups[key].push(idx);
      return {
        item: it,
        x: it.cost,
        y: it.priority,
        jittered: false,
        expanded: false,
        groupSize: 1,
        cellKey: key
      };
    });
    Object.keys(groups).forEach(function (key) {
      var idxs = groups[key];
      idxs.forEach(function (idx) { out[idx].groupSize = idxs.length; });
    });
    return out;
  }

  /* 仅在用户展开某一档时使用，位移不超过 0.2 档，并标明坐标未改。 */
  function expandCluster(plots, key) {
    var idxs = [];
    plots.forEach(function (p, i) { if (p.cellKey === key) idxs.push(i); });
    var n = idxs.length;
    if (n <= 1) return plots;
    var golden = Math.PI * (3 - Math.sqrt(5));
    var seed = hashId(plots[idxs[0]].item.id);
    var radius = Math.min(0.2, 0.07 + 0.01 * Math.min(n, 12));
    idxs.forEach(function (idx, i) {
      var r = radius * Math.sqrt((i + 1) / n);
      var theta = (seed % 360) * (Math.PI / 180) + i * golden;
      var plot = plots[idx];
      plot.x = plot.item.cost + r * Math.cos(theta);
      plot.y = plot.item.priority + r * Math.sin(theta);
      plot.expanded = true;
      plot.jittered = true;
    });
    return plots;
  }

  /* 兼容旧名：默认不再位移。 */
  function jitterItems(items, scales) {
    return layoutItems(items, scales);
  }

  function frequencyExtent(items) {
    var max = 0;
    items.forEach(function (it) {
      if (!it.frequencyUnknown && it.frequency !== null && it.frequency > max) max = it.frequency;
    });
    return { min: 0, max: max };
  }

  function bubbleRadius(item, extent, opts) {
    var rMin = (opts && opts.rMin) || 7;
    var rMax = (opts && opts.rMax) || 22;
    var rUnknown = (opts && opts.rUnknown) || 9;
    if (item.frequencyUnknown || item.frequency === null) return rUnknown;
    if (!extent.max || extent.max <= 0) return rMin;
    /* 面积与频次成正比，不是半径与频次成正比。 */
    var areaMin = Math.PI * rMin * rMin;
    var areaMax = Math.PI * rMax * rMax;
    var area = areaMin + (item.frequency / extent.max) * (areaMax - areaMin);
    return Math.sqrt(area / Math.PI);
  }

  function bubbleArea(item, extent, opts) {
    var r = bubbleRadius(item, extent, opts);
    return Math.PI * r * r;
  }

  function csvEscape(v) {
    var s = v === null || v === undefined ? "" : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function sourceText(sources) {
    return asArray(sources).map(function (s) {
      return [s.type, s.id, s.label, s.url].filter(Boolean).join(" ");
    }).join(" | ");
  }

  function toCSV(data) {
    var headers = [
      "group",
      "id",
      "title",
      "product",
      "productLabel",
      "status",
      "ownership",
      "cost",
      "priority",
      "quickWin",
      "frequency",
      "frequencyUnknown",
      "frequencyEvidence",
      "confidence",
      "costRationale",
      "priorityRationale",
      "originalStatuses",
      "mergedFrom",
      "sources",
      "reason",
      "missing",
      "description"
    ];
    var rows = [headers.join(",")];
    function push(group, it) {
      var freqUnknown = it.frequencyUnknown === true || (group === "unscored" && it.frequency == null && it.frequencyUnknown !== false);
      var line = [
        group,
        it.id,
        it.title,
        it.product,
        it.productLabel,
        it.status,
        it.ownership,
        it.cost === null || it.cost === undefined ? "" : it.cost,
        it.priority === null || it.priority === undefined ? "" : it.priority,
        it.quickWin ? "true" : (group === "items" ? "false" : ""),
        it.frequency === null || it.frequency === undefined ? "" : it.frequency,
        it.frequencyUnknown ? "true" : (group === "items" ? "false" : ""),
        it.frequencyEvidence || "",
        it.confidence || "",
        it.costRationale || "",
        it.priorityRationale || "",
        (it.originalStatuses || []).join(" | "),
        (it.mergedFrom || []).join(" | "),
        sourceText(it.sources),
        it.reason || "",
        (it.missing || []).join(" | "),
        it.description || ""
      ].map(csvEscape);
      rows.push(line.join(","));
    }
    data.items.forEach(function (it) { push("items", it); });
    asArray(data.unplottedThemes).forEach(function (it) { push("unplottedThemes", it); });
    data.excludedCompleted.forEach(function (it) { push("excludedCompleted", it); });
    data.unscored.forEach(function (it) { push("unscored", it); });
    asArray(data.deferred).forEach(function (it) { push("deferred", it); });
    return rows.join("\r\n") + "\r\n";
  }

  function formatStamp(iso, timezone) {
    if (!iso) return "";
    var tz = timezone || "Asia/Shanghai";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    try {
      var fmt = new Intl.DateTimeFormat("zh-CN", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
      return fmt.format(d).replace(/\//g, "-") + "（" + tz + "）";
    } catch (e) {
      return String(iso) + "（" + tz + "）";
    }
  }

  function overlaps(a, b) {
    var dx = a.px - b.px;
    var dy = a.py - b.py;
    var min = a.r + b.r - 2;
    return dx * dx + dy * dy < min * min;
  }

  /* 简单网格聚类：用于提示仍重叠的气泡，不改动坐标。 */
  function findClusters(points) {
    var n = points.length;
    var parent = [];
    for (var i = 0; i < n; i++) parent[i] = i;
    function find(x) {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    }
    function uni(a, b) {
      a = find(a);
      b = find(b);
      if (a !== b) parent[b] = a;
    }
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        if (overlaps(points[i], points[j])) uni(i, j);
      }
    }
    var buckets = Object.create(null);
    for (var k = 0; k < n; k++) {
      var r = find(k);
      if (!buckets[r]) buckets[r] = [];
      buckets[r].push(k);
    }
    var clusters = [];
    Object.keys(buckets).forEach(function (key) {
      var idxs = buckets[key];
      if (idxs.length < 2) return;
      var sx = 0, sy = 0;
      idxs.forEach(function (idx) {
        sx += points[idx].px;
        sy += points[idx].py;
      });
      clusters.push({
        indices: idxs,
        px: sx / idxs.length,
        py: sy / idxs.length,
        count: idxs.length
      });
    });
    return clusters;
  }

  return {
    DEFAULT_PRODUCT_COLORS: DEFAULT_PRODUCT_COLORS,
    awaiting: awaiting,
    normalize: normalize,
    isQuickWin: isQuickWin,
    filterOptions: filterOptions,
    applyFilters: applyFilters,
    passesFilters: passesFilters,
    textMatch: textMatch,
    summarize: summarize,
    jitterItems: jitterItems,
    layoutItems: layoutItems,
    expandCluster: expandCluster,
    cellKey: cellKey,
    frequencyExtent: frequencyExtent,
    bubbleRadius: bubbleRadius,
    bubbleArea: bubbleArea,
    csvEscape: csvEscape,
    toCSV: toCSV,
    formatStamp: formatStamp,
    findClusters: findClusters,
    hashId: hashId
  };
});
