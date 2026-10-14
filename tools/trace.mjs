// Traceability: for every requirement in the chosen stages, the tests that name it in a test title
// or a comment. Prints a Markdown table to stdout, then the requirements no test names.
//   pnpm trace                 the stages before 1.0 that are being closed (M0, M1, MW, M3, M2, M4)
//   pnpm trace M3 M2           only these stages
//   pnpm trace --json          the same data as JSON
//   pnpm trace --check         exit 1 when a requirement has no test
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = join(import.meta.dirname, "..");
const docs = join(root, "documentations");
const graph = JSON.parse(readFileSync(join(docs, "plan/work-graph.json"), "utf8"));
const known = new Set(
  [...readFileSync(join(docs, "product/requirements.md"), "utf8").matchAll(/^\| ([A-Z0-9]+-\d+) \|/gm)].map((m) => m[1]),
);

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const picked = args.filter((a) => !a.startsWith("--"));
const stages = picked.length ? picked : ["M0", "M1", "MW", "M3", "M2", "M4"];

// The directories whose files are tests: packages/<name>/test, apps/<name>/test and e2e, tools/test.
const testDirs = () => {
  const out = [join(root, "tools", "test")];
  for (const base of ["packages", "apps"])
    for (const name of readdirSync(join(root, base)))
      for (const sub of base === "apps" ? ["test", "e2e"] : ["test"]) out.push(join(root, base, name, sub));
  return out.filter((d) => {
    try {
      return statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
};

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
    return /\.(m?[jt]sx?)$/.test(e.name) ? [p] : [];
  });

/** Every requirement ID in a piece of text, with ranges ("TBL-01 to TBL-03", "FOC-01–06") expanded. */
export const idsIn = (text) => {
  const ids = new Set();
  const range = /\b([A-Z0-9]+)-(\d{2})\s*(?:to|–|\.\.)\s*(?:\1-)?(\d{2})\b/g;
  for (const m of text.matchAll(range))
    for (let i = +m[2]; i <= +m[3]; i++) ids.add(`${m[1]}-${String(i).padStart(2, "0")}`);
  for (const m of text.matchAll(/\b([A-Z0-9]+-\d{2})\b/g)) ids.add(m[1]);
  return [...ids].filter((id) => known.has(id));
};

const TITLE = /\b(?:test|it|describe)(?:\.(?:step|only|skip|describe|serial|fixme))*\s*\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;

/** The places a file names requirements: comments and test titles, each with its line. */
export const mentions = (source) => {
  const found = [];
  let inBlock = false;
  source.split(/\r?\n/).forEach((line, i) => {
    let text = "";
    let rest = line;
    if (inBlock) {
      const end = rest.indexOf("*/");
      text += end < 0 ? rest : rest.slice(0, end);
      inBlock = end < 0;
      rest = end < 0 ? "" : rest.slice(end + 2);
    }
    const open = rest.indexOf("/*");
    if (open >= 0) {
      const end = rest.indexOf("*/", open + 2);
      text += " " + (end < 0 ? rest.slice(open + 2) : rest.slice(open + 2, end));
      inBlock = end < 0;
    }
    const slash = rest.search(/(^|[^:"'`])\/\//);
    if (slash >= 0) text += " " + rest.slice(slash);
    for (const m of line.matchAll(TITLE)) text += " " + m[2];
    for (const id of idsIn(text)) found.push({ id, line: i + 1 });
  });
  return found;
};

const scan = () => {
  const refs = new Map();
  for (const file of testDirs().flatMap(walk)) {
    const rel = relative(root, file).split(sep).join("/");
    for (const { id, line } of mentions(readFileSync(file, "utf8"))) {
      if (!refs.has(id)) refs.set(id, new Map());
      const files = refs.get(id);
      if (!files.has(rel)) files.set(rel, []);
      files.get(rel).push(line);
    }
  }
  return refs;
};

const trace = () => {
  const refs = scan();
  return stages.map((stage) => {
    const rows = graph.workPackages
      .filter((w) => w.stage === stage)
      .flatMap((w) => w.requirements.map((id) => ({ id, wp: w.id, status: w.status, tests: [...(refs.get(id) ?? new Map()).keys()] })));
    return { stage, rows, traced: rows.filter((r) => r.tests.length).length, untraced: rows.filter((r) => !r.tests.length).map((r) => r.id) };
  });
};

const main = () => {
  const result = trace();
  if (flags.has("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const out = ["# Requirement traceability", "", "| Stage | Traced | Untraced |", "| --- | ---: | ---: |"];
    for (const s of result) out.push(`| ${s.stage} | ${s.traced} | ${s.untraced.length} |`);
    for (const s of result) {
      out.push("", `## ${s.stage}`, "", "| Requirement | Work package | Tests |", "| --- | --- | --- |");
      for (const r of s.rows) out.push(`| ${r.id} | ${r.wp} | ${r.tests.length ? r.tests.map((t) => `\`${t}\``).join(", ") : "**none**"} |`);
    }
    const missing = result.flatMap((s) => s.untraced.map((id) => `${s.stage} ${id}`));
    out.push("", "## Requirements with no test", "", missing.length ? missing.map((m) => `- ${m}`).join("\n") : "None.");
    console.log(out.join("\n"));
  }
  if (flags.has("--check") && result.some((s) => s.untraced.length)) process.exit(1);
};

if (process.argv[1] && import.meta.filename === join(process.argv[1])) main();
