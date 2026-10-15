/**
 * DSK-09, D-148: the window never shows a blank, white, see-through or unstyled frame. Every frame
 * the page draws is recorded through the DevTools screencast of the inactive journey window (no
 * screen capture, no focus: safe on the owner's computer), through the window's first frame in dark
 * and light, setup's steps, finishing setup and Start writing, opening another workspace, ten theme
 * changes, and removing the workspace. A frame fails when 2% or more of the drawn window is
 * see-through or outside its theme's palette, or the window is blank while a transition is in
 * flight (`frames.ts`). The page is never reloaded for a change of state, and the window shows only
 * once the page reports its first themed frame (`fn:window.firstFrame`).
 */
import { test, expect, type Page } from "./fixtures.ts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { quit, windowBox, type Launched } from "./helpers.ts";
import { card, existingInstance, heading, press, start, world } from "./github-world.ts";
import { frameProblems, recordFrames, type Frame } from "./frames.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const settings = (page: Page) => page.getByRole("dialog", { name: "Settings" });
async function openWorkspaceSettings(page: Page) {
  await press(page, `${mod}+,`);
  await expect(settings(page)).toBeVisible();
  const tab = settings(page).getByRole("tab", { name: "Workspace" });
  if ((await tab.getAttribute("aria-selected")) !== "true") {
    await settings(page).getByRole("tab", { selected: true }).focus();
    await press(page, "ArrowDown");
  }
  await expect(tab).toHaveAttribute("aria-selected", "true");
}
/** A few frames more after a transition settles, so its last frames are in the record. */
const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 150)))));
/** Every main-frame navigation after the first load: a reload is one. */
function navigations(page: Page): string[] {
  const seen: string[] = [];
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) seen.push(f.url());
  });
  return seen;
}
async function check(l: Launched, frames: Frame[], schemeOf: (label: string) => "light" | "dark" | "either") {
  const box = await windowBox(l.page);
  const width = await l.page.evaluate(() => innerWidth);
  const problems = frameProblems(frames, box, width, schemeOf);
  const byLabel = new Map<string, number>();
  for (const f of frames) byLabel.set(f.label, (byLabel.get(f.label) ?? 0) + 1);
  process.stdout.write(`[frames] ${frames.length} frames: ${[...byLabel].map(([k, n]) => `${k} ${n}`).join(", ")}\n`);
  for (const p of problems.slice(0, 40)) process.stdout.write(`[frames] #${p.frame} ${p.label}: ${p.problem}\n`);
  return problems.map((p) => `${p.label}: ${p.problem}`);
}
/** The main process shows the window on the page's first themed frame, not on ready-to-show alone. */
const shownOnFirstFrame = (l: Launched) => expect.soft.poll(() => l.log.find((x) => x.includes("window-shown")) ?? "", { timeout: 5_000 }).toContain("window-shown on=first-frame");

