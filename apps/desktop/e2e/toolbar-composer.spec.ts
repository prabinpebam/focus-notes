import { test, expect, type Locator, type Page } from "./fixtures.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const defaults = ["New note", "Open…", "Actions", "Save", "Focus mode", "Switch light and dark"];
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"));
const names = (toolbar: Locator) => toolbar.locator("[data-slot] button").evaluateAll(els => els.map(el => el.getAttribute("aria-label")!));

async function composer(page: Page) {
  const live = page.getByRole("toolbar", { name: "Toolbar", exact: true });
  if (!await live.isVisible()) await page.getByRole("button", { name: "Focus Notes menu", exact: true }).click();
  await settled(page);
  await page.getByRole("toolbar", { name: "Toolbar", exact: true }).getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Customize toolbar…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Customize toolbar", exact: true });
  await expect(dialog).toBeVisible();
  await settled(page);
  return { dialog, toolbar: dialog.getByRole("toolbar", { name: "Toolbar", exact: true }), available: dialog.getByRole("group", { name: "Available buttons", exact: true }) };
}

async function beginDrag(page: Page, source: Locator) {
  const r = (await source.boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 8, r.y + r.height / 2, { steps: 3 });
}

async function endGap(page: Page, toolbar: Locator) {
  const r = (await toolbar.locator("[data-slot]").last().boundingBox())!;
  await page.mouse.move(r.x + r.width - 1, r.y + r.height / 2, { steps: 10 });
}

test("UI-08: composer fits normal and minimum windows and reorders across wrapped rows", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, "# Synthetic responsive toolbar review\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note }));
  let l: Launched | undefined;
  try {
    l = await launch(dirs); console.log(`toolbar-scan-owned-pid=${l.pid}`);
    const { page } = l, c = await composer(page);
    for (const size of [[1100, 800], [360, 320]]) {
      await l.app.evaluate(({ BrowserWindow }, [width, height]) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("index.html"))!.setSize(width!, height!), size);
      await settled(page);
      await c.toolbar.scrollIntoViewIfNeeded();
      const geometry = await c.toolbar.evaluate(toolbar => {
        const stage = toolbar.closest('[role="group"]')!.parentElement!.parentElement!;
        const panel = toolbar.closest("[data-morph-panel]")!;
        const s = stage.getBoundingClientRect(), p = panel.getBoundingClientRect(), padding = getComputedStyle(stage);
        const buttons = [...toolbar.querySelectorAll("button")].map(b => {
          const r = b.getBoundingClientRect();
          return { left: r.left, right: r.right, width: r.width, height: r.height, top: r.top };
        });
        return { left: s.left + parseFloat(padding.paddingLeft), right: s.right - parseFloat(padding.paddingRight), panelLeft: p.left, panelRight: p.right, overflow: toolbar.scrollWidth - toolbar.clientWidth, buttons };
      });
      expect(geometry.panelLeft).toBeGreaterThanOrEqual(geometry.left - 1);
      expect(geometry.panelRight).toBeLessThanOrEqual(geometry.right + 1);
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      for (const button of geometry.buttons) {
        expect(button.width).toBeGreaterThanOrEqual(32);
        expect(button.height).toBeGreaterThanOrEqual(32);
        expect(button.left).toBeGreaterThanOrEqual(geometry.left - 1);
        expect(button.right).toBeLessThanOrEqual(geometry.right + 1);
      }
      if (size[0] === 360) expect(new Set(geometry.buttons.map(b => b.top)).size).toBeGreaterThan(1);
      expect(await c.toolbar.locator("[data-slot]").evaluateAll(slots => slots.every(slot => getComputedStyle(slot, "::before").visibility === "hidden"))).toBe(true);
      await page.screenshot({ path: join(test.info().outputDir, `toolbar-composer-${size[0]}.png`) });
    }
    await beginDrag(page, c.toolbar.getByRole("button", { name: "New note", exact: true }));
    await endGap(page, c.toolbar);
    await page.mouse.up();
    await expect.poll(() => names(c.toolbar)).toEqual([...defaults.slice(1), defaults[0]!]);
  } finally { if (l) await quit(l); }
});

