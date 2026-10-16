/**
 * M4 journeys for Spotlight (WP-4.2), each by keyboard: Mod+/ opens it from anywhere in under 50 ms
 * on the 5,000-note fixture (SPT-01, SPT-07, demo step 1); one ranked list with live states, recent
 * notes, and create and find (SPT-02, SPT-04); modes and prefixes, jumping to a heading and running
 * a command (SPT-05, demo step 2); quick actions: copy link, move, make public (SPT-03, demo step 3);
 * quick open (FIL-04); every command with its shortcut (KEY-01); and no axe violations.
 */
import { test, expect, type Locator, type Page } from "./fixtures.ts";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { instance, write } from "./instance.ts";
import { fixtureNotes } from "../../../tools/bench/fixtures.ts";

const mac = process.platform === "darwin";
const mod = mac ? "Meta" : "Control";
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
const spotlight = (page: Page) => page.getByRole("dialog", { name: "Spotlight" });
const field = (page: Page) => spotlight(page).getByRole("combobox");
const results = (page: Page) => spotlight(page).getByRole("listbox");
const option = (page: Page, name: string | RegExp) => results(page).getByRole("option", { name });
const editor = (page: Page) => page.getByRole("textbox", { name: "Note" });
/** The option the field points at (aria-activedescendant). */
const active = (page: Page): Locator => spotlight(page).locator("[role=option][aria-selected=true]");

/** Opens Spotlight with a key and waits for the field. */
async function open(page: Page, key = `${mod}+/`) {
  await page.keyboard.press(key);
  await expect(field(page)).toBeFocused();
}
/** Types a query and waits until the rows answer it. */
async function search(page: Page, text: string, first?: string | RegExp) {
  await field(page).fill(text);
  if (first) await expect(active(page)).toContainText(first);
}

