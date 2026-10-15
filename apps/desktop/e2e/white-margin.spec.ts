/**
 * D-153, DSK-09: the app-built window's shadow margin is never white or opaque at the screen level.
 * The page screencast (dsk09-frames) can't see this: it's the system's composition of the
 * transparent window. A solid magenta window sits behind the app, and the screen is captured again
 * and again (desktopCapturer) while the window lets clicks through and takes them back
 * (setIgnoreMouseEvents, the margin's pass-through path), settles on focus and blur, hides and
 * shows, minimizes and restores, resizes, maximizes, snaps (with its preview), and after the GPU
 * process crashes (software compositing, D-121). In every capture the margin must be magenta, or
 * magenta darkened by the shadow: never white, grey or any opaque fill.
 *
 * Screen-level: it captures the screen and moves the real window, so it runs on CI only (D-141).
 */
import { test, expect, screenAllowed, SCREEN_SKIP } from "./fixtures.ts";
import { launch, quit, tempDirs } from "./helpers.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = join(import.meta.dirname, "..", "..", "..", "test-results", "white-margin");

interface Report { label: string; captures: number; bad: number; worst: number; invalid: number; notDrawn: number; samples: string[] }
/**
 * The compositing paths a Windows window can be on: in software (a runner, a remote desktop, after
 * the GPU went away), and on the GPU (DirectComposition), reached on a runner with no GPU through
 * Direct3D 11 on WARP, Windows' own software rasterizer (FOCUS_NOTES_CHROMIUM_SWITCHES, never packaged).
 */
const WARP = { FOCUS_NOTES_CHROMIUM_SWITCHES: "use-angle=d3d11-warp,ignore-gpu-blocklist,enable-gpu-rasterization" };
const MODES = [
  { name: "software", env: {} },
  { name: "gpu (DirectComposition on WARP)", env: WARP },
  // The same without the window kept layered (D-153), to compare.
  { name: "software-unlayered", env: { FOCUS_NOTES_WINDOW_LAYERED: "0" } },
  { name: "gpu-unlayered (DirectComposition on WARP)", env: { ...WARP, FOCUS_NOTES_WINDOW_LAYERED: "0" } },
] as const;

