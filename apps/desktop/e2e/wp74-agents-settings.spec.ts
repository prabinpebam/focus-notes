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
  await expect(settings.getByRole("button", { name: "Agents can connect" })).toBeVisible();
  return settings;
}
const permissions = (userData: string) => {
  try {
    return JSON.parse(readFileSync(join(userData, "agents.json"), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
};

test("AGT-02: Settings → Agents writes agents.json, copies a working snippet, and undoes an agent's change", async () => {
  const { dirs } = instance();
  // An agent's change to undo: the command-line tool's write is an attributed commit like any agent's.
  execFileSync(process.execPath, [join(import.meta.dirname, "..", "src", "cli", "main.ts"), "new", "--workspace", dirs.docs], { input: "# Agent plan\n\nWritten by an agent.\n" });
  const priv = join(dirs.docs, "private");
  expect(git(priv, "log", "-1", "--format=%s")).toBe("Agent edit: notes/Agent plan.md");

  let l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000", FOCUS_NOTES_MEMORY_CLIPBOARD: "1" });
  let settings = await openAgents(l.page);
  const connect = settings.getByRole("button", { name: "Agents can connect" });
  const readPrivate = settings.getByRole("button", { name: "Read private and shared notes" });
  await expect(connect).toHaveAttribute("aria-pressed", "false");
  await expect(readPrivate).toBeDisabled();
  expect(await settledAxe(l.page)).toEqual([]);

  await connect.click();
  await expect(connect).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => permissions(dirs.userData).connect).toBe(true);
  await expect(readPrivate).toBeEnabled();
  await readPrivate.click();
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
  settings = await openAgents(l.page);
  await expect(settings.getByRole("button", { name: "Agents can connect" })).toHaveAttribute("aria-pressed", "true");
  await expect(settings.getByRole("button", { name: "Read private and shared notes" })).toHaveAttribute("aria-pressed", "true");
  await quit(l);
});
