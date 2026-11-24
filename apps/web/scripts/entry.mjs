// Generates the web app's entry documents from the design system's template (CSP included).
// --check fails, without writing, when the committed documents differ from what it would write (D-138).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { renderEntryHtml, DEFAULT_CSP } from "../../../packages/ui/entry/template.mjs";
import en from "../../../packages/views/messages/en.json" with { type: "json" };

// The browser talks only to its own site (D-90): no GitHub API, no other host.
// frame-ancestors is ignored in a meta CSP, so it's dropped rather than implied.
const csp = DEFAULT_CSP.replace("; frame-ancestors 'none'", "");
const dir = join(import.meta.dirname, "..", "src");
// The retired web app's export page and the share reader (WP-5.4, D-125, D-292) render no HTML from
// text and use no search worker, so no Trusted Types policy exists at all.
// Images are only the share's own, decrypted in the page and shown from data: URLs (WP-9.6; was review I9).
const pageCsp = csp.replace(/trusted-types [^;]+/, "trusted-types 'none'");
const files = {
  "index.html": renderEntryHtml({ title: "Focus Notes", script: "./main.ts", csp: pageCsp, icon: "./favicon.svg", page: "reader" }),
  "s/index.html": renderEntryHtml({ title: en["share.reader.documentTitle"], script: "../share/main.ts", csp: pageCsp, icon: "../favicon.svg", page: "reader" }),
};

if (process.argv.includes("--check")) {
  const lf = (t) => t.replace(/\r\n/g, "\n");
  const stale = Object.entries(files).filter(([f, t]) => { const p = join(dir, f); return !existsSync(p) || lf(readFileSync(p, "utf8")) !== lf(t); }).map(([f]) => `apps/web/src/${f}`);
  if (stale.length) { console.error(`Web entry documents out of date: ${stale.join(", ")}. Run: node apps/web/scripts/entry.mjs`); process.exit(1); }
  console.log("Web entry documents up to date.");
} else {
  for (const [f, t] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), t); }
  console.log("Web entry documents generated.");
}