test.describe("D-153: the shadow margin at the screen level", () => {
  test.skip(process.platform === "darwin", "macOS uses the native window (D-14)");
  test.skip(!screenAllowed(), SCREEN_SKIP);

  for (const mode of MODES) test(`the margin is never white or opaque, ${mode.name}: pass-through toggles, focus, show, minimize, resize, maximize, snap, GPU crash`, async () => {
    test.setTimeout(240_000);
    mkdirSync(OUT, { recursive: true });
    const dirs = tempDirs();
    writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", appearance: "dark" }));
    writeFileSync(join(dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 140, y: 120, width: 640, height: 440 } }));
    const l = await launch(dirs, { ...mode.env });
    const { app, page } = l;
    try {
      await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
      // The backdrop, and the capture loop, in the main process.
      await app.evaluate(async ({ BrowserWindow, desktopCapturer, screen }, { out, tag }) => {
        const fs = process.getBuiltinModule("node:fs") as typeof import("node:fs");
        const path = process.getBuiltinModule("node:path") as typeof import("node:path");
        const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
        const d = screen.getPrimaryDisplay();
        const backdrop = new BrowserWindow({ ...d.workArea, frame: false, backgroundColor: "#ff00ff", show: false, focusable: false, skipTaskbar: true, resizable: false, hasShadow: false });
        backdrop.showInactive();
        // Above the backdrop: moveTop alone doesn't raise a window that isn't the foreground one on a
        // runner (the first runs measured the backdrop); restoring it does.
        win.moveTop();
        win.minimize();
        await new Promise((r) => setTimeout(r, 400));
        win.restore();
        await new Promise((r) => setTimeout(r, 1200));
        const g = globalThis as unknown as { wm: { label: string; stop: boolean; reports: Record<string, { label: string; captures: number; bad: number; worst: number; invalid: number; notDrawn: number; samples: string[] }>; done?: Promise<void>; interior?: () => Promise<number> } };
        g.wm = { label: "rest", stop: false, reports: {} };
        const scale = d.scaleFactor;
        const size = { width: Math.round(d.size.width * scale), height: Math.round(d.size.height * scale) };
        const margin = 16;
        const once = async () => {
          const label = g.wm.label;
          const b = win.getBounds();
          const report = (g.wm.reports[label] ??= { label, captures: 0, bad: 0, worst: 0, invalid: 0, notDrawn: 0, samples: [] });
          // Only a rounded window at rest has a margin; maximized, snapped and minimized have none.
          const inset = win.isMinimized() || !win.isVisible() ? 0 : await win.webContents.executeJavaScript("document.documentElement.dataset.windowFrame === 'rounded' ? 1 : 0").catch(() => 0);
          const [src] = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: size });
          if (!src || !inset) return;
          const img = src.thumbnail;
          const bmp = img.toBitmap();
          const W = img.getSize().width;
          const px = (x: number, y: number) => {
            const o = (Math.round(y * scale) * W + Math.round(x * scale)) * 4;
            return [bmp[o + 2]!, bmp[o + 1]!, bmp[o]!] as const; // BGRA
          };
          // A capture is only evidence if the backdrop around the window is in it: a capturer's blank
          // frame (it sends some while the GPU process restarts) shows no magenta at all.
          let around = 0, magenta = 0;
          for (let x = b.x - 12; x < b.x + b.width + 12; x += 3) {
            for (const y of [b.y - 8, b.y + b.height + 8]) {
              if (x < 0 || y < 0 || x >= d.size.width || y >= d.size.height) continue;
              around++;
              const [r, gg, bl] = px(x, y);
              if (r > 200 && bl > 200 && gg < 60) magenta++;
            }
          }
          if (!around || magenta / around < 0.9) {
            report.invalid++;
            return;
          }
          let ring = 0, bad = 0;
          // The margin's ring, clear of the drawn window's 1 px border and its corners' curve.
          for (let y = b.y; y < b.y + b.height; y++) {
            for (let x = b.x; x < b.x + b.width; x++) {
              const inX = x >= b.x + margin - 2 && x < b.x + b.width - margin + 2;
              const inY = y >= b.y + margin - 2 && y < b.y + b.height - margin + 2;
              if (inX && inY) continue;
              ring++;
              const [r, gg, bl] = px(x, y);
              // Magenta under a dark shadow keeps green near 0 and red near blue; white or grey doesn't.
              if (gg > 70 || Math.abs(r - bl) > 70) bad++;
            }
          }
          report.captures++;
          // The window itself must be drawn: its inside is the dark canvas, never the backdrop showing through.
          let inside = 0, through = 0;
          for (let y = b.y + margin + 50; y < b.y + b.height - margin - 20; y += 9) {
            for (let x = b.x + margin + 20; x < b.x + b.width - margin - 20; x += 9) {
              inside++;
              const [r, gg, bl] = px(x, y);
              if (r > 200 && bl > 200 && gg < 60) through++;
            }
          }
          // The window not drawn at all (the backdrop through it) is counted on its own: it's not a white margin.
          if (inside && through / inside > 0.3) report.notDrawn++;
          const share = ring ? bad / ring : 0;
          report.worst = Math.max(report.worst, share);
          // A sample of a good frame too, the first of each phase, to see what was measured.
          if (share < 0.01 && report.captures === 1 && (label === "rest" || label.startsWith("pass-through"))) {
            fs.writeFileSync(path.join(out, `${tag}-ok-${label.replace(/[^a-z0-9]+/gi, "-")}.png`), img.crop({ x: Math.max(0, Math.round((b.x - 30) * scale)), y: Math.max(0, Math.round((b.y - 30) * scale)), width: Math.round((b.width + 60) * scale), height: Math.round((b.height + 60) * scale) }).toPNG());
          }
          if (share >= 0.01) {
            report.bad++;
            if (report.samples.length < 3) {
              const file = path.join(out, `${tag}-${label.replace(/[^a-z0-9]+/gi, "-")}-${report.captures}.png`);
              fs.writeFileSync(file, img.crop({ x: Math.max(0, Math.round((b.x - 30) * scale)), y: Math.max(0, Math.round((b.y - 30) * scale)), width: Math.round((b.width + 60) * scale), height: Math.round((b.height + 60) * scale) }).toPNG());
              report.samples.push(`${(share * 100).toFixed(1)}% → ${path.basename(file)}`);
            }
          }
        };
        g.wm.done = (async () => {
          while (!g.wm.stop) await once().catch((e) => void (g.wm.reports.error ??= { label: `error ${String(e)}`, captures: 0, bad: 1, worst: 1, invalid: 0, notDrawn: 0, samples: [] }));
        })();
        // The drawn window's inside, summed: it changes when what the window shows changes (content still updates).
        g.wm.interior = async () => {
          const b = win.getBounds();
          const [src] = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: size });
          const bmp = src!.thumbnail.toBitmap();
          const W = src!.thumbnail.getSize().width;
          let sum = 0;
          for (let y = b.y + margin + 4; y < b.y + b.height - margin - 4; y += 2) for (let x = b.x + margin + 4; x < b.x + b.width - margin - 4; x += 2) sum += bmp[(Math.round(y * scale) * W + Math.round(x * scale)) * 4 + 1]! * ((x * 31 + y) % 7 + 1);
          return sum;
        };
      }, { out: OUT, tag: mode.name.split(" ")[0]! });
      const phase = async (label: string, fn: () => Promise<unknown>, settleMs = 600) => {
        await app.evaluate((_e, l) => void ((globalThis as unknown as { wm: { label: string } }).wm.label = l), label);
        await fn();
        await page.waitForTimeout(settleMs);
      };
      const inMain = <A,>(fn: (e: typeof import("electron"), a: A) => unknown, a?: A) => app.evaluate(fn as never, a as never);
      // The window still shows what changes: typing reaches the screen (a window whose content stopped
      // updating would pass every margin check). Checked at the start and at the end.
      const interior = () => app.evaluate(() => (globalThis as unknown as { wm: { interior: () => Promise<number> } }).wm.interior());
      const editor = page.getByRole("textbox", { name: "Note" });
      const updates: string[] = [];
      const typingShows = async (when: string, words: string) => {
        await editor.click();
        const before = await interior();
        await page.keyboard.type(words);
        await expect(editor).toContainText(words.trim());
        let changed = false;
        for (let i = 0; i < 20 && !changed; i++) {
          await page.waitForTimeout(250);
          changed = (await interior()) !== before;
        }
        updates.push(`${when}: typed text ${changed ? "reached" : "did NOT reach"} the screen`);
      };

      await phase("rest", () => page.waitForTimeout(1500));
      await typingShows("at the start", " Typed at the start.");
      await phase("pass-through toggles (setIgnoreMouseEvents)", async () => {
        for (let i = 0; i < 12; i++) {
          await inMain(({ BrowserWindow }, on: boolean) => {
            const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!;
            w.setIgnoreMouseEvents(on, on ? { forward: true } : undefined);
          }, i % 2 === 0);
          await page.waitForTimeout(150);
        }
      });
      // The window's own focus and blur, which run settle() (D-150), without the system's activation:
      // on a runner, blur() activates another window over the screen (an earlier run measured that).
      await phase("focus and blur (settle)", async () => {
        for (let i = 0; i < 4; i++) {
          await inMain(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!.emit("focus", "journey"));
          await page.waitForTimeout(250);
          await inMain(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!.emit("blur", "journey"));
          await page.waitForTimeout(250);
        }
      });
      await phase("hide and show", async () => {
        for (let i = 0; i < 3; i++) {
          await inMain(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!.hide());
          await page.waitForTimeout(300);
          await inMain(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!.showInactive());
          await page.waitForTimeout(400);
        }
      });
      await phase("minimize and restore", async () => {
        for (let i = 0; i < 2; i++) {
          await page.evaluate(() => (window as unknown as { focusNotes: { window: { minimize(): void } } }).focusNotes.window.minimize());
          await page.waitForTimeout(500);
          await inMain(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!.restore());
          await page.waitForTimeout(600);
        }
      });
      await phase("resize", async () => {
        for (const width of [720, 600, 680]) {
          await inMain(({ BrowserWindow }, w: number) => {
            const win = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!;
            win.setBounds({ ...win.getBounds(), width: w });
          }, width + 32);
          await page.waitForTimeout(400);
        }
      });
      await phase("maximize and restore", async () => {
        await page.evaluate(() => (window as unknown as { focusNotes: { window: { maximize(): void } } }).focusNotes.window.maximize());
        await page.waitForTimeout(700);
        await page.evaluate(() => (window as unknown as { focusNotes: { window: { restore(): void } } }).focusNotes.window.restore());
      }, 900);
      await phase("vertical maximize and back", async () => {
        await page.evaluate(() => (window as unknown as { focusNotes: { window: { toggleVertical(): void } } }).focusNotes.window.toggleVertical());
        await page.waitForTimeout(700);
        await page.evaluate(() => (window as unknown as { focusNotes: { window: { toggleVertical(): void } } }).focusNotes.window.toggleVertical());
      }, 900);
      await phase("snap and restore", async () => {
        await page.evaluate(() => (window as unknown as { focusNotes: { window: { snap(z: string): void } } }).focusNotes.window.snap("left"));
        await page.waitForTimeout(700);
        await page.evaluate(() => (window as unknown as { focusNotes: { window: { restore(): void } } }).focusNotes.window.restore());
      }, 900);
      await phase("pass-through toggles after the window changed", async () => {
        for (let i = 0; i < 8; i++) {
          await inMain(({ BrowserWindow }, on: boolean) => {
            const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!;
            w.setIgnoreMouseEvents(on, on ? { forward: true } : undefined);
          }, i % 2 === 0);
          await page.waitForTimeout(150);
        }
      });
      await typingShows("after the window changed, before the GPU crash", " Typed after the changes.");
      await phase("GPU process crash", async () => {
        await inMain(({ BrowserWindow }) => {
          const crash = new BrowserWindow({ show: false, webPreferences: { partition: "gpucrash" } });
          void crash.loadURL("chrome://gpucrash").catch(() => {});
          setTimeout(() => crash.destroy(), 1500);
        });
        await page.waitForTimeout(2500);
      }, 1500);
      await phase("pass-through toggles after a GPU crash", async () => {
        for (let i = 0; i < 8; i++) {
          await inMain(({ BrowserWindow }, on: boolean) => {
            const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!;
            w.setIgnoreMouseEvents(on, on ? { forward: true } : undefined);
          }, i % 2 === 0);
          await page.waitForTimeout(150);
        }
      });
      await typingShows("at the end", "\n\nTyped at the end.");

      const reports = await app.evaluate(async () => {
        const g = globalThis as unknown as { wm: { stop: boolean; done: Promise<void>; reports: Record<string, Report> } };
        g.wm.stop = true;
        await g.wm.done;
        return Object.values(g.wm.reports);
      });
      const compositing = l.log.filter((x) => x.includes("compositing")).join(" | ");
      process.stdout.write(`[white-margin] ${mode.name}: ${compositing}\n`);
      for (const r of reports) process.stdout.write(`[white-margin] ${r.label}: ${r.captures} captures, ${r.bad} with ≥1% of the margin not magenta (worst ${(r.worst * 100).toFixed(1)}%), ${r.notDrawn} with the window not drawn, ${r.invalid} blank captures skipped ${r.samples.join(", ")}\n`);
      writeFileSync(join(OUT, `report-${mode.name.split(" ")[0]}.json`), JSON.stringify({ compositing, reports }, null, 2));
      for (const u of updates) process.stdout.write(`[white-margin] ${u}\n`);
      expect(reports.find((r) => r.label === "rest")?.captures ?? 0, "the window at rest was captured").toBeGreaterThan(0);
      expect(updates.filter((u) => u.includes("NOT")), "what the window shows keeps updating").toEqual([]);
      expect(reports.filter((r) => r.notDrawn > 0 && !["GPU process crash", "minimize and restore", "hide and show"].includes(r.label)).map((r) => `${r.label}: the window wasn't drawn in ${r.notDrawn} of ${r.captures} captures`), "the window is drawn (but while it appears, is restored, or the GPU process restarts)").toEqual([]);
      expect(reports.filter((r) => r.bad > 0).map((r) => `${r.label}: ${r.bad} of ${r.captures} captures (worst ${(r.worst * 100).toFixed(1)}%)`)).toEqual([]);
    } finally {
      await quit(l).catch(() => {});
    }
  });
});
