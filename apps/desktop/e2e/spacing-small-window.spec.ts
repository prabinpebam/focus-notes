import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test, expect } from "./fixtures.ts";
import { quit } from "./helpers.ts";
import { reset, scheme, start, SURFACES } from "./surfaces.ts";
import { settled, visualProblems } from "./visual-quality.ts";

for (const theme of ["light", "dark"] as const) {
  test(`Small-window Find in all and Settings preserve content insets, ${theme}`, async () => {
    const l = await start({ width: 480, height: 360 });
    try {
      await scheme(l.page, theme);
      const problems: string[] = [];
      for (const name of ["find in all notes", "settings account"]) {
        await SURFACES.find(surface => surface.name === name)!.open(l.page);
        await settled(l.page);
        await l.page.screenshot({ path: `../../test-results/screens/spacing-batch-${theme}-${name.replaceAll(" ", "-")}.png` });
        problems.push(...(await visualProblems(l.page)).map(problem => `${name}: ${problem}`));
        if (name === "find in all notes") {
          const content = l.page.locator("[data-sheet-body] > [data-sheet-content]");
          expect(await content.evaluate(el => getComputedStyle(el).paddingBottom)).toBe("16px");
          await content.evaluate(el => { (el as HTMLElement).style.paddingBottom = "0px"; });
          expect(await visualProblems(l.page)).toEqual(expect.arrayContaining([expect.stringMatching(/uniform padding:.*bottom 0/)]));
          await content.evaluate(el => { (el as HTMLElement).style.removeProperty("padding-bottom"); });
        } else {
          const content = l.page.locator("[data-tab-content]");
          expect(await content.evaluate(el => getComputedStyle(el).paddingInlineStart)).toBe("24px");
          await content.evaluate(el => { (el as HTMLElement).style.paddingInlineStart = "16px"; });
          expect(await visualProblems(l.page)).toEqual(expect.arrayContaining([expect.stringMatching(/uniform padding:.*left 16/)]));
          await content.evaluate(el => { (el as HTMLElement).style.removeProperty("padding-inline-start"); });
          for (const tab of ["Workspace", "Appearance"]) {
            await l.page.getByRole("tab", { name: tab, exact: true }).click();
            await settled(l.page);
            problems.push(...(await visualProblems(l.page)).map(problem => `settings ${tab}: ${problem}`));
          }
        }
        await reset(l.page);
      }
      expect(problems).toEqual([]);
    } finally {
      try { await quit(l); } finally {
        if (process.platform === "win32") for (const flags of [["-WhatIf"], []]) {
          execFileSync("pwsh", ["-File", join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1"), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
        }
      }
    }
  });
}