test("SPT-01, SPT-07 (M4 demo 1): in the 5,000-note fixture Mod+/ opens Spotlight from the note in under 50 ms; Mod+K stays the link key", async () => {
  const dirs = tempDirs();
  for (const n of fixtureNotes()) {
    const p = join(dirs.docs, ...n.path.split("/"));
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, n.markdown);
  }
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome\n\nStart here.\n");
  const l = await launch(dirs, {}, {});
  const { page } = l;
  await expect(editor(page)).toBeFocused({ timeout: 30_000 });
  await page.evaluate(() => {
    const w = window as unknown as { __keys: number[] };
    w.__keys = [];
    window.addEventListener("keydown", (e) => { if (e.key === "/") w.__keys.push(e.timeStamp); }, true);
  });
  // Keypress to the visible panel with its results: the key's time to the end of Spotlight's measure.
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    await open(page);
    await expect(results(page).getByRole("option").first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => performance.getEntriesByName("fn:spotlight.open", "measure").length)).toBe(i + 1);
    times.push(await page.evaluate(() => {
      const m = performance.getEntriesByName("fn:spotlight.open", "measure").at(-1)!;
      return m.startTime + m.duration - (window as unknown as { __keys: number[] }).__keys.at(-1)!;
    }));
    await page.keyboard.press("Escape");
    await expect(spotlight(page)).toBeHidden();
    // Focus and the caret go back to the note.
    await expect(editor(page)).toBeFocused();
  }
  const median = [...times].sort((a, b) => a - b)[2]!;
  console.log(`SPT-07: Spotlight opened in ${times.map((t) => t.toFixed(1)).join(", ")} ms (median ${median.toFixed(1)} ms)`);
  // The budget is on reference hardware; CI runners only report (Performance and quality).
  if (!process.env.CI) expect(median).toBeLessThan(50);

  // A title search across 5,000 notes answers as you type.
  await open(page);
  const n = fixtureNotes()[125]!;
  const title = /^# (.+)$/m.exec(n.markdown)![1]!;
  await search(page, title, title);

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(editor(page)).toBeFocused();
  await editor(page).click();
  // Mod+K is the link key in the note, never Spotlight.
  await page.keyboard.press(`${mod}+K`);
  await expect(page.getByRole("dialog", { name: "Spotlight" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Link editor" })).toBeVisible();
  await page.keyboard.press("Escape");
  await quit(l);
});

/** A small workspace, its notes in both roots. */
function workspace() {
  const inst = instance();
  const { docs } = inst.dirs;
  write(join(docs, "private", "notes", "welcome.md"), "# Welcome\n\n## Getting started\n\nWrite here.\n\n## Scope of the work\n\nSmall steps, every day.\n");
  write(join(docs, "private", "notes", "ideas.md"), "# Ideas\n\nKeep a foc list of things to try.\n");
  write(join(docs, "private", "notes", "journal", "focus-sessions.md"), "# Focus sessions\n\nMorning blocks.\n");
  write(join(docs, "notes", "essays", "on-focus.md"), "# On focus\n\n## Deep work\n\nOne line at a time.\n");
  mkdirSync(join(docs, "private", "notes", "archive"), { recursive: true });
  return inst;
}
async function started(): Promise<Launched & { docs: string }> {
  const inst = workspace();
  const l = await launch(inst.dirs);
  await expect(editor(l.page)).toContainText("Welcome");
  // The index has read every note once full-text matches come back.
  await open(l.page);
  await expect(async () => {
    await field(l.page).fill("");
    await field(l.page).fill("morning");
    await expect(option(l.page, /Focus sessions/)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await l.page.keyboard.press("Escape");
  await l.page.keyboard.press("Escape");
  await expect(spotlight(l.page)).toBeHidden();
  return { ...l, docs: inst.dirs.docs };
}

test("SPT-01: Mod+/ opens Spotlight from the Files panel and from Settings; focus goes back to Files, or to the note", async () => {
  const l = await started();
  const { page } = l;
  const files = page.getByRole("complementary", { name: "Files" });
  await page.keyboard.press(`${mod}+O`);
  await expect(files.getByRole("treeitem", { name: "Welcome", exact: true })).toBeFocused();
  await open(page);
  await page.keyboard.press("Escape");
  await expect(spotlight(page)).toBeHidden();
  await expect(files.getByRole("treeitem", { name: "Welcome", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(files).toBeHidden();
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press(`${mod}+,`);
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  // Spotlight takes Settings' place, as Esc would close it, and is the one dialog open.
  await open(page);
  await expect(settings).toBeHidden();
  await search(page, "focus mode", "Focus mode");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(spotlight(page)).toBeHidden();
  await expect(editor(page)).toBeFocused();
  // The cheat sheet too.
  await page.keyboard.press(`${mod}+Shift+/`);
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await open(page);
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(editor(page)).toBeFocused();
  await quit(l);
});

test("SPT-02, SPT-04, KEY-01: one ranked list with live states, recent notes, and create and find", async () => {
  const l = await started();
  const { page } = l;
  // Notes opened earlier come first in the empty field, then suggestions, then a hint.
  await open(page, `${mod}+P`);
  await search(page, "on focus", "On focus");
  await page.keyboard.press("Enter");
  await expect(editor(page)).toContainText("Deep work");
  await open(page);
  await expect(results(page).getByRole("group", { name: "Recent" }).getByRole("option")).toHaveText([/Welcome/]);
  await expect(results(page).getByRole("group", { name: "Suggestions" }).getByRole("option")).toHaveText([/New note/, /Focus mode/, /Switch light and dark/]);
  await expect(spotlight(page)).toContainText("Type ? for help");
  // After them, every action the app has: the action center on Mod+/ (SPT-04, D-111), where the
  // arrow keys reach any action and Enter runs it.
  await expect(results(page).getByRole("group", { name: "Commands" }).getByRole("option", { name: /^Search commands and settings/ })).toBeAttached();
  await expect(results(page).getByRole("group", { name: "Commands" }).getByRole("option", { name: /^Find in all notes/ })).toBeAttached();
  expect(await results(page).getByRole("group", { name: "Commands" }).getByRole("option").count()).toBeGreaterThan(100);
  const textSize = results(page).getByRole("group", { name: "Settings" }).getByRole("option", { name: /^Text size/ });
  await expect(textSize).toContainText("16 px");
  for (let i = 0; i < 400 && !(await active(page).textContent())?.startsWith("Text size"); i++) await page.keyboard.press("ArrowDown");
  await expect(active(page)).toContainText("Text size");
  await expect(active(page)).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(textSize).toContainText("17 px");
  await expect(field(page)).toBeFocused();

  // "foc": a command with its state and shortcut, notes with their paths, a snippet, and create and find.
  await search(page, "foc");
  await expect(results(page).getByRole("group", { name: "Top hit" })).toBeVisible();
  const command = results(page).getByRole("group", { name: "Commands" }).getByRole("option", { name: /^Focus mode/ });
  await expect(command).toContainText("On");
  await expect(command).toContainText(mac ? "⇧⌘D" : "Ctrl+Shift+D");
  await expect(option(page, /On focus/)).toContainText("essays/on-focus.md · Public");
  await expect(results(page).getByRole("group", { name: "In notes" }).getByRole("option", { name: /Ideas/ })).toContainText("Keep a foc list");
  await expect(results(page).getByRole("group", { name: "Actions" }).getByRole("option")).toHaveText([/Create note “foc”/, /Find “foc” in all notes/]);
  await expect(option(page, /Find “foc” in all notes/)).not.toHaveAttribute("aria-disabled", "true");
  // Matches are marked, as Find in all notes marks them (one ResultList, D-109, D-110).
  await expect(results(page).getByRole("group", { name: "In notes" }).getByRole("option", { name: /Ideas/ }).locator("mark")).toHaveText(["foc"]);

  // Running a toggle leaves Spotlight open and its row shows the new state; Esc closes it.
  while (!(await active(page).textContent())?.startsWith("Focus mode")) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(command).toContainText("Off");
  await expect(spotlight(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(spotlight(page)).toBeHidden();

  // No match: Enter creates a note named after the query.
  await open(page);
  await search(page, "Zebra crossings", "Create note “Zebra crossings”");
  await page.keyboard.press("Enter");
  await expect(editor(page).locator("h1")).toHaveText("Zebra crossings");
  await expect.poll(() => existsSync(join(l.docs, "private", "notes", "zebra-crossings.md")), { timeout: 10_000 }).toBe(true);

  // No match: Find in all notes opens its sheet searching for the query (WP-4.3, D-110).
  await open(page);
  await search(page, "foc list");
  while (!(await active(page).textContent())?.startsWith("Find “foc list” in all notes")) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(spotlight(page)).toBeHidden();
  const sheet = page.getByRole("complementary", { name: "Find in all notes" });
  await expect(sheet.getByRole("combobox", { name: "Search all notes" })).toHaveValue("foc list");
  await expect(sheet.getByRole("combobox", { name: "Search all notes" })).toBeFocused();
  await expect(sheet.getByRole("listbox", { name: "Matches" }).getByRole("group", { name: /^Ideas/ }).getByRole("option")).toHaveCount(1, { timeout: 20_000 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // KEY-01: Mod+Shift+P lists every command, each with its shortcut.
  await open(page, `${mod}+Shift+P`);
  await expect(field(page)).toHaveAttribute("placeholder", "Run a command or change a setting");
  await expect(option(page, /^Keyboard shortcuts/)).toContainText(mac ? "⇧⌘/" : "Ctrl+Shift+/");
  await expect(option(page, /^Bold/)).toContainText(mac ? "⌘B" : "Ctrl+B");
  expect(await results(page).getByRole("option").count()).toBeGreaterThan(100);
  await quit(l);
});

test("SPT-05, FIL-04 (M4 demo 2): jump to a heading, run a command with >, help with ?, quick open by path", async () => {
  const l = await started();
  const { page } = l;
  // Type part of a heading in another note and jump to it.
  await open(page);
  await search(page, "deep wo", "Deep work");
  await page.keyboard.press("Enter");
  await expect(spotlight(page)).toBeHidden();
  await expect(editor(page)).toBeFocused();
  await expect.poll(() => page.evaluate(() => getSelection()?.anchorNode?.parentElement?.closest("h2")?.textContent)).toBe("Deep work");

  // # is this note's headings, Mod+Shift+O too.
  await open(page, `${mod}+Shift+O`);
  await expect(field(page)).toHaveAttribute("placeholder", "Go to a heading");
  await expect(results(page).getByRole("option")).toHaveText([/On focus/, /Deep work/]);
  await page.keyboard.press("Escape");

  // > runs a command and shows each command's state; Backspace in the empty field goes back to All.
  await open(page);
  await page.keyboard.type(">");
  await expect(field(page)).toHaveValue("");
  await expect(field(page)).toHaveAttribute("placeholder", "Run a command or change a setting");
  await page.keyboard.type("light theme");
  await expect(option(page, /^Light theme/).first()).toBeVisible();
  await search(page, "switch light", "Switch light and dark");
  await expect(active(page)).toContainText("Off");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("ink");
  await expect(active(page)).toContainText("On");
  await field(page).fill("");
  await page.keyboard.press("Backspace");
  await expect(field(page)).toHaveAttribute("placeholder", "Search notes, commands, and settings");

  // ? is help: the prefixes and filters, each a row that puts itself into the field.
  await page.keyboard.type("?");
  await expect(results(page).getByRole("group", { name: "Prefixes and filters" }).getByRole("option").first()).toContainText("Commands and settings");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // FIL-04: quick open by title or path, fuzzily, with Mod+P.
  await open(page, `${mod}+P`);
  await expect(field(page)).toHaveAttribute("placeholder", "Find a note by title or path");
  await search(page, "journal foc", "Focus sessions");
  await expect(active(page)).toContainText("journal/focus-sessions.md · Private");
  await search(page, "sesions", "Focus sessions");
  await page.keyboard.press("Enter");
  await expect(editor(page)).toContainText("Morning blocks.");
  await quit(l);
});

test("SPT-03 (M4 demo 3): quick actions on a result: copy link, move, make public, and open in a new window", async () => {
  const l = await started();
  const { page } = l;
  await open(page);
  await search(page, "focus sessions", "Focus sessions");
  // → at the end of the text, or Mod+K, shows the selected result's actions; ← or Esc goes back.
  await page.keyboard.press("ArrowRight");
  await expect(spotlight(page)).toContainText("Actions for “Focus sessions”");
  await expect(results(page).getByRole("option")).toHaveText([
    /^Open$/, /^Open in new window/, /^Copy Markdown link/, /^Rename/, /^Move to…/, /^Make public/, /^Show in Files/, /^Delete/,
  ]);
  // Open in new window is built (WP-8.5): offered, not disabled.
  await expect(option(page, /^Open in new window/)).not.toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(spotlight(page)).not.toContainText("Actions for");
  await page.keyboard.press(`${mod}+K`);
  await expect(spotlight(page)).toContainText("Actions for “Focus sessions”");

  // Copy link: a Markdown link from the open note. The shell's side (`clipboard:write`) is recorded
  // instead of touching the real clipboard, which other programs on the machine can change meanwhile
  // (as EDT-13's journey does).
  type Spy = { copied: string[] };
  await l.app.evaluate(({ clipboard }) => {
    const spy = globalThis as unknown as Spy;
    spy.copied = [];
    clipboard.writeText = (text: string) => { spy.copied.push(text); };
  });
  const copied = () => l.app.evaluate(() => (globalThis as unknown as Spy).copied);
  while (!(await active(page).textContent())?.startsWith("Copy Markdown link")) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(spotlight(page)).toBeHidden();
  await expect.poll(copied).toEqual(["[Focus sessions](journal/focus-sessions.md)"]);

  // Move to…: through Files' own dialog, as one batch.
  await open(page);
  await search(page, "ideas", "Ideas");
  await page.keyboard.press(`${mod}+K`);
  while (!(await active(page).textContent())?.startsWith("Move to…")) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const move = page.getByRole("dialog", { name: /Move/ });
  await expect(move.getByRole("combobox")).toBeFocused();
  await move.getByRole("combobox").fill("archive");
  await page.keyboard.press("Enter");
  await expect.poll(() => existsSync(join(l.docs, "private", "notes", "archive", "ideas.md")), { timeout: 10_000 }).toBe(true);
  await page.keyboard.press("Escape");

  // Make public asks first, then moves the note.
  await open(page);
  await search(page, "focus sessions", "Focus sessions");
  await page.keyboard.press(`${mod}+K`);
  while (!(await active(page).textContent())?.startsWith("Make public")) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("dialog", { name: "Make public?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Make public" }).click();
  await expect.poll(() => existsSync(join(l.docs, "notes", "journal", "focus-sessions.md")), { timeout: 15_000 }).toBe(true);
  expect(readFileSync(join(l.docs, "notes", "journal", "focus-sessions.md"), "utf8")).toContain("Morning blocks.");
  await quit(l);
});

test("A11Y: Spotlight in every mode and its actions has no axe violations, in light and dark", async () => {
  const l = await started();
  const { page } = l;
  const problems: string[] = [];
  for (const scheme of ["light", "dark"]) {
    for (const [key, query] of [[`${mod}+/`, ""], [`${mod}+/`, "foc"], [`${mod}+P`, "focus"], [`${mod}+Shift+P`, "focus"], [`${mod}+Shift+O`, ""], [`${mod}+/`, "?"]] as const) {
      await open(page, key);
      await field(page).fill(query);
      await expect(results(page)).toBeVisible();
      await settled(page);
      problems.push(...(await axeViolations(page)).map((v) => `${scheme} ${key} "${query}": ${v}`));
      await page.keyboard.press("Escape");
      if (await spotlight(page).isVisible()) await page.keyboard.press("Escape");
      await expect(spotlight(page)).toBeHidden();
    }
    await open(page);
    await search(page, "ideas", "Ideas");
    await page.keyboard.press(`${mod}+K`);
    await expect(spotlight(page)).toContainText("Actions for");
    await settled(page);
    problems.push(...(await axeViolations(page)).map((v) => `${scheme} actions: ${v}`));
    await page.screenshot({ path: `../../test-results/screens/spotlight-actions-${scheme}.png` });
    await page.keyboard.press("Escape");
    await field(page).fill("foc");
    await expect(results(page).getByRole("group", { name: "Top hit" })).toBeVisible();
    await settled(page);
    await page.screenshot({ path: `../../test-results/screens/spotlight-${scheme}.png` });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.keyboard.press(`${mod}+Shift+L`);
  }
  expect(problems).toEqual([]);
  await quit(l);
});
