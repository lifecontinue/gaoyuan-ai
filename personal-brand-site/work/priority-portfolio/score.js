/* 建议权重下的分项评分。纯函数，不改源数据，不读标题，不把频次算进优先级。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PortfolioScore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var COST_IDS = ["complexity", "surface", "dataImpact", "external", "regression"];
  var PRIORITY_IDS = ["impact", "coverage", "urgency", "direction", "alternative"];

  var METRICS = [
    { id: "complexity", axis: "cost", label: "实现复杂度", levels: ["几乎只改文案或配置", "单点规则或小交互", "一个明确模块内的功能", "跨模块或要分期", "新的子系统或大改流程"] },
    { id: "surface", axis: "cost", label: "涉及端与模块范围", levels: ["单点文案", "单一入口且范围写明有限", "同一产品内的多处界面", "多端或多模块", "跨产品"] },
    { id: "dataImpact", axis: "cost", label: "数据 / 兼容 / 迁移", levels: ["不改已有数据", "可空字段", "改现有模型或校验", "要迁移或承担兼容", "难回退的迁移"] },
    { id: "external", axis: "cost", label: "外部依赖", levels: ["无外部依赖", "只读已有接口", "改一个内部接口", "依赖外部系统或第三方", "外部排期不可控"] },
    { id: "regression", axis: "cost", label: "测试回归范围", levels: ["几乎不用回归", "单功能手测", "一条主路径", "多个模块", "数据正确性或大范围回归"] },
    { id: "impact", axis: "priority", label: "业务影响 / 阻断", levels: ["文案或便利", "局部体验或有限效率", "明确痛点，范围仍待观察", "关键流程受阻", "合规、账务或权限正确性"] },
    { id: "coverage", axis: "priority", label: "客户覆盖与反馈证据", levels: ["没有客户证据", "单条或覆盖证据有限", "原文写明覆盖只上调一档", "多客户且写成通用能力", "原文写明大范围通用"] },
    { id: "urgency", axis: "priority", label: "紧迫性 / 已确认承诺", levels: ["可以后做", "池结论为后续考虑", "已接纳，但没有写成承诺", "口径已确认", "写明日期的已确认承诺"] },
    { id: "direction", axis: "priority", label: "已确认产品方向", levels: ["方向被否定", "方向未确认", "只有讨论稿", "已确认主路径或明确方向", "已放进确认版本"] },
    { id: "alternative", axis: "priority", label: "现有替代是否不够", levels: ["现有做法可接受", "有替代但体验差", "替代不完整", "基本没有可接受替代", "不做就阻断且无替代"] }
  ];

  var DEFAULT_WEIGHTS = {
    complexity: 0.30,
    surface: 0.20,
    dataImpact: 0.20,
    external: 0.15,
    regression: 0.15,
    impact: 0.35,
    coverage: 0.15,
    urgency: 0.20,
    direction: 0.15,
    alternative: 0.15
  };

  var QUICK_WIN = {
    costMax: 2,
    priorityMin: 4,
    ownershipKey: "current_owner",
    label: "Quick win",
    rule: "建议：图上成本 ≤ 2 且优先级 ≥ 4，并且归属是 current_owner（需求池当前负责人包含高源）。待确认归属不列入。这是建议，不是已批准排期。"
  };

  var MIN_SCORED = 2;
  var MIN_COVERAGE = 0.45;

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function metricById(id) {
    for (var i = 0; i < METRICS.length; i++) if (METRICS[i].id === id) return METRICS[i];
    return null;
  }

  function axisIds(axis) {
    return axis === "cost" ? COST_IDS : PRIORITY_IDS;
  }

  function cloneWeights(raw) {
    var out = {};
    METRICS.forEach(function (m) {
      var n = raw && typeof raw[m.id] === "number" ? raw[m.id] : DEFAULT_WEIGHTS[m.id];
      out[m.id] = n < 0 ? 0 : n;
    });
    return normalizeWeights(out);
  }

  function normalizeWeights(raw) {
    var src = raw || {};
    var out = {};
    ["cost", "priority"].forEach(function (axis) {
      var ids = axisIds(axis);
      var sum = 0;
      ids.forEach(function (id) {
        var n = Number(src[id]);
        if (!isFinite(n) || n < 0) n = 0;
        out[id] = n;
        sum += n;
      });
      if (sum <= 0) {
        ids.forEach(function (id) { out[id] = DEFAULT_WEIGHTS[id]; });
        sum = ids.reduce(function (s, id) { return s + out[id]; }, 0);
      }
      ids.forEach(function (id) { out[id] = out[id] / sum; });
    });
    return out;
  }

  function stripBoiler(s) {
    return String(s || "")
      .replace(/不是工时或排期承诺/g, "")
      .replace(/不是研发估时/g, "")
      .replace(/AI 相对初评/g, "");
  }

  function evidenceText(item) {
    return stripBoiler([
      item.costRationale,
      item.priorityRationale,
      item.notes,
      item.remainingScope
    ].join("\n"));
  }

  function pending(def, reason) {
    return {
      id: def.id,
      axis: def.axis,
      label: def.label,
      status: "pending",
      score: null,
      quote: "",
      kind: "missing",
      confidence: "none",
      reason: reason
    };
  }

  function scored(def, score, quote, kind, confidence) {
    return {
      id: def.id,
      axis: def.axis,
      label: def.label,
      status: "scored",
      score: score,
      quote: quote,
      kind: kind || "estimate",
      confidence: confidence || "low",
      reason: ""
    };
  }

  function costFromText(item) {
    var costText = stripBoiler(item.costRationale);
    var extra = stripBoiler((item.remainingScope || "") + "\n" + (item.notes || ""));
    var byId = {};
    METRICS.forEach(function (m) { if (m.axis === "cost") byId[m.id] = pending(m, "源数据没有这一项的独立证据"); });
    if (/^依据原文涉及的能力类型给出相对档/.test(costText)) {
      COST_IDS.forEach(function (id) {
        byId[id].reason = "成本说明只给了能力类型总档，没有复杂度、范围、迁移、依赖或回归的分项";
      });
      return byId;
    }
    if (/^原文能看出诉求，但改造面不够具体/.test(costText)) {
      byId.surface.reason = "原文写明改造面不够具体，不能改记成一个范围分数";
      COST_IDS.forEach(function (id) {
        if (id !== "surface") byId[id].reason = "改造面不够具体，其余成本分项也没有单独证据";
      });
      return byId;
    }
    var blob = costText + "\n" + extra;
    if (/工作量明显大|两期交付|整包引擎|不是单页/.test(costText)) {
      byId.complexity = scored(metricById("complexity"), 4, "成本说明写明工作量大、分期或不是单点改造", "estimate", "medium");
    } else if (/中小改动|偏小|单点|单页改造/.test(costText)) {
      byId.complexity = scored(metricById("complexity"), 2, "成本说明写明是中小改动或单点", "estimate", "medium");
    } else if (/而非整包|按中等|中等计/.test(costText)) {
      byId.complexity = scored(metricById("complexity"), 3, "成本说明把范围放在中等，且点明了改什么", "estimate", "low");
    }
    if (/范围未锁|不够具体/.test(blob)) {
      byId.surface = pending(metricById("surface"), "原文写明范围未锁或不够具体");
    } else if (/范围限于|范围有限|范围相对明确|题型集合相对明确/.test(costText)) {
      byId.surface = scored(metricById("surface"), 2, "成本说明写明范围有限或集合相对明确", "estimate", "low");
    }
    if (/迁移/.test(blob)) {
      byId.dataImpact = scored(metricById("dataImpact"), 4, "说明里写了迁移", "estimate", "medium");
    } else if (/兼容/.test(blob)) {
      byId.dataImpact = scored(metricById("dataImpact"), 4, "说明里写了兼容", "estimate", "medium");
    } else if (/数据模型/.test(blob)) {
      byId.dataImpact = scored(metricById("dataImpact"), 3, "说明里写了依赖现有数据模型", "estimate", "low");
    }
    if (/第三方|外部系统|供应商|外部依赖/.test(blob)) {
      byId.external = scored(metricById("external"), 4, "说明里写了外部系统或第三方", "estimate", "medium");
    }
    if (/回归/.test(blob)) {
      byId.regression = scored(metricById("regression"), 3, "说明里写了回归", "estimate", "low");
    }
    return byId;
  }

  function priorityFromText(item) {
    var t = stripBoiler(item.priorityRationale);
    var notes = stripBoiler(item.notes);
    var byId = {};
    PRIORITY_IDS.forEach(function (id) {
      byId[id] = pending(metricById(id), id === "coverage"
        ? "频次只决定气泡面积，不重复计入优先级；原文也没有单独的覆盖证据"
        : "源数据没有这一项的独立证据");
    });
    var impact = null;
    var impactQuote = "";
    var templated = false;
    if (/局部体验/.test(t)) {
      templated = true; impact = 2; impactQuote = "优先级说明：局部体验";
    } else if (/阻断程度不突出|效率问题，范围相对有限/.test(t)) {
      templated = true; impact = 2; impactQuote = "优先级说明：效率或范围有限，阻断不突出";
    } else if (/较强制约/.test(t)) {
      templated = true; impact = 3; impactQuote = "优先级说明：有较强制约，范围仍待观察";
    } else if (/关键流程受阻|业务阻断/.test(t)) {
      templated = true; impact = 4; impactQuote = "优先级说明：关键流程受阻或规则不一致";
    } else if (/建议定制/.test(t)) {
      templated = true; impact = 2; impactQuote = "优先级说明：池结论建议定制，不按平台关键痛点";
    }
    if (impact != null && /不超过 3|不上到关键通用档/.test(t) && impact > 3) {
      impact = 3;
      impactQuote += "；原文写明不超过 3 或不升到关键通用档";
    }
    if (!templated) {
      if (/不影响|非投放阻断|局部体验/.test(t)) {
        impact = 2; impactQuote = "优先级说明写明影响有限";
      } else if (/合规阻断|账务|权限被绕过/.test(t) && !/非明确合规/.test(t)) {
        impact = 5; impactQuote = "优先级说明写明合规、账务或权限正确性";
      } else if (/阻断|无法|不支持|破坏|痛点|受阻|关键流程/.test(t)) {
        impact = 4; impactQuote = "优先级说明写明阻断、无法完成或关键痛点";
      } else if (/效率/.test(t)) {
        impact = 3; impactQuote = "优先级说明写的是效率";
      }
    }
    if (impact != null) byId.impact = scored(metricById("impact"), impact, impactQuote, "estimate", templated ? "low" : "medium");

    if (/单条\/单客户|仅单条|通用性证据有限|客户覆盖或通用性证据有限|非通用/.test(t)) {
      byId.coverage = scored(metricById("coverage"), 2, "优先级说明写明覆盖或通用性证据有限", "estimate", "low");
    } else if (/覆盖面支持上调/.test(t)) {
      byId.coverage = scored(metricById("coverage"), 3, "优先级说明写明覆盖面只支持上调一档", "estimate", "low");
    }

    if (/口径已确认|口径已拍/.test(t + "\n" + notes)) {
      byId.urgency = scored(metricById("urgency"), 4, "说明里写了口径已确认或已拍", "estimate", "medium");
    } else if (/后续考虑/.test(t)) {
      byId.urgency = scored(metricById("urgency"), 2, "池结论为后续考虑，不当作已确认承诺", "estimate", "low");
    }

    if (/明确产品方向|已确认的[\s\S]{0,16}主路径/.test(t + "\n" + notes)) {
      byId.direction = scored(metricById("direction"), 4, "说明里写了明确产品方向或已确认主路径", "estimate", "medium");
    } else if (item.layer === "direction_unconfirmed") {
      byId.direction = scored(metricById("direction"), 2, "分层记为 direction_unconfirmed", "fact", "medium");
    }

    if (/现有做法可接受|可以用现有|已有可接受替代/.test(t + "\n" + notes)) {
      byId.alternative = scored(metricById("alternative"), 1, "说明里写了现有做法可接受", "estimate", "low");
    } else if (/没有可接受替代|无替代/.test(t + "\n" + notes)) {
      byId.alternative = scored(metricById("alternative"), 4, "说明里写了没有可接受替代", "estimate", "low");
    }
    return byId;
  }

  function applyOverride(entry, value) {
    if (value == null || value === "") return entry;
    var n = Number(value);
    if (!isFinite(n)) return entry;
    n = Math.max(1, Math.min(5, Math.round(n * 2) / 2));
    entry.status = "override";
    entry.score = n;
    entry.quote = "这台浏览器里的个人评估，不会写回飞书或 Linear";
    entry.kind = "personal";
    entry.confidence = "personal";
    entry.reason = "";
    return entry;
  }

  function combine(axis, byId, weights, legacy) {
    var ids = axisIds(axis);
    var acc = 0;
    var scoredW = 0;
    var pendingW = 0;
    var n = 0;
    ids.forEach(function (id) {
      var w = weights[id];
      var entry = byId[id];
      entry.weight = w;
      if (entry.score == null) {
        entry.contribution = null;
        pendingW += w;
      } else {
        entry.contribution = round2(w * entry.score);
        acc += w * entry.score;
        scoredW += w;
        n += 1;
      }
    });
    var partial = scoredW > 0 ? acc / scoredW : null;
    var low = scoredW > 0 ? acc + pendingW * 1 : null;
    var high = scoredW > 0 ? acc + pendingW * 5 : null;
    var useWeighted = n >= MIN_SCORED && scoredW >= MIN_COVERAGE && partial != null && legacy != null;
    var value = useWeighted ? round1(partial) : legacy;
    return {
      mode: useWeighted ? "weighted" : (legacy == null ? "unevaluated" : "provisional"),
      value: value,
      partial: partial == null ? null : round1(partial),
      legacy: legacy,
      coverage: round2(scoredW),
      scoredCount: n,
      pendingCount: ids.length - n,
      low: low == null ? null : round1(Math.max(1, Math.min(5, low))),
      high: high == null ? null : round1(Math.max(1, Math.min(5, high)))
    };
  }

  function ownershipConfirmed(item) {
    return item.ownershipKey === QUICK_WIN.ownershipKey;
  }

  function quickWinOf(item, cost, priority) {
    var reasons = [];
    var numeric = cost.value != null && priority.value != null && cost.value <= QUICK_WIN.costMax && priority.value >= QUICK_WIN.priorityMin;
    var owned = ownershipConfirmed(item);
    if (!numeric) reasons.push("坐标没有同时满足成本 ≤ " + QUICK_WIN.costMax + " 且优先级 ≥ " + QUICK_WIN.priorityMin);
    if (!owned) {
      reasons.push(item.ownershipKey === "ownership_pending"
        ? "归属待确认，不能当成已确认承诺"
        : "归属不是 current_owner，不把跟进记录当成已确认归属");
    }
    var legacyNumeric = item.cost != null && item.priority != null && item.cost <= QUICK_WIN.costMax && item.priority >= QUICK_WIN.priorityMin;
    return {
      eligible: numeric && owned,
      legacyNear: legacyNumeric && owned && !(numeric && owned),
      owned: owned,
      reasons: reasons
    };
  }

  function assessItem(item, weights, overrides) {
    var w = normalizeWeights(weights || DEFAULT_WEIGHTS);
    var costMap = costFromText(item);
    var priMap = priorityFromText(item);
    var ov = overrides || {};
    METRICS.forEach(function (m) {
      var map = m.axis === "cost" ? costMap : priMap;
      if (Object.prototype.hasOwnProperty.call(ov, m.id)) applyOverride(map[m.id], ov[m.id]);
    });
    var cost = combine("cost", costMap, w, item.cost);
    var priority = combine("priority", priMap, w, item.priority);
    var metrics = METRICS.map(function (m) { return (m.axis === "cost" ? costMap : priMap)[m.id]; });
    var plot = {
      x: cost.value,
      y: priority.value,
      explain: (cost.mode === "weighted" ? "成本按分项加权" : "成本沿用原评分") + "，" + (priority.mode === "weighted" ? "优先级按分项加权" : "优先级沿用原评分")
    };
    return {
      metrics: metrics,
      cost: cost,
      priority: priority,
      plot: plot,
      quickWin: quickWinOf(item, cost, priority),
      weights: w
    };
  }

  function formulaText() {
    return "某一轴 = Σ(建议权重 × 得分) / Σ(已评分项的权重)。待确认项不代入分子。已评分少于 " + MIN_SCORED + " 项，或已评分权重低于 " + MIN_COVERAGE + " 时，图上仍用旧的 1–5 档，并给出待确认项若取 1 和取 5 的区间。频次不进入这个公式，只决定气泡面积。开发状态不加分。";
  }

  return {
    METRICS: METRICS,
    COST_IDS: COST_IDS,
    PRIORITY_IDS: PRIORITY_IDS,
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
    QUICK_WIN: QUICK_WIN,
    MIN_SCORED: MIN_SCORED,
    MIN_COVERAGE: MIN_COVERAGE,
    round1: round1,
    normalizeWeights: normalizeWeights,
    cloneWeights: cloneWeights,
    assessItem: assessItem,
    formulaText: formulaText,
    evidenceText: evidenceText
  };
});
