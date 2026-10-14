/**
 * WP-1.11: the M1 accessibility audit (A11Y-01, WCAG 2.2 AA with ARIA Authoring Practices patterns).
 * Every surface built so far, opened from the keyboard, in every built-in theme mode: no axe
 * violations (contrast included), every control at least 24 × 24 px or spaced as 2.5.8 allows, a
 * visible focus indicator that isn't covered (2.4.7, 2.4.11), tooltips inside landmarks, reflow at
 * 320 CSS px (1.4.10), no motion with reduced motion (2.3.3), and system colors in forced colors.
 * The screen-reader passes are scripted in Performance and quality → Accessibility audit.
 */
import { test, expect, type ElectronApplication, type Page } from "./fixtures.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, quit, tempDirs, windowBox, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { focusProblem, smallTargets } from "./a11y-checks.ts";
import { makeFakes } from "../test/fakes/fakes.ts";

const mac = process.platform === "darwin";
const mod = mac ? "Meta" : "Control";
/** Windows and Linux draw their own window (D-14). */
const custom = !mac;
const NOTE = [
  "# Audit", "",
  "A paragraph with a [link](https://example.com/audit) and more words to select here.", "",
  "| Task | Owner |", "| --- | --- |", "| Draft | Me |", "| Ship | You |", "",
  "- [ ] a task", "", "> a quote", "",
  "Last line",
].join("\n") + "\n";

const editorOf = (page: Page) => page.getByRole("textbox", { name: "Note" });

/**
 * 400% zoom: the window as drawn is 320 × 200 CSS px. On Windows and Linux the page is the window
 * plus its transparent shadow margin (D-104), which zooms with the page, so the page is that much larger.
 */
async function reflowTo320(page: Page, app: ElectronApplication) {
  const margin = await page.evaluate(() => Math.round(document.querySelector("[data-app-root]")?.getBoundingClientRect().left ?? 0));
  await app.evaluate(({ BrowserWindow }, m) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
    win.unmaximize();
    win.setContentSize((320 + 2 * m) * 4, (200 + 2 * m) * 4);
    win.webContents.setZoomFactor(4);
  }, margin);
  await expect.poll(async () => Math.round((await windowBox(page)).width)).toBe(320);
}

/** 1.4.10: nothing scrolls sideways, and popups, panels, and dialogs stay inside the window as drawn. */
const overflowProblems = (page: Page) => page.evaluate(() => {
  const out: string[] = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`the page scrolls sideways (${document.documentElement.scrollWidth} px)`);
  const root = document.querySelector("[data-app-root]");
  const win = root?.getBoundingClientRect() ?? { left: 0, right: innerWidth };
  for (const el of document.querySelectorAll('[role="menu"], [role="dialog"], [role="toolbar"], [role="region"], [role="listbox"], [role="group"], [role="main"], aside')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || el.closest("[inert]")) continue;
    if (r.left < win.left - 1 || r.right > win.right + 1) out.push(`${el.getAttribute("aria-label") ?? el.getAttribute("role")} spans ${Math.round(r.left)}–${Math.round(r.right)} of ${Math.round(win.left)}–${Math.round(win.right)}`);
  }
  return out;
});
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

async function start(): Promise<Launched> {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), NOTE);
  mkdirSync(join(dirs.docs, "Projects"));
  writeFileSync(join(dirs.docs, "Projects", "plan.md"), "# Plan\n\nSteps.\n");
  const l = await launch(dirs);
  await expect(editorOf(l.page)).toBeFocused();
  // Focus mode's dimmed rows are a deliberate contrast exception (D-04); the audit reads them bright.
  await l.page.keyboard.press("F8");
  await expect.poll(() => l.page.evaluate(() => document.documentElement.dataset.focus)).toBeUndefined();
  return l;
}

