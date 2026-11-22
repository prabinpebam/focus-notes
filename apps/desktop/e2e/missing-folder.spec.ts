import { test, expect } from "./fixtures.ts";
import { launch, quit, tempDirs } from "./helpers.ts";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_FILES } from "@focus-notes/core/inventory";

test("FRE-11, FRE-12: missing folder stays missing on Cancel without changing original bytes", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Original.md");
  const content = "# Original\n\nThese are the exact original notes.\n";
  writeFileSync(note, content);
  const record = { version: 1, folder: dirs.docs, kind: "local" };
  writeFileSync(join(dirs.userData, DATA_FILES.workspace), JSON.stringify(record));
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
  const moved = `${dirs.docs}-moved`;
  renameSync(dirs.docs, moved);
  const l = await launch(dirs);
  try {
    const { page } = l;
    await expect(page.getByRole("heading", { name: "Your notes folder is missing", exact: true })).toBeVisible();
    expect(existsSync(dirs.docs)).toBe(false);
    expect(JSON.parse(readFileSync(join(dirs.userData, DATA_FILES.workspace), "utf8"))).toEqual(record);
    const capture = process.env.FOCUS_NOTES_G5_CAPTURE;
    if (capture) {
      mkdirSync(capture, { recursive: true });
      await page.screenshot({ path: join(capture, "missing-folder.png") });
      writeFileSync(join(capture, "provenance.json"), JSON.stringify({ head: process.env.FOCUS_NOTES_G5_HEAD, test: test.info().title, pid: l.pid, source: "hidden built Electron renderer page.screenshot", disposable: true, recorded: dirs.docs, moved, at: new Date().toISOString() }, null, 2));
    }
    await l.app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    });
    await page.getByRole("button", { name: /^Find the folder/ }).click();
    await expect(page.getByRole("heading", { name: "Your notes folder is missing", exact: true })).toBeVisible();
    expect(existsSync(dirs.docs)).toBe(false);
    expect(readFileSync(join(moved, "Original.md"), "utf8")).toBe(content);
    expect(existsSync(dirs.docs)).toBe(false);
    expect(JSON.parse(readFileSync(join(dirs.userData, DATA_FILES.workspace), "utf8"))).toEqual(record);
  } finally {
    await quit(l);
  }
});
