import { test, expect, screenAllowed, SCREEN_SKIP, type ElectronApplication, type Page } from "./fixtures.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { spawn } from "node:child_process";

// WP-5.9, PRF-14, D-151: the window follows the hand. The main process owns a drag: one message
// starts it, then it follows the pointer once a frame, applies only the latest position, nothing
// after the release, and the page never repaints for a move.
//
// The first journey is safe on the owner's computer (D-104): an inactive window, the journey's own
// pointer, and the window's `setPosition` recorded instead of moving it, made slower than a frame on
// purpose (the transparent window's case that queued moves before). The second drives a real cursor
// and moves the real window, so it runs only on CI (D-141): `fn:window.dragLag` and `fn:window.settle`.
const custom = process.platform !== "darwin";

/** A pointer on the band at an exact screen position, as the window frame sees one. */
const bandPointer = (page: Page, type: "pointerover" | "pointerdown" | "pointermove" | "pointerup", x: number, y: number) =>
  page.locator("[data-drag-band]").first().dispatchEvent(type, { screenX: x, screenY: y, clientX: 80, clientY: 20, pointerId: 41, isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true });
const nextFrame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))));

interface Recorded { positions: { t: number; x: number; y: number }[]; ends: number[]; moves: number[] }
/** Records every position the main process gives the window, and when each drag's end arrives, without moving it. */
const record = (app: ElectronApplication, stallMs: number) =>
  app.evaluate(({ BrowserWindow, ipcMain }, stall) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
    const g = globalThis as unknown as { snappy: Recorded; stall: number };
    g.snappy = { positions: [], ends: [], moves: [] };
    g.stall = stall;
    win.setPosition = (x: number, y: number) => {
      const t = Date.now();
      // A transparent window can take longer than a frame to move: the case that queued moves.
      while (Date.now() - t < g.stall) { /* the system moving the window */ }
      g.snappy.positions.push({ t, x, y });
    };
    // Registered after the app's own, so it runs once the end has been applied.
    ipcMain.on("window:drag", (_e, phase: unknown) => {
      if (phase === "end") g.snappy.ends.push(Date.now());
      if (phase === "move") g.snappy.moves.push(Date.now());
    });
  }, stallMs);
const recorded = (app: ElectronApplication) => app.evaluate(() => (globalThis as unknown as { snappy: Recorded }).snappy);

async function start(): Promise<Launched> {
  const l = await launch(tempDirs());
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeVisible();
  return l;
}

