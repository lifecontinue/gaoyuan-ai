"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  applyLaunchSyncPatches,
  untouchedSnapshot,
  ganttSafeRange,
  LAUNCHED_OCT30_IDS,
} = require("./merge-state");

const before = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/cloud-state-before.json"), "utf8")
);

const after = applyLaunchSyncPatches(before);
const ids = after.features.map((f) => f.id);
const byId = Object.fromEntries(after.features.map((f) => [f.id, f]));

assert.strictEqual(after.hiddenApps.length, 0, "hiddenApps must stay empty");
LAUNCHED_OCT30_IDS.forEach((id) => assert.ok(!ids.includes(id), "must not reinsert " + id));
assert.ok(!ids.includes("f-eval-jira"), "must not restore 补 Jira row");
assert.strictEqual(byId["f-spectrum-import"].name, "光谱 · 岗位序列");
assert.strictEqual(byId["f-spectrum-import"].jiraId, "");
assert.strictEqual(byId["f-spectrum-import"].ddl, "2026-11-13");
assert.ok(!String(byId["f-spectrum-import"].jiraId).includes("8488"));
assert.strictEqual(byId["f-competency-import"].status, "待确认");
assert.strictEqual(byId["f-competency-import"].ddl, "");
assert.strictEqual(byId["f-competency-import"].jiraId, "");
assert.strictEqual(byId["f-404"].name, "光谱职级选择 bug");
assert.strictEqual(byId["f-8488"].jiraId, "SDGH-8488");
assert.strictEqual(byId["f-8488"].status, "待开发");
assert.strictEqual(byId["f-8488"].ddl, "2026-11-30");
assert.ok(byId["f-8488"].note.includes("冲突"));
assert.strictEqual(byId["f-rank-col"].ddl, "2026-11-30");
assert.strictEqual(byId["f-rank-col"].status, "进行中");
assert.strictEqual(byId["f-rank-col"].jiraId, "");
assert.strictEqual(byId["f-rank-remain"].status, "待办");
assert.strictEqual(byId["f-rank-remain"].jiraId, "");
assert.strictEqual(byId["f-rank-remain"].ddl, "");
assert.strictEqual(byId["f-8490"].jiraId, "SDGH-8490");
assert.strictEqual(byId["f-8490"].status, "开发中");
assert.strictEqual(byId["f-8490"].ddl, "2026-11-30");
assert.strictEqual(byId["f-8502"].jiraId, "SDGH-8502");
assert.strictEqual(byId["f-8502"].ddl, "2026-12-31");
assert.notStrictEqual(byId["f-8502"].name, "评估并入调查 · 补 Jira");
assert.notStrictEqual(byId["f-8502"].ddl, "2026-11-06");
assert.strictEqual(byId["f-8415"].status, "In Review");
assert.strictEqual(byId["f-8280"].status, "In Review");
assert.strictEqual(byId["f-8377"].ddl, "2026-11-13");
assert.strictEqual(byId["f-8377"].status, "已提测");
assert.strictEqual(byId["f-8399"].ddl, "2026-11-13");
assert.strictEqual(byId["f-multi-jump"].status, "开发中");
assert.ok(byId["f-multi-jump"].note.includes("已提测"));

const touched = new Set([
  "f-spectrum-import",
  "f-competency-import",
  "f-rank-col",
  "f-rank-remain",
  "f-8490",
  "f-8502",
  "f-8415",
  "f-8280",
  "f-8377",
  "f-8399",
  "f-multi-jump",
  "f-8488",
]);
const diffs = untouchedSnapshot(before, after, touched);
assert.deepStrictEqual(diffs, [], "untouched fields must stay equal: " + JSON.stringify(diffs));

const empty = ganttSafeRange({ start: "", end: "", ddl: "" }, "2026-11-02", "2026-12-15");
assert.strictEqual(empty.undated, true);
assert.ok(empty.start);
assert.ok(empty.end);
const dated = ganttSafeRange({ start: "2026-11-03", end: "2026-11-30", ddl: "2026-11-30" }, "2026-11-02", "2026-12-15");
assert.strictEqual(dated.undated, false);
assert.strictEqual(dated.end, "2026-11-30");

const seedPath = path.join(__dirname, "data.js");
const seedSrc = fs.readFileSync(seedPath, "utf8");
assert.ok(seedSrc.includes('"version": 7') || seedSrc.includes("version: 7"), "seed version 7");
assert.ok(!seedSrc.includes('"id": "f-eval-jira"'));
LAUNCHED_OCT30_IDS.forEach((id) => {
  assert.ok(!seedSrc.includes('"id": "' + id + '"'), "seed must omit " + id);
});
assert.ok(seedSrc.includes("f-competency-import"));
assert.ok(seedSrc.includes("f-8490"));
assert.ok(seedSrc.includes("f-8502"));
assert.ok(seedSrc.includes("f-rank-remain"));

console.log("ok", after.features.length, "features");
