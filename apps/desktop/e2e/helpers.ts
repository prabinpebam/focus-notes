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
