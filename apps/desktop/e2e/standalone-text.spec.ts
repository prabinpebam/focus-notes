import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "./fixtures.ts";
import { launch, quit } from "./helpers.ts";
import { encodeText } from "../src/main/text-files.ts";
import { readDrafts, crash } from "./recovery.ts";

const roots: string[] = [];
test.afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});
function scratch(text: string) {
  const root = mkdtempSync(join(tmpdir(), "fn-standalone-text-"));
  roots.push(root);
  const dirs = { docs: join(root, "files"), userData: join(root, "profile") };
  mkdirSync(dirs.docs); mkdirSync(dirs.userData);
  const file = join(dirs.docs, "Untitled.txt");
  writeFileSync(file, encodeText(text, { encoding: "utf16le", bom: true }));
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: file }));
  return { dirs, file };
}
const mod = process.platform === "darwin" ? "Meta" : "Control";

test("PRJ-09: literal paste preserves mixed separators and undo restores the original bytes", async () => {
  const original = "A\r\nB\nC\rD";
  const { dirs, file } = scratch(original);
  const l = await launch(dirs, {}, { args: [file] });
  try {
    const note = l.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(note).toContainText("B");
    await note.locator("p").nth(1).click();
    await l.page.keyboard.press("End");
    await note.evaluate(element => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", "**paste**\r\nnext");
      clipboardData.setData("text/html", "<h1>do not parse this</h1>");
      element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
    });
    await expect.poll(() => readFileSync(file).equals(encodeText("A\r\nB**paste**\r\nnext\nC\rD", { encoding: "utf16le", bom: true }))).toBe(true);
    expect(await note.locator("h1, strong").count()).toBe(0);
    await l.page.keyboard.press(`${mod}+Z`);
    await expect.poll(() => readFileSync(file).equals(encodeText(original, { encoding: "utf16le", bom: true }))).toBe(true);
  } finally { console.log(`standalone-text-pids: ${l.pid}`); await quit(l); }
});

test("PRJ-09: an unsupported text file stays unchanged and Open file can retry", async () => {
  const { dirs, file } = scratch("Keep this text\r\n");
  const invalid = join(dirs.docs, "Unsupported.txt");
  const bytes = Buffer.from([0xff, 0xfe, 0x41]);
  writeFileSync(invalid, bytes);
  const l = await launch(dirs, {}, { args: [file] });
  try {
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Keep this text");
    await l.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, invalid);
    await l.page.keyboard.press("Control+Alt+O");
    const open = l.page.getByRole("dialog", { name: "Open", exact: true });
    await open.getByRole("button", { name: "Open file…", exact: true }).click();
    await expect(open).toContainText("Choose a readable Markdown, UTF-8 or BOM-marked UTF-16 text file and try again.");
    expect(readFileSync(invalid)).toEqual(bytes);
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Keep this text");
    writeFileSync(invalid, "Now readable **literal**");
    await open.getByRole("button", { name: "Open file…", exact: true }).click();
    await expect(open).toBeHidden();
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Now readable **literal**");
    expect(readFileSync(invalid, "utf8")).toBe("Now readable **literal**");
  } finally { console.log(`standalone-text-pids: ${l.pid}`); await quit(l); }
});

test("PRJ-09: Open with and Open file autosave literal UTF-16 text; Save as Markdown makes a separate copy", async () => {
  const original = "---\r\nid: literal\r\n---\r\n# not a heading **literal** <tag>\r\n";
  const { dirs, file } = scratch(original);
  let l = await launch(dirs, {}, { args: [file] });
  const pids = [l.pid];
  try {
    const note = l.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(note).toContainText("# not a heading **literal** <tag>");
    expect(await note.locator("h1, strong, img").count()).toBe(0);
    expect(await l.app.evaluate(() => process.env.FOCUS_NOTES_LOCAL_NOTES)).toBe("1");
    await note.focus();
    await l.page.keyboard.press(`${mod}+End`);
    await l.page.keyboard.insertText("Typed **literally**");
    const expected = encodeText(`${original}Typed **literally**`, { encoding: "utf16le", bom: true });
    await expect.poll(() => readFileSync(file).equals(expected)).toBe(true);
    expect(existsSync(join(dirs.docs, ".git"))).toBe(false);
    expect(existsSync(join(dirs.docs, ".focus-notes"))).toBe(false);
    await quit(l);
    l = await launch(dirs, {}, { args: [file] }); pids.push(l.pid);
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Typed **literally**");
    await l.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, file);
    await l.page.keyboard.press("Control+Alt+O");
    await l.page.getByRole("button", { name: "Open file…", exact: true }).click();
    await expect(l.page.getByRole("dialog", { name: "Open", exact: true })).toBeHidden();
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Typed **literally**");
    expect(await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    await l.page.keyboard.press(`${mod}+,`);
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "This file", exact: true }).click();
    await expect(settings.getByRole("tab", { name: "Project", exact: true })).toHaveCount(0);
    await expect(settings.getByRole("tab", { name: "Sharing", exact: true })).toHaveCount(0);
    await expect(settings.getByText("Images need a Markdown file. Save as Markdown to add them.", { exact: true }).first()).toBeVisible();
    await expect(settings.getByRole("button", { name: "Insert image…", exact: true })).toBeDisabled();
    const copy = join(dirs.docs, "Copy.md");
    await l.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, copy);
    await settings.getByRole("button", { name: "Save as Markdown…", exact: true }).click();
    await expect.poll(() => existsSync(copy)).toBe(true);
    expect(readFileSync(file)).toEqual(expected);
    expect(readFileSync(copy, "utf8")).toBe(`${original}Typed **literally**`);
    await expect(l.page.getByRole("region", { name: "Notifications", exact: true })).toContainText("Markdown copy saved");
  } finally {
    console.log(`standalone-text-pids: ${pids.join(",")}`);
    await quit(l);
  }
});

