// Generates the web app's entry document from the design system's template (CSP included).
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { renderEntryHtml, DEFAULT_CSP } from "../../../packages/ui/entry/template.mjs";
import en from "../../../packages/views/messages/en.json" with { type: "json" };

// The browser talks only to its own site (D-90): no GitHub API, no other host.
// frame-ancestors is ignored in a meta CSP, so it's dropped rather than implied.
const csp = DEFAULT_CSP.replace("; frame-ancestors 'none'", "");
const dir = join(import.meta.dirname, "..", "src");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "index.html"), renderEntryHtml({ title: "Focus Notes", script: "./main.ts", csp, icon: "./favicon.svg" }));

// The share reader (WP-5.4, D-125) renders no HTML from text, so no Trusted Types policy exists at all.
// It shows no images at all, so not even data: URLs (review I9).
const shareCsp = csp.replace(/trusted-types [^;]+/, "trusted-types 'none'").replace("img-src 'self' data:", "img-src 'self'");
mkdirSync(join(dir, "s"), { recursive: true });
writeFileSync(join(dir, "s", "index.html"), renderEntryHtml({ title: en["share.reader.documentTitle"], script: "../share/main.ts", csp: shareCsp, icon: "../favicon.svg", page: "reader" }));
console.log("Web entry documents generated.");
