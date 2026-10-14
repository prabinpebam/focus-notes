import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Launched {
  app: ElectronApplication;
  page: Page;
  log: string[];
  readyMs: () => Promise<number>;
}

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

export const tempDirs = () => ({
  userData: mkdtempSync(join(tmpdir(), "fn-user-")),
  docs: mkdtempSync(join(tmpdir(), "fn-docs-")),
});

export async function launch(dirs: { userData: string; docs: string }, extraEnv: Record<string, string> = {}): Promise<Launched> {
  const log: string[] = [];
  const app = await electron.launch({
    args: [join(import.meta.dirname, "..", "out", "main", "main.mjs")],
    env: { ...process.env, FOCUS_NOTES_USER_DATA: dirs.userData, FOCUS_NOTES_DOCS: dirs.docs, ...extraEnv } as Record<string, string>,
  });
  app.process().stdout?.on("data", (d: Buffer) => log.push(...d.toString().split("\n").filter(Boolean)));
  const page = await app.firstWindow();
  // FOCUS_NOTES_E2E_CPU_THROTTLE=4 slows the renderer down like a busy CI runner, to reproduce races.
  const throttle = Number(process.env.FOCUS_NOTES_E2E_CPU_THROTTLE ?? 0);
  if (throttle > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: throttle });
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

/** Closes through the window's close path so pending saves are flushed (QLT-03). */
export async function quit(l: Launched): Promise<void> {
  await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await l.app.waitForEvent("close", { timeout: 10_000 }).catch(() => {});
}
