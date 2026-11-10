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
vm.runInContext(fs.readFileSync(path.join(dir, "data.js"), "utf8"), sandbox, { filename: "data.js" });
const Core = sandbox.PortfolioCore;
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
if (fails.length) {
  console.error(fails.join("\n"));
  process.exit(1);
}
console.log("ok 515/38/2/19/688 cell33=191");
