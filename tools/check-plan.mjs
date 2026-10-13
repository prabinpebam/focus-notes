// The plan check: every requirement belongs to exactly one work package, dependencies exist
// in the same or an earlier stage, the graph is acyclic, and the roadmap lists each requirement.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const docs = join(import.meta.dirname, "..", "documentations");
const read = (p) => readFileSync(join(docs, p), "utf8");
const graph = JSON.parse(read("plan/work-graph.json"));
const reqs = [...read("product/requirements.md").matchAll(/^\| ([A-Z0-9]+-\d+) \|/gm)].map((m) => m[1]);
const roadmap = read("plan/roadmap.md");
const plan = read("plan/implementation-plan.md");
const errs = [];

const stages = graph.stages.map((s) => s.id);
const byId = new Map(graph.workPackages.map((w) => [w.id, w]));
const owner = new Map();
for (const w of graph.workPackages) {
  if (!stages.includes(w.stage)) errs.push(`${w.id}: unknown stage ${w.stage}`);
  if (!plan.includes(`| ${w.id} |`)) errs.push(`${w.id}: missing from implementation-plan.md`);
  for (const r of w.requirements) {
    if (!reqs.includes(r)) errs.push(`${w.id}: unknown requirement ${r}`);
    if (owner.has(r)) errs.push(`${r}: in both ${owner.get(r)} and ${w.id}`);
    owner.set(r, w.id);
  }
  for (const d of w.dependsOn) {
    const dep = byId.get(d);
    if (!dep) errs.push(`${w.id}: depends on unknown ${d}`);
    else if (stages.indexOf(dep.stage) > stages.indexOf(w.stage)) errs.push(`${w.id}: depends on later-stage ${d}`);
  }
}
for (const r of reqs) if (!owner.has(r)) errs.push(`${r}: in no work package`);

const covered = new Set();
for (const m of roadmap.matchAll(/([A-Z0-9]+)-(\d+) to (?:[A-Z0-9]+-)?(\d+)/g))
  for (let i = +m[2]; i <= +m[3]; i++) covered.add(`${m[1]}-${String(i).padStart(2, "0")}`);
for (const m of roadmap.matchAll(/\b([A-Z0-9]+-\d+)\b/g)) covered.add(m[1]);
for (const r of reqs) if (!covered.has(r)) errs.push(`${r}: not on the roadmap`);

const state = new Map();
const visit = (id, path) => {
  if (state.get(id) === "done") return;
  if (state.get(id) === "active") { errs.push(`cycle: ${[...path, id].join(" → ")}`); return; }
  state.set(id, "active");
  for (const d of byId.get(id)?.dependsOn ?? []) visit(d, [...path, id]);
  state.set(id, "done");
};
for (const w of graph.workPackages) visit(w.id, []);

const done = graph.workPackages.filter((w) => w.status === "done").length;
console.log(`Plan: ${graph.workPackages.length} work packages, ${reqs.length} requirements, ${done} work packages done.`);
if (errs.length) {
  console.error(errs.join("\n"));
  process.exit(1);
}
console.log("Plan check passed.");
