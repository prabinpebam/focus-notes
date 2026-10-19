/**
 * Send feedback (WP-5.12: QLT-07, D-203, IA-VIEW-FEEDBACK): from Settings' foot, the ⋯ menu and
 * Spotlight. Signed in, a problem with the diagnostic report attached is posted as an issue on the
 * project's repository and the dialog shows its number; the fake GitHub gets the title, the person's
 * words, the summary line and the marker, and nothing private from the report. An idea goes without
 * the report, after Try again. When GitHub refuses the sign-in, Continue on GitHub opens the
 * new-issue form without the report, which is on the clipboard instead. Signed out, Continue is the
 * only way, done here by keyboard alone. GitHub is the in-memory fake; pages are recorded, not opened.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { quit } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { existingInstance, opened, start, tabTo, world, type World } from "./github-world.ts";
import { BUDGETS, scoreRegion } from "./visual-score.ts";
import { scheme } from "./surfaces.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const ISSUES = "POST /repos/prabinpebam/focus-notes/issues";
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
const dialog = (page: Page) => page.getByRole("dialog", { name: "Send feedback" });
const shot = (page: Page, name: string) => page.screenshot({ path: `../../test-results/screens/feedback-${name}.png` });
const clipboard = (l: { app: import("@playwright/test").ElectronApplication }) => l.app.evaluate(() => (globalThis as { memoryClipboard?: { text: string } }).memoryClipboard?.text ?? "");

/** A workspace cloned from GitHub, with the account signed in through Git's helper unless `signedIn` is false. */
async function launchWorld(o: { signedIn?: boolean } = {}) {
  const w = await world({ gcm: true });
  const { notes } = existingInstance(w);
  if (o.signedIn !== false) w.fakes.store(w.gh.token);
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, w.dirs.docs);
  w.git(join(w.dirs.docs, "private"), "checkout", "--quiet", "main");
  writeFileSync(join(w.dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: join(w.dirs.docs, "private", "notes", "secret.md") }));
  writeFileSync(join(w.dirs.userData, DATA_FILES.workspace), JSON.stringify({ version: 1, folder: w.dirs.docs }));
  writeFileSync(join(w.dirs.userData, DATA_FILES.firstRun), JSON.stringify({ version: 1 }));
  writeFileSync(join(w.dirs.userData, DATA_FILES.setup), JSON.stringify({ version: 1, steps: {} }));
  w.env = { ...w.env, FOCUS_NOTES_MEMORY_CLIPBOARD: "1", FOCUS_NOTES_IDLE_COMMIT_MS: "600000" };
  const l = await start(w, false);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeVisible();
  return { w, l, page: l.page };
}

async function openMore(page: Page) {
  const more = page.getByRole("button", { name: "More" });
  if (!(await more.isVisible())) await page.keyboard.press(`${mod}+.`);
  await expect(more).toBeVisible();
  await more.click();
  const menu = page.getByRole("menu", { name: "More" });
  await expect(menu).toBeVisible();
  return menu;
}

/** Criteria 1 and 4 of the visual score (D-127) in the app's real light and dark themes, and axe in both; the lower counts. */
async function vvsAndAxe(page: Page, name: string) {
  const parts: string[] = [];
  let low = { anchor: 20, economy: 20 };
  for (const mode of ["light", "dark"] as const) {
    await scheme(page, mode);
    await settled(page);
    expect(await axeViolations(page), mode).toEqual([]);
    const m = await scoreRegion(dialog(page), BUDGETS.dialog);
    low = { anchor: Math.min(low.anchor, m.anchorScore), economy: Math.min(low.economy, m.economyScore) };
    parts.push(`${mode} anchor ${m.anchorScore}/20 (${m.anchor}px) economy ${m.economyScore}/20 (${m.words} words, ${m.maxLines} lines)`);
    await shot(page, `${name}-${mode}`);
  }
  await scheme(page, "light");
  const line = `VVS ${name}: ${parts.join("; ")}`;
  console.log(line);
  expect(low.anchor, line).toBe(20);
  expect(low.economy, line).toBeGreaterThanOrEqual(15);
}

/** Nothing private in what reached GitHub: no login, folder, note text, or private repository. */
function expectNothingPrivate(body: string, w: World) {
  expect(body).not.toMatch(/(^|[^\w])@?ada([^\w]|$)/i);
  for (const bad of [w.dirs.docs, w.dirs.userData, w.root, "Only mine", "secret.md", "notes-private", "A public note", w.gh.token]) expect(body, bad).not.toContain(bad);
}

