/**
 * WP-8.9 journey for Files → Recovered (QLT-06, D-190, D-221): text a crash left that couldn't go
 * back in its note shows in Files, and the launch toast's Review opens it. By pointer a draft is
 * opened and saved as a new note (the note has its text, the row goes); by keyboard one is reached,
 * opened, copied and discarded after a confirmation. Nothing else is written to the workspace.
 */
import { test, expect, type Locator, type Page } from "./fixtures.ts";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { launch, quit, tempDirs } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

/** The draft store's folder for a workspace: `workspaceKey()` in src/main/drafts.ts. */
function draftDir(userData: string, workspace: string): string {
  let p = realpathSync.native(workspace).split(sep).join("/");
  if (process.platform === "win32") p = p.toLowerCase();
  return join(userData, "recovery", createHash("sha256").update(p).digest("hex").slice(0, 16));
}
/** A draft as the store writes it: a JSON header line, then the text. A path to no note makes it Recovered. */
function seedDraft(userData: string, workspace: string, id: string, path: string, text: string, at: number): void {
  const dir = draftDir(userData, workspace);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.draft`), `${JSON.stringify({ v: 1, draft: id, seq: 0, path, at })}\n${text}`);
}
/** Every file in the workspace, relative with `/`. */
function filesIn(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join("/"))
    .sort();
}
async function tabTo(page: Page, target: Locator, max = 16) {
  for (let i = 0; i < max && !(await target.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(target).toBeFocused();
}
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};
async function axeInBothThemes(l: Awaited<ReturnType<typeof launch>>): Promise<string[]> {
  const found: string[] = [];
  for (const t of ["light", "dark"] as const) {
    await l.app.evaluate(({ nativeTheme }, s) => {
      nativeTheme.themeSource = s;
      nativeTheme.emit("updated");
    }, t);
    await expect.poll(() => l.page.evaluate(() => document.documentElement.style.colorScheme)).toBe(t);
    found.push(...(await settledAxe(l.page)).map((v) => `${t}: ${v}`));
  }
  return found;
}

const IDEAS = { id: "01JRECOVEREDIDEAS0000000001", text: "# Lost ideas\n\nFirst thought.\n\nSecond thought.\n" };
const SCRATCH = { id: "01JRECOVEREDSCRATCH00000002", text: "# Scratch\n\nThrow this away.\n" };

test("QLT-06: Files → Recovered: Review opens it; a draft saved as a new note by pointer, another copied and discarded by keyboard", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome to Focus Notes\n\nHello.\n");
  mkdirSync(join(dirs.docs, "notes"));
  writeFileSync(join(dirs.docs, "notes", "keep.md"), "# Keep\n\nStays.\n");
  const at = Date.now() - 60_000;
  seedDraft(dirs.userData, dirs.docs, IDEAS.id, "notes/gone.md", IDEAS.text, at);
  seedDraft(dirs.userData, dirs.docs, SCRATCH.id, "notes/also-gone.md", SCRATCH.text, at - 1000);
  const before = filesIn(dirs.docs);

  const l = await launch(dirs, { FOCUS_NOTES_MEMORY_CLIPBOARD: "1" });
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toContainText("Welcome");
    // The launch says what it kept, and Review opens Recovered.
    await expect(page.locator("#toasts").getByText("Kept 2 drafts that couldn't go back in their notes.")).toBeVisible({ timeout: 15_000 });
    await page.locator("#toasts").getByRole("button", { name: "Review" }).click();
    const files = page.getByRole("complementary", { name: "Files" });
    await expect(files.getByRole("heading", { name: "Recovered" })).toBeVisible();
    await expect(files.getByText("2 drafts couldn't go back in their notes.")).toBeVisible();
    const card = (title: string) => files.locator("[data-item-card]").filter({ hasText: title });
    await expect(card("Lost ideas")).toContainText(new RegExp(`Was in “notes” · .+ · ${IDEAS.text.length} characters`));
    await expect(card("Lost ideas")).toContainText(/Kept until /);
    await expect(card("Scratch")).toBeVisible();
    // In place of the tree, like Recently deleted.
    await expect(files.getByRole("tree")).toHaveCount(0);
    expect(await axeInBothThemes(l)).toEqual([]);
    await page.screenshot({ path: "../../test-results/screens/files-recovered.png" });

    // By pointer: open one, read-only, and save it as a new note where it was.
    await card("Lost ideas").click();
    const pane = files.getByRole("region", { name: "Lost ideas" });
    await expect(pane.getByRole("listitem")).toHaveText(["# Lost ideas", "First thought.", "Second thought."]);
    await expect(files.getByRole("textbox")).toHaveCount(0);
    expect(await axeInBothThemes(l)).toEqual([]);
    await page.screenshot({ path: "../../test-results/screens/files-recovered-draft.png" });
    await files.getByRole("button", { name: "Save as a new note…" }).click();
    const picker = page.getByRole("dialog", { name: "Save “Lost ideas” as a new note in…" });
    await expect(picker.locator("[role=option][aria-selected=true]")).toContainText("notes");
    expect(await settledAxe(page)).toEqual([]);
    await page.keyboard.press("Enter");
    await expect(page.locator("#toasts").getByText("Saved “Lost ideas” as a new note in “notes”.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Note" })).toContainText("Second thought.");
    const added = () => filesIn(dirs.docs).filter((f) => !before.includes(f));
    await expect.poll(added).toHaveLength(1);
    const saved = added()[0]!;
    expect(saved).toMatch(/^notes\/[^/]+\.md$/);
    expect(readFileSync(join(dirs.docs, saved), "utf8")).toBe(IDEAS.text);
    await expect.poll(() => readdirSync(draftDir(dirs.userData, dirs.docs)).sort()).toEqual([`${SCRATCH.id}.draft`]);

    // The list stays, with what's left.
    await expect(files.getByRole("status").filter({ hasText: "1 draft couldn't go back in its note." })).toBeVisible();
    await expect(card("Lost ideas")).toHaveCount(0);

    // By keyboard: back to the tree, then the footer's Recovered reaches the one left; open, copy, discard.
    await tabTo(page, files.getByRole("button", { name: "Browse files" }), 24);
    await page.keyboard.press("Enter");
    await expect(files.getByRole("tree")).toBeVisible();
    await tabTo(page, files.getByRole("button", { name: "Recovered · 1" }), 24);
    await page.keyboard.press("Enter");
    await expect(files.getByText("1 draft couldn't go back in its note.")).toBeVisible();
    await expect(card("Lost ideas")).toHaveCount(0);
    await expect(card("Scratch")).toBeFocused();
    await page.keyboard.press("Enter");
    const save = files.getByRole("button", { name: "Save as a new note…" });
    await expect(save).toBeFocused();
    await expect(files.getByRole("region", { name: "Scratch" })).toContainText("Throw this away.");
    await page.keyboard.press("Tab");
    await expect(files.getByRole("button", { name: "Copy text" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#toasts").getByText("Copied the text of “Scratch”.")).toBeVisible();
    expect(await l.app.evaluate(() => (globalThis as { memoryClipboard?: { text: string } }).memoryClipboard?.text)).toBe(SCRATCH.text);
    await page.keyboard.press("Tab");
    await expect(files.getByRole("button", { name: "Discard" })).toBeFocused();
    await page.keyboard.press("Enter");
    const confirm = page.getByRole("dialog", { name: "Discard this draft?" });
    await expect(confirm).toContainText(`“Scratch” and its ${SCRATCH.text.length} characters will be deleted from this computer. This can't be undone.`);
    expect(await settledAxe(page)).toEqual([]);
    // Nothing goes before it's confirmed.
    expect(readdirSync(draftDir(dirs.userData, dirs.docs))).toEqual([`${SCRATCH.id}.draft`]);
    await tabTo(page, confirm.getByRole("button", { name: "Discard draft" }), 4);
    await page.keyboard.press("Enter");
    await expect(page.locator("#toasts").getByText("Discarded “Scratch”.")).toBeVisible();
    await expect.poll(() => readdirSync(draftDir(dirs.userData, dirs.docs))).toEqual([]);
    // None left: Recovered goes, and the tree is back.
    await expect(files.getByRole("heading", { name: "Recovered" })).toHaveCount(0);
    await expect(files.getByRole("button", { name: /^Recovered/ })).toHaveCount(0);

    // The workspace has nothing new but the saved note.
    expect(filesIn(dirs.docs).filter((f) => !before.includes(f))).toEqual([saved]);
  } finally {
    await quit(l);
  }
});
