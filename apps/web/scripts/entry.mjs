// Generates the web app's entry document from the design system's template (CSP included).
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { renderEntryHtml, DEFAULT_CSP } from "../../../packages/ui/entry/template.mjs";

// The only network destination is GitHub's API (D-81).
const csp = DEFAULT_CSP.replace("connect-src 'self'", "connect-src 'self' https://api.github.com").replace("; frame-ancestors 'none'", "");
const dir = join(import.meta.dirname, "..", "src");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "index.html"), renderEntryHtml({ title: "Focus Notes", script: "./main.ts", csp }));
console.log("Web entry document generated.");
