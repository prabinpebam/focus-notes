import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

// M2 window journeys (WP-2.1): the Windows and Linux window the app draws and manages itself
// (DSK-01, DSK-03, DSK-08, D-14), and macOS's native window. What needs a real desktop (the system's
// own Win+arrow keys, Aero snap, monitors with different scaling, clicks passing through the shadow
// margin) is unit-tested in the window controller and checked by hand in the stage demo.
const custom = process.platform !== "darwin";
const shots = "../../test-results/screens";

interface Box { x: number; y: number; width: number; height: number }
const bounds = (app: ElectronApplication): Promise<Box> =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!.getBounds());
const displayBounds = (app: ElectronApplication): Promise<Box> =>
  app.evaluate(({ BrowserWindow, screen }) => screen.getDisplayMatching(BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!.getBounds()).bounds);
const isMinimized = (app: ElectronApplication): Promise<boolean> =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!.isMinimized());
const isFocused = (app: ElectronApplication): Promise<boolean> =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!.isFocused());
const workArea = (app: ElectronApplication): Promise<Box> =>
  app.evaluate(({ BrowserWindow, screen }) => screen.getDisplayMatching(BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!.getBounds()).workArea);
/** The drawn window inside the page: its corners, and where it sits in the transparent margin. */
const frame = (page: Page) =>
  page.locator("[data-app-root]").evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { radius: cs.borderTopLeftRadius, left: Math.round(r.left), top: Math.round(r.top), right: Math.round(innerWidth - r.right), page: getComputedStyle(document.body).backgroundColor };
  });
const nextFrame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))));
/** A pointer on the band at an exact screen position, as the window frame sees one. */
const bandPointer = (page: Page, type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number) =>
  page.locator("[data-drag-band]").first().dispatchEvent(type, { screenX: x, screenY: y, clientX: 80, clientY: 20, pointerId: 31, isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1 });
const band = async (page: Page) => {
  const b = (await page.locator("[data-drag-band]").first().boundingBox())!;
  return { x: b.x + 60, y: b.y + 12 };
};

async function start(dirs = tempDirs()): Promise<Launched & { dirs: ReturnType<typeof tempDirs> }> {
  const l = await launch(dirs);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeVisible();
  return { ...l, dirs };
}

