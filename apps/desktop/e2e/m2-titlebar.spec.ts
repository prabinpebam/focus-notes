import { test, expect, type ElectronApplication, type Page } from "./fixtures.ts";
import { launch, placed, quit, setWindowActive, tempDirs, windowBox, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

// M2 title bar journeys (WP-2.2): the 44 px title bar band with the trigger centered (DSK-02), full
// screen and the band coming back at the top edge (DSK-04), and macOS's menu bar built from the
// commands (DSK-05). What only a real Mac or desktop shows (the traffic lights with a real pointer,
// Help's search, a real pointer at the top of a full-screen display) is checked by hand in the M2 demo.
const mac = process.platform === "darwin";
const shots = "../../test-results/screens";

const mainWindow = (app: ElectronApplication) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!.id);
const bounds = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!.getBounds());
const displayBounds = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow, screen }) => screen.getDisplayMatching(BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!.getBounds()).bounds);
const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;
/** The band is showing its controls (the window frame marks the page while the pointer is on it). */
const bandShown = (page: Page) => page.evaluate(() => "windowBand" in document.documentElement.dataset);
const regionOf = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).getPropertyValue("-webkit-app-region"));

async function start(): Promise<Launched> {
  const l = await launch(tempDirs());
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeVisible();
  return l;
}

test("DSK-02: the top 44 px are the title bar band, with the trigger centered under it and nothing else at rest", async () => {
  const l = await start();
  const { page } = l;
  const win = await windowBox(page);
  const band = await box(page, "[data-drag-band]");
  // The band is the window's top 44 px, edge to edge.
  expect(band).toEqual({ x: win.left, y: win.top, width: win.width, height: 44 });
  // The trigger is centered across it, 40 px below the window's top edge (UI-10, D-78).
  const trigger = page.getByRole("button", { name: "Focus Notes menu" });
  const t = (await trigger.boundingBox())!;
  expect(Math.abs(t.x + t.width / 2 - (band.x + band.width / 2))).toBeLessThanOrEqual(1);
  expect(Math.round(t.y - win.top)).toBe(40);
  // The trigger is never dragged; on macOS the band is the system's drag region, elsewhere the app moves the window.
  expect(await regionOf(page, "[data-drag-band] ~ [data-no-drag]")).toBe("no-drag");
  expect(await regionOf(page, "[data-drag-band]")).toBe(mac ? "drag" : "no-drag");
  // Text under the band, below it, isn't part of it: the band ends at 44 px.
  const below = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-drag-band]") !== null, { x: win.left + 60, y: win.top + 50 });
  expect(below).toBe(false);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/titlebar-rest.png` });
  expect(await axeViolations(page)).toEqual([]);
  await quit(l);
});

test.describe("Windows and Linux: the app-drawn window controls", () => {
  test.skip(mac, "macOS has its own traffic lights");

  test("DSK-02: the controls are hidden at rest, and show on hover and on keyboard focus", async () => {
    const l = await start();
    const { app, page } = l;
    const controls = page.getByRole("group", { name: "Window controls" });
    const win = await windowBox(page);
    await page.mouse.move(win.left + win.width / 2, win.top + 300);
    expect(await bandShown(page)).toBe(false);
    // Hidden at rest while the window is the active one; shown while another app is (DD-DSK-04).
    await expect(controls).toHaveCSS("opacity", "0");
    await setWindowActive(app, false);
    await expect(controls).toHaveCSS("opacity", "1");
    await setWindowActive(app, true);
    await expect(controls).toHaveCSS("opacity", "0");
    // The controls sit in the band, at its end.
    const c = (await controls.boundingBox())!;
    expect(c.y - win.top).toBeGreaterThanOrEqual(0);
    expect(c.y + c.height - win.top).toBeLessThanOrEqual(44);
    expect(Math.round(win.left + win.width - (c.x + c.width))).toBeLessThanOrEqual(16);
    // Hover anywhere on the band shows them.
    await page.mouse.move(win.left + 80, win.top + 20);
    expect(await bandShown(page)).toBe(true);
    await expect(controls).toHaveCSS("opacity", "1");
    await page.mouse.move(win.left + win.width / 2, win.top + 300);
    expect(await bandShown(page)).toBe(false);
    await expect(controls).toHaveCSS("opacity", "0");
    // Keyboard focus shows them too, with a visible focus ring.
    await page.getByRole("button", { name: "Minimize" }).focus();
    await expect(controls).toHaveCSS("opacity", "1");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Maximize" })).toBeFocused();
    await expect(controls).toHaveCSS("opacity", "1");
    expect(await axeViolations(page)).toEqual([]);
    await quit(l);
  });

  test("DSK-04: F11 and ⋯ go full screen; the band hides there until the pointer reaches the top edge", async () => {
    const l = await start();
    const { app, page } = l;
    const controls = page.getByRole("group", { name: "Window controls" });
    const rest = await bounds(app);
    await page.keyboard.press("F11");
    await expect.poll(() => bounds(app)).toEqual(await placed(app, await displayBounds(app)));
    const win = await windowBox(page);
    expect(win.top).toBe(0);
    // On the band, but not at the top edge: still hidden.
    await page.mouse.move(win.width / 2 - 120, 20);
    await page.mouse.move(win.width / 2 - 100, 24);
    expect(await bandShown(page)).toBe(false);
    await expect(controls).toHaveCSS("opacity", "0");
    // At the top edge it comes back, and stays while the pointer is on it.
    await page.mouse.move(win.width / 2 - 100, 0);
    expect(await bandShown(page)).toBe(true);
    await expect(controls).toHaveCSS("opacity", "1");
    await page.mouse.move(win.width - 60, 20);
    expect(await bandShown(page)).toBe(true);
    await expect(controls).toHaveCSS("opacity", "1");
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${shots}/titlebar-full-screen-edge.png` });
    // Leaving the band hides it again; the trigger stays visible throughout.
    await page.mouse.move(win.width / 2, 300);
    expect(await bandShown(page)).toBe(false);
    await expect(controls).toHaveCSS("opacity", "0");
    await expect(page.getByRole("button", { name: "Focus Notes menu" })).toBeVisible();
    // Back on the band below the edge: still hidden until the edge again.
    await page.mouse.move(win.width / 2 - 100, 30);
    expect(await bandShown(page)).toBe(false);
    // The keyboard still reaches the controls in full screen.
    await page.getByRole("button", { name: "Close" }).focus();
    await expect(controls).toHaveCSS("opacity", "1");
    expect(await axeViolations(page)).toEqual([]);

    // ⋯ → Full screen leaves it, and the window is back where it was.
    await page.getByRole("textbox", { name: "Note" }).focus();
    await page.keyboard.press("Control+.");
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: /Full screen/ }).click();
    await expect.poll(() => bounds(app)).toEqual(rest);
    // ⋯ → Full screen enters it too.
    await page.keyboard.press("Control+.");
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: /Full screen/ }).click();
    await expect.poll(() => bounds(app)).toEqual(await placed(app, await displayBounds(app)));
    await page.keyboard.press("F11");
    await expect.poll(() => bounds(app)).toEqual(rest);
    await quit(l);
  });
});