test.describe("PRF-14: the window follows the hand (D-151)", () => {
  test.skip(!custom, "macOS moves its own window (D-14)");

  test("a fast drag applies only the latest position, nothing after the release, and never lays out or repaints the page", async () => {
    const l = await start();
    const { app, page } = l;
    await record(app, 25);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const metrics = async () => {
      const m = (await cdp.send("Performance.getMetrics")).metrics;
      const get = (name: string) => m.find((x) => x.name === name)?.value ?? 0;
      return { layouts: get("LayoutCount"), styles: get("RecalcStyleCount") };
    };
    // The pointer is on the band before the press, as a hand's is.
    await bandPointer(page, "pointerover", 500, 110);
    await bandPointer(page, "pointermove", 500, 110);
    await nextFrame(page);
    await page.evaluate(() => {
      const g = globalThis as unknown as { mutations: number };
      g.mutations = 0;
      new MutationObserver((list) => void (g.mutations += list.length)).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    // About 3,000 px/s: a move of 50 px every frame for 60 frames, dispatched in the page so nothing
    // waits for the journey between them; then, if asked, the release in the very next frame.
    const burst = (release: boolean) =>
      page.evaluate(async (up) => {
        const band = document.querySelector("[data-drag-band]")!;
        const fire = (type: string, x: number) =>
          band.dispatchEvent(new PointerEvent(type, { screenX: x, screenY: 110, clientX: 80, clientY: 20, pointerId: 41, isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true, cancelable: true }));
        const frame = () => new Promise((r) => requestAnimationFrame(r));
        const g = globalThis as unknown as { mutations: number };
        g.mutations = 0;
        fire("pointerdown", 500);
        for (let i = 1; i <= 60; i++) {
          fire("pointermove", 500 + i * 50);
          await frame();
        }
        const mutations = g.mutations;
        const released = Date.now();
        if (up) fire("pointerup", 3500);
        return { mutations, released };
      }, release);

    // Never a queue: released while the main process is still busy moving the window.
    const { released } = await burst(true);
    await expect.poll(async () => (await recorded(app)).ends.length).toBe(1);
    await page.waitForTimeout(200);
    const r = await recorded(app);
    const afterEnd = r.positions.filter((p) => p.t > r.ends[0]!).length;
    const afterRelease = r.positions.filter((p) => p.t >= released).length;

    // A move never lays out or repaints the page. (Now at full speed, to see the loop's own pace.)
    await app.evaluate(() => void ((globalThis as unknown as { stall: number }).stall = 0));
    const counted = r.positions.length;
    const signals = r.moves.length;
    const before = await metrics();
    const { mutations } = await burst(false);
    const during = await metrics();
    await bandPointer(page, "pointerup", 3500, 110);
    const all = await recorded(app);
    const fast = all.positions.slice(counted);
    const pings = all.moves.slice(signals);
    const pingGaps = pings.slice(1).map((t, i) => t - pings[i]!).sort((a, b) => a - b);
    const gaps = fast.slice(1).map((p, i) => p.t - fast[i]!.t).sort((a, b) => a - b);
    const hz = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().displayFrequency);
    console.log(`[D-151] loop pace: ${fast.length} positions for 60 page frames, median ${gaps[Math.floor(gaps.length / 2)]} ms apart (display ${hz} Hz); the page's frames reach it ${pingGaps[Math.floor(pingGaps.length / 2)]} ms apart (${pings.length} for 60)`);
    console.log(`[D-151] journey: ${r.positions.length} positions applied for 60 page moves (setPosition 25 ms); after the release ${afterRelease}, after the end ${afterEnd}; during a move: page layouts ${during.layouts - before.layouts}, style recalcs ${during.styles - before.styles}, DOM mutations ${mutations}`);
    // Only the latest position: nothing after the end, and only the release's own (or the frame in progress) after the release.
    expect(afterEnd).toBe(0);
    expect(afterRelease).toBeLessThanOrEqual(2);
    expect(r.positions.length).toBeLessThan(60);
    expect(mutations).toBe(0);
    expect(during.layouts - before.layouts).toBe(0);
    expect(during.styles - before.styles).toBe(0);
    await quit(l);
  });

  test("fn:window.dragLag and fn:window.settle: a real cursor at 3,000 px/s, the window within a frame of it, settled within a frame of release", async () => {
    // A real cursor and the real window moving: CI only (D-141).
    test.skip(!screenAllowed(), SCREEN_SKIP);
    test.skip(process.platform !== "win32", "The cursor is moved with Windows' SetCursorPos");
    const l = await start();
    const { app, page } = l;
    const box = await app.evaluate(({ BrowserWindow, screen }) => {
      (globalThis as { focusNotesDragPointer?: string }).focusNotesDragPointer = "cursor";
      const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
      const d = screen.getDisplayMatching(win.getBounds());
      return { win: win.getBounds(), work: d.workArea, hz: d.displayFrequency || 60 };
    });
    const at = { x: box.win.x + 120, y: box.win.y + 30 };
    // The cursor moves left and right across `span` px at 3,000 px/s for 1.2 s, in one process.
    const span = Math.max(200, Math.min(600, box.work.width - box.win.width - 40));
    const script = `Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);';
      [W.U]::SetCursorPos(${at.x}, ${at.y}) | Out-Null; Start-Sleep -Milliseconds 400; $sw = [Diagnostics.Stopwatch]::StartNew();
      while ($sw.ElapsedMilliseconds -lt 1200) { $d = ($sw.Elapsed.TotalMilliseconds * 3) % (2 * ${span}); if ($d -gt ${span}) { $d = 2 * ${span} - $d }; [W.U]::SetCursorPos(${at.x} + [int]$d, ${at.y}) | Out-Null }
      Write-Output done`;
    const mover = spawn("powershell.exe", ["-NoProfile", "-Command", script], { stdio: ["ignore", "pipe", "inherit"] });
    const done = new Promise<void>((res) => mover.on("exit", () => res()));
    await page.waitForTimeout(250);
    await bandPointer(page, "pointerdown", at.x, at.y);
    // The main process samples every 2 ms: the cursor against the window's point that was under it.
    await app.evaluate(({ BrowserWindow, screen }, a) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
      const b0 = win.getBounds();
      const off = { x: a.x - b0.x, y: a.y - b0.y };
      const g = globalThis as unknown as { lag: number[]; lagTimer: ReturnType<typeof setInterval> };
      g.lag = [];
      g.lagTimer = setInterval(() => {
        const c = screen.getCursorScreenPoint();
        const b = win.getBounds();
        g.lag.push(Math.hypot(c.x - (b.x + off.x), c.y - (b.y + off.y)));
      }, 2);
    }, at);
    await done;
    const lag = await app.evaluate(() => {
      const g = globalThis as unknown as { lag: number[]; lagTimer: ReturnType<typeof setInterval> };
      clearInterval(g.lagTimer);
      return g.lag;
    });
    const final = await app.evaluate(({ screen }) => screen.getCursorScreenPoint());
    await bandPointer(page, "pointerup", final.x, final.y);
    const released = Date.now();
    // Settled: the window where the cursor left it.
    const settledAt = await app.evaluate(async ({ BrowserWindow }, f) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
      const want = { x: f.final.x - f.at.x + f.win.x, y: f.final.y - f.at.y + f.win.y };
      for (let i = 0; i < 500; i++) {
        const b = win.getBounds();
        if (b.x === want.x && b.y === want.y) return Date.now();
        await new Promise((r) => setTimeout(r, 1));
      }
      return Number.NaN;
    }, { final, at, win: box.win });
    const sorted = [...lag].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? Number.NaN;
    const frame = 1000 / box.hz;
    const budget = (3000 * frame) / 1000;
    console.log(`fn:window.dragLag p95=${p95.toFixed(1)}px (budget ${budget.toFixed(1)} px at ${box.hz} Hz, ${lag.length} samples); fn:window.settle=${Math.max(0, settledAt - released)}ms (budget ${frame.toFixed(1)} ms)`);
    expect(p95).toBeLessThanOrEqual(budget);
    expect(Math.max(0, settledAt - released)).toBeLessThanOrEqual(Math.ceil(frame));
    await quit(l);
  });
});
