/**
 * The visual quality checklist (D-111) on the surfaces a flow reaches: the first run's card (its four
 * steps, D-124), and,
 * with a workspace in Git, the conflict resolver and Recently deleted. Light and dark, at the
 * default window size and at the minimum (480 × 360), each captured for review
 * (`test-results/screens/vq-*.png`). The flows themselves are in `flows.ts`.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { quit } from "./helpers.ts";
import { hoverTooltips, settled, visualProblems } from "./visual-quality.ts";
import { conflictFlow, firstRunFlow, notesFlow, type FlowHooks } from "./flows.ts";
import { writeFileSync } from "node:fs";
import { anchorScore, BUDGETS, economyScore, measureVisual, visualScoreProblems, welcomeProblems } from "./visual-score.ts";

const SIZES = [{ name: "default", size: undefined }, { name: "small", size: { width: 480, height: 360 } }, { name: "large", size: { width: 1600, height: 1000 } }] as const;
/** The setup's primary path (D-127): each step is scored; disclosures opened (More options, Having trouble?) aren't. */
const PRIMARY = ["first-run-welcome", "first-run-connect", "first-run-connect-found", "first-run-notes-found", "first-run-notes-create", "first-run-ready"];
const shot = (name: string) => `../../test-results/screens/vq-${name}.png`;

/** Checks and captures every step's surface, collecting what fails. */
function checks(prefix: string, problems: string[]): FlowHooks {
  return {
    at: async (page: Page, step: string) => {
      await settled(page);
      await page.screenshot({ path: shot(`${prefix}-${step}`) });
      for (const p of await visualProblems(page)) problems.push(`${prefix}-${step}: ${p}`);
      // D-127: the measurable parts of the visual score; D-126: Welcome is the whole window, its mark and title centred.
      if (PRIMARY.includes(step)) {
        problems.push(...(await visualScoreProblems(page, `${prefix}-${step}`)));
        // The measures beside the screenshot, for the self-score in the evidence record.
        const m = await measureVisual(page);
        writeFileSync(shot(`${prefix}-${step}`).replace(/\.png$/, ".vvs.json"), JSON.stringify({ ...m, anchorScore: anchorScore(m.anchor), economyScore: economyScore(m.words, m.maxLines, BUDGETS.onboarding) }));
      }
      if (step === "first-run-welcome") problems.push(...(await welcomeProblems(page)).map((p) => `${prefix}: ${p}`));
    },
    tooltips: (page, controls, step) => hoverTooltips(page, controls, step.replace(/-/g, " "), problems, shot(`${prefix}-${step}-tooltip`)),
  };
}

for (const { name: sizeName, size } of SIZES) {
  for (const mode of ["light", "dark"] as const) {
    test(`D-111, D-126, D-127: the full-window setup passes the visual quality checklist and the visual score, ${mode}, ${sizeName} window`, async () => {
      const problems: string[] = [];
      const l = await firstRunFlow(mode, size, checks(`${sizeName}-${mode}`, problems));
      expect(problems).toEqual([]);
      await quit(l);
    });

    test(`D-111, D-124, D-126, D-127: the setup's Connect, Your notes (found, Create my notes, More options), and Ready scroll inside and pass the visual score, ${mode}, ${sizeName} window`, async () => {
      test.setTimeout(150_000);
      const problems: string[] = [];
      const { l, w } = await notesFlow(mode, size, checks(`${sizeName}-${mode}`, problems));
      try {
        expect(problems).toEqual([]);
      } finally {
        await quit(l);
        w.server.close();
      }
    });

    if (sizeName !== "large") test(`D-111: the conflict resolver and Recently deleted pass the visual quality checklist, ${mode}, ${sizeName} window`, async () => {
      test.setTimeout(120_000);
      const problems: string[] = [];
      const l = await conflictFlow(mode, size, checks(`${sizeName}-${mode}`, problems));
      expect(problems).toEqual([]);
      await quit(l);
    });
  }
}