test("PRJ-09: an external text edit conflicts without overwriting either version", async () => {
  const { dirs, file } = scratch("Original\r\n");
  const l = await launch(dirs, {}, { args: [file] });
  try {
    const note = l.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(note).toContainText("Original");
    await note.focus();
    await l.page.keyboard.press(`${mod}+End`);
    await l.page.keyboard.insertText("Mine");
    const outside = encodeText("External\r\n", { encoding: "utf16le", bom: true });
    writeFileSync(file, outside);
    await l.page.keyboard.press(`${mod}+S`);
    const dialog = l.page.getByRole("dialog", { name: /changed outside Focus Notes/ });
    const resolve = l.page.getByRole("button", { name: "Resolve", exact: true });
    await expect.poll(async () => await dialog.isVisible() || await resolve.isVisible()).toBe(true);
    if (!await dialog.isVisible()) await resolve.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Mine");
    await expect(dialog).toContainText("External");
    expect(readFileSync(file)).toEqual(outside);
    await dialog.getByRole("button", { name: "Decide later", exact: true }).click();
    await expect(note).toContainText("Mine");
    expect(readFileSync(file)).toEqual(outside);
    await l.page.keyboard.press(`${mod}+S`);
    await dialog.getByRole("button", { name: "Keep both", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(note).toContainText("External");
    const copies = readdirSync(dirs.docs).filter(name => name.endsWith(".txt") && name !== "Untitled.txt");
    expect(copies).toHaveLength(1);
    expect(readFileSync(join(dirs.docs, copies[0]!))).toEqual(encodeText("Original\r\nMine", { encoding: "utf16le", bom: true }));
    expect(readFileSync(file)).toEqual(outside);
  } finally { console.log(`standalone-text-pids: ${l.pid}`); await crash(l, await l.app.evaluate(({ app }) => app.getPath("userData"))); }
});

test("PRJ-09: dirty text recovery survives a crash and saves in the source encoding", async () => {
  const original = "# literal\r\n";
  const { dirs, file } = scratch(original);
  let l = await launch(dirs, {}, { args: [file] });
  const pids = [l.pid];
  try {
    const profile = await l.app.evaluate(({ app }) => app.getPath("userData"));
    await l.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("note:write");
      ipcMain.handle("note:write", () => new Promise(() => {}));
    });
    const note = l.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(note).toContainText("# literal");
    await note.focus();
    await l.page.keyboard.press(`${mod}+End`);
    await l.page.keyboard.insertText("Recovered **literal**");
    await expect.poll(() => readDrafts(profile, dirs.docs).some(draft => draft.text === `${original}Recovered **literal**`)).toBe(true);
    expect(readFileSync(file)).toEqual(encodeText(original, { encoding: "utf16le", bom: true }));
    await crash(l, profile);
    l = await launch(dirs, {}, { args: [file] }); pids.push(l.pid);
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Recovered **literal**");
    expect(await l.page.getByRole("textbox", { name: "Note", exact: true }).locator("h1, strong").count()).toBe(0);
    await l.page.keyboard.press(`${mod}+S`);
    await expect.poll(() => readFileSync(file).equals(encodeText(`${original}Recovered **literal**`, { encoding: "utf16le", bom: true }))).toBe(true);
  } finally { console.log(`standalone-text-pids: ${pids.join(",")}`); await quit(l); }
});
