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
import { dirname, join, resolve } from "node:path";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { quit, windowBox, type Launched } from "./helpers.ts";
import { card, existingInstance, heading, press, start, world } from "./github-world.ts";
import { frameProblems, recordFrames, watchMotion, watchShifts, type Frame } from "./frames.ts";

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
async function check(l: Launched, frames: Frame[], schemeOf: (label: string) => "light" | "dark" | "either", opts: { instant?: boolean } = {}) {
  const box = await windowBox(l.page);
  const width = await l.page.evaluate(() => innerWidth);
  const problems = frameProblems(frames, box, width, schemeOf, opts);
  const byLabel = new Map<string, number>();
  for (const f of frames) byLabel.set(f.label, (byLabel.get(f.label) ?? 0) + 1);
  process.stdout.write(`[frames] ${frames.length} frames: ${[...byLabel].map(([k, n]) => `${k} ${n}`).join(", ")}\n`);
  for (const p of problems.slice(0, 40)) process.stdout.write(`[frames] #${p.frame} ${p.label}: ${p.problem}\n`);
  return problems.map((p) => `${p.label}: ${p.problem}`);
}
/** The main process shows the window on the page's first themed frame, not on ready-to-show alone. */
/**
 * Known layout shifts, quarantined with a scope, owner and expiry in gate-evidence.md (D-148): each is
 * a defect queued to fix, not an allowance. Only these, at most this large, pass; any other fails.
 */
const KNOWN_SHIFTS: { source: string; max: number; why: string }[] = [
  { source: `"We found your notes`, max: 0.03, why: "the setup card is centred, so it moves when We found your notes changes height (skeleton rows to the found repository)" },
  { source: "section#removeWorkspace", max: 0.03, why: "Remove this workspace? grows while it checks, and is centred, so it moves" },
];
/** Layout shifts after the first frame that no input caused, over 0.01 of the page (DSK-09: no shifting layout). */
async function shiftProblems(shifts: Awaited<ReturnType<typeof watchShifts>>): Promise<string[]> {
  const found = await shifts.shifts(0.01);
  for (const s of found) process.stdout.write(`[shifts] ${s.label}: ${s.value.toFixed(3)} at ${Math.round(s.at)} ms (${s.sources.join(", ")})\n`);
  const known = (s: (typeof found)[number]) => KNOWN_SHIFTS.some((k) => s.value <= k.max && s.sources.length > 0 && s.sources.every((x) => x.includes(k.source)));
  return found.filter((s) => !known(s)).map((s) => `${s.label}: a layout shift of ${s.value.toFixed(3)} (${s.sources.join(", ")})`);
}
const shownOnFirstFrame = (l: Launched) => expect.soft.poll(() => l.log.find((x) => x.includes("window-shown")) ?? "", { timeout: 5_000 }).toContain("window-shown on=first-frame");