/** Back to the note with nothing open. */
async function reset(page: Page) {
  for (let i = 0; i < 6; i++) {
    const state = await page.evaluate(() => ({
      toolbar: Boolean(document.querySelector("[data-morph-panel][data-open]")),
      inToolbar: Boolean(document.activeElement?.closest("[data-morph-panel]")),
      other: Boolean(document.querySelector('[role="menu"], [role="dialog"][aria-modal="true"]')) || !document.activeElement?.hasAttribute("data-editor"),
    }));
    if (!state.toolbar && !state.other) break;
    // The trigger's toolbar closes with Esc from inside it, or its own shortcut from anywhere.
    await page.keyboard.press(state.toolbar && !state.inToolbar && !state.other ? `${mod}+.` : "Escape");
    await page.waitForTimeout(50);
  }
  const where = await page.evaluate(() => `${document.activeElement?.tagName} ${document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.getAttribute("role") ?? ""}`);
  await expect(editorOf(page), `focus is on ${where}`).toBeFocused();
  await settled(page);
}

/** Puts the caret at the end of a cell, by keyboard: from the top, down into the table. */
async function caretInTable(page: Page) {
  await page.keyboard.press(caret.docStart);
  const inCell = () => page.evaluate(() => Boolean(getSelection()?.anchorNode?.parentElement?.closest("td, th")));
  // Paragraphs wrap onto more rows in a narrow window.
  for (let i = 0; i < 30 && !(await inCell()); i++) await page.keyboard.press("ArrowDown");
  expect(await inCell()).toBe(true);
}

