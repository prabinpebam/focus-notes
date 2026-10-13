import type { Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

/** Runs axe-core inside the page (Electron can't open the helper page @axe-core/playwright needs). */
export async function axeViolations(page: Page): Promise<string[]> {
  await page.evaluate(axeSource);
  const result = await page.evaluate(async () => {
    const axe = (globalThis as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }> } }).axe;
    return axe.run(document, { resultTypes: ["violations"] });
  });
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
}