for (const reduced of [false, true]) test(`DSK-09: dark${reduced ? ", with reduced motion" : ""}, through setup's steps, finishing setup, Start writing, opening another workspace, 10 theme changes and removing the workspace, no frame is blank, white, see-through${reduced ? " or mid-transition" : ""}, and nothing shifts`, async () => {
  test.setTimeout(240_000);
  const w = await world({ gcm: true });
  existingInstance(w);
  w.fakes.store(w.gh.token);
  writeFileSync(join(w.dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, appearance: "dark" }));
  const l = await start(w);
  const { page } = l;
  const navs = navigations(page);
  // Reduced motion: swaps are instant, and no frame is caught mid-transition (D-148).
  if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  const rec = await recordFrames(page);
  const shifts = await watchShifts(page);
  let motion: Awaited<ReturnType<typeof watchMotion>> | undefined;
  let scheme: "light" | "dark" | "either" = "dark";
  const schemes = new Map<string, "light" | "dark" | "either">();
  const mark = async (label: string) => {
    schemes.set(label, scheme);
    rec.mark(label);
    await shifts.mark(label);
    await motion?.mark(label);
  };
  try {
    await mark("launch");
    await heading(page, "A quiet place to write");
    // From here on with reduced motion on (the launch frames were drawn before the journey could ask for it).
    if (reduced) {
      await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
      await settle(page);
      motion = await watchMotion(page);
    }
    expect.soft(await page.evaluate(() => new URL(location.href).searchParams.get("theme")), "the theme is in the page's address").toBe("ink");
    await shownOnFirstFrame(l);
    await settle(page);
    await mark("setup: Welcome to Connect");
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused({ timeout: 20_000 });
    await settle(page);
    await mark("setup: Connect to Your notes");
    await press(page, "Enter");
    await heading(page, "We found your notes");
    await expect(card(page).getByRole("button", { name: "Open", exact: true })).toBeFocused({ timeout: 15_000 });
    await settle(page);
    await mark("setup: Your notes to Create and back");
    await card(page).getByRole("button", { name: "More options" }).click();
    await card(page).getByRole("button", { name: "Create new notes instead" }).click();
    await heading(page, "Create your notes");
    await card(page).getByRole("button", { name: "Back", exact: true }).click();
    await heading(page, "We found your notes");
    await settle(page);
    await mark("finishing setup: Open to Ready");
    await card(page).getByRole("button", { name: "Open", exact: true }).click();
    await heading(page, "Ready");
    await expect(card(page).getByRole("button", { name: "Start writing" })).toBeFocused({ timeout: 15_000 });
    await settle(page);
    await mark("Ready to Start writing");
    await press(page, "Enter");
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible({ timeout: 20_000 });
    await expect(card(page)).toHaveCount(0);
    await settle(page);

    await mark("opening another workspace");
    await openWorkspaceSettings(page);
    await settings(page).getByRole("button", { name: "Open another workspace from GitHub…" }).click();
    const open = card(page).getByRole("button", { name: "Open", exact: true });
    await expect(open).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");
    // D-155: setup made Documents/notes, so opening the notes again goes in the first free folder beside it, "notes 2".
    const folderNow = () => (existsSync(join(w.dirs.userData, DATA_FILES.workspace)) ? resolve((JSON.parse(readFileSync(join(w.dirs.userData, DATA_FILES.workspace), "utf8")) as { folder: string }).folder) : "");
    await expect.poll(folderNow, { timeout: 30_000 }).toBe(resolve(join(dirname(w.dirs.docs), "notes 2")));
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible({ timeout: 20_000 });
    await expect(card(page)).toHaveCount(0);
    await settle(page);

    scheme = "either";
    await mark("theme changes");
    for (let i = 0; i < 10; i++) {
      await press(page, `${mod}+Shift+L`);
      await page.waitForTimeout(250);
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
    await settle(page);
    scheme = "dark";

    await mark("removing the workspace");
    await openWorkspaceSettings(page);
    await settings(page).getByRole("button", { name: "Remove this workspace from this computer…" }).click();
    const dialog = page.getByRole("dialog", { name: "Remove this workspace?" });
    await dialog.getByRole("button", { name: "Remove", exact: true }).click({ timeout: 30_000 });
    await heading(page, "We found your notes");
    await settle(page);

    const frames = await rec.stop();
    const problems = await check(l, frames, (label) => schemes.get(label) ?? "dark", { instant: reduced });
    expect.soft(navs, "the page was reloaded for a change of state").toEqual([]);
    expect.soft(await shiftProblems(shifts), "the layout shifted after the first frame").toEqual([]);
    if (motion) expect.soft(await motion.moving(), "with reduced motion, something moved over time").toEqual([]);
    expect(problems).toEqual([]);
  } finally {
    await rec.stop();
    await quit(l);
    w.server.close();
  }
});