/** Every surface built through M1 and MW, opened from the keyboard. */
const SURFACES: { name: string; open: (page: Page) => Promise<void> }[] = [
  { name: "canvas", open: async () => {} },
  { name: "trigger toolbar", open: async (page) => {
    await page.keyboard.press(`${mod}+.`);
    await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
  } },
  { name: "tooltip from keyboard focus", open: async (page) => {
    await page.keyboard.press(`${mod}+.`);
    await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tooltip").filter({ hasText: "Open…" })).toBeVisible();
  } },
  { name: "⋯ menu and a submenu", open: async (page) => {
    await page.keyboard.press(`${mod}+.`);
    await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowDown");
    const menu = page.getByRole("menu", { name: "More" });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "Light theme" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("menu", { name: "Light theme" })).toBeVisible();
  } },
  { name: "find and replace", open: async (page) => {
    await page.keyboard.press(mac ? "Meta+Alt+f" : "Control+h");
    const bar = page.getByRole("region", { name: "Find in note" });
    await expect(bar.getByRole("searchbox", { name: "Find" })).toBeFocused();
    await page.keyboard.type("a");
    await expect(bar.getByRole("status").first()).toHaveText(/of \d+$/);
  } },
  { name: "cheat sheet", open: async (page) => {
    await page.keyboard.press(`${mod}+Shift+Slash`);
    await expect(page.getByRole("searchbox", { name: "Search shortcuts" })).toBeFocused();
  } },
  { name: "Files", open: async (page) => {
    await page.keyboard.press(`${mod}+O`);
    await expect(page.getByRole("complementary", { name: "Files" }).getByRole("treeitem").and(page.locator(":focus"))).toHaveCount(1);
  } },
  { name: "Move to…", open: async (page) => {
    await page.keyboard.press(`${mod}+O`);
    await expect(page.getByRole("complementary", { name: "Files" }).getByRole("treeitem").and(page.locator(":focus"))).toHaveCount(1);
    await page.keyboard.press(`${mod}+Shift+M`);
    await expect(page.getByRole("dialog", { name: /^Move/ }).getByRole("combobox")).toBeFocused();
  } },
  { name: "delete confirmation", open: async (page) => {
    await page.keyboard.press(`${mod}+O`);
    const files = page.getByRole("complementary", { name: "Files" });
    await expect(files.getByRole("treeitem").and(page.locator(":focus"))).toHaveCount(1);
    await page.keyboard.press("Home");
    for (let i = 0; i < 5 && !(await files.getByRole("treeitem", { name: "Projects" }).evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press(mac ? "Meta+Backspace" : "Delete");
    await expect(page.getByRole("dialog", { name: "Delete" })).toBeVisible();
  } },
  { name: "formatting toolbar", open: async (page) => {
    await page.keyboard.press(caret.docEnd);
    await page.keyboard.press(mac ? "Alt+Shift+ArrowLeft" : "Control+Shift+ArrowLeft");
    await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();
    await page.keyboard.press("Alt+F10");
    await expect(page.getByRole("toolbar", { name: "Text formatting" }).locator(":focus")).toHaveCount(1);
  } },
  { name: "link editor", open: async (page) => {
    await page.keyboard.press(caret.docEnd);
    await page.keyboard.press(mac ? "Alt+Shift+ArrowLeft" : "Control+Shift+ArrowLeft");
    await page.keyboard.press(`${mod}+K`);
    await expect(page.getByRole("region", { name: "Link editor" }).getByRole("textbox", { name: "Link address" })).toBeFocused();
  } },
  { name: "link card", open: async (page) => {
    await page.keyboard.press(caret.docStart);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press(caret.lineStart);
    // Into "link", after "A paragraph with a l".
    for (let i = 0; i < 21; i++) await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("region", { name: "Link", exact: true })).toBeVisible();
  } },
  { name: "slash menu", open: async (page) => {
    await page.keyboard.press(caret.docEnd);
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    await expect(page.getByRole("listbox", { name: "Insert a block" })).toBeVisible();
  } },
  { name: "table controls and the cell menu", open: async (page) => {
    await caretInTable(page);
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menu", { name: "Cell options" })).toBeVisible();
  } },
  // The custom window on Windows and Linux (WP-2.1, D-104): its controls, Snap Layouts, and system menu.
  ...(custom ? [
    { name: "window controls", open: async (page: Page) => {
      // Tab from the trigger's toolbar goes on to the window's buttons.
      await page.keyboard.press(`${mod}+.`);
      await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "Minimize" })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "Maximize" })).toBeFocused();
    } },
    { name: "Snap layouts", open: async (page: Page) => {
      await page.keyboard.press(`${mod}+.`);
      await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "Maximize" })).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByRole("dialog", { name: "Snap layouts" }).getByRole("button", { name: "Left half" })).toBeFocused();
    } },
    { name: "system menu", open: async (page: Page) => {
      await page.keyboard.press("Alt+Space");
      await expect(page.getByRole("menu", { name: "Window menu" }).getByRole("menuitem", { name: "Move" })).toBeFocused();
    } },
  ] : []),
  // Settings (WP-3.6, D-103): on the desktop it's always there to open.
  { name: "Settings", open: async (page) => {
    await page.keyboard.press(`${mod}+,`);
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await expect(settings.getByRole("tab", { name: "Account" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  } },
  { name: "toast", open: async (page) => {
    // Two lines pasted into one cell: the toast says what happened to them.
    await caretInTable(page);
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData("text/plain", "one\ntwo");
      document.querySelector("[data-editor]")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect(page.getByRole("status").filter({ hasText: "A table cell holds one line" })).toBeVisible();
  } },
];

for (const [mode, theme] of [["light", "Paper"], ["dark", "Ink"], ["light", "High contrast"], ["dark", "High contrast"]] as const) {
  test(`A11Y-01: every surface in ${theme} (${mode}) has no axe violations, 24 px targets, and visible focus`, async () => {
    test.setTimeout(180_000);
    const l = await start();
    const { page } = l;
    // The theme, chosen from ⋯ by keyboard.
    await page.keyboard.press(`${mod}+.`);
    await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowDown");
    const more = page.getByRole("menu", { name: "More" });
    await more.getByRole("menuitemcheckbox", { name: mode === "light" ? "Light" : "Dark" }).focus();
    await page.keyboard.press("Enter");
    await reset(page);
    if (theme !== (mode === "light" ? "Paper" : "Ink")) {
      await page.keyboard.press(`${mod}+.`);
      await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
      await page.keyboard.press("End");
      await page.keyboard.press("ArrowDown");
      const submenu = mode === "light" ? "Light theme" : "Dark theme";
      await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: submenu }).focus();
      await page.keyboard.press("ArrowRight");
      await page.getByRole("menu", { name: submenu }).getByRole("menuitemradio", { name: theme }).focus();
      await page.keyboard.press("Enter");
      await reset(page);
    }
    const expected = theme === "High contrast" ? `contrast-${mode}` : theme.toLowerCase();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(expected);

    const problems: string[] = [];
    for (const s of SURFACES) {
      await s.open(page);
      await settled(page);
      for (const v of await axeViolations(page)) problems.push(`${s.name}: ${v}`);
      for (const t of await smallTargets(page)) problems.push(`${s.name}: target under 24 px: ${t}`);
      const f = await focusProblem(page);
      if (f) problems.push(`${s.name}: ${f}`);
      // A keyboard step inside the surface keeps a visible, uncovered focus.
      // (Tab leaves a toolbar, by design: arrows move inside it.)
      if (!["canvas", "toast", "slash menu", "link card", "trigger toolbar", "tooltip from keyboard focus", "formatting toolbar"].includes(s.name)) {
        await page.keyboard.press("Tab");
        const g = await focusProblem(page);
        if (g) problems.push(`${s.name}, after Tab: ${g}`);
        // And back, so Esc closes the surface from inside it.
        await page.keyboard.press("Shift+Tab");
      }
      await reset(page).catch((e: Error) => { throw new Error(`Closing ${s.name}: ${e.message}`); });
    }
    expect(problems).toEqual([]);
    await quit(l);
  });
}

