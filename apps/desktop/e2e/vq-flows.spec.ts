/**
 * The visual quality checklist (D-111) on the surfaces a flow reaches: the first run's card, and,
 * with a workspace in Git, the conflict resolver and Recently deleted. Light and dark, at the
 * default window size and at the minimum (480 × 360), each captured for review
 * (`test-results/screens/vq-*.png`). The flows themselves are in `flows.ts`.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { quit } from "./helpers.ts";
import { hoverTooltips, settled, visualProblems } from "./visual-quality.ts";
import { conflictFlow, firstRunFlow, type FlowHooks } from "./flows.ts";

const SIZES = [{ name: "default", size: undefined }, { name: "small", size: { width: 480, height: 360 } }] as const;
const shot = (name: string) => `../../test-results/screens/vq-${name}.png`;

/** Checks and captures every step's surface, collecting what fails. */
function checks(prefix: string, problems: string[]): FlowHooks {
  return {
    at: async (page: Page, step: string) => {
      await settled(page);
      await page.screenshot({ path: shot(`${prefix}-${step}`) });
      for (const p of await visualProblems(page)) problems.push(`${prefix}-${step}: ${p}`);
    },
    tooltips: (page, controls, step) => hoverTooltips(page, controls, step.replace(/-/g, " "), problems, shot(`${prefix}-${step}-tooltip`)),
  };
}

for (const { name: sizeName, size } of SIZES) {
  for (const mode of ["light", "dark"] as const) {
    test(`D-111: the first run's card passes the visual quality checklist, ${mode}, ${sizeName} window`, async () => {
      const problems: string[] = [];
      const l = await firstRunFlow(mode, size, checks(`${sizeName}-${mode}`, problems));
      expect(problems).toEqual([]);
      await quit(l);
    });

    test(`D-111: the conflict resolver and Recently deleted pass the visual quality checklist, ${mode}, ${sizeName} window`, async () => {
      test.setTimeout(120_000);
      const problems: string[] = [];
      const l = await conflictFlow(mode, size, checks(`${sizeName}-${mode}`, problems));
      expect(problems).toEqual([]);
      await quit(l);
    });
  }
}
