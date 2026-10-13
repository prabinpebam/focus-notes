// The chain check: promises → scenarios → user-can → IA → requirements stay consistent.
// See documentations/product/spec/chain.md#checking-the-chain.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..", "documentations");
const txt = (p) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");
const cp = txt("product/spec/customer-promises.md");
const sc = txt("product/spec/scenarios.md");
const uc = txt("product/spec/user-can.md");
const ia = txt("design/information-architecture.html");
const req = txt("product/requirements.md");

const rows = (md, prefix) => {
  const out = new Map();
  for (const line of md.split("\n")) {
    const m = line.match(new RegExp(`^\\|\\s*(${prefix}-[A-Z0-9-]+)\\s*\\|(.*)`));
    if (m) out.set(m[1], m[2].replace(/\|\s*$/, "").split("|").map((c) => c.trim()));
  }
  return out;
};
const all = (re, s) => [...s.matchAll(re)].map((m) => m[1] ?? m[0]);
const expand = (s, pre) => {
  const ids = new Set(s.match(new RegExp(`${pre}-[A-Z]+-\\d+`, "g")) ?? []);
  for (const m of s.matchAll(new RegExp(`(${pre}-[A-Z]+)-(\\d+) to ${pre}-[A-Z]+-(\\d+)`, "g")))
    for (let i = +m[2]; i <= +m[3]; i++) ids.add(`${m[1]}-${String(i).padStart(2, "0")}`);
  return ids;
};
const eq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

const cps = new Set(all(/### (CP-[A-Z]+-\d+)/g, cp));
const scs = rows(sc, "SC"), uns = rows(sc, "UNSUP"), ucs = rows(uc, "UC");
const ias = new Set(all(/<td>(IA-(?:VIEW|CMP)-[A-Z]+)<\/td>/g, ia));
const reqs = new Set(all(/^\| ([A-Z0-9]+-\d+) \|/gm, req));
const errs = [];
for (const [k, c] of [...scs, ...uns, ...ucs]) if (c.length !== 6) errs.push(`${k}: ${c.length} cells`);
for (const c of cps) {
  const want = new Set([...scs].filter(([, v]) => v[0] === c).map(([k]) => k));
  const m = cp.match(new RegExp(`\\| \`${c}\` \\|[^\\n]*\\| ([^|\\n]*) \\|\\n`));
  const sec = cp.match(new RegExp(`### ${c}[\\s\\S]*?\\| Scenarios \\| ([^\\n]*) \\|`));
  if (!m || !eq(expand(m[1], "SC"), want)) errs.push(`promise map row for ${c} disagrees with scenarios`);
  if (!sec || !eq(expand(sec[1], "SC"), want)) errs.push(`promise section for ${c} disagrees with scenarios`);
}
for (const [k, c] of scs) {
  if (!cps.has(c[0])) errs.push(`${k}: unknown promise ${c[0]}`);
  for (const u of c[4].match(/UC-[A-Z]+-\d+/g) ?? []) {
    if (!ucs.has(u)) errs.push(`${k}: ${u} undefined`);
    else if (!ucs.get(u)[1].includes(k)) errs.push(`${u} lacks back-reference to ${k}`);
  }
  for (const i of c[5].match(/IA-(?:VIEW|CMP)-[A-Z]+/g) ?? []) if (!ias.has(i)) errs.push(`${k}: ${i} undefined`);
}
for (const [k, c] of ucs) {
  const s = c[1].match(/SC-[A-Z]+-\d+/g) ?? [];
  if (!s.length) errs.push(`${k}: no scenario`);
  for (const x of s) {
    if (!scs.has(x)) errs.push(`${k}: ${x} undefined`);
    else if (!scs.get(x)[4].includes(k)) errs.push(`${k} not listed back by ${x}`);
  }
  for (const i of c[3].match(/IA-(?:VIEW|CMP)-[A-Z]+/g) ?? []) if (!ias.has(i)) errs.push(`${k}: ${i} undefined`);
  for (const r of c[4].match(/\b[A-Z0-9]{2,4}-\d+\b/g) ?? []) if (!reqs.has(r)) errs.push(`${k}: requirement ${r} undefined`);
}
const iauc = expand(ia, "UC");
for (const [k, c] of ucs) if (!iauc.has(k) && !c[3].includes("None")) errs.push(`${k}: no IA owner`);
for (const k of iauc) if (!ucs.has(k)) errs.push(`IA references undefined ${k}`);
const used = new Set();
for (const c of ucs.values()) for (const r of c[4].match(/\b[A-Z0-9]{2,4}-\d+\b/g) ?? []) used.add(r);
const ids = new Set([...cps, ...scs.keys(), ...uns.keys(), ...ucs.keys(), ...ias]);
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? (f === "shell" ? [] : walk(p)) : /\.(md|html)$/.test(f) ? [p] : [];
});
for (const p of walk(root)) {
  const t = readFileSync(p, "utf8");
  for (const m of new Set(t.match(/\b(?:(?:CP|SC|UC|UNSUP)-[A-Z]+-\d+|IA-(?:VIEW|CMP)-[A-Z]+)\b/g) ?? []))
    if (!ids.has(m)) errs.push(`${relative(root, p)}: ${m} undefined`);
  for (const m of t.matchAll(/(?:<tr><td>|\| )(DD-[A-Z]+-\d+)(?:<\/td>| \|)(.*?)(?:<\/tr>|$)/gm))
    if (!/UC-[A-Z]+-\d+/.test(m[2])) errs.push(`${relative(root, p)}: ${m[1]} names no user-can`);
}
const EXEMPT_AREAS = ["LIC", "DOC", "SEC", "PRV", "PRF", "QLT", "A11Y", "I18N", "DSY"];
const EXEMPT_IDS = ["PKG-04", "DST-03", "DST-04", "DST-05", "DST-06", "DST-07"];
const exempt = (r) => EXEMPT_AREAS.includes(r.split("-")[0]) || EXEMPT_IDS.includes(r);
for (const r of reqs) if (!used.has(r) && !exempt(r)) errs.push(`${r} traces to no user-can`);
console.log(`Chain: ${cps.size} promises, ${scs.size} scenarios, ${uns.size} boundaries, ${ucs.size} user-can, ${ias.size} IA entries, ${reqs.size} requirements.`);
if (errs.length) {
  console.error(errs.join("\n"));
  process.exit(1);
}
console.log("Chain check passed.");