test.describe("macOS: the native window and its menu bar", () => {
  test.skip(!mac, "Only macOS has a menu bar and traffic lights");

  interface Item { id: string; label: string; role: string | null; accelerator: string | null; type: string; checked: boolean; enabled: boolean; submenu?: Item[] }
  const menuBar = (app: ElectronApplication) =>
    app.evaluate(({ Menu }) => {
      const walk = (items: Electron.MenuItem[]): unknown[] => items.map((i) => ({
        id: i.id, label: i.label, role: i.role ?? null, accelerator: (i.accelerator as string | undefined) ?? null, type: i.type, checked: i.checked, enabled: i.enabled,
        ...(i.submenu ? { submenu: walk(i.submenu.items) } : {}),
      }));
      const m = Menu.getApplicationMenu();
      return m ? walk(m.items) : [];
    }) as Promise<Item[]>;
  const flat = (items: Item[]): Item[] => items.flatMap((i) => [i, ...(i.submenu ? flat(i.submenu) : [])]);
  const itemOf = async (app: ElectronApplication, id: string) => flat(await menuBar(app)).find((i) => i.id === id);

  test("DSK-05: the menu bar lists the commands with their keys, follows their states, and runs them", async () => {
    const l = await start();
    const { app, page } = l;
    // The renderer builds it once the note is open.
    await expect.poll(async () => (await menuBar(app)).map((m) => m.label).slice(1)).toEqual(["File", "Edit", "Format", "View", "Go", "Window", "Help"]);
    const top = await menuBar(app);
    expect(top.find((m) => m.label === "Window")?.role?.toLowerCase()).toBe("window");
    expect(top.find((m) => m.label === "Help")?.role?.toLowerCase()).toBe("help");
    // The system's own items.
    const roles = flat(top).map((i) => i.role?.toLowerCase()).filter(Boolean);
    for (const r of ["about", "services", "hide", "hideothers", "unhide", "quit", "undo", "redo", "cut", "copy", "paste", "selectall", "minimize", "zoom", "front", "close"]) expect(roles, r).toContain(r);
    // Commands with the keymap's keys.
    expect(await itemOf(app, "note.new")).toMatchObject({ label: "New note", accelerator: "Command+N", enabled: true });
    expect(await itemOf(app, "find.replace")).toMatchObject({ accelerator: "Alt+Command+F" });
    expect(await itemOf(app, "window.fullScreen")).toMatchObject({ accelerator: "Control+Command+F" });
    expect(await itemOf(app, "format.bold")).toMatchObject({ accelerator: "Command+B", enabled: true });
    expect(await itemOf(app, "settings.open")).toMatchObject({ accelerator: "Command+," });
    expect(await itemOf(app, "window.minimize")).toBeUndefined();
    // Each command once.
    const ids = flat(top).map((i) => i.id).filter((id) => /^[a-z]+\.[A-Za-z.-]+$/.test(id));
    expect(ids.length).toBe(new Set(ids).size);
    // Choosing an item runs the command in the page; its checkmark follows the command's state.
    const focus = await itemOf(app, "focus.toggle");
    expect(focus?.type).toBe("checkbox");
    const before = focus!.checked;
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById("focus.toggle")!.click());
    await expect.poll(async () => (await itemOf(app, "focus.toggle"))?.checked).toBe(!before);
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById("toolbar.toggle")!.click());
    await expect(page.getByRole("toolbar")).toBeVisible();
    await page.keyboard.press("Escape");
    // The key runs the command once, wherever macOS sends it first.
    await page.getByRole("textbox", { name: "Note" }).focus();
    await page.keyboard.press("Meta+Shift+D");
    await expect.poll(async () => (await itemOf(app, "focus.toggle"))?.checked).toBe(before);
    await page.waitForTimeout(MENU_SETTLE_MS);
    expect((await itemOf(app, "focus.toggle"))?.checked).toBe(before);
    await quit(l);
  });

  test("DSK-02: the traffic lights sit in the band, hidden at rest and shown while the toolbar is open", async () => {
    const l = await start();
    const { app, page } = l;
    expect(await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)!.getWindowButtonPosition(), await mainWindow(app))).toEqual({ x: 16, y: 14 });
    // Record what the window is told from now on.
    await app.evaluate(({ BrowserWindow }) => {
      const g = globalThis as unknown as { buttons: boolean[] };
      g.buttons = [];
      const proto = BrowserWindow.prototype as unknown as { setWindowButtonVisibility(v: boolean): void };
      const set = proto.setWindowButtonVisibility;
      proto.setWindowButtonVisibility = function (this: unknown, v: boolean) {
        g.buttons.push(v);
        return set.call(this, v);
      };
    });
    const last = () => app.evaluate(() => (globalThis as unknown as { buttons: boolean[] }).buttons.at(-1));
    await page.keyboard.press("Meta+.");
    await expect(page.getByRole("toolbar")).toBeVisible();
    await expect.poll(last).toBe(true);
    await page.keyboard.press("Escape");
    // Hidden again, unless the real pointer happens to be on the band (journeys don't move it).
    const atRest = await app.evaluate(({ BrowserWindow, screen }, id) => {
      const w = BrowserWindow.fromId(id)!;
      const c = w.getContentBounds();
      const p = screen.getCursorScreenPoint();
      const onBand = p.x >= c.x && p.x < c.x + c.width && p.y >= c.y && p.y < c.y + 44;
      return !onBand && !w.isFullScreen();
    }, await mainWindow(app));
    if (atRest) await expect.poll(last).toBe(false);
    // Another app in front: the window isn't the active one, and its traffic lights show, as macOS's do.
    await setWindowActive(app, false);
    await expect.poll(last).toBe(true);
    await setWindowActive(app, true);
    if (atRest) await expect.poll(last).toBe(false);
    await quit(l);
  });
});

/** Longer than the menu bar's own wait to notice a key the page already ran (MENU_KEY_WINDOW_MS). */
const MENU_SETTLE_MS = 700;
