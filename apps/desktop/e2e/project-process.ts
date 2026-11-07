import { chromium, expect, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { emulateFocus } from "./helpers.ts";
import { CHROMIUM_FOLDERS } from "../../../packages/core/src/inventory.ts";
import { journeyUnseen } from "../src/main/window/journey-window.ts";

/** A real project-manager child, attached only over its disposable loopback inspector. */
export function projectEntryApp(profile: string): string {
  const folder = join(profile, "project-entry-app");
  mkdirSync(folder);
  writeFileSync(join(folder, "package.json"), '{"name":"focus-notes-project-journey","type":"module","main":"entry.mjs"}');
  const main = pathToFileURL(join(import.meta.dirname, "..", "out", "main", "main.mjs")).href;
  writeFileSync(join(folder, "entry.mjs"), `
import { app } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
if (process.env.FOCUS_NOTES_USER_DATA !== ${JSON.stringify(profile)}) {
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
  app.commandLine.appendSwitch("remote-debugging-port", "0");
  writeFileSync(join(process.env.FOCUS_NOTES_USER_DATA, "journey-owned-pid"), String(process.pid));
  app.on("browser-window-created", (_event, window) => {
    window.once("show", () => writeFileSync(join(process.env.FOCUS_NOTES_USER_DATA, "journey-window-opacity"), String(window.getOpacity())));
  });
}
await import(${JSON.stringify(main)});
`);
  return folder;
}

export async function attachProject(profile: string): Promise<{ browser: Browser; page: Page; pid: number }> {
  const pidFile = join(profile, "journey-owned-pid");
  await expect.poll(() => existsSync(pidFile), { timeout: 10_000 }).toBe(true);
  const pid = Number(readFileSync(pidFile, "utf8"));
  if (!Number.isInteger(pid) || pid < 1) throw new Error("The project child did not publish its owned PID");
  let browser: Browser | undefined;
  try {
    const portFile = join(profile, CHROMIUM_FOLDERS.session, "DevToolsActivePort");
    await expect.poll(() => existsSync(portFile), { timeout: 10_000 }).toBe(true);
    const port = Number(readFileSync(portFile, "utf8").split("\n")[0]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("The project inspector did not publish a valid loopback port");
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 5000 });
    const connected = browser;
    await expect.poll(() => connected.contexts()[0]?.pages().length ?? 0).toBeGreaterThan(0);
    const page = browser.contexts()[0]!.pages()[0]!;
    await emulateFocus(page);
    await expect.poll(() => existsSync(join(profile, "journey-window-opacity"))).toBe(true);
    expect(readFileSync(join(profile, "journey-window-opacity"), "utf8")).toBe(journeyUnseen({ ...process.env, FOCUS_NOTES_E2E: "1" }) ? "0" : "1");
    return { browser, page, pid };
  } catch (error) {
    await closeProject({ browser, pid });
    throw error;
  }
}

export async function closeProject(child: { browser?: Browser; pid: number }): Promise<void> {
  try { await child.browser?.close(); }
  finally {
    const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
    for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(child.pid), ...flags], { stdio: "inherit" });
  }
}
