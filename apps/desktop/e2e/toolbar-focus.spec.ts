import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { caret, quit } from "./helpers.ts";
import { reset, scheme, sendFeedback, start } from "./surfaces.ts";

for (const want of ["light", "dark"] as const) {
  test(`EDT-12: keyboard selection immediately after focus survives and opens formatting, compact ${want}`, async () => {
    test.setTimeout(120_000);
    const l = await start({ width: 480, height: 360 });
    try {
      await scheme(l.page, want);
      for (let attempt = 0; attempt < 10; attempt++) {
        await sendFeedback(l.page, "Idea");
        await reset(l.page);
        await l.page.keyboard.press(caret.docStart);
        await l.page.keyboard.press("ArrowDown");
        await l.page.keyboard.press(process.platform === "darwin" ? "Alt+Shift+ArrowRight" : "Control+Shift+ArrowRight");
        await expect(l.page.getByRole("toolbar", { name: "Text formatting", exact: true })).toBeVisible();
        expect(await l.page.evaluate(() => getSelection()?.toString())).toBe("A ");
        await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toBeFocused();
        await reset(l.page);
      }
    } finally {
      try { await quit(l); }
      finally {
        const script = fileURLToPath(new URL("../../../tools/dev/close-test-apps.ps1", import.meta.url));
        for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
      }
    }
  });
}