test.describe("Windows and Linux: the app-built window", () => {
  test.skip(!custom, "macOS uses the native window (D-14)");

  test("DSK-01: 20 px corners and a shadow margin at rest, square when maximized, snapped, or full screen", async () => {
    const l = await start();
    const { app, page } = l;
    await expect.poll(() => frame(page)).toMatchObject({ radius: "20px", left: 16, top: 16, right: 16, page: "rgba(0, 0, 0, 0)" });
    // Synthetic pointer moves are given in page coordinates, so each test drag is one step: a real
    // pointer reports the screen position, which doesn't move with the window.
    // The page is transparent around the drawn window; the window keeps its 16 px margin on every side.
    const shadow = await page.locator("[data-app-root]").evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).not.toBe("none");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${shots}/window-rounded.png` });

    await page.getByRole("button", { name: "Maximize" }).click();
    await expect.poll(() => frame(page)).toMatchObject({ radius: "0px", left: 0, top: 0, right: 0 });
    await expect.poll(() => bounds(app)).toEqual(await workArea(app));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${shots}/window-maximized.png` });
    await page.getByRole("button", { name: "Restore" }).click();
    await expect.poll(() => frame(page)).toMatchObject({ radius: "20px", left: 16 });

    const rest = await bounds(app);
    await page.keyboard.press("F11");
    await expect.poll(() => bounds(app)).toEqual(await displayBounds(app));
    await expect.poll(() => frame(page)).toMatchObject({ radius: "0px", left: 0 });
    await page.keyboard.press("F11");
    await expect.poll(() => frame(page)).toMatchObject({ radius: "20px", left: 16 });
    await expect.poll(() => bounds(app)).toEqual(rest);
    expect(await axeViolations(page)).toEqual([]);
    await quit(l);
  });

  test("DSK-03: moving with the app's own move handling, resizing from every edge and corner, double-click to maximize", async () => {
    const l = await start();
    const { app, page } = l;
    await expect.poll(() => frame(page)).toMatchObject({ radius: "20px" });
    const before = await bounds(app);
    const at = await band(page);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 120, at.y + 60);
    await page.mouse.up();
    await expect.poll(() => bounds(app)).toEqual({ ...before, x: before.x + 120, y: before.y + 60 });
    // The note keeps focus: pressing the band never takes it.
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();

    const grow: Record<string, [number, number, number, number]> = {
      n: [0, -20, 0, 20], s: [0, 0, 0, 20], e: [0, 0, 30, 0], w: [-30, 0, 30, 0],
      ne: [0, -20, 30, 20], nw: [-30, -20, 30, 20], se: [0, 0, 30, 20], sw: [-30, 0, 30, 20],
    };
    for (const [edge, [dx, dy, dw, dh]] of Object.entries(grow)) {
      const b = await bounds(app);
      const h = (await page.locator(`[data-window-handle="${edge}"]`).boundingBox())!;
      const cx = h.x + h.width / 2;
      const cy = h.y + h.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + (edge.includes("w") ? -30 : edge.includes("e") ? 30 : 0), cy + (edge.includes("n") ? -20 : edge.includes("s") ? 20 : 0));
      await page.mouse.up();
      await expect.poll(() => bounds(app), { message: edge }).toEqual({ x: b.x + dx, y: b.y + dy, width: b.width + dw, height: b.height + dh });
    }

    const resized = await bounds(app);
    const spot = await band(page);
    await page.mouse.dblclick(spot.x, spot.y);
    await expect.poll(() => bounds(app)).toEqual(await workArea(app));
    await expect.poll(() => frame(page)).toMatchObject({ radius: "0px" });
    const again = await band(page);
    await page.mouse.dblclick(again.x, again.y);
    await expect.poll(() => bounds(app)).toEqual(resized);
    await quit(l);
  });

  test("DSK-08: dragging to a screen edge previews the zone and snaps; dragging a maximized window restores it under the pointer", async () => {
    const l = await start();
    const { app, page } = l;
    await expect.poll(() => frame(page)).toMatchObject({ radius: "20px" });
    const wa = await workArea(app);
    const normal = await bounds(app);
    const preview = () => app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => !x.webContents.getURL().includes("index.html"));
      return w && w.isVisible() ? w.getBounds() : undefined;
    });

    // The left edge: a half-screen zone, previewed, then applied in the work area.
    await bandPointer(page, "pointerdown", normal.x + 200, normal.y + 30);
    await bandPointer(page, "pointermove", wa.x + 1, wa.y + Math.round(wa.height / 2));
    await nextFrame(page);
    const half = { x: wa.x, y: wa.y, width: Math.round(wa.width / 2), height: wa.height };
    await expect.poll(preview).toEqual(half);
    await bandPointer(page, "pointerup", wa.x + 1, wa.y + Math.round(wa.height / 2));
    await expect.poll(() => bounds(app)).toEqual(half);
    await expect.poll(preview).toBeUndefined();
    await expect.poll(() => frame(page)).toMatchObject({ radius: "0px", left: 0 });

    // The top: maximize.
    await bandPointer(page, "pointerdown", wa.x + 300, wa.y + 20);
    await bandPointer(page, "pointermove", wa.x + Math.round(wa.width / 2), wa.y + 1);
    await nextFrame(page);
    await bandPointer(page, "pointerup", wa.x + Math.round(wa.width / 2), wa.y + 1);
    await expect.poll(() => bounds(app)).toEqual(wa);

    // Dragging the maximized window's band restores its size under the pointer.
    const px = wa.x + Math.round(wa.width * 0.75);
    await bandPointer(page, "pointerdown", px, wa.y + 20);
    await bandPointer(page, "pointermove", px + 10, wa.y + 120);
    await nextFrame(page);
    await bandPointer(page, "pointerup", px + 10, wa.y + 120);
    await expect.poll(async () => (await bounds(app)).width).toBe(normal.width);
    const restored = await bounds(app);
    expect(restored.x).toBeLessThan(px + 10);
    expect(restored.x + restored.width).toBeGreaterThan(px + 10);
    await expect.poll(() => frame(page)).toMatchObject({ radius: "20px" });
    await quit(l);
  });

  test("DSK-08: the Snap Layouts picker opens from the maximize button by hover and by keyboard", async () => {
    const l = await start();
    const { app, page } = l;
    const wa = await workArea(app);
    const maximize = page.getByRole("button", { name: "Maximize" });
    await maximize.hover();
    const picker = page.getByRole("dialog", { name: "Snap layouts" });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("group", { name: "Halves" })).toBeVisible();
    await expect(picker.getByRole("group", { name: "Quarters" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Window controls" })).toHaveCSS("opacity", "1");
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${shots}/window-snap-layouts.png` });
    expect(await axeViolations(page)).toEqual([]);
    await picker.getByRole("button", { name: "Left half" }).click();
    await expect(picker).toBeHidden();
    await expect.poll(() => bounds(app)).toEqual({ x: wa.x, y: wa.y, width: Math.round(wa.width / 2), height: wa.height });

    // By keyboard: ↓ on the maximize button opens it with focus on the first zone; arrows move, Enter places.
    await page.mouse.move(400, 400);
    await maximize.focus();
    await page.keyboard.press("ArrowDown");
    await expect(picker.getByRole("button", { name: "Left half" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(picker.getByRole("button", { name: "Right half" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => bounds(app)).toEqual({ x: wa.x + Math.round(wa.width / 2), y: wa.y, width: wa.width - Math.round(wa.width / 2), height: wa.height });
    // Esc closes it and goes back to the button.
    await maximize.focus();
    await page.keyboard.press("ArrowDown");
    await expect(picker).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    await expect(maximize).toBeFocused();
    await quit(l);
  });

  test("DSK-08: Alt+Space opens the app's system menu, and Move works with the arrow keys", async () => {
    const l = await start();
    const { app, page } = l;
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toBeFocused();
    await page.keyboard.press("Alt+Space");
    const menu = page.getByRole("menu", { name: "Window menu" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Restore" })).toBeDisabled();
    await expect(menu.getByRole("menuitem", { name: "Move" })).toBeFocused();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${shots}/window-system-menu.png` });
    expect(await axeViolations(page)).toEqual([]);
    // Move, then arrows, then Enter.
    const before = await bounds(app);
    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect.poll(() => bounds(app)).toEqual({ ...before, x: before.x + 20, y: before.y + 10 });
    await expect(editor).toBeFocused();

    // Maximize from the menu, then Restore from it.
    await page.keyboard.press("Alt+Space");
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "Maximize" }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => bounds(app)).toEqual(await workArea(app));
    await page.keyboard.press("Alt+Space");
    await expect(menu.getByRole("menuitem", { name: "Restore" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => bounds(app)).toEqual({ ...before, x: before.x + 20, y: before.y + 10 });

    // Right-clicking the band opens it too; Esc closes it and the note has focus again.
    const at = await band(page);
    await page.mouse.click(at.x, at.y, { button: "right" });
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(editor).toBeFocused();
    await quit(l);
  });

  test("DSK-03: minimize, and the controls show on hover with Close turning red", async () => {
    const l = await start();
    const { app, page } = l;
    const controls = page.getByRole("group", { name: "Window controls" });
    const close = page.getByRole("button", { name: "Close" });
    await page.mouse.move(400, 400);
    // Hidden at rest while the window is the active one (a CI display without a window manager may never make it so).
    if (await isFocused(app)) await expect(controls).toHaveCSS("opacity", "0");
    await close.hover();
    await expect(controls).toHaveCSS("opacity", "1");
    const red = await close.evaluate((el) => getComputedStyle(el).backgroundColor);
    const danger = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fn-color-danger").trim());
    expect(red).not.toBe("rgba(0, 0, 0, 0)");
    expect(danger).not.toBe("");
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${shots}/window-controls.png` });
    await page.getByRole("button", { name: "Minimize" }).click();
    // A desktop without a window manager (a CI display) can't minimize; Windows always can.
    if (process.platform === "win32") await expect.poll(() => isMinimized(app)).toBe(true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!.restore());
    await quit(l);
  });

  test("DSK-03: size, position, and maximize are remembered across launches", async () => {
    const first = await start();
    const at = await band(first.page);
    await first.page.mouse.move(at.x, at.y);
    await first.page.mouse.down();
    await first.page.mouse.move(at.x - 40, at.y + 30);
    await first.page.mouse.up();
    const h = (await first.page.locator('[data-window-handle="se"]').boundingBox())!;
    await first.page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await first.page.mouse.down();
    await first.page.mouse.move(h.x + h.width / 2 - 100, h.y + h.height / 2 - 60);
    await first.page.mouse.up();
    await first.page.waitForTimeout(100);
    const placed = await bounds(first.app);
    await quit(first);

    const second = await start(first.dirs);
    expect(await bounds(second.app)).toEqual(placed);
    await second.page.getByRole("button", { name: "Maximize" }).click();
    await expect.poll(() => bounds(second.app)).toEqual(await workArea(second.app));
    await quit(second);

    const third = await start(first.dirs);
    await expect.poll(() => frame(third.page)).toMatchObject({ radius: "0px" });
    expect(await bounds(third.app)).toEqual(await workArea(third.app));
    await third.page.getByRole("button", { name: "Restore" }).click();
    await expect.poll(() => bounds(third.app)).toEqual(placed);
    await quit(third);
  });
});

test("DSK-01: macOS keeps the system's own window, with no drawn frame or window controls", async () => {
  test.skip(custom, "Windows and Linux draw their own window");
  const l = await start();
  await expect(l.page.locator("[data-window-handle]")).toHaveCount(0);
  await expect(l.page.getByRole("group", { name: "Window controls" })).toHaveCount(0);
  expect(await l.page.evaluate(() => document.documentElement.dataset.windowFrame)).toBeUndefined();
  expect(await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isResizable())).toBe(true);
  await quit(l);
});

test("PRF-04: the page reports the pointer only near the shadow margin or the title bar band, and nothing polls for it", async () => {
  const l = await start();
  const { app, page } = l;
  // Count the page's reports (D-104, D-106): the shell reads where the pointer is only when told.
  await app.evaluate(({ ipcMain }) => {
    const g = globalThis as unknown as { pointerReports: number };
    g.pointerReports = 0;
    ipcMain.on("window:pointer", () => void g.pointerReports++);
  });
  const reports = () => app.evaluate(() => (globalThis as unknown as { pointerReports: number }).pointerReports);
  const settled = async () => {
    await nextFrame(page);
    return reports();
  };
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  // The margin, 6 px from the page's left edge (Windows and Linux); on macOS, just under the band.
  const near = custom ? { x: 6, y: Math.round(h / 2) } : { x: Math.round(w / 2), y: 50 };
  await page.mouse.move(w / 2, h / 2);
  const before = await settled();
  for (let i = 1; i <= 5; i++) await page.mouse.move(w / 2 + i * 10, h / 2 + i * 5);
  expect(await settled()).toBe(before);
  await page.mouse.move(near.x, near.y);
  const reported = await settled();
  expect(reported).toBeGreaterThan(before);
  // Back in the middle: one more report, so the shell sees the pointer leave, then nothing.
  await page.mouse.move(w / 2, h / 2);
  expect(await settled()).toBe(reported + 1);
  for (let i = 1; i <= 5; i++) await page.mouse.move(w / 2 - i * 10, h / 2 - i * 5);
  await page.waitForTimeout(500);
  expect(await settled()).toBe(reported + 1);
  await quit(l);
});
