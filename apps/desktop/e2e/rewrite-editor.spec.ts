import { test, expect } from "./fixtures.ts";
import { launch, tempDirs, caret, onDisk } from "./helpers.ts";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

test("actual file editor: selection, stream, no partial disk save, Accept, native undo, cancel and outside edit", async () => {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, "public"), { recursive: true });
  const file = join(dirs.docs, "public", "sample.md");
  const original = "We are planning a community garden.\n\nKeep this paragraph unchanged.\n";
  writeFileSync(file, original);
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: file }));
  const { app, page } = await launch(dirs, {}, { args: ["--rewrite-editor-demo"] });
  const captures = resolve("../../test-results/rewrite-editor");
  mkdirSync(captures, { recursive: true });
  try {
    const editor = page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toContainText("We are planning");
    await expect(editor).toHaveAttribute("data-rewrite-enabled", "true");
    await editor.press(caret.docStart);
    await editor.press("Control+Shift+r");
    const review = page.getByRole("complementary", { name: "Rewrite with AI", exact: true });
    await expect(review).toBeVisible();
    await review.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(review.getByText("Rewriting with the fake provider…", { exact: true }).last()).toBeVisible();
    expect(readFileSync(file, "utf8")).toBe(original);
    await page.screenshot({ path: `${captures}/01-actual-editor-stream.png` });
    await expect(review.getByRole("button", { name: "Accept", exact: true })).toBeEnabled();
    await expect(page.locator("[data-rewrite-proposal]")).toContainText("Plan a community");
    const assertLayout = async () => {
      const proposal = await page.locator("[data-rewrite-proposal]").boundingBox();
      const panel = await review.boundingBox();
      expect(proposal!.x + proposal!.width).toBeLessThanOrEqual(panel!.x);
      expect(await review.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      for (const button of await review.getByRole("button").all()) {
        const box = await button.boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(panel!.x + panel!.width);
      }
    };
    await assertLayout();
    await page.screenshot({ path: `${captures}/04-inline-review.png` });
    await page.setViewportSize({ width: 800, height: 700 });
    await assertLayout();
    await page.screenshot({ path: `${captures}/06-small-review.png` });
    await page.setViewportSize({ width: 1280, height: 800 });
    await review.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(review.getByRole("button", { name: "Accept", exact: true })).toBeEnabled();
    await review.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(editor).toContainText("Plan a community garden and agree on the next steps.");
    await onDisk(file, "Plan a community garden");
    await expect(editor).toContainText("Keep this paragraph unchanged.");
    await page.screenshot({ path: `${captures}/02-actual-editor-accepted.png` });
    await editor.press("Control+z");
    await expect(editor).toContainText("We are planning");
    await expect.poll(() => readFileSync(file, "utf8")).toBe(original);
    await editor.press("Control+Shift+r");
    await review.getByRole("button", { name: "Rewrite", exact: true }).click();
    await review.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(editor).toContainText("We are planning");
    expect(readFileSync(file, "utf8")).toBe(original);
    await editor.press(caret.docStart);
    await editor.press("Control+Shift+ArrowRight");
    const selected = await page.evaluate(() => {
      const box = getSelection()!.getRangeAt(0).getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });

    await page.mouse.click(selected.x, selected.y, { button: "right" });
    const menu = page.getByRole("menu").filter({ has: page.getByRole("menuitem", { name: /Rewrite with AI/ }) });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /^Copy/ }).first()).toBeVisible();
    await page.screenshot({ path: `${captures}/07-context-menu.png` });
    await menu.getByRole("menuitem", { name: /Rewrite with AI/ }).click();
    await review.getByRole("textbox", { name: "Rewrite instruction" }).fill("Make it friendly");
    await review.getByRole("button", { name: "Toggle simulated error" }).click();
    await review.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(review.getByRole("status")).toContainText("couldn’t finish");
    await expect(review).not.toContainText("provider settings");
    await page.screenshot({ path: `${captures}/05-error.png` });
    await review.getByRole("button", { name: "Toggle simulated error" }).click();
    await review.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(review.getByRole("button", { name: "Accept", exact: true })).toBeEnabled();
    await review.getByRole("button", { name: "Discard", exact: true }).click();
    expect(readFileSync(file, "utf8")).toBe(original);
    await editor.press("Control+Shift+r");
    await review.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(review.getByRole("button", { name: "Accept", exact: true })).toBeEnabled();
    writeFileSync(file, original + "\nExternal edit survives.\n");
    await expect(review).not.toBeVisible();
    await expect(editor).toContainText("External edit survives.");
    expect(readFileSync(file, "utf8")).toContain("External edit survives.");
    await page.screenshot({ path: `${captures}/03-outside-edit.png` });
  } finally { await app.close(); }
});

test("unsupported headings and tables give actionable feedback without touching the file", async () => {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, "public"), { recursive: true });
  const file = join(dirs.docs, "public", "sample.md");
  const original = "# Garden plan\n\n| Task | Owner |\n| --- | --- |\n| Plant | Team |\n";
  writeFileSync(file, original);
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: file }));
  const { app, page } = await launch(dirs, {}, { args: ["--rewrite-editor-demo"] });
  try {
    const editor = page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toHaveAttribute("data-rewrite-enabled", "true");
    const review = page.getByRole("complementary", { name: "Rewrite with AI", exact: true });
    for (const target of [editor.getByRole("heading"), editor.getByRole("cell", { name: "Plant", exact: true })]) {
      await target.click();
      await editor.press("Control+Shift+r");
      await expect(review).toContainText("Headings and tables aren’t supported yet.");
      expect(readFileSync(file, "utf8")).toBe(original);
      await review.getByRole("button", { name: "Close rewrite" }).focus();
      await review.getByRole("button", { name: "Close rewrite" }).press("Escape");
      await expect(review).not.toBeVisible();
    }
  } finally { await app.close(); }
});