test("DSK-09: dark, through setup's steps, finishing setup, Start writing, opening another workspace, 10 theme changes and removing the workspace, no frame is blank, white or see-through", async () => {
  test.setTimeout(240_000);
  const w = await world({ gcm: true });
  existingInstance(w);
  w.fakes.store(w.gh.token);
  writeFileSync(join(w.dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, appearance: "dark" }));
  const l = await start(w);
  const { page } = l;
  const navs = navigations(page);
  const rec = await recordFrames(page);
  let scheme: "light" | "dark" | "either" = "dark";
  const schemes = new Map<string, "light" | "dark" | "either">();
  const mark = (label: string) => {
    schemes.set(label, scheme);
    rec.mark(label);
  };
  try {
    mark("launch");
    await heading(page, "A quiet place to write");
    expect.soft(await page.evaluate(() => new URL(location.href).searchParams.get("theme")), "the theme is in the page's address").toBe("ink");
    await shownOnFirstFrame(l);
    await settle(page);
    mark("setup: Welcome to Connect");
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused({ timeout: 20_000 });
    await settle(page);
    mark("setup: Connect to Your notes");
    await press(page, "Enter");
    await heading(page, "We found your notes");
    await expect(card(page).getByRole("button", { name: "Open", exact: true })).toBeFocused({ timeout: 15_000 });
    await settle(page);
    mark("setup: Your notes to Create and back");
    await card(page).getByRole("button", { name: "More options" }).click();
    await card(page).getByRole("button", { name: "Create new notes instead" }).click();
    await heading(page, "Create your notes");
    await card(page).getByRole("button", { name: "Back", exact: true }).click();
    await heading(page, "We found your notes");
    await settle(page);
    mark("finishing setup: Open to Ready");
    await card(page).getByRole("button", { name: "Open", exact: true }).click();
    await heading(page, "Ready");
    await expect(card(page).getByRole("button", { name: "Start writing" })).toBeFocused({ timeout: 15_000 });
    await settle(page);
    mark("Ready to Start writing");
    await press(page, "Enter");
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible({ timeout: 20_000 });
    await expect(card(page)).toHaveCount(0);
    await settle(page);

    mark("opening another workspace");
    await openWorkspaceSettings(page);
    await settings(page).getByRole("button", { name: "Open another workspace from GitHub…" }).click();
    const open = card(page).getByRole("button", { name: "Open", exact: true });
    await expect(open).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");
    await expect.poll(() => (existsSync(join(w.dirs.userData, DATA_FILES.workspace)) ? readFileSync(join(w.dirs.userData, DATA_FILES.workspace), "utf8") : ""), { timeout: 30_000 }).toContain("Focus Notes 2");
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible({ timeout: 20_000 });
    await expect(card(page)).toHaveCount(0);
    await settle(page);

    scheme = "either";
    mark("theme changes");
    for (let i = 0; i < 10; i++) {
      await press(page, `${mod}+Shift+L`);
      await page.waitForTimeout(250);
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
    await settle(page);
    scheme = "dark";

    mark("removing the workspace");
    await openWorkspaceSettings(page);
    await settings(page).getByRole("button", { name: "Remove this workspace from this computer…" }).click();
    const dialog = page.getByRole("dialog", { name: "Remove this workspace?" });
    await dialog.getByRole("button", { name: "Remove", exact: true }).click({ timeout: 30_000 });
    await heading(page, "We found your notes");
    await settle(page);

    const frames = await rec.stop();
    const problems = await check(l, frames, (label) => schemes.get(label) ?? "dark");
    expect.soft(navs, "the page was reloaded for a change of state").toEqual([]);
    expect(problems).toEqual([]);
  } finally {
    await rec.stop();
    await quit(l);
    w.server.close();
  }
});

test("DSK-09: light, the window's first frame is the light theme's and finished; theme changes never mix the two", async () => {
  test.setTimeout(120_000);
  const w = await world({ gcm: true });
  const { notes } = existingInstance(w);
  w.fakes.store(w.gh.token);
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, w.dirs.docs);
  w.git(join(w.dirs.docs, "private"), "checkout", "--quiet", "main");
  const note = join(w.dirs.docs, "private", "notes", "secret.md");
  writeFileSync(join(w.dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", appearance: "light", lastNotePath: note }));
  writeFileSync(join(w.dirs.userData, DATA_FILES.workspace), JSON.stringify({ version: 1, folder: w.dirs.docs }));
  const l = await start(w, false);
  const { page } = l;
  const rec = await recordFrames(page);
  try {
    rec.mark("launch");
    await expect(page.getByRole("textbox", { name: "Note" })).toContainText("Only mine.");
    expect.soft(await page.evaluate(() => new URL(location.href).searchParams.get("theme")), "the theme is in the page's address").toBe("paper");
    await shownOnFirstFrame(l);
    await settle(page);
    rec.mark("theme changes");
    for (let i = 0; i < 10; i++) {
      await press(page, `${mod}+Shift+L`);
      await page.waitForTimeout(250);
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
    await settle(page);
    const frames = await rec.stop();
    expect(await check(l, frames, (label) => (label === "launch" ? "light" : "either"))).toEqual([]);
  } finally {
    await rec.stop();
    await quit(l);
    w.server.close();
  }
});
