import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Launched {
  app: ElectronApplication;
  page: Page;
  log: string[];
  readyMs: () => Promise<number>;
}

export const tempDirs = () => ({
  userData: mkdtempSync(join(tmpdir(), "fn-user-")),
  docs: mkdtempSync(join(tmpdir(), "fn-docs-")),
});

/**
 * Starts the app. Journeys about other things start past the desktop's first run (it's done once
 * per install, FRE-01), as someone who already set up; `firstRun` starts a new install instead.
 * Git's settings are isolated (no system or personal config, so no real credential helper is
 * asked), and GitHub's API points at a closed local port unless a journey gives its fake: no
 * journey ever reaches the network.
 */
export async function launch(dirs: { userData: string; docs: string }, extraEnv: Record<string, string> = {}, opts: { firstRun?: boolean } = {}): Promise<Launched> {
  const log: string[] = [];
  const stateFile = join(dirs.userData, "state.json");
  if (!opts.firstRun && !existsSync(stateFile)) writeFileSync(stateFile, JSON.stringify({ version: 1, firstRun: "done" }));
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !(extraEnv.PATH && k.toUpperCase() === "PATH")) base[k] = v;
  if (!extraEnv.GIT_CONFIG_GLOBAL) {
    const gitconfig = join(dirs.userData, "..", `${dirs.userData.split(/[\\/]/).pop()}.gitconfig`);
    if (!existsSync(gitconfig)) writeFileSync(gitconfig, "[protocol \"file\"]\n\tallow = always\n[commit]\n\tgpgsign = false\n[core]\n\tautocrlf = false\n");
    Object.assign(base, { GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: "1" });
  }
  const app = await electron.launch({
    args: [join(import.meta.dirname, "..", "out", "main", "main.mjs")],
    env: { ...base, FOCUS_NOTES_USER_DATA: dirs.userData, FOCUS_NOTES_DOCS: dirs.docs, FOCUS_NOTES_GITHUB_API: "http://127.0.0.1:9", ...extraEnv },
  });
  app.process().stdout?.on("data", (d: Buffer) => log.push(...d.toString().split("\n").filter(Boolean)));
  const page = await app.firstWindow();
  const readyMs = async () => {
    for (let i = 0; i < 100; i++) {
      const line = log.find((l) => l.includes("ready-ms="));
      if (line) return Number(line.split("ready-ms=")[1]);
      await page.waitForTimeout(100);
    }
    throw new Error("The app never reported ready");
  };
  return { app, page, log, readyMs };
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

/** Closes through the window's close path so pending saves are flushed (QLT-03). */
export async function quit(l: Launched): Promise<void> {
  // The note's window, not the snap preview (which has no page).
  await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))?.close());
  await l.app.waitForEvent("close", { timeout: 10_000 }).catch(() => {});
}
