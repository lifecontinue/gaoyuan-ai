import fs from "fs";
import vm from "vm";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { console };
sandbox.self = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, "core.js"), "utf8"), sandbox, { filename: "core.js" });
vm.runInContext(fs.readFileSync(path.join(dir, "score.js"), "utf8"), sandbox, { filename: "score.js" });
vm.runInContext(fs.readFileSync(path.join(dir, "data.js"), "utf8"), sandbox, { filename: "data.js" });
const Core = sandbox.PortfolioCore;
const Score = sandbox.PortfolioScore;
const data = Core.normalize(sandbox.PRIORITY_PORTFOLIO);
const fails = [];
function eq(n, a, b) {
  if (a !== b) fails.push(n + ": expected " + b + " got " + a);
}
eq("items", data.items.length, 515);
eq("unplotted", data.unplottedThemes.length, 19);
eq("themes", data.items.length + data.unplottedThemes.length, 534);
eq("advancing", data.items.filter((i) => i.inDefaultChart).length, 38);
eq("qw", data.items.filter((i) => i.quickWin).length, 2);
eq("hollow", data.items.filter((i) => i.frequencyUnknown).length, 8);
eq("cell33", data.items.filter((i) => i.cost === 3 && i.priority === 3).length, 191);
eq("owned", data.meta.coverage.owned, 688);
eq("supported", data.alreadySupported.length, 39);
eq("dup", data.duplicateUnmapped.length, 34);
eq("excluded", data.excludedCompleted.length, 83);
eq("filter all", Core.applyFilters(data.items, { viewMode: "all" }).length, 515);
eq("filter advancing", Core.applyFilters(data.items, { viewMode: "advancing" }).length, 38);
eq("filter qw", Core.applyFilters(data.items, { viewMode: "quickwin" }).length, 2);
const qw = data.items.filter((i) => i.quickWin).map((i) => i.id).sort();
eq("qw ids", qw.join(","), "TH-gp-empty-resource,TH-ops-lottery-once");
const plots = Core.spreadAllCells(Core.layoutItems(data.items));
eq("spread count", plots.length, 515);
let crossed = 0;
plots.forEach((p) => {
  if (Math.round(p.x) !== p.item.cost || Math.round(p.y) !== p.item.priority) crossed += 1;
  if (Math.abs(p.x - p.item.cost) > 0.38 + 1e-9) crossed += 1;
  if (Math.abs(p.y - p.item.priority) > 0.38 + 1e-9) crossed += 1;
});
eq("spread stays in cell", crossed, 0);
const cell33 = plots.filter((p) => p.item.cost === 3 && p.item.priority === 3);
eq("cell33 spread nodes", cell33.length, 191);
eq("cell33 not stacked", new Set(cell33.map((p) => p.x.toFixed(4) + "," + p.y.toFixed(4))).size, 191);

const w = Score.normalizeWeights(Score.DEFAULT_WEIGHTS);
const costSum = Score.COST_IDS.reduce((s, id) => s + w[id], 0);
const priSum = Score.PRIORITY_IDS.reduce((s, id) => s + w[id], 0);
eq("cost weights sum", Math.round(costSum * 1000), 1000);
eq("priority weights sum", Math.round(priSum * 1000), 1000);
const zeroed = Score.normalizeWeights({ complexity: 0, surface: 0, dataImpact: 0, external: 0, regression: 0, impact: 2, coverage: 2, urgency: 0, direction: 0, alternative: 0 });
eq("zero cost falls back", Math.round(Score.COST_IDS.reduce((s, id) => s + zeroed[id], 0) * 1000), 1000);
eq("priority renormalizes", Math.round(zeroed.impact * 100), 50);
const reset = Score.cloneWeights(Score.DEFAULT_WEIGHTS);
eq("reset complexity", reset.complexity, Score.DEFAULT_WEIGHTS.complexity);

const fixture = {
  id: "fixture",
  title: "标题里的迁移第三方回归不能计分",
  description: "描述里的第三方和回归也不能计分",
  cost: 3,
  priority: 3,
  frequency: 50,
  costRationale: "依据原文涉及的能力类型给出相对档 3（不是研发估时）。",
  priorityRationale: "原文描述关键流程受阻或数据/规则不一致，且有接纳或重复反馈。；依据：无法；目前仅单条/单客户反馈，且非明确合规阻断，不上到关键通用档。；池结论后续考虑，保留层内优先级不超过 3。",
  notes: "",
  remainingScope: "",
  ownershipKey: "ownership_pending",
  layer: ""
};
const got = Score.assessItem(fixture);
eq("fixture cost mode", got.cost.mode, "provisional");
eq("fixture cost value", got.cost.value, 3);
eq("fixture priority", got.priority.value, 2.5);
eq("fixture priority mode", got.priority.mode, "weighted");
eq("fixture not qw", got.quickWin.eligible, false);
eq("title ignored", Score.assessItem(Object.assign({}, fixture, { title: "另一标题", frequency: 1 })).priority.value, 2.5);
const costScores = got.metrics.filter((m) => m.axis === "cost").map((m) => m.score).join(",");
eq("old cost not copied", costScores, ",,,,");
const freqOnly = Score.assessItem(Object.assign({}, fixture, {
  priorityRationale: "能判断有真实诉求，但阻断程度不突出，先按明确效率/范围有限。",
  frequency: 80
}));
eq("frequency not coverage", freqOnly.metrics.find((m) => m.id === "coverage").status, "pending");
const areaHi = Core.bubbleArea({ frequency: 8, frequencyUnknown: false }, { max: 8 }, { rMin: 3, rMax: 11, rUnknown: 4 });
const areaLo = Core.bubbleArea({ frequency: 1, frequencyUnknown: false }, { max: 8 }, { rMin: 3, rMax: 11, rUnknown: 4 });
eq("area grows with frequency", areaHi > areaLo, true);

const assessed = data.items.map((it) => Score.assessItem(it));
eq("none dropped", assessed.filter((a) => a.plot.x == null || a.plot.y == null).length, 0);
eq("new qw", assessed.filter((a) => a.quickWin.eligible).length, 0);
const near = data.items.filter((it, i) => assessed[i].quickWin.legacyNear).map((it) => it.id).sort();
eq("legacy qw near", near.join(","), "TH-gp-empty-resource,TH-ops-lottery-once");
const lottery = assessed[data.items.findIndex((it) => it.id === "TH-ops-lottery-once")];
const emptyRes = assessed[data.items.findIndex((it) => it.id === "TH-gp-empty-resource")];
eq("lottery priority mode", lottery.priority.mode, "provisional");
eq("lottery still old y", lottery.plot.y, 4);
eq("empty resource priority mode", emptyRes.priority.mode, "weighted");
eq("empty resource y", emptyRes.plot.y, 4);
eq("empty resource cost mode", emptyRes.cost.mode, "provisional");
const overridden = Score.assessItem(fixture, Score.DEFAULT_WEIGHTS, { impact: 5, coverage: 5, urgency: 5, direction: 5, alternative: 5 });
eq("override can move priority", overridden.priority.mode, "weighted");
eq("override value", overridden.priority.value, 5);
if (fails.length) {
  console.error(fails.join("\n"));
  process.exit(1);
}
console.log("ok 515/38/2/19/688 cell33=191");