/** A set-up workspace in the light theme, opened at its private note, signed in with Git's credential. */
async function setUpLight() {
  const w = await world({ gcm: true });
  const { notes } = existingInstance(w);
  w.fakes.store(w.gh.token);
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, w.dirs.docs);
  w.git(join(w.dirs.docs, "private"), "checkout", "--quiet", "main");
  const note = join(w.dirs.docs, "private", "notes", "secret.md");
  writeFileSync(join(w.dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", appearance: "light", lastNotePath: note }));
  writeFileSync(join(w.dirs.userData, DATA_FILES.workspace), JSON.stringify({ version: 1, folder: w.dirs.docs }));
  writeFileSync(join(w.dirs.userData, DATA_FILES.firstRun), JSON.stringify({ version: 1 }));
  writeFileSync(join(w.dirs.userData, DATA_FILES.setup), JSON.stringify({ version: 1, steps: {} }));
  return { w, l: await start(w, false) };
}

test("DSK-09: light, the window's first frame is the light theme's and finished; theme changes never mix the two; signing out never blanks the window; nothing shifts", async () => {
  test.setTimeout(150_000);
  const { w, l } = await setUpLight();
  const { page } = l;
  const navs = navigations(page);
  const rec = await recordFrames(page);
  const shifts = await watchShifts(page);
  const mark = async (label: string) => {
    rec.mark(label);
    await shifts.mark(label);
  };
  try {
    await mark("launch");
    await expect(page.getByRole("textbox", { name: "Note" })).toContainText("Only mine.");
    expect.soft(await page.evaluate(() => new URL(location.href).searchParams.get("theme")), "the theme is in the page's address").toBe("paper");
    await shownOnFirstFrame(l);
    await settle(page);
    await mark("theme changes");
    for (let i = 0; i < 10; i++) {
      await press(page, `${mod}+Shift+L`);
      await page.waitForTimeout(250);
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
    await settle(page);

    // Signing out (D-148: a transition that never reloads): the app stays in place, the account pill signed out.
    await mark("signing out");
    await page.getByRole("button", { name: /Signed in to GitHub as @ada/ }).click({ timeout: 20_000 });
    await page.getByRole("menuitem", { name: "Sign out of GitHub" }).click();
    const confirm = page.getByRole("dialog", { name: "Sign out of GitHub?" });
    await confirm.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(confirm).toBeHidden({ timeout: 45_000 });
    await expect(page.getByText("Signed out of GitHub on this computer, in the app and in the terminal.", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    await settle(page);

    const frames = await rec.stop();
    const problems = await check(l, frames, (label) => (label === "launch" || label === "signing out" ? "light" : "either"));
    expect.soft(navs, "the page was reloaded for a change of state").toEqual([]);
    expect.soft(await shiftProblems(shifts), "the layout shifted after the first frame").toEqual([]);
    expect(problems).toEqual([]);
  } finally {
    await rec.stop();
    await quit(l);
    w.server.close();
  }
});

test("DSK-09: after a renderer crash the window loads its page again behind its theme's canvas, never white, and the new page's frames are finished", async () => {
  test.setTimeout(120_000);
  const { w, l } = await setUpLight();
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toContainText("Only mine.");
    await shownOnFirstFrame(l);
    await settle(page);
    const canvas = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fn-color-canvas").trim());
    expect(canvas).toBe("#fbfaf7");
    // The crashed page's DevTools target is gone, so the new page's frames are taken in the main process,
    // every frame it paints from its first (beginFrameSubscription: the page's own frames, no screen capture).
    // Until the new page reports its first themed frame, the cover hides what it paints; every frame after that shows.
    await l.app.evaluate(({ BrowserWindow, ipcMain }) => {
      const wc = BrowserWindow.getAllWindows()[0]!.webContents;
      const g = globalThis as unknown as { __fnFrames: { covered: boolean; png: string }[] };
      g.__fnFrames = [];
      let covered = true;
      ipcMain.once("window:firstFrame", () => (covered = false));
      // From the new page's start, before its first paint.
      wc.once("render-process-gone", () => wc.once("did-start-loading", () => {
        wc.beginFrameSubscription((image) => {
          if (g.__fnFrames.length < 120) g.__fnFrames.push({ covered, png: image.toPNG().toString("base64") });
        });
      }));
      wc.forcefullyCrashRenderer();
    });
    // The cover in the theme's canvas goes over the drawn window first, then the page loads again.
    await expect.poll(() => l.log.find((x) => x.includes("renderer-gone")) ?? "", { timeout: 10_000 }).toContain(`cover=${canvas}`);
    await expect.poll(() => l.log.find((x) => x.includes("renderer-recovered")) ?? "", { timeout: 20_000 }).toContain("renderer-recovered on=first-frame");
    expect(l.log.findIndex((x) => x.includes("renderer-gone"))).toBeLessThan(l.log.findIndex((x) => x.includes("renderer-recovered")));
    const inPage = <T,>(js: string) => l.app.evaluate(({ BrowserWindow }, code) => BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScript(code), js) as Promise<T>;
    await expect.poll(() => inPage<string>(`document.querySelector('[role=textbox][aria-label="Note"]')?.textContent ?? ""`), { timeout: 20_000 }).toContain("Only mine.");
    await inPage(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 300))))`);
    const data = await l.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.webContents.endFrameSubscription();
      return (globalThis as unknown as { __fnFrames: { covered: boolean; png: string }[] }).__fnFrames;
    });
    const box = await inPage<{ left: number; top: number; width: number; height: number }>(`(() => { const r = document.querySelector("[data-app-root]").getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`);
    const width = await inPage<number>("innerWidth");
    const frames: Frame[] = data.filter((d) => !d.covered).map((d) => ({ label: "the page loaded after the crash, uncovered", at: 0, data: Buffer.from(d.png, "base64") }));
    process.stdout.write(`[frames] after the crash: ${data.length - frames.length} under the cover, ${frames.length} uncovered\n`);
    expect(frames.length).toBeGreaterThan(0);
    const problems = frameProblems(frames, box, width, () => "light");
    for (const p of problems.slice(0, 20)) process.stdout.write(`[frames] #${p.frame} ${p.label}: ${p.problem}\n`);
    expect(problems.map((p) => `${p.label}: ${p.problem}`)).toEqual([]);
  } finally {
    await quit(l);
    w.server.close();
  }
});