test("UI-08: drag reorder, remove/add, hold replace and full refusal survive restart in the real toolbar", async () => {
  test.setTimeout(150_000);
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, "# Synthetic toolbar review\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note }));
  let l: Launched | undefined;
  const start = async () => { l = await launch(dirs); console.log(`toolbar-scan-owned-pid=${l.pid}`); return l.page; };
  const restart = async (expected: string[]) => {
    await quit(l!);
    const page = await start();
    await page.getByRole("button", { name: "Focus Notes menu", exact: true }).click();
    const real = page.getByRole("toolbar", { name: "Toolbar", exact: true });
    await expect.poll(() => real.locator('button, input[role="switch"]').evaluateAll(els => els.map(el => el.getAttribute("aria-label")))).toEqual([...expected, "More"]);
    await page.keyboard.press("Escape");
    await settled(page);
    return page;
  };
  try {
    let page = await start(), c = await composer(page);
    await beginDrag(page, c.toolbar.getByRole("button", { name: "New note", exact: true }));
    await endGap(page, c.toolbar);
    await page.mouse.up();
    let expected = [...defaults.slice(1), defaults[0]!];
    await expect.poll(() => names(c.toolbar)).toEqual(expected);
    await c.dialog.getByRole("button", { name: "Done", exact: true }).click();
    page = await restart(expected);

    c = await composer(page);
    await beginDrag(page, c.toolbar.getByRole("button", { name: "Open…", exact: true }));
    const shelf = (await c.available.boundingBox())!;
    await page.mouse.move(shelf.x + 10, shelf.y + 10, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => names(c.toolbar)).toEqual(expected.slice(1));
    await beginDrag(page, c.available.getByRole("button", { name: "Open…", exact: true }));
    await endGap(page, c.toolbar);
    await page.mouse.up();
    expected = [...expected.slice(1), "Open…"];
    await expect.poll(() => names(c.toolbar)).toEqual(expected);
    await c.dialog.getByRole("button", { name: "Done", exact: true }).click();
    page = await restart(expected);

    c = await composer(page);
    const replacement = c.available.getByRole("button").first(), replacementName = (await replacement.getAttribute("aria-label"))!;
    await beginDrag(page, replacement);
    const slot = c.toolbar.locator('[data-slot="2"]'), r = (await slot.boundingBox())!;
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 10 });
    await expect(slot).toHaveAttribute("data-lifted", "", { timeout: 2500 });
    const displaced = (await slot.getByRole("button").boundingBox())!;
    expect(displaced.y).toBeGreaterThanOrEqual(r.y + r.height + 8);
    await page.mouse.up();
    expected[2] = replacementName;
    await expect.poll(() => names(c.toolbar)).toEqual(expected);
    await c.dialog.getByRole("button", { name: "Done", exact: true }).click();
    page = await restart(expected);

    c = await composer(page);
    await beginDrag(page, c.available.getByRole("button").first());
    await endGap(page, c.toolbar);
    await expect(c.toolbar.locator("[data-side][data-full]")).toBeVisible();
    await page.mouse.up();
    await expect.poll(() => names(c.toolbar)).toEqual(expected);
    await c.dialog.getByRole("button", { name: "Done", exact: true }).click();
    await restart(expected);
  } finally { if (l) await quit(l); }
});

test("UI-08: keyboard reorder, remove/add, replace and full refusal persist without running an action", async () => {
  test.setTimeout(90_000);
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, "# Synthetic keyboard review\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note }));
  let l: Launched | undefined;
  try {
    l = await launch(dirs); console.log(`toolbar-scan-owned-pid=${l.pid}`);
    const { page } = l, c = await composer(page);
    await c.toolbar.getByRole("button", { name: "New note", exact: true }).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    const expected = [...defaults.slice(1), defaults[0]!];
    await expect.poll(() => names(c.toolbar)).toEqual(expected);
    await c.toolbar.getByRole("button", { name: "Open…", exact: true }).focus();
    await page.keyboard.press("Delete");
    await expect.poll(() => names(c.toolbar)).toEqual(expected.slice(1));
    await c.available.getByRole("button", { name: "Open…", exact: true }).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    expected.push(expected.shift()!);
    await expect.poll(() => names(c.toolbar)).toEqual(expected);
    const replacement = c.available.getByRole("button").first(), name = (await replacement.getAttribute("aria-label"))!;
    await replacement.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    expected[0] = name;
    await expect.poll(() => names(c.toolbar)).toEqual(expected);
    await c.available.getByRole("button").first().focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect.poll(() => names(c.toolbar)).toEqual(expected);
    await c.dialog.getByRole("button", { name: "Done", exact: true }).click();
    await quit(l);
    l = await launch(dirs); console.log(`toolbar-scan-owned-pid=${l.pid}`);
    await l.page.keyboard.press(`${mod}+.`);
    const real = l.page.getByRole("toolbar", { name: "Toolbar", exact: true });
    await expect.poll(() => real.locator('button, input[role="switch"]').evaluateAll(els => els.map(el => el.getAttribute("aria-label")))).toEqual([...expected, "More"]);
    await l.page.keyboard.press("Escape");
    const reset = await composer(l.page);
    await reset.dialog.getByRole("button", { name: "Reset toolbar to default", exact: true }).click();
    await expect.poll(() => names(reset.toolbar)).toEqual(defaults);
    await reset.dialog.getByRole("button", { name: "Done", exact: true }).click();
    await quit(l);
    l = await launch(dirs); console.log(`toolbar-scan-owned-pid=${l.pid}`);
    await l.page.keyboard.press(`${mod}+.`);
    const restored = l.page.getByRole("toolbar", { name: "Toolbar", exact: true });
    await expect.poll(() => restored.locator('button, input[role="switch"]').evaluateAll(els => els.map(el => el.getAttribute("aria-label")))).toEqual([...defaults, "More"]);
  } finally { if (l) await quit(l); }
});
