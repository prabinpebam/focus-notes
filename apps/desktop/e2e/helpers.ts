import { _electron as electron, expect, type ElectronApplication, type Page } from "@playwright/test";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { flipFuses, FuseV1Options, FuseVersion } from "@electron/fuses";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Launched {
  app: ElectronApplication;
  page: Page;
  log: string[];
  /** The main process's ID, asked once at launch: a crash journey kills it without a call into the app first. */
  pid: number;
  readyMs: () => Promise<number>;
}

/**
 * Options for `expect.poll` when waiting for something the app does on its own (a save, the journal,
 * a commit). The default backoff checks at 0, 100, 350 and 850 ms, then about every second, so a
 * short timeout gives far less than it says (1.5 s really gives 0.85 s; DEF-8). These check every
 * 50 ms, so it's seen as soon as it happens, for up to 10 s, because a loaded runner can be twice as
 * slow. A wait is never the budget: a journey that has one measures the time and asserts that.
 */
export const PROMPTLY = { timeout: 10_000, intervals: [50] };

/** Waits for `text` to be in the file on disk (see `PROMPTLY`). */
export const onDisk = (file: string, text: string) => expect.poll(() => readFileSync(file, "utf8"), PROMPTLY).toContain(text);

const mac = process.platform === "darwin";
/**
 * Caret keys as each platform's text editing has them. macOS moves to a line's and the note's ends
 * with ⌘ and the arrows; Home and End only scroll there, and ⌘End does nothing.
 */
export const caret = {
  docStart: mac ? "Meta+ArrowUp" : "Control+Home",
  docEnd: mac ? "Meta+ArrowDown" : "Control+End",
  lineStart: mac ? "Meta+ArrowLeft" : "Home",
  lineEnd: mac ? "Meta+ArrowRight" : "End",
  selectToLineStart: mac ? "Meta+Shift+ArrowLeft" : "Shift+Home",
} as const;

/**
 * The packaged app turns the Node inspector's arguments off (SEC-01's fuses), and Playwright drives
 * Electron's main process through that inspector. So journeys run a copy beside the executable, the
 * same binary and resources with only that fuse turned back on; the shipped executable is untouched
 * (`packaged.spec.ts` reads its fuses).
 */
async function harnessExe(exe: string): Promise<string> {
  const copy = exe.replace(/(\.exe)?$/i, (ext) => `-e2e${ext}`);
  if (!existsSync(copy) || statSync(copy).mtimeMs < statSync(exe).mtimeMs) {
    copyFileSync(exe, copy);
    await flipFuses(copy, { version: FuseVersion.V1, [FuseV1Options.EnableNodeCliInspectArguments]: true });
  }
  return copy;
}

/** Every app a journey started, by its main process's ID: one a journey leaves running is killed after it (`fixtures.ts`). */
const running = new Map<ElectronApplication, number>();

/**
 * Kills every app the journey left running: a journey that fails stops before it quits, and an app
 * asked to quit can rightly refuse (unsaved text, D-92), which would hold up the worker's teardown
 * and leave the app running into the next journeys. On Windows `app.process()` is a launcher, so the
 * main process's own ID is killed too.
 */
export function killLeftovers(): void {
  const kill = (id: number | undefined) => {
    try {
      if (id) process.kill(id, "SIGKILL");
    } catch {
      // Already gone.
    }
  };
  for (const [app, pid] of running) {
    running.delete(app);
    let launcher: number | undefined;
    try {
      launcher = app.process().pid;
    } catch {
      // Closed already.
    }
    // On macOS and Linux Playwright starts the app in a process group of its own: the renderer, GPU,
    // and zygote processes go with it, or they'd hold its output open and the worker would wait on them.
    if (process.platform !== "win32" && launcher) kill(-launcher);
    kill(pid);
    kill(launcher);
  }
}

export const tempDirs = () => ({
  userData: mkdtempSync(join(tmpdir(), "fn-user-")),
  docs: mkdtempSync(join(tmpdir(), "fn-docs-")),
});

/**
 * Tells a page it has focus, though its window never takes the computer's (D-104 (7)): keys,
 * focus, and `:focus-visible` then behave as in the active window. Playwright's keys and pointer
 * reach the page without the system's focus.
 */
export async function emulateFocus(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
}