/**
 * A new install (WP-3.2, D-101), in a theme chosen before it starts. Git Credential Manager is a
 * fake one, so the Sign in step is the same whatever this computer has installed (FRE-02).
 */
async function startFirstRun(mode: "light" | "dark", theme: string): Promise<Launched> {
  const dirs = tempDirs();
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, appearance: mode, ...(mode === "light" ? { lightTheme: theme } : { darkTheme: theme }) }));
  const l = await launch(dirs, makeFakes({ token: "ghp_unused", gcm: true }).env, { firstRun: true });
  await expect(l.page.getByRole("button", { name: "Get started" })).toBeFocused();
  await expect.poll(() => l.page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
  return l;
}

/** The first run's card by keyboard, through the steps a new install shows offline: Welcome, Git, and Sign in. */
async function walkFirstRun(page: Page, check: (step: string) => Promise<void>) {
  const card = page.getByRole("main", { name: "Set up Focus Notes" });
  await settled(page);
  await check("first run: Welcome");
  await page.keyboard.press("Enter");
  await expect(card.getByRole("heading", { name: "Git" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Continue" })).toBeFocused();
  await settled(page);
  await check("first run: Git");
  await page.keyboard.press("Enter");
  await expect(card.getByRole("heading", { name: "Sign in to GitHub" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Sign in with GitHub" })).toBeFocused();
  await settled(page);
  await check("first run: Sign in");
}

for (const [mode, theme] of [["light", "paper"], ["dark", "ink"], ["light", "contrast-light"], ["dark", "contrast-dark"]] as const) {
  test(`A11Y-01: the first run's card in ${theme} has no axe violations, 24 px targets, and visible focus`, async () => {
    const l = await startFirstRun(mode, theme);
    const { page } = l;
    const problems: string[] = [];
    await walkFirstRun(page, async (step) => {
      for (const v of await axeViolations(page)) problems.push(`${step}: ${v}`);
      for (const t of await smallTargets(page)) problems.push(`${step}: target under 24 px: ${t}`);
      const f = await focusProblem(page);
      if (f) problems.push(`${step}: ${f}`);
      await page.keyboard.press("Tab");
      const g = await focusProblem(page);
      if (g) problems.push(`${step}, after Tab: ${g}`);
      await page.keyboard.press("Shift+Tab");
    });
    expect(problems).toEqual([]);
    await quit(l);
  });
}

test("A11Y-01: the first run's card in forced colors uses system colors and keeps a visible focus, and fits at 320 CSS px", async () => {
  const l = await startFirstRun("light", "paper");
  const { page } = l;
  await page.emulateMedia({ forcedColors: "active" });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fn-color-canvas").trim())).toBe("Canvas");
  const problems: string[] = [];
  await walkFirstRun(page, async (step) => {
    for (const v of await axeViolations(page)) problems.push(`${step}: ${v}`);
    const f = await focusProblem(page);
    if (f) problems.push(`${step}: ${f}`);
  });
  await quit(l);

  const n = await startFirstRun("light", "paper");
  await reflowTo320(n.page, n.app);
  await walkFirstRun(n.page, async (step) => {
    for (const o of await overflowProblems(n.page)) problems.push(`${step} at 320 px: ${o}`);
    const f = await focusProblem(n.page);
    if (f) problems.push(`${step} at 320 px: ${f}`);
  });
  expect(problems).toEqual([]);
  await quit(n);
});

test("A11Y-01: a tooltip opened by keyboard focus is inside a landmark, and names its control", async () => {
  const l = await start();
  const { page } = l;
  await page.keyboard.press(`${mod}+.`);
  await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Open…");
  expect(await tooltip.evaluate((el) => Boolean(el.closest("main, aside, [role=banner], [role=complementary], [role=region], [role=dialog]")))).toBe(true);
  // It's next to its control, not at the end of the page.
  const button = (await page.getByRole("button", { name: "Open…" }).boundingBox())!;
  const tip = (await tooltip.boundingBox())!;
  expect(tip.y).toBeGreaterThan(button.y + button.height - 1);
  expect(Math.abs(tip.x + tip.width / 2 - (button.x + button.width / 2))).toBeLessThan(tip.width);
  await expect(page.getByRole("button", { name: "Open…" })).toHaveAccessibleDescription(/Open…/);
  expect(await axeViolations(page)).toEqual([]);
  await quit(l);
});

test("A11Y-01: at 320 CSS px (400% zoom) every surface fits without sideways scrolling (1.4.10)", async () => {
  test.setTimeout(120_000);
  const l = await start();
  const { page, app } = l;
  await reflowTo320(page, app);
  const problems: string[] = [];
  for (const s of SURFACES.filter((x) => !["tooltip from keyboard focus", "delete confirmation"].includes(x.name))) {
    await s.open(page);
    await settled(page);
    for (const o of await overflowProblems(page)) problems.push(`${s.name}: ${o}`);
    await reset(page);
  }
  expect(problems).toEqual([]);
  await quit(l);
});

test("A11Y-01: with reduced motion, nothing animates as surfaces open and close (2.3.3)", async () => {
  test.setTimeout(120_000);
  const l = await start();
  const { page } = l;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe("reduced");
  // Anything that started before reduced motion was on (turning focus mode off) finishes first.
  await settled(page);
  const moving = () => page.evaluate(() => document.getAnimations().filter((a) => {
    const d = Number(a.effect?.getTiming().duration ?? 0);
    return a.playState === "running" && d > 0;
  }).map((a) => (a as CSSTransition).transitionProperty ?? (a as CSSAnimation).animationName ?? "animation"));
  const problems: string[] = [];
  for (const s of SURFACES) {
    await s.open(page);
    const m = await moving();
    if (m.length) problems.push(`${s.name}: ${m.join(", ")}`);
    await reset(page);
  }
  expect(problems).toEqual([]);
  await quit(l);
});

test("A11Y-01: in forced colors every surface uses system colors and keeps a visible focus", async () => {
  test.setTimeout(120_000);
  const l = await start();
  const { page } = l;
  await page.emulateMedia({ forcedColors: "active" });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fn-color-canvas").trim())).toBe("Canvas");
  const problems: string[] = [];
  for (const s of SURFACES) {
    await s.open(page);
    await settled(page);
    for (const v of await axeViolations(page)) problems.push(`${s.name}: ${v}`);
    const f = await focusProblem(page);
    if (f) problems.push(`${s.name}: ${f}`);
    await reset(page);
  }
  expect(problems).toEqual([]);
  await quit(l);
});