test("QLT-07: from Settings' foot, a problem with the report is posted as an issue, and the dialog shows its number", async () => {
  test.setTimeout(180_000);
  const { w, l, page } = await launchWorld();
  try {
    await page.keyboard.press(`${mod}+,`);
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(settings).toBeVisible();
    // On the category Settings opens on, and on another one.
    await expect(settings.getByRole("button", { name: "Send feedback" })).toBeVisible();
    await settings.getByRole("tab", { name: "About" }).click();
    await expect(settings.getByRole("button", { name: "Send feedback" })).toBeVisible();
    await settings.getByRole("button", { name: "Send feedback" }).click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(settings).toHaveCount(0);
    await expect(d.getByRole("radio", { name: "Problem" })).toBeChecked();
    await expect(d.getByRole("textbox", { name: "Title" })).toBeFocused();
    await expect(d.getByRole("button", { name: "Attach diagnostic report" })).toHaveAttribute("aria-pressed", "true");
    // Attached, the exact report that will be posted shows, read-only, from the start (D-203).
    const report = d.getByRole("textbox", { name: "Diagnostic report, as it will be posted" });
    await expect(report).toHaveValue(/^## Focus Notes diagnostic report/, { timeout: 20_000 });
    await expect(report).toHaveAttribute("readonly", "");
    await expect(d.getByRole("button", { name: "Preview" })).toHaveAttribute("aria-expanded", "true");
    await expect(d.getByRole("textbox", { name: "Title" })).toHaveAttribute("aria-required", "true");
    await expect(d.getByText("@ada")).toBeVisible({ timeout: 15_000 });
    await expect(d.getByText("Posts publicly to prabinpebam/focus-notes")).toBeVisible();
    const send = d.getByRole("button", { name: "Send", exact: true });
    await expect(send).toHaveAttribute("aria-disabled", "true");
    await vvsAndAxe(page, "editing");

    await page.keyboard.type("The app closed when I saved");
    await d.getByRole("textbox", { name: "Details" }).fill("I pressed save and it closed.\nI expected it to stay open.");
    await expect(d.getByText("Never included: note text, names, paths, emails, passwords, keys, or tokens.")).toBeVisible();
    const shown = await report.inputValue();
    expect(shown).not.toContain("Nothing was sent.");
    await shot(page, "preview");
    await send.click();
    await expect(d.getByText("Feedback sent")).toBeVisible({ timeout: 20_000 });
    await expect(d.getByText("Issue #101")).toBeVisible();
    await expect(d.getByRole("button", { name: "Done" })).toBeFocused();
    await settled(page);
    expect(await axeViolations(page)).toEqual([]);
    await shot(page, "sent");

    expect(w.gh.issues).toHaveLength(1);
    const issue = w.gh.issues[0]!;
    expect(issue).toMatchObject({ owner: "prabinpebam", repo: "focus-notes", title: "The app closed when I saved", labels: ["bug", "from-app"] });
    expect(issue.body.startsWith("I pressed save and it closed.\nI expected it to stay open.\n\n---\n\nFocus Notes ")).toBe(true);
    expect(issue.body).toContain("<details><summary>Diagnostic report</summary>");
    expect(issue.body).toContain("## Focus Notes diagnostic report");
    // What was posted is exactly what was shown.
    expect(issue.body).toContain(`\n\n${shown.trim()}\n\n</details>`);
    expect(issue.body).toMatch(/<!-- focus-notes-feedback: kind=problem; app=[\w.+-]+; platform=(win32|darwin|linux) -->$/);
    expectNothingPrivate(issue.body, w);

    await d.getByRole("button", { name: "Open on GitHub" }).click();
    await expect.poll(() => opened(l)).toEqual(["https://github.com/prabinpebam/focus-notes/issues/101"]);
    await d.getByRole("button", { name: "Done" }).click();
    await expect(d).toHaveCount(0);
    // Done goes back to Settings, where it came from, onto Send feedback.
    await expect(settings).toBeVisible();
    await expect(settings.getByRole("button", { name: "Send feedback" })).toBeFocused();
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("QLT-07: from the ⋯ menu, an idea goes without the report, after Try again", async () => {
  test.setTimeout(180_000);
  const { w, l, page } = await launchWorld();
  try {
    const menu = await openMore(page);
    await menu.getByRole("menuitem", { name: /^Send feedback…/ }).click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    // The segment's label takes the press, as a person's would.
    await d.getByRole("radiogroup", { name: "Kind" }).getByText("Idea", { exact: true }).click();
    await expect(d.getByRole("radio", { name: "Idea" })).toBeChecked();
    await expect(d.getByRole("button", { name: "Attach diagnostic report" })).toHaveAttribute("aria-pressed", "false");
    await d.getByRole("textbox", { name: "Title" }).fill("Tags in Files");
    await d.getByRole("textbox", { name: "Details" }).fill("Show each note's tags beside its name.");
    await expect(d.getByText("@ada")).toBeVisible({ timeout: 15_000 });
    w.gh.fail(ISSUES, 502, "Bad gateway");
    await d.getByRole("button", { name: "Send", exact: true }).click();
    await expect(d.getByText("Couldn't reach GitHub. Your feedback is still here.")).toBeVisible({ timeout: 15_000 });
    await expect(d.getByRole("textbox", { name: "Title" })).toHaveValue("Tags in Files");
    await settled(page);
    expect(await axeViolations(page)).toEqual([]);
    await shot(page, "failed-network");
    // Straight away, the shell waits a few seconds after a failure (D-203).
    await d.getByRole("button", { name: "Try again" }).click();
    await expect(d.getByText("Wait a few seconds, then try again.")).toBeVisible({ timeout: 15_000 });
    // Closed with Esc, the draft stays, and the caret goes back to the note (the ⋯ menu it came from is gone).
    await page.keyboard.press("Escape");
    await expect(d).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    await (await openMore(page)).getByRole("menuitem", { name: /^Send feedback…/ }).click();
    // Reopened, the draft and what happened to it are as they were.
    await expect(d.getByRole("textbox", { name: "Title" })).toHaveValue("Tags in Files");
    await expect(d.getByText("Wait a few seconds, then try again.")).toBeVisible();
    await expect(async () => {
      await d.getByRole("button", { name: "Try again" }).click();
      await expect(d.getByText("Issue #101")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    const issue = w.gh.issues[0]!;
    expect(issue).toMatchObject({ title: "Tags in Files", labels: ["enhancement", "from-app"] });
    expect(issue.body).not.toContain("Diagnostic report");
    expect(issue.body).toMatch(/kind=idea;/);
    expectNothingPrivate(issue.body, w);
    await d.getByRole("button", { name: "Done" }).click();
    await expect(d).toHaveCount(0);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("QLT-07: from Spotlight, GitHub refusing this sign-in leads to Continue on GitHub, without the report in the address", async () => {
  test.setTimeout(180_000);
  const { w, l, page } = await launchWorld();
  try {
    await page.keyboard.press(`${mod}+/`);
    const spotlight = page.getByRole("dialog", { name: "Spotlight" });
    await expect(spotlight).toBeVisible();
    await page.keyboard.type("bug");
    const option = spotlight.getByRole("option", { name: /^Send feedback…/ });
    await expect(option).toBeVisible();
    await option.click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.getByRole("textbox", { name: "Title" })).toBeFocused();
    await page.keyboard.type("Sync stopped");
    await expect(d.getByText("@ada")).toBeVisible({ timeout: 15_000 });
    await expect(d.getByRole("textbox", { name: "Diagnostic report, as it will be posted" })).toHaveValue(/diagnostic report/, { timeout: 20_000 });
    w.gh.fail(ISSUES, 403, "Resource not accessible by personal access token");
    await d.getByRole("button", { name: "Send", exact: true }).click();
    await expect(d.getByText("GitHub didn't accept it from this sign-in.")).toBeVisible({ timeout: 20_000 });
    await settled(page);
    expect(await axeViolations(page)).toEqual([]);
    await shot(page, "failed-refused");
    await d.getByRole("button", { name: "Continue on GitHub" }).click();
    await expect(page.getByText("Report copied. Paste it into the issue.")).toBeVisible({ timeout: 20_000 });
    await expect(d).toHaveCount(0);
    const urls = await opened(l);
    expect(urls).toHaveLength(1);
    const url = new URL(urls[0]!);
    expect(`${url.origin}${url.pathname}`).toBe("https://github.com/prabinpebam/focus-notes/issues/new");
    expect(url.searchParams.get("title")).toBe("Sync stopped");
    expect(url.searchParams.get("labels")).toBe("bug,from-app");
    expect(decodeURIComponent(urls[0]!)).not.toContain("diagnostic report");
    expect(decodeURIComponent(urls[0]!)).not.toContain("Diagnostic report");
    expect(await clipboard(l)).toContain("## Focus Notes diagnostic report");
    expect(w.gh.issues).toHaveLength(0);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("QLT-07: signed out, it continues on GitHub only, by keyboard alone from start to end", async () => {
  test.setTimeout(180_000);
  const { w, l, page } = await launchWorld({ signedIn: false });
  try {
    await page.keyboard.press(`${mod}+/`);
    const spotlight = page.getByRole("dialog", { name: "Spotlight" });
    await expect(spotlight).toBeVisible();
    await page.keyboard.type("send feedback");
    await expect(spotlight.getByRole("option", { name: /^Send feedback…/ })).toBeVisible();
    await page.keyboard.press("Enter");
    const d = dialog(page);
    await expect(d).toBeVisible();
    const title = d.getByRole("textbox", { name: "Title" });
    await expect(title).toBeFocused();
    await expect(d.getByText("Continues on GitHub")).toBeVisible();
    await expect(d.getByRole("button", { name: "Send", exact: true })).toHaveCount(0);
    await vvsAndAxe(page, "signed-out");
    // Escape closes it and keeps the draft.
    await page.keyboard.type("Spellcheck misses words");
    await page.keyboard.press("Escape");
    await expect(d).toHaveCount(0);
    await page.keyboard.press(`${mod}+/`);
    await page.keyboard.type("send feedback");
    await expect(spotlight.getByRole("option", { name: /^Send feedback…/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(title).toBeFocused();
    await expect(title).toHaveValue("Spellcheck misses words");
    await page.keyboard.press("Tab");
    await expect(d.getByRole("textbox", { name: "Details" })).toBeFocused();
    await page.keyboard.type("In a table cell.");
    // The report off by keyboard: Space on the toggle.
    await tabTo(page, d.getByRole("button", { name: "Attach diagnostic report" }));
    await page.keyboard.press("Space");
    await expect(d.getByRole("button", { name: "Attach diagnostic report" })).toHaveAttribute("aria-pressed", "false");
    await tabTo(page, d.getByRole("button", { name: "Continue on GitHub" }));
    await page.keyboard.press("Enter");
    await expect(d).toHaveCount(0);
    const urls = await opened(l);
    expect(urls).toHaveLength(1);
    const url = new URL(urls[0]!);
    expect(url.searchParams.get("title")).toBe("Spellcheck misses words");
    expect(url.searchParams.get("body")).toMatch(/^In a table cell\.\n\n---\n\nFocus Notes /);
    expect(await clipboard(l)).toBe("");
    expect(w.gh.calls.filter((c) => c.path.endsWith("/issues"))).toEqual([]);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("QLT-07: by keyboard from Settings, Esc and Done give focus back to Settings' Send feedback", async () => {
  test.setTimeout(180_000);
  const { w, l, page } = await launchWorld();
  try {
    await page.keyboard.press(`${mod}+,`);
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(settings).toBeVisible();
    const footer = settings.getByRole("button", { name: "Send feedback" });
    await tabTo(page, footer);
    await page.keyboard.press("Enter");
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.getByRole("textbox", { name: "Title" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(d).toHaveCount(0);
    await expect(footer).toBeFocused();

    // Again, and this time it's sent: Done goes back to the same place.
    await page.keyboard.press("Enter");
    await expect(d).toBeVisible();
    await expect(d.getByRole("textbox", { name: "Title" })).toBeFocused();
    // Enter with no title says why instead of doing nothing.
    await page.keyboard.press("Enter");
    await expect(page.locator("[aria-live]").filter({ hasText: "Add a title first." })).toHaveCount(1);
    await page.keyboard.type("Keyboard only");
    await expect(d.getByRole("textbox", { name: "Diagnostic report, as it will be posted" })).toHaveValue(/diagnostic report/, { timeout: 20_000 });
    await page.keyboard.press("Enter");
    await expect(d.getByText("Feedback sent")).toBeVisible({ timeout: 20_000 });
    await expect(d.getByRole("button", { name: "Done" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(d).toHaveCount(0);
    await expect(footer).toBeFocused();
    expect(w.gh.issues.map((i) => i.title)).toEqual(["Keyboard only"]);
  } finally {
    await quit(l);
    w.server.close();
  }
});