/**
 * Makes the app's window inactive or active again, as switching to another app and back would:
 * journeys never take the computer's focus, so they drive the window's own state (D-104 (7)).
 */
export async function setWindowActive(app: ElectronApplication, active: boolean): Promise<void> {
  await app.evaluate(({ BrowserWindow }, on) => {
    // "journey": the app counts only these, never the system's own (journey-window.ts).
    BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))?.emit(on ? "focus" : "blur", "journey");
  }, active);
}

/**
 * Starts the app. Journeys about other things start past the desktop's first run (it's done once
 * per install, FRE-01), as someone who already set up; `firstRun` starts a new install instead.
 * Git's settings are isolated (no system or personal config, so no real credential helper is
 * asked), and GitHub's API points at a closed local port unless a journey gives its fake: no
 * journey ever reaches the network.
 */
/** Whether this worker printed the app's compositing yet (D-121). */
let compositingShown = false;
export async function launch(dirs: { userData: string; docs: string }, extraEnv: Record<string, string> = {}, opts: { firstRun?: boolean; args?: string[] } = {}): Promise<Launched> {
  const log: string[] = [];
  const stateFile = join(dirs.userData, "state.json");
  if (!opts.firstRun && !existsSync(stateFile)) writeFileSync(stateFile, JSON.stringify({ version: 1, firstRun: "done" }));
  // FOCUS_NOTES_E2E_WINDOW=1024x720 opens the window at a CI runner's size, to reproduce what only a small display shows.
  const size = /^(\d+)x(\d+)$/.exec(process.env.FOCUS_NOTES_E2E_WINDOW ?? "");
  const windowFile = join(dirs.userData, "window.json");
  if (size && !existsSync(windowFile)) writeFileSync(windowFile, JSON.stringify({ version: 1, bounds: { x: 40, y: 40, width: Number(size[1]), height: Number(size[2]) } }));
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !(extraEnv.PATH && k.toUpperCase() === "PATH")) base[k] = v;
  if (!extraEnv.GIT_CONFIG_GLOBAL) {
    const gitconfig = join(dirs.userData, "..", `${dirs.userData.split(/[\\/]/).pop()}.gitconfig`);
    if (!existsSync(gitconfig)) writeFileSync(gitconfig, "[protocol \"file\"]\n\tallow = always\n[commit]\n\tgpgsign = false\n[core]\n\tautocrlf = false\n");
    Object.assign(base, { GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: "1" });
  }
  // FOCUS_NOTES_E2E_EXE runs the packaged app (release\win-unpacked\focus-notes.exe) instead of the build.
  const exe = process.env.FOCUS_NOTES_E2E_EXE ? await harnessExe(process.env.FOCUS_NOTES_E2E_EXE) : undefined;
  const app = await electron.launch({
    // Extra arguments: a deep link the app is opened with (D-165).
    ...(exe ? { executablePath: exe, args: [...(opts.args ?? [])] } : { args: [join(import.meta.dirname, "..", "out", "main", "main.mjs"), ...(opts.args ?? [])] }),
    // The warm-up after start is off in journeys, so their timing and focus stay the same (PRF-10).
    // Never the computer's focus (D-104 (7)): the windows open inactive, and the app keeps its own "active".
    env: { ...base, FOCUS_NOTES_USER_DATA: dirs.userData, FOCUS_NOTES_DOCS: dirs.docs, FOCUS_NOTES_GITHUB_API: "http://127.0.0.1:9", FOCUS_NOTES_WARMUP: "0", FOCUS_NOTES_E2E: "1", ...extraEnv },
  });
  app.process().stdout?.on("data", (d: Buffer) => {
    const lines = d.toString().split("\n").filter(Boolean);
    log.push(...lines);
    // Which compositing the app found, once a run, so CI's log shows whether its edges blur (D-121).
    const found = !compositingShown && lines.find((x) => x.includes("[focus-notes] compositing:"));
    if (found) (compositingShown = true), process.stdout.write(`${found.trim()}\n`);
  });
  const pid = await app.evaluate(() => process.pid);
  running.set(app, pid);
  // Every window the journey uses; one that closes at once (a page that went away) needs none.
  app.on("window", (p) => void emulateFocus(p).catch(() => {}));
  const page = await app.firstWindow();
  await emulateFocus(page);
  await simulateUiFont(page);
  // FOCUS_NOTES_E2E_CPU_THROTTLE=4 slows the renderer down like a busy CI runner, to reproduce races.
  const throttle = Number(process.env.FOCUS_NOTES_E2E_CPU_THROTTLE ?? 0);
  if (throttle > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: throttle });
  // The search index's worker starts once the first note is open (WP-4.1). While it's being attached,
  // the main process's inspector can drop the answer to a call into it ("Resulting promise was
  // garbage collected"), so a journey starts once it's there: at most a few seconds, as a first run
  // starts it only after the card.
  if (!page.workers().length) await page.waitForEvent("worker", { timeout: 5_000 }).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r))).catch(() => {});
  const readyMs = async () => {
    for (let i = 0; i < 100; i++) {
      const line = log.find((l) => l.includes("ready-ms="));
      if (line) return Number(line.split("ready-ms=")[1]);
      await page.waitForTimeout(100);
    }
    throw new Error("The app never reported ready");
  };
  return { app, page, log, pid, readyMs };
}

