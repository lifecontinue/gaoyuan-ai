/**
 * Minimal ID-based merge for Launch Sync cloud state.
 * Used by tests and the one-off apply script. Does not overwrite
 * unrelated fields or replace the whole feature list.
 */
"use strict";

const LAUNCHED_OCT30_IDS = [
  "f-8213",
  "f-8185",
  "f-8160",
  "f-8162",
  "f-8214",
  "f-8376",
  "f-8368",
  "f-8204",
];

const REMOVED_IDS = ["f-eval-jira"];

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function indexById(features) {
  const map = new Map();
  features.forEach((f, i) => {
    if (f && f.id) map.set(String(f.id), i);
  });
  return map;
}

function patchFields(feat, fields) {
  Object.keys(fields).forEach((k) => {
    feat[k] = fields[k];
  });
}

function insertAfter(features, afterId, row) {
  const i = features.findIndex((f) => f && f.id === afterId);
  if (i < 0) {
    features.push(row);
    return;
  }
  features.splice(i + 1, 0, row);
}

function applyLaunchSyncPatches(state) {
  const next = clone(state);
  next.features = Array.isArray(next.features) ? next.features.slice() : [];
  next.hiddenApps = Array.isArray(next.hiddenApps) ? next.hiddenApps.map(String) : [];

  next.features = next.features.filter((f) => {
    if (!f || !f.id) return false;
    const id = String(f.id);
    if (LAUNCHED_OCT30_IDS.includes(id)) return false;
    if (REMOVED_IDS.includes(id)) return false;
    return true;
  });

  const byId = () => indexById(next.features);
  const must = (id) => {
    const i = byId().get(id);
    if (i == null) throw new Error("missing feature " + id);
    return next.features[i];
  };

  const spectrum = must("f-spectrum-import");
  patchFields(spectrum, {
    name: "光谱 · 岗位序列",
    jiraId: "",
    status: "开发中",
    end: "2026-11-13",
    ddl: "2026-11-13",
    note: "现有岗位序列/职级功能相关。与「职级选择 bug」「能力等级导入导出」「胜任力导入」都是独立项。跟踪截止 11-13。",
  });

  if (!byId().has("f-competency-import")) {
    insertAfter(next.features, "f-spectrum-import", {
      id: "f-competency-import",
      name: "光谱 · 胜任力导入",
      jiraId: "",
      app: "光谱",
      status: "待确认",
      start: "",
      end: "",
      ddl: "",
      frontend: "",
      backend: "",
      qa: "",
      note: "独立需求。不是能力等级导入导出（f-8488 / SDGH-8488），也不是职级选择 bug。Linear 尚无已确认独立映射，票号与上线日待确认。",
      description:
        "用户确认：岗位序列与胜任力导入是两个独立需求。本行单独跟踪胜任力导入。不要映射到 SDGH-8488。",
      feishuUrl: spectrum.feishuUrl || "",
      jiraUrl: "",
    });
  }

  const rank = must("f-rank-col");
  patchFields(rank, {
    ddl: "2026-11-30",
    end: "2026-11-30",
    note: "2026-11-30 上线；本周下发。Jira 仍未建（记录层尚未关联，不断言外部未建）。不要写 11-10 为上线日。",
  });

  if (!byId().has("f-rank-remain")) {
    insertAfter(next.features, "f-rank-col", {
      id: "f-rank-remain",
      name: "排行榜字段同步 · 闯关竞赛 + 一战到底",
      jiraId: "",
      app: "竞赛",
      status: "待办",
      start: "",
      end: "",
      ddl: "",
      frontend: "",
      backend: "",
      qa: "",
      note: "已确认纳入 11 月上线，本周待补；具体发版日未核定。学员端剩余玩法。不要并入后台名次列统一，也不要复用已上线的 SDGH-8376。",
      description:
        "上周学员端排行榜字段按排名规则仅上线练习 PK + 计时竞赛（SDGH-8376）。闯关竞赛、一战到底两玩法字段同步尚未完成，需单独跟踪。具体上线日待与开发核定。",
      feishuUrl: "",
      jiraUrl: "",
    });
  }

  if (!byId().has("f-8490")) {
    insertAfter(next.features, "f-8304", {
      id: "f-8490",
      name: "调查 · 未开启催促时点击提醒增加提示",
      jiraId: "SDGH-8490",
      app: "调查",
      status: "开发中",
      start: "2026-11-11",
      end: "2026-11-30",
      ddl: "2026-11-30",
      frontend: "",
      backend: "",
      qa: "",
      note: "已关联 SDGH-8490。Linear 跟踪截止 2026-11-30（15:04 更新）。未开启催促时点击提醒给出开发中提示。",
      description:
        "未勾选「催促消息提醒」时，点击「提醒」应提示「未开启催促消息提醒，请联系管理员」。不自动开启开关，不改变原有消息发送逻辑。",
      feishuUrl: "",
      jiraUrl: "https://21tb-jira.21tb.com/browse/SDGH-8490",
    });
  }

  if (!byId().has("f-8502")) {
    insertAfter(next.features, "f-8490", {
      id: "f-8502",
      name: "评估并入调查",
      jiraId: "SDGH-8502",
      app: "调查",
      status: "开发中",
      start: "2026-10-27",
      end: "2026-12-31",
      ddl: "2026-12-31",
      frontend: "待定",
      backend: "待定",
      qa: "待定",
      note: "主 Jira SDGH-8502，开发中；年内/12 月底。不要再写成「补 Jira」或 11-06。",
      description:
        "评估并入调查管理（方向 A，非并入 360）。范围：加讲师库关联与评估关系；结果回传讲师。用户核实已有 SDGH-8502。",
      feishuUrl: "https://shuiiiiqqq.feishu.cn/docx/CMp4doVo0oX1eRxCB7VcoZo2ntc",
      jiraUrl: "https://21tb-jira.21tb.com/browse/SDGH-8502",
    });
  }

  patchFields(must("f-8415"), {
    status: "In Review",
    note: "In Review（Linear 15:06）；截止 11-13。不是已上线。",
  });
  patchFields(must("f-8280"), {
    status: "In Review",
    note: "In Review（Linear 15:02）；截止 11-13。不是已上线。",
  });
  patchFields(must("f-8377"), {
    ddl: "2026-11-13",
    end: "2026-11-13",
    note: "已提测；用户 15:02 将跟踪截止改为 2026-11-13（原页 11-27）。",
  });
  patchFields(must("f-8399"), {
    ddl: "2026-11-13",
    end: "2026-11-13",
    note: "In Review，本周上线。用户 15:01 将跟踪截止改为 2026-11-13（原页 11-15）。不是已上线。",
  });
  patchFields(must("f-multi-jump"), {
    status: "开发中",
    note: "当前：开发中（Linear 状态字段 15:02 → In Dev，due 仍 11-30）。历史：页上曾写「11-06 已提测」；Linear 正文仍有 11-06 已提测/曾改 In Review 的记录，属来源冲突，以状态字段为准，不把旧提测当当前。",
  });

  const skill = must("f-8488");
  patchFields(skill, {
    status: "待开发",
    ddl: "2026-11-30",
    end: "2026-11-30",
    jiraId: "SDGH-8488",
    name: "能力等级导入导出",
    note: "计划 11-30，本页继续记未上线。跟踪单 11-04 被标 Done，与计划 11-30 冲突（来源：Linear Done vs 页上未上线）。不要自动隐藏，也不要当成胜任力导入。",
  });

  next.hiddenApps = [];
  next.meta = Object.assign({}, next.meta || {}, {
    storageKey: "launch-sync-state-v1",
    source: "Linear 字段 2026-11-11 最小合并",
  });
  return next;
}

