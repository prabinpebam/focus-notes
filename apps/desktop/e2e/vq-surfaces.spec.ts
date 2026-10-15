/**
 * The visual quality checklist (Foundations → Visual quality, D-111) on every surface, opened from
 * the keyboard, in a light and a dark theme, at the default window size and at the minimum
 * (480 × 360): overlays inside the window, dialogs never edge to edge, content inside its surface,
 * uniform padding, floating side sheets, gaps between items, fading scroll edges, aligned rows, and
 * anchored tooltips. Each surface is also captured for the critical review in screenshots
 * (`test-results/screens/vq-*.png`).
 */
import { test, expect, screenAllowed, SCREEN_SKIP } from "./fixtures.ts";
import { quit } from "./helpers.ts";
import { dialogNeverShrinks, hoverTooltips, listRings, scrollbarClearOfCorners, settled, visualProblems } from "./visual-quality.ts";
import { SIZES, SURFACES, mod, reset, scheme, settings, spotlight, start } from "./surfaces.ts";

for (const { name: sizeName, size } of SIZES) {
  for (const want of ["light", "dark"] as const) {
    test(`D-111: every surface passes the visual quality checklist, ${want}, ${sizeName} window`, async () => {
      test.setTimeout(300_000);
      // The small window is a real window of 480 × 360 on the screen: on CI, or with FOCUS_NOTES_E2E_ALLOW_SCREEN=1 (D-141).
      test.skip(Boolean(size) && !screenAllowed(), SCREEN_SKIP);
      const l = await start(size);
      const { page } = l;
      await scheme(page, want);
      await reset(page);
      const problems: string[] = [];
      for (const s of SURFACES.filter((x) => !process.env.VQ_ONLY || process.env.VQ_ONLY.split(",").includes(x.name))) {
        try {
          await s.open(page);
        } catch (e) {
          problems.push(`${s.name}: couldn't open it: ${(e as Error).message.split("\n")[0]}`);
          await reset(page);
          continue;
        }
        await settled(page);
        await page.screenshot({ path: `../../test-results/screens/vq-${sizeName}-${want}-${s.name.replace(/\s+/g, "-")}.png` });
        for (const p of await visualProblems(page, s.opts)) problems.push(`${s.name}: ${p}`);
        if (s.tooltips) await hoverTooltips(page, s.tooltips(page), s.name, problems, `../../test-results/screens/vq-${sizeName}-${want}-${s.name.replace(/\s+/g, "-")}-tooltip.png`);
        // The focus ring at both ends of whatever list holds focus (D-111); last, as it moves focus
        // (and so the selection) the tooltips were checked with.
        problems.push(...await listRings(page, s.name));
        await reset(page).catch((e: Error) => { throw new Error(`Closing ${s.name}: ${e.message}`); });
      }
      // The note's scrollbar thumb never runs into the window's rounded corners (D-111).
      problems.push(...await scrollbarClearOfCorners(page));
      // Dialogs never shrink while open (D-111): tabs that hold less, and filters that leave less.
      await settings(page, "Workspace");
      const dialog = page.getByRole("dialog", { name: "Settings" });
      problems.push(...await dialogNeverShrinks(page, "settings", ["Appearance", "Account", "Workspace"].map((c) => () => dialog.getByRole("tab", { name: c }).click())));
      await reset(page);
      await page.keyboard.press(`${mod}+Shift+Slash`);
      await expect(page.getByRole("searchbox", { name: "Search shortcuts" })).toBeFocused();
      problems.push(...await dialogNeverShrinks(page, "cheat sheet", [() => page.keyboard.type("bold"), () => page.keyboard.type("zzz")]));
      await reset(page);
      await spotlight(page, `${mod}+Slash`);
      problems.push(...await dialogNeverShrinks(page, "spotlight", [() => page.keyboard.type("idea 2"), () => page.keyboard.type("zzz")]));
      await reset(page);
      expect(problems).toEqual([]);
      await quit(l);
    });
  }
}