interface Rect { x: number; y: number; width: number; height: number }

/**
 * FOCUS_NOTES_E2E_UI_FONT="DejaVuSans.ttf;DejaVuSans-Bold.ttf" sets the interface font to another
 * system's (here Ubuntu's), regular and bold, so what only macOS's or Linux's wider or shorter font
 * shows reproduces on Windows (D-195).
 */
async function simulateUiFont(page: Page): Promise<void> {
  const files = (process.env.FOCUS_NOTES_E2E_UI_FONT ?? "").split(";").filter(Boolean);
  if (!files.length) return;
  const fonts = files.map((f) => readFileSync(f).toString("base64"));
  await page.evaluate(async (list) => {
    for (const [i, data] of list.entries()) {
      const face = new FontFace("FocusNotesE2eUi", Uint8Array.from(atob(data), (c) => c.charCodeAt(0)).buffer, { weight: i ? "600 900" : "100 500" });
      await face.load();
      document.fonts.add(face);
    }
    document.documentElement.style.setProperty("--fn-ref-font-system", "FocusNotesE2eUi, sans-serif");
  }, fonts);
}
/**
 * The bounds a window asked for `r` ends up with. Chromium on Linux (X11) keeps a window asked to
 * cover a whole screen exactly 1 px narrower and shorter (bigger or smaller ones are as asked), and
 * a CI display has no panels, so a maximized window's work area is its whole screen there too
 * (D-104 (9)). Elsewhere it's exactly what was asked.
 */
export async function placed(app: ElectronApplication, r: Rect): Promise<Rect> {
  if (process.platform !== "linux") return r;
  const whole = await app.evaluate(({ screen }, a) => screen.getAllDisplays().some(({ bounds: b }) => b.x === a.x && b.y === a.y && b.width === a.width && b.height === a.height), r);
  return whole ? { ...r, width: r.width - 1, height: r.height - 1 } : r;
}

/**
 * The drawn window's box in the page (D-14): on Windows and Linux the window sits in a transparent
 * shadow margin, so positions "from the window's edge" are measured from it. The viewport elsewhere.
 */
export const windowBox = (page: Page): Promise<{ left: number; top: number; width: number; height: number }> =>
  page.evaluate(() => {
    const r = document.querySelector("[data-app-root]")?.getBoundingClientRect();
    return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  });

/** Points on the title bar band, as parts of the window's width, clear of the trigger and the window controls. */
const BAND_POINTS = [0.08, 0.3, 0.7];
/** What takes a press on the band rather than the window (WindowFrame.tsx CONTROLS). */
const BAND_CONTROLS = "[data-no-drag], [data-window-controls], [data-window-handle], button, a[href], input, textarea, select, [contenteditable]:not([contenteditable='false']), [role=menu], [role=listbox], [role=dialog], [role=toolbar]";

/**
 * D-147: the title bar band (DSK-02, the window's top 44 px) drags the window in every state. Each
 * point 12 px down the band must be a drag region: on macOS the system's (a band with
 * `-webkit-app-region: drag`, nothing over it that's `no-drag`); elsewhere the band the app moves the
 * window from (the element there is a band, not in anything `data-no-drag`: WindowFrame's own hit
 * test). Returns what isn't, named by `where`.
 */