function untouchedSnapshot(before, after, touchedIds) {
  const bMap = new Map((before.features || []).map((f) => [f.id, f]));
  const aMap = new Map((after.features || []).map((f) => [f.id, f]));
  const diffs = [];
  bMap.forEach((bf, id) => {
    if (touchedIds.has(id)) return;
    if (LAUNCHED_OCT30_IDS.includes(id) || REMOVED_IDS.includes(id)) return;
    const af = aMap.get(id);
    if (!af) {
      diffs.push({ id, reason: "removed-untouched" });
      return;
    }
    const keys = new Set([...Object.keys(bf), ...Object.keys(af)]);
    keys.forEach((k) => {
      if (JSON.stringify(bf[k]) !== JSON.stringify(af[k])) {
        diffs.push({ id, field: k, before: bf[k], after: af[k] });
      }
    });
  });
  return diffs;
}

function ganttSafeRange(feat, fallbackStart, fallbackEnd) {
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/;
  const ok = (s) => ymd.test(String(s || ""));
  const start = ok(feat.start) ? feat.start : fallbackStart;
  const end = ok(feat.end) ? feat.end : ok(feat.ddl) ? feat.ddl : start || fallbackEnd;
  return { start: start || fallbackStart, end: end || start || fallbackEnd, undated: !ok(feat.start) && !ok(feat.end) && !ok(feat.ddl) };
}

module.exports = {
  LAUNCHED_OCT30_IDS,
  REMOVED_IDS,
  applyLaunchSyncPatches,
  untouchedSnapshot,
  ganttSafeRange,
};
