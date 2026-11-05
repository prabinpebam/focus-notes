import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { quit } from "./helpers.ts";
import { reset, scheme, settings, start, SURFACES } from "./surfaces.ts";
import { settled, visualProblems } from "./visual-quality.ts";

for (const want of ["light", "dark"] as const) {
  test(`compact Settings and Find keep their content insets, ${want}`, async () => {
    const l = await start({ width: 480, height: 360 });
    try {
      await scheme(l.page, want);
      for (const category of ["Account", "Workspace", "Appearance"]) {
        await settings(l.page, category);
        const dialog = l.page.getByRole("dialog", { name: "Settings", exact: true });
        await expect(dialog.getByRole("tablist")).toHaveAttribute("aria-orientation", "horizontal");
        await settled(l.page);
        expect(await dialog.locator("[data-tab-content]").evaluate(el => {
          const cs = getComputedStyle(el);
          return Number.parseFloat(cs.paddingInlineStart);
        })).toBe(24);
        expect(await visualProblems(l.page)).toEqual([]);
        await reset(l.page);
      }
      await SURFACES.find(surface => surface.name === "find in all notes")!.open(l.page);
      const sheet = l.page.getByRole("complementary", { name: "Find in all notes", exact: true });
      await expect(sheet).toHaveAttribute("data-short", "");
      await settled(l.page);
      expect(await visualProblems(l.page)).toEqual([]);
      const content = sheet.locator("[data-sheet-content]");
      await content.evaluate(el => { (el as HTMLElement).style.paddingBlockEnd = "0px"; });
      expect(await visualProblems(l.page)).toEqual(expect.arrayContaining([expect.stringContaining("uniform padding: sheet")]));
      await content.evaluate(el => { (el as HTMLElement).style.removeProperty("padding-block-end"); });
      const scroller = sheet.locator("[data-sheet-main]");
      await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      expect(await sheet.evaluate(el => {
        const frame = el.querySelector("[data-sheet-main]")!;
        const content = el.querySelector("[data-sheet-content]")!;
        const end = content.lastElementChild!;
        return frame.getBoundingClientRect().bottom - end.getBoundingClientRect().bottom;
      })).toBeCloseTo(16, 0);
      expect(await visualProblems(l.page)).toEqual([]);
    } finally {
      try { await quit(l); }
      finally {
        const script = fileURLToPath(new URL("../../../tools/dev/close-test-apps.ps1", import.meta.url));
        for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
      }
    }
  });
}
