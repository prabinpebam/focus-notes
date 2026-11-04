import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./fixtures.ts";
import { launch, quit, tempDirs } from "./helpers.ts";

test("review feedback: project scheme reaches Settings and edge blur excludes both docked panels", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, Array.from({ length: 30 }, (_, i) => `## Section ${i}\n\nSample paragraph ${i} has enough words to fill the writing area and keep both scroll edges active.\n`).join("\n"));
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({
    version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note,
    appearance: "dark", focusMode: false, outlinePinned: true, filesPinned: true,
    projectSettings: { [dirs.docs]: { name: "Sample project", accent: "blue", logo: "rocket", watermark: "off", font: "app", theme: "sepia" } },
  }));
  writeFileSync(join(dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, width: 1400, height: 850 } }));
  const baseline = process.env.FOCUS_NOTES_REVIEW_BASELINE;
  const l = await launch(dirs, {}, baseline ? { entrypoint: join(baseline, "app", "out", "main", "main.mjs") } : {});
  try {
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Sample paragraph");
    const files = l.page.getByRole("complementary", { name: "Files", exact: true });
    await expect(files).toHaveAttribute("data-docked", "");
    await expect(l.page.locator("[data-doc-minimap-card]")).toHaveAttribute("data-docked", "");
    await l.page.locator("[data-editor-scroller]").evaluate(el => { el.scrollTop = 500; });
    await expect(l.page.locator('[data-scroll-edge="top"]')).toBeVisible();
    await expect(l.page.locator('[data-scroll-edge="bottom"]')).toBeVisible();
    const shots = "E:\\Projects\\side-projects\\focus-notes-work\\review\\ui-states-owner-feedback";
    mkdirSync(shots, { recursive: true });
    await l.page.screenshot({ path: join(shots, baseline ? "before.png" : "after.png") });
    if (!baseline) {
      for (const edge of await l.page.locator("[data-scroll-edge]").all()) {
        const bounds = await edge.boundingBox();
        const area = await l.page.locator("[data-editor-scroller]").boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(area!.x);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(area!.x + area!.width);
      }
    }
    await l.page.keyboard.press("Control+,");
    await expect(l.page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
    const scheme = await l.page.getByRole("dialog", { name: "Settings", exact: true }).evaluate(el => getComputedStyle(el).colorScheme);
    if (!baseline) {
      expect(scheme).toBe("light");
      await expect(l.page.locator("html")).toHaveAttribute("data-theme", "sepia");
    }
    console.log(JSON.stringify({ baseline: Boolean(baseline), settingsScheme: scheme }));
  } finally {
    try { await quit(l); }
    finally {
      for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", fileURLToPath(new URL("../../../tools/dev/close-test-apps.ps1", import.meta.url)), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
    }
  }
});
