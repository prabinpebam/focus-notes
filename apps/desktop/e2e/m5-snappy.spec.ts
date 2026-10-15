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

  // The same real-cursor drag on three paths, so CI tells the loop from the runner (D-151):
  // "relay", the path before D-151 (each page move applied as it arrives); "cursor", the app's
  // (the main process reads the cursor at its own ticks and at each page frame); and "cursor, timer
  // only", the window ignoring the mouse, so only the main process's ticks pace it.
  const PATHS = [
    { name: "relay (before D-151)", pointer: "relay", mouse: true, gate: false },
    { name: "cursor (D-151)", pointer: "cursor", mouse: true, gate: true },
    { name: "cursor, timer only", pointer: "cursor", mouse: false, gate: false },
  ] as const;
  for (const path of PATHS) {
    test(`fn:window.dragLag and fn:window.settle, ${path.name}: a real cursor at 3,000 px/s, the window within a frame of it, settled within a frame of release`, async () => {
      // A real cursor and the real window moving: CI only (D-141).
      test.skip(!screenAllowed(), SCREEN_SKIP);
      test.skip(process.platform !== "win32", "The cursor is moved with Windows' SetCursorPos");
      const l = await start();
      const { app, page } = l;
      const box = await app.evaluate(({ BrowserWindow, screen }, o) => {
        (globalThis as { focusNotesDragPointer?: string }).focusNotesDragPointer = o.pointer;
        const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
        if (o.mouse) {
          // The window takes the real pointer, so the page sees its moves (journeys normally ignore it, D-104).
          const own = BrowserWindow.prototype.setIgnoreMouseEvents.bind(win);
          win.setIgnoreMouseEvents = own;
          own(false);
        }
        // Every position the window is given, to count them.
        const g = globalThis as unknown as { moves: number[] };
        g.moves = [];
        const setPosition = BrowserWindow.prototype.setPosition.bind(win);
        win.setPosition = (x: number, y: number, animate?: boolean) => {
          const t = performance.now();
          setPosition(x, y, animate);
          g.moves.push(performance.now() - t);
        };
        const d = screen.getDisplayMatching(win.getBounds());
        return { win: win.getBounds(), display: d.bounds, work: d.workArea, scale: d.scaleFactor, hz: d.displayFrequency || 60 };
      }, { pointer: path.pointer, mouse: path.mouse });
      const state = await page.evaluate(() => document.documentElement.dataset.windowFrame ?? "");
      const at = { x: box.win.x + 160, y: box.win.y + 30 };
      // The cursor sweeps right and left across `span` px at 3,000 px/s for 1.2 s, in one process,
      // parked first and started on a word, so the press and the start of the sweep are known.
      const span = Math.max(200, Math.min(600, box.work.x + box.work.width - at.x - 40));
      const script = `Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);';
        [W.U]::SetCursorPos(${at.x}, ${at.y}) | Out-Null; [Console]::Out.WriteLine('parked'); [Console]::Out.Flush(); [void][Console]::In.ReadLine();
        $sw = [Diagnostics.Stopwatch]::StartNew(); $n = 0;
        while ($sw.ElapsedMilliseconds -lt 1200) { $d = ($sw.Elapsed.TotalMilliseconds * 3) % (2 * ${span}); if ($d -gt ${span}) { $d = 2 * ${span} - $d }; [W.U]::SetCursorPos(${at.x} + [int]$d, ${at.y}) | Out-Null; $n++ }
        [Console]::Out.WriteLine("done $n")`;
      const mover = spawn("powershell.exe", ["-NoProfile", "-Command", script], { stdio: ["pipe", "pipe", "inherit"] });
      let out = "";
      mover.stdout.on("data", (b: Buffer) => (out += b.toString()));
      const done = new Promise<void>((res) => mover.on("exit", () => res()));
      await expect.poll(() => out, { timeout: 20_000 }).toContain("parked");
      // The press, where the cursor is: the window's point under it is what must follow the cursor.
      const press = await app.evaluate(({ BrowserWindow, screen }) => {
        const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
        return { cursor: screen.getCursorScreenPoint(), win: win.getBounds() };
      });
      await page.locator("[data-drag-band]").first().dispatchEvent("pointerdown", { screenX: press.cursor.x, screenY: press.cursor.y, clientX: 160, clientY: 30, pointerId: 1, isPrimary: true, button: 0, buttons: 1, bubbles: true });
      // The main process samples every 2 ms: the cursor against the window's point that was under it.
      await app.evaluate(({ BrowserWindow, screen }, pr) => {
        const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
        const off = { x: pr.cursor.x - pr.win.x, y: pr.cursor.y - pr.win.y };
        const g = globalThis as unknown as { samples: number[][]; lagTimer: ReturnType<typeof setInterval>; t0: number };
        g.samples = [];
        g.t0 = performance.now();
        g.lagTimer = setInterval(() => {
          const c = screen.getCursorScreenPoint();
          const b = win.getBounds();
          g.samples.push([Math.round(performance.now() - g.t0), c.x, c.y, b.x, b.y, Math.hypot(c.x - (b.x + off.x), c.y - (b.y + off.y))]);
        }, 2);
      }, press);
      mover.stdin.write("go\n");
      await done;
      const run = await app.evaluate(() => {
        const g = globalThis as unknown as { samples: number[][]; lagTimer: ReturnType<typeof setInterval>; moves: number[] };
        clearInterval(g.lagTimer);
        return { samples: g.samples, moves: g.moves };
      });
      const final = await app.evaluate(({ screen }) => screen.getCursorScreenPoint());
      const released = Date.now();
      await page.locator("[data-drag-band]").first().dispatchEvent("pointerup", { screenX: final.x, screenY: final.y, clientX: 160, clientY: 30, pointerId: 1, isPrimary: true, button: 0, buttons: 0, bubbles: true });
      // Settled: the window's point that was under the cursor is under it again.
      const settledAt = await app.evaluate(async ({ BrowserWindow }, f) => {
        const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
        const want = { x: f.final.x - f.press.cursor.x + f.press.win.x, y: f.final.y - f.press.cursor.y + f.press.win.y };
        for (let i = 0; i < 500; i++) {
          const b = win.getBounds();
          if (b.x === want.x && b.y === want.y) return Date.now();
          await new Promise((r) => setTimeout(r, 1));
        }
        return Number.NaN;
      }, { final, press });
      const after = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!.getBounds());
      // While the cursor moved (it's parked before and after): its speed, the lag, the window's moves.
      const moving = run.samples.filter((s, i) => i > 0 && (s[1] !== run.samples[i - 1]![1] || s[2] !== run.samples[i - 1]![2]));
      const lag = run.samples.map((s) => s[5]!).sort((a, b) => a - b);
      const pct = (a: number[], q: number) => a[Math.min(a.length - 1, Math.floor(a.length * q))] ?? Number.NaN;
      const p95 = pct(lag, 0.95);
      const span0 = run.samples.at(-1)?.[0] ?? 1;
      const travel = run.samples.slice(1).reduce((n, s, i) => n + Math.abs(s[1]! - run.samples[i]![1]!), 0);
      const costs = [...run.moves].sort((a, b) => a - b);
      const frame = 1000 / box.hz;
      const budget = (3000 * frame) / 1000;
      const settle = Math.max(0, settledAt - released);
      console.log(`[D-151] ${path.name}: display ${JSON.stringify(box.display)} work ${JSON.stringify(box.work)} scale ${box.scale} ${box.hz} Hz; window ${JSON.stringify(box.win)} frame "${state}"; press ${JSON.stringify(press)}; span ${span}; mover ${out.trim().split(/\s+/).join(" ")}`);
      console.log(`[D-151] ${path.name}: cursor travelled ${travel} px in ${span0} ms (${Math.round((travel / span0) * 1000)} px/s), moving in ${moving.length} of ${run.samples.length} samples; window given ${run.moves.length} positions, setPosition p50 ${pct(costs, 0.5)?.toFixed(2)} ms p95 ${pct(costs, 0.95)?.toFixed(2)} ms; lag p50 ${pct(lag, 0.5)?.toFixed(1)} p95 ${p95.toFixed(1)} max ${lag.at(-1)?.toFixed(1)} px; after release ${JSON.stringify(after)}`);
      console.log(`[D-151] ${path.name}: samples (ms, cursor x, y, window x, y, lag) ${JSON.stringify(run.samples.filter((_, i) => i % 40 === 0).map((s) => s.map((v) => Math.round(v))))}`);
      console.log(`fn:window.dragLag (${path.name}) p95=${p95.toFixed(1)}px (budget ${budget.toFixed(1)} px at ${box.hz} Hz, ${lag.length} samples); fn:window.settle=${settle}ms (budget ${frame.toFixed(1)} ms)`);
      await quit(l);
      if (!path.gate) return;
      expect(p95).toBeLessThanOrEqual(budget);
      expect(settle).toBeLessThanOrEqual(Math.ceil(frame));
    });
  }
});
