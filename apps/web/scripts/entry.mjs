// Generates the web app's entry document from the design system's template (CSP included).
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { renderEntryHtml, DEFAULT_CSP } from "../../../packages/ui/entry/template.mjs";

// The browser talks only to its own site (D-90): no GitHub API, no other host.
// frame-ancestors is ignored in a meta CSP, so it's dropped rather than implied.
const csp = DEFAULT_CSP.replace("; frame-ancestors 'none'", "");
const dir = join(import.meta.dirname, "..", "src");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "index.html"), renderEntryHtml({ title: "Focus Notes", script: "./main.ts", csp, icon: "./favicon.svg" }));
console.log("Web entry document generated.");
