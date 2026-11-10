/* 将 2026-11-10-priority-portfolio 数据稿转为页面使用的组合结构。浏览器与 Node 均可引用。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PortfolioAdapt = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* 咨询风格产品色：可区分、避免紫/靛与高饱和彩虹。源数据若带来这类强调色，会在此改写。 */
  var PRODUCT_COLORS = {
    "光谱": "#0B1F3A",
    "调查管理": "#1F6B5C",
    "调查中心": "#1A5A4E",
    "评估管理": "#8C4A1F",
    "评估中心": "#6E3A18",
    "竞赛管理": "#8A2E2E",
    "积分管理": "#8A4B0F",
    "积分管理（激励体系）": "#8A4B0F",
    "积分商城": "#6B3A4A",
    "运营工具": "#3F5D4A",
    "课程管理": "#4A5568",
    "跨模块": "#5C5C5C",
    "其他": "#5C5C5C"
  };

  var OWNERSHIP_LABEL = {
    current_owner: "当前负责（高源）",
    ownership_pending: "归属待确认",
    linear_follow: "Linear 跟进"
  };

  function text(v) {
    return v === null || v === undefined ? "" : String(v);
  }
  function trim(v) { return text(v).trim(); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }
  function safeUrl(u) {
    u = trim(u);
    return /^https?:\/\//i.test(u) ? u : "";
  }

  function scrubPii(s) {
    var t = text(s);
    t = t.replace(/\(mailto:[^)]+\)/ig, "");
    t = t.replace(/mailto:[A-Z0-9._%+\-]+@[A-Z0-9.\-]+/ig, "");
    t = t.replace(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/ig, "[已隐去邮箱]");
    t = t.replace(/(^|[^0-9])((?:\+?86[-\s]?)?1[3-9]\d{9})(?!\d)/g, "$1[已隐去电话]");
    t = t.replace(/(^|[^0-9])(0\d{2,3}-?\d{7,8})(?!\d)/g, "$1[已隐去电话]");
    return t;
  }

  function scrubDeep(v) {
    if (typeof v === "string") return scrubPii(v);
    if (Array.isArray(v)) return v.map(scrubDeep);
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v).forEach(function (k) { o[k] = scrubDeep(v[k]); });
      return o;
    }
    return v;
  }
  function productColor(name) {
    if (PRODUCT_COLORS[name]) return PRODUCT_COLORS[name];
    for (var k in PRODUCT_COLORS) {
      if (name.indexOf(k) !== -1) return PRODUCT_COLORS[k];
    }
    return "#5C5C5C";
  }
  function parseCSV(textIn) {
    var s = textIn || "";
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    var rows = [];
    var row = [];
    var field = "";
    var i = 0;
    var inQ = false;
    while (i < s.length) {
      var c = s.charAt(i);
      if (inQ) {
        if (c === '"') {
          if (s.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
          inQ = false; i += 1; continue;
        }
        field += c; i += 1; continue;
      }
      if (c === '"') { inQ = true; i += 1; continue; }
      if (c === ",") { row.push(field); field = ""; i += 1; continue; }
      if (c === "\r") { i += 1; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i += 1; continue; }
      field += c; i += 1;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    var headers = rows[0].map(function (h) { return String(h).replace(/^\uFEFF/, "").trim(); });
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var cells = rows[r];
      if (!cells.some(function (x) { return String(x || "").trim(); })) continue;
      var obj = {};
      headers.forEach(function (h, idx) { obj[h] = cells[idx] != null ? cells[idx] : ""; });
      out.push(obj);
    }
    return out;
  }

  function collectSources(theme) {
    var out = [];
    arr(theme.sources).forEach(function (s) {
      if (!isObj(s)) return;
      out.push({
        type: "feishu",
        id: trim(s.record_id),
        label: trim(s.title) || trim(s.record_id) || "飞书记录",
        url: safeUrl(s.url)
      });
    });
    arr(theme.linearIssues).forEach(function (s) {
      if (!isObj(s)) return;
      out.push({
        type: "linear",
        id: trim(s.id),
        label: (trim(s.id) + " " + trim(s.title)).trim() + (s.status ? " · " + s.status : "") + (s.missingToday ? "（今日不可见）" : ""),
        url: safeUrl(s.url)
      });
    });
    arr(theme.otherSources).concat(arr(theme.meetingSources)).forEach(function (s) {
      if (typeof s === "string") {
        out.push({ type: "other", id: "", label: s, url: safeUrl(s) });
        return;
      }
      if (!isObj(s)) return;
      out.push({
        type: trim(s.type) || "other",
        id: trim(s.id),
        label: trim(s.label) || trim(s.title) || trim(s.id),
        url: safeUrl(s.url)
      });
    });
    return out;
  }

  function adaptTheme(theme) {
    var cost = isObj(theme.cost) ? theme.cost : {};
    var pri = isObj(theme.priority) ? theme.priority : {};
    var fb = isObj(theme.feedback) ? theme.feedback : {};
    var st = isObj(theme.status) ? theme.status : {};
    var product = trim(theme.product) || "其他";
    var freqUnknown = fb.frequencyUnknown === true || fb.displayFrequency === null || fb.displayFrequency === undefined || fb.displayFrequency === "";
    var description = trim(theme.fullDescription) || trim(theme.oneLiner) || "";
    var originalStatuses = [];
    arr(st.pool).forEach(function (x) { if (trim(x)) originalStatuses.push("池：" + trim(x)); });
    if (st.linear) originalStatuses.push("Linear：" + trim(st.linear));
    var rules = arr(pri.rulesApplied);
    var ownershipKey = trim(theme.ownership);
    return {
      id: trim(theme.id),
      title: trim(theme.title) || trim(theme.id),
      description: scrubPii(description),
      oneLiner: trim(theme.oneLiner),
      product: product,
      productLabel: product,
      color: productColor(product),
      layer: trim(theme.layer),
      plottable: theme.plottable === true,
      inDefaultChart: theme.inDefaultChart === true,
      inFullChart: theme.inFullChart === true,
      ownershipKey: ownershipKey,
      ownership: OWNERSHIP_LABEL[ownershipKey] || ownershipKey || trim(theme.ownershipNote),
      ownershipNote: trim(theme.ownershipNote),
      status: trim(st.combined) || trim(st.linear) || "",
      originalStatuses: originalStatuses,
      sources: collectSources(theme),
      cost: cost.band == null || cost.band === "" ? null : Number(cost.band),
      costLabel: trim(cost.label),
      costRationale: trim(cost.rationale) + (cost.notDevelopmentEstimate ? "（AI 相对初评，不是工时或排期承诺。）" : ""),
      confidence: trim(cost.confidence),
      priority: pri.recommendedBand == null || pri.recommendedBand === "" ? null : Number(pri.recommendedBand),
      priorityLabel: trim(pri.recommendedLabel),
      priorityRationale: rules.length ? rules.join("；") : "",
      originalPriority: pri.originalLabel || pri.originalBand || pri.linearPriorityBand || "",
      frequency: freqUnknown ? null : Number(fb.displayFrequency),
      frequencyUnknown: freqUnknown,
      frequencyEvidence: scrubPii(trim(fb.frequencyNote) || (arr(fb.customers).length ? "客户：" + fb.customers.join("、") : "")),
      sourceRecordCount: arr(theme.sourceRecordIds).length || fb.recordCount || null,
      independentCustomerCount: fb.independentCustomerCount,
      customers: arr(fb.customers).map(function (c) { return scrubPii(c); }),
      quickWin: theme.quickWinCandidate === true,
      remainingScope: trim(theme.remainingScope),
      mergeNote: trim(theme.mergeNote),
      mergedFrom: arr(theme.relatedLinear).map(function (x) { return trim(x); }).filter(Boolean),
      excludedCompletedParts: trim(theme.excludedCompletedParts),
      notes: [trim(theme.mergeNote), trim(theme.remainingScope)].filter(Boolean).join("\n")
    };
  }

  function rowId(row, fallback) {
    return trim(row.record_id || row.id || row["\ufeffrecord_id"] || row["\ufeffid"] || fallback);
  }

  function adaptRecord(row, group, index) {
    var id = rowId(row, group + "-" + (index + 1));
    var title = trim(row.title) || id;
    var product = trim(row.module || row.product) || "其他";
    var url = safeUrl(row.url);
    var evidence = trim(row.evidence);
    var evUrl = "";
    var m = evidence.match(/https?:\/\/\S+/);
    if (m) evUrl = safeUrl(m[0]);
    var sources = [];
    if (url) sources.push({ type: "feishu", id: id, label: title, url: url });
    if (evUrl && evUrl !== url) sources.push({ type: "evidence", id: "", label: evidence, url: evUrl });
    return {
      id: id,
      title: title,
      product: product,
      productLabel: product,
      status: trim(row.status),
      ownership: trim(row.owner || row.ownership),
      reason: scrubPii(trim(row.whyNotBubbled || row.reason)),
      missing: group === "unscored" ? ["cost", "priority"] : [],
      sources: sources,
      description: scrubPii(trim(row.description)),
      eval: trim(row.eval),
      customer: trim(row.customer),
      appliedAt: trim(row.appliedAt),
      scope: trim(row.scope),
      evidence: scrubPii(evidence),
      layer: trim(row.layer)
    };
  }

  function uniqueProducts(items, unmatched, deferred) {
    var seen = Object.create(null);
    var out = [];
    function add(name) {
      name = trim(name);
      if (!name || seen[name]) return;
      seen[name] = true;
      out.push({ id: name, label: name, color: productColor(name) });
    }
    items.forEach(function (it) { add(it.product); });
    unmatched.forEach(function (it) { add(it.product); });
    deferred.forEach(function (it) { add(it.product); });
    return out;
  }

  function adapt(input) {
    var bubbles = input.bubbles || {};
    var themes = arr(bubbles.items).map(adaptTheme);
    var fullChart = themes.filter(function (t) { return t.inFullChart && t.cost !== null && t.priority !== null; });
    var defaultChart = fullChart.filter(function (t) { return t.inDefaultChart; });
    var unplottedThemes = themes.filter(function (t) { return !t.inFullChart || t.cost === null || t.priority === null; });
    var rawUnplottable = bubbles.unplottable;
    var unplottableRows = arr(Array.isArray(rawUnplottable) ? rawUnplottable : (rawUnplottable && rawUnplottable.items));
    unplottableRows.forEach(function (row, i) {
      unplottedThemes.push(adaptRecord(row, "unplottable", i));
    });
    /* 覆盖已完成时，不把历史未匹配底表再当作「缺成本待评估」，以免与已入图主题重复。 */
    var unmatched = input.includeUnmatchedInventory
      ? arr(input.unmatchedRows).map(function (row, i) { return adaptRecord(row, "unscored", i); })
      : [];
    var deferred = input.includeDeferredInventory
      ? arr(input.deferredRows).map(function (row, i) { return adaptRecord(row, "deferred", i); })
      : [];
    var alreadySupported = arr(bubbles.alreadySupported).map(function (row, i) { return adaptRecord(row, "alreadySupported", i); });
    var duplicateUnmapped = arr(bubbles.duplicateUnmapped).map(function (row, i) { return adaptRecord(row, "duplicateUnmapped", i); });
    var excludedSrc = arr(bubbles.excludes).length ? bubbles.excludes : input.excludeRows;
    var excluded = arr(excludedSrc).map(function (row, i) { return adaptRecord(row, "excluded", i); });

    var rawMeta = isObj(bubbles.meta) ? bubbles.meta : {};
    var stats = isObj(rawMeta.stats) ? rawMeta.stats : {};
    var generatedAt = (isObj(stats) && stats.generatedAt) || input.generatedAt || null;
    var inaccessible = isObj(bubbles.linearInaccessibleToday) ? bubbles.linearInaccessibleToday : (stats.linear || {});
    var coverage = (isObj(input.coverage) ? input.coverage : (isObj(stats.scope) ? { owned: stats.scope.ownedRecordsToday, missing: stats.scope.coverageMissing || [] } : {}));
    var sourceNote = "数据生成于 " + (generatedAt || "2026-11-10T10:00:29+08:00") +
      "（Asia/Shanghai）。默认展示全部可画图主题，不是只展示正在推进的 38 条。成本和建议优先级均为 AI 相对初评，不是工时或排期承诺。反馈频次按独立来源记录计（池标「重复需求」仍计独立反馈），未知则不编造；各主题频次不能相加当作客户数或全库总数。本页尚未对外发布。";

    var out = {
      meta: {
        status: "ready",
        title: (trim(rawMeta.title) || "高源负责需求优先级组合").replace("（完整覆盖数据稿）", "（完整覆盖）"),
        owner: "高源",
        generatedAt: generatedAt,
        timezone: (stats.timezone) || "Asia/Shanghai",
        sourceNote: sourceNote,
        draft: false,
        stale: false,
        priorityMethod: trim(rawMeta.priorityMethod),
        costMethod: trim(rawMeta.costMethod),
        inaccessibleNote: trim(inaccessible.inaccessibleStatement),
        costScale: {
          min: 1,
          max: 5,
          label: "开发成本",
          unit: "AI相对初评",
          disclaimer: "坐标为 AI 相对初评（1–5），不是工时或排期承诺。"
        },
        priorityScale: {
          min: 1,
          max: 5,
          label: "优先级",
          unit: "AI相对初评",
          disclaimer: "坐标为 AI 相对初评（1–5），不是工时或排期承诺。"
        },
        quickWin: {
          costMax: 2,
          priorityMin: 4,
          label: "Quick win",
          rule: "成本≤2 且推荐优先级≥4，且 layer=active_tracked、归属明确、成本信心 medium/high。不是已批准排期。"
        },
        frequency: { label: "反馈频次", unknownLabel: "频次未知" },
        stats: stats,
        sourceStamp: {
          feishuCount: stats.feishu && stats.feishu.todayCount,
          feishuRev: stats.feishu && stats.feishu.todayRev,
          linearCount: stats.linear && stats.linear.todayCount,
          inDefaultChart: defaultChart.length,
          inFullChart: fullChart.length,
          themes: themes.length,
          advancing: defaultChart.length,
          rejected: unplottedThemes.length,
          coverageOwned: coverage.owned || (stats.scope && stats.scope.ownedRecordsToday) || 688,
          coverageMissing: arr(coverage.missing).length
        },
        coverage: {
          owned: coverage.owned || (stats.scope && stats.scope.ownedRecordsToday) || 688,
          missing: arr(coverage.missing)
        }
      },
      products: uniqueProducts(themes, unmatched.concat(alreadySupported, duplicateUnmapped), deferred),
      items: fullChart,
      unplottedThemes: unplottedThemes,
      excludedCompleted: excluded,
      unscored: unmatched,
      deferred: deferred,
      alreadySupported: alreadySupported,
      duplicateUnmapped: duplicateUnmapped,
      themes: themes
    };
    return slimPublic(out);
  }

  function slimSources(list) {
    return arr(list).map(function (s) {
      return {
        type: trim(s.type),
        id: trim(s.id),
        label: scrubPii(trim(s.label)),
        url: safeUrl(s.url)
      };
    }).filter(function (s) { return s.id || s.label || s.url; });
  }

  function slimItem(it) {
    if (!it) return it;
    return scrubDeep({
      id: it.id,
      title: it.title,
      oneLiner: it.oneLiner,
      description: it.description,
      product: it.product,
      productLabel: it.productLabel,
      color: it.color,
      layer: it.layer,
      plottable: it.plottable,
      inDefaultChart: it.inDefaultChart,
      inFullChart: it.inFullChart,
      ownershipKey: it.ownershipKey,
      ownership: it.ownership,
      ownershipNote: it.ownershipNote,
      status: it.status,
      originalStatuses: it.originalStatuses,
      sources: slimSources(it.sources),
      cost: it.cost,
      costLabel: it.costLabel,
      costRationale: it.costRationale,
      confidence: it.confidence,
      priority: it.priority,
      priorityLabel: it.priorityLabel,
      priorityRationale: it.priorityRationale,
      originalPriority: it.originalPriority,
      frequency: it.frequency,
      frequencyUnknown: it.frequencyUnknown,
      frequencyEvidence: it.frequencyEvidence,
      sourceRecordCount: it.sourceRecordCount,
      independentCustomerCount: it.independentCustomerCount,
      customers: it.customers,
      quickWin: it.quickWin,
      remainingScope: it.remainingScope,
      mergeNote: it.mergeNote,
      mergedFrom: it.mergedFrom,
      excludedCompletedParts: it.excludedCompletedParts,
      notes: it.notes,
      reason: it.reason,
      missing: it.missing,
      eval: it.eval,
      customer: it.customer,
      appliedAt: it.appliedAt,
      scope: it.scope,
      evidence: it.evidence
    });
  }

  function slimStats(stats) {
    stats = stats || {};
    var fe = stats.feishu || {};
    var lin = stats.linear || {};
    return {
      generatedAt: stats.generatedAt,
      timezone: stats.timezone,
      feishu: { todayCount: fe.todayCount, todayRev: fe.todayRev },
      linear: { todayCount: lin.todayCount, inaccessibleTodayCount: lin.inaccessibleTodayCount, inaccessibleStatement: lin.inaccessibleStatement },
      scope: stats.scope,
      layers: stats.layers
    };
  }

  function slimPublic(data) {
    var meta = data.meta || {};
    if (meta.stats) meta = Object.assign({}, meta, { stats: slimStats(meta.stats) });
    return {
      meta: meta,
      products: data.products,
      items: arr(data.items).map(slimItem),
      unplottedThemes: arr(data.unplottedThemes).map(slimItem),
      excludedCompleted: arr(data.excludedCompleted).map(slimItem),
      unscored: arr(data.unscored).map(slimItem),
      deferred: arr(data.deferred).map(slimItem),
      alreadySupported: arr(data.alreadySupported).map(slimItem),
      duplicateUnmapped: arr(data.duplicateUnmapped).map(slimItem)
      /* 故意不输出 themes 全量副本，避免与 items 重复打包；也不嵌入 688 条源记录或 9141 全池。 */
    };
  }

  return {
    PRODUCT_COLORS: PRODUCT_COLORS,
    OWNERSHIP_LABEL: OWNERSHIP_LABEL,
    parseCSV: parseCSV,
    productColor: productColor,
    scrubPii: scrubPii,
    slimPublic: slimPublic,
    adapt: adapt,
    adaptTheme: adaptTheme
  };
});
