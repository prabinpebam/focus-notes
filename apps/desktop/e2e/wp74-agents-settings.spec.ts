/**
 * WP-7.4 journey (AGT-02, D-166): Settings → Agents. The switches write agents.json at once and
 * persist across starts, the others waiting for Agents can connect; each snippet copies a command
 * that starts this app's MCP server; a recent agent change is listed as self-reported and Undo puts
 * the note back as a new commit; Install command-line tool isn't offered outside an installed app;
 * no axe violations. Local Git only; the clipboard is in memory.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { git, instance } from "./instance.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const clipboard = (l: { app: import("@playwright/test").ElectronApplication }) => l.app.evaluate(() => (globalThis as { memoryClipboard?: { text: string } }).memoryClipboard?.text ?? "");
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};
async function openAgents(page: Page) {
  await page.keyboard.press(`${mod}+,`);
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("tab", { name: "Agents" }).click();
  await expect(settings.getByRole("switch", { name: /^Agents can connect/ })).toBeVisible();
  return settings;
}
const permissions = (userData: string) => {
  try {
    return JSON.parse(readFileSync(join(userData, "agents.json"), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
};

test("OFB.25–OFB.28: Off parent disables and fades dependent Switch rows without changing their colours", async () => {
  const { dirs } = instance();
  const l = await launch(dirs);
  console.log(`ofb-switch-owned-pid=${l.pid}`);
  try {
    const settings = await openAgents(l.page);
    const connect = settings.getByRole("switch", { name: /^Agents can connect/ });
    const switches = settings.getByRole("switch");
    await expect(switches).toHaveCount(5);
    const readPublic = settings.getByRole("switch", { name: /^Read public notes/ });
    await expect(connect).not.toBeChecked();
    await expect(readPublic).toBeChecked();
    const paint = () => switches.evaluateAll(inputs => inputs.map(input => {
      const row = input.closest("label")!;
      const track = row.querySelector('[data-part="switch-track"]')!;
      const thumb = row.querySelector('[data-part="switch-thumb"]')!;
      const style = getComputedStyle(row);
      return {
        opacity: Number(style.opacity), gap: Number.parseFloat(style.columnGap),
        colours: [getComputedStyle(track).backgroundColor, getComputedStyle(track).borderColor, getComputedStyle(thumb).backgroundColor],
        descendantOpacity: [...row.querySelectorAll("span")].map(span => Number(getComputedStyle(span).opacity)),
      };
    }));
    const off = await paint();
    for (let i = 1; i < 5; i++) {
      await expect(switches.nth(i)).toBeDisabled();
      expect(off[i]!.opacity).toBe(0.4);
      expect(off[i]!.gap).toBe(8);
      expect(off[i]!.descendantOpacity.every(opacity => opacity === 1)).toBe(true);
    }
    await expect(settings.getByText("Turn on Agents can connect first", { exact: true })).toHaveCount(4);
    const before = permissions(dirs.userData);
    await settings.getByText("Read public notes", { exact: true }).click({ force: true });
    await expect(readPublic).toBeChecked();
    expect(permissions(dirs.userData)).toEqual(before);
    await connect.focus();
    await l.page.keyboard.press("Tab");
    for (let i = 1; i < 5; i++) await expect(switches.nth(i)).not.toBeFocused();
    await settings.getByText("Agents can connect", { exact: true }).click();
    await expect.poll(() => permissions(dirs.userData).connect).toBe(true);
    for (let i = 1; i < 5; i++) await expect(switches.nth(i)).toBeEnabled();
    await l.page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"));
    const on = await paint();
    for (let i = 1; i < 5; i++) {
      expect(on[i]!.opacity).toBe(1);
      expect(on[i]!.colours).toEqual(off[i]!.colours);
    }
    await expect(settings.getByText("Turn on Agents can connect first", { exact: true })).toHaveCount(0);
    await connect.focus();
    await l.page.keyboard.press("Tab");
    await expect(readPublic).toBeFocused();
    await l.page.screenshot({ path: join(test.info().outputDir, "agents-enabled.png") });
    await settings.getByText("Agents can connect", { exact: true }).click();
    await expect.poll(() => permissions(dirs.userData).connect).toBe(false);
    await expect(connect).not.toBeChecked();
    await expect(readPublic).toBeDisabled();
    await expect(settings.getByText("Turn on Agents can connect first", { exact: true })).toHaveCount(4);
    await l.page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"));
    await l.page.screenshot({ path: join(test.info().outputDir, "agents-disabled.png") });
  } finally { await quit(l); }
});

test("AGT-02: Settings → Agents writes agents.json, copies a working snippet, and undoes an agent's change", async () => {
  const { dirs } = instance();
  // An agent's change to undo: the command-line tool's write is an attributed commit like any agent's.
  execFileSync(process.execPath, [join(import.meta.dirname, "..", "src", "cli", "main.ts"), "new", "--workspace", dirs.docs], { input: "# Agent plan\n\nWritten by an agent.\n" });
  const priv = join(dirs.docs, "private");
  expect(git(priv, "log", "-1", "--format=%s")).toBe("Agent edit: notes/Agent plan.md");

  let l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000", FOCUS_NOTES_MEMORY_CLIPBOARD: "1" });
  console.log(`ofb-switch-owned-pid=${l.pid}`);
  try {
  let settings = await openAgents(l.page);
  const connect = settings.getByRole("switch", { name: /^Agents can connect/ });
  const readPrivate = settings.getByRole("switch", { name: /^Read private and shared notes/ });
  await expect(connect).not.toBeChecked();
  await expect(readPrivate).toBeDisabled();
  expect(await settledAxe(l.page)).toEqual([]);
  await l.page.screenshot({ path: join(test.info().outputDir, "agents-switches.png") });

  await settings.getByText("Agents can connect", { exact: true }).click();
  await expect(connect).toBeChecked();
  await expect.poll(() => permissions(dirs.userData).connect).toBe(true);
  await expect(readPrivate).toBeEnabled();
  await settings.getByText("Read private and shared notes", { exact: true }).click();
  await expect.poll(() => permissions(dirs.userData).readPrivate).toBe(true);

  // A snippet that starts this app's MCP server, through the app's own executable.
  await settings.getByRole("group", { name: "VS Code (mcp.json)" }).getByRole("button", { name: "Copy" }).click();
  await expect.poll(() => clipboard(l)).toContain("focus-notes");
  const copied = JSON.parse(await clipboard(l)) as { servers: { "focus-notes": { command: string; args: string[] } } };
  expect(copied.servers["focus-notes"].args).toEqual(expect.arrayContaining(["--cli", "mcp", "--data", dirs.userData]));

  // The recent change, as self-reported; Undo puts the note back as a new commit.
  const undo = settings.getByRole("button", { name: "Undo change to notes/Agent plan.md" });
  await expect(settings.getByText("command line (self-reported)")).toBeVisible();
  await undo.click();
  await expect(l.page.locator("#toasts").getByText("Undid the agent's change to notes/Agent plan.md.")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => git(priv, "log", "-1", "--format=%s")).toBe("Undo agent edit: notes/Agent plan.md");
  expect(existsSync(join(priv, "notes", "Agent plan.md"))).toBe(false);

  // Not an installed app: the tool says where it works, and offers nothing.
  await expect(settings.getByText("Available in the installed app.")).toBeVisible();
  await expect(settings.getByRole("button", { name: "Install command-line tool" })).toHaveCount(0);
  await quit(l);

  // The switches persist across starts.
  l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000", FOCUS_NOTES_MEMORY_CLIPBOARD: "1" });
  console.log(`ofb-switch-owned-pid=${l.pid}`);
  settings = await openAgents(l.page);
  await expect(settings.getByRole("switch", { name: /^Agents can connect/ })).toBeChecked();
  await expect(settings.getByRole("switch", { name: /^Read private and shared notes/ })).toBeChecked();
  } finally { await quit(l); }
});

test("OFB.5: an agent Switch keeps its focus and geometry through a refused save and Retry", async () => {
  const { dirs } = instance();
  const l = await launch(dirs);
  try {
    await l.app.evaluate(({ ipcMain }) => {
      const page = {
        permissions: { connect: false, readPublic: true, readPrivate: false, edit: false, createPublic: false, folders: "all" },
        changedOutside: false, snippets: [], recent: [], cli: { available: false, installed: false, onPath: false },
      };
      ipcMain.removeHandler("agents:load");
      ipcMain.handle("agents:load", () => page);
      ipcMain.removeHandler("agents:set");
      ipcMain.handle("agents:set", async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        throw new Error("Synthetic refusal");
      });
    });
    const settings = await openAgents(l.page);
    await l.page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"));
    const connect = settings.getByRole("switch", { name: /^Agents can connect/ });
    const phase = () => connect.evaluate(el => el.closest("[data-commit]")?.getAttribute("data-commit"));
    const box = () => connect.evaluate(el => {
      const r = el.closest("label")!.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    await connect.focus();
    const before = await box();
    await l.page.keyboard.press("Space");
    await expect.poll(phase).toBe("pending");
    await expect(connect).not.toBeChecked();
    await expect(connect).toBeFocused();
    expect(await box()).toEqual(before);
    await expect.poll(phase).toBe("failed");
    await expect(connect).not.toBeChecked();
    await expect(connect).toBeFocused();
    await expect(settings.getByText("Couldn't change agent settings. Try again.")).toBeVisible();
    await l.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("agents:set");
      ipcMain.handle("agents:set", async (_event, permissions) => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return { permissions: { ...permissions, folders: "all" }, changedOutside: false, snippets: [], recent: [], cli: { available: false, installed: false, onPath: false } };
      });
    });
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(phase).toBe("pending");
    await expect.poll(phase, { intervals: [25, 50, 100] }).toBe("confirmed");
    await expect(connect).toBeChecked();
    expect(await box()).toEqual(before);
  } finally { await quit(l); }
});
