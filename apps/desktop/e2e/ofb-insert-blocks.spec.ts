import { test, expect } from "./fixtures.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, quit, tempDirs } from "./helpers.ts";
import { execFileSync } from "node:child_process";

async function close(l: Awaited<ReturnType<typeof launch>>) {
  try { await quit(l); }
  finally {
    const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
    for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
  }
}

for (const entry of ["slash", "Spotlight", "toolbar"] as const) {
  test(`OFB.16: ${entry} inserts a table, Tab adds a row, and visible cells survive restart as GFM`, async () => {
    const dirs = tempDirs();
    const note = join(dirs.docs, "Welcome.md");
    writeFileSync(note, "# Plan\n\nKeep this text.\n");
    const l = await launch(dirs);
    let closed = false;
    try {
      const { page } = l;
      const editor = page.getByRole("textbox", { name: "Note", exact: true });
      await expect(editor).toBeFocused();
      await page.keyboard.press(caret.docEnd);
      await page.keyboard.press("Enter");
      if (entry === "slash") {
        await page.keyboard.type("/");
        const blocks = page.getByRole("listbox", { name: "Insert a block" });
        await expect(blocks.getByRole("option", { name: /^Table/ })).toBeVisible();
        await blocks.getByRole("option", { name: /^Table/ }).click();
      } else if (entry === "Spotlight") {
        await page.keyboard.press("Control+/");
        await page.getByRole("combobox").pressSequentially("> Insert table");
        const command = page.getByRole("option", { name: /^Insert table/ });
        await expect(command).not.toHaveAttribute("aria-disabled", "true");
        await command.click();
      } else {
        await page.keyboard.press("Control+.");
        const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
        await toolbar.getByRole("button", { name: "More", exact: true }).click();
        await page.getByRole("menuitem", { name: "Insert table", exact: true }).click();
      }
      const table = editor.locator("table");
      await expect(table.locator("tr")).toHaveCount(3);
      await expect(table.locator("th")).toHaveCount(3);
      for (const [index, value] of ["Task", "Owner", "Status", "Draft", "Me", "Doing", "Edit", "You", "Next"].entries()) {
        await page.keyboard.type(value);
        if (index < 8) await page.keyboard.press("Tab");
      }
      await expect(table.locator("th")).toHaveText(["Task", "Owner", "Status"]);
      await page.keyboard.press("Tab");
      await page.keyboard.type("Added");
      await expect(table.locator("tr")).toHaveCount(4);
      await expect(table.locator("td")).toHaveText(["Draft", "Me", "Doing", "Edit", "You", "Next", "Added", "", ""]);
      await expect.poll(() => readFileSync(note, "utf8")).toMatch(/\| Task\s+\| Owner\s+\| Status\s+\|/);
      await expect.poll(() => readFileSync(note, "utf8")).toMatch(/\| Added\s+\|\s+\|\s+\|/);
      await expect.poll(() => readFileSync(note, "utf8")).toContain("Keep this text.");
      const saved = readFileSync(note, "utf8");
      expect(saved).toMatch(/\| -+ \| -+ \| -+ \|/);
      await close(l); closed = true;
      const reopened = await launch(dirs);
      try {
        const reopenedTable = reopened.page.getByRole("textbox", { name: "Note", exact: true }).locator("table");
        await expect(reopenedTable.locator("th")).toHaveText(["Task", "Owner", "Status"]);
        await expect(reopenedTable.locator("td")).toHaveText(["Draft", "Me", "Doing", "Edit", "You", "Next", "Added", "", ""]);
        expect(readFileSync(note, "utf8")).toBe(saved);
      } finally { await close(reopened); }
    } finally { if (!closed) await close(l); }
  });
}
