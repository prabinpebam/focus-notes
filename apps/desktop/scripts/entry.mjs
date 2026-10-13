// Generates the entry documents from the design system's template before Vite builds.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { renderEntryHtml } from "../../../packages/ui/entry/template.mjs";

const here = join(import.meta.dirname, "..");
const targets = [
  { dir: "src/renderer", title: "Focus Notes", script: "./main.ts" },
  { dir: "src/gallery", title: "Focus Notes component gallery", script: "./main.ts" },
];
for (const t of targets) {
  mkdirSync(join(here, t.dir), { recursive: true });
  writeFileSync(join(here, t.dir, "index.html"), renderEntryHtml({ title: t.title, script: t.script }));
}
console.log("Entry documents generated.");