export const bandProblems = (page: Page, where: string): Promise<string[]> =>
  page.evaluate(({ where, points, controls }) => {
    const r = document.querySelector("[data-app-root]")!.getBoundingClientRect();
    const custom = "windowFrame" in document.documentElement.dataset;
    const region = (el: Element) => getComputedStyle(el).getPropertyValue("-webkit-app-region");
    const out: string[] = [];
    for (const f of points) {
      const x = r.left + r.width * f;
      const y = r.top + 12;
      const el = document.elementFromPoint(x, y);
      // WindowFrame's hit test: the band, or (the rest of the app inert under a menu) the band's place with no control there.
      const t = document.querySelector("[data-title-band]")?.getBoundingClientRect();
      const ok = custom
        ? Boolean(el && (el.closest("[data-drag-band]") ? !el.closest("[data-no-drag]") : !el.closest(controls) && t && x >= t.left && x < t.right && y >= t.top && y < t.bottom))
        : [...document.querySelectorAll("[data-drag-band]")].some((b) => {
            const q = b.getBoundingClientRect();
            return x >= q.left && x < q.right && y >= q.top && y < q.bottom && region(b) === "drag";
          }) && !document.elementsFromPoint(x, y).some((e) => region(e) === "no-drag");
      if (!ok) {
        const what = (e: Element | null) => (e ? `${e.tagName.toLowerCase()}${[...e.attributes].filter((a) => a.name !== "class" && a.name !== "style").map((a) => `[${a.name}${a.value ? `=${a.value.slice(0, 30)}` : ""}]`).join("")}` : "nothing");
        out.push(`${where}: the title bar band at ${Math.round(f * 100)}% of the width doesn't drag the window (${what(el)} in ${what(el?.parentElement ?? null)} is there)`);
      }
    }
    return out;
  }, { where, points: BAND_POINTS, controls: BAND_CONTROLS });

/**
 * D-147, Windows and Linux: a press on the title bar band starts the app's own move (the shell gets
 * `window:drag` start, then end where it started, so the window never moves). Synthetic pointer
 * events on whatever is at the band's left, as WindowFrame sees a real one.
 */
export async function bandStartsMove(app: ElectronApplication, page: Page): Promise<string[]> {
  await app.evaluate(({ ipcMain }) => {
    const g = globalThis as unknown as { bandMoves?: string[] };
    if (!g.bandMoves) {
      g.bandMoves = [];
      ipcMain.on("window:drag", (_e, phase: string, kind: string) => void g.bandMoves!.push(`${phase}:${kind}`));
    }
    g.bandMoves.length = 0;
  });
  await page.evaluate((f) => {
    const r = document.querySelector("[data-app-root]")!.getBoundingClientRect();
    const x = r.left + r.width * f;
    const y = r.top + 12;
    const el = document.elementFromPoint(x, y)!;
    const o = { clientX: x, clientY: y, screenX: Math.round(screenX + x), screenY: Math.round(screenY + y), pointerId: 47, isPrimary: true, button: 0, bubbles: true, cancelable: true, composed: true };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...o, buttons: 1 }));
    el.dispatchEvent(new PointerEvent("pointerup", { ...o, buttons: 0 }));
  }, BAND_POINTS[0]!);
  const seen = () => app.evaluate(() => (globalThis as unknown as { bandMoves: string[] }).bandMoves.slice());
  await expect.poll(seen, { timeout: 5_000 }).toContain("end:move");
  return seen();
}

/** Closes through the window's close path so pending saves are flushed (QLT-03). */
export async function quit(l: Launched): Promise<void> {
  const closed = l.app.waitForEvent("close", { timeout: 10_000 }).then(() => true, () => false);
  for (let attempt = 0; ; attempt++) {
    try {
      // The note's window, not the snap preview (which has no page).
      await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))?.close());
      break;
    } catch (e) {
      // The main process's inspector can drop a call's answer ("Promise was collected") while
      // Chromium attaches a new worker, such as the search index's just after start (WP-4.1). The
      // call may have run: what counts is that the app closes; if it doesn't, it's asked again.
      if (attempt >= 2 || !/garbage collected|Promise was collected/.test(String(e))) throw e;
      if (await Promise.race([closed, new Promise<false>((r) => setTimeout(() => r(false), 1000))])) return;
    }
  }
  await closed;
}
