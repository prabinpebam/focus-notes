import { test, expect } from "./fixtures.ts";
import { launch, tempDirs, caret } from "./helpers.ts";
import { egressEndpoints, observeEgress } from "./rewrite-egress-http.ts";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { Page } from "@playwright/test";

const key = "AIR_SAFE_B_KEY_SENTINEL_20261030_not_a_real_key";
const source = "Synthetic garden sentence.\n";
function isolatedAccount(dirs: { userData: string }) {
  const gh = join(dirs.userData, "empty-gh-config");
  mkdirSync(gh, { recursive: true });
  return { GH_CONFIG_DIR: gh, GH_TOKEN: "", GITHUB_TOKEN: "", GH_ENTERPRISE_TOKEN: "", GITHUB_ENTERPRISE_TOKEN: "" };
}
function profile(gitWorkspace = false) {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, "public"), { recursive: true });
  const file = join(dirs.docs, "public", "egress.md");
  writeFileSync(file, source);
  writeFileSync(join(dirs.docs, "public", "other.md"), "Other synthetic note.\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: file }));
  if (gitWorkspace) {
    execFileSync("git", ["-c", "core.autocrlf=false", "init", "--quiet", dirs.docs]);
    execFileSync("git", ["-C", dirs.docs, "-c", "core.autocrlf=false", "add", "public"]);
    execFileSync("git", ["-C", dirs.docs, "-c", "user.name=Egress fixture", "-c", "user.email=egress@example.invalid",
      "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Synthetic egress fixture"]);
  }
  return { ...dirs, file };
}
const panel = (page: Page) => page.getByRole("complementary", { name: "Rewrite with AI", exact: true });
async function open(page: Page) {
  const editor = page.getByRole("textbox", { name: "Note", exact: true });
  await expect(editor).toContainText("Synthetic garden");
  await editor.press(caret.docStart); await editor.press("Control+Shift+r");
  await expect(panel(page)).toBeVisible();
}
async function configure(page: Page, address: string) {
  const p = panel(page);
  await p.getByRole("button", { name: "Open connection settings" }).click();
  await p.getByRole("textbox", { name: "API base address" }).fill(address);
  await p.getByRole("textbox", { name: "Model", exact: true }).fill("synthetic-fixture-model");
  await p.getByRole("textbox", { name: "API key", exact: true }).fill(key);
  await p.getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(p.getByRole("textbox", { name: "API key", exact: true })).toHaveValue("");
  await expect(p.getByText("Connection saved locally. Not checked. The key field is cleared.", { exact: true }).last()).toBeVisible();
  await p.getByRole("button", { name: "Open connection settings" }).click();
}
async function connection(page: Page, action: string, input = {}) {
  return page.evaluate(async ({ action, input }) => {
    try { return { ok: true, value: await (window as any).focusNotes.rewriteConnection(action, input) }; }
    catch { return { ok: false }; }
  }, { action, input });
}
function scan(root: string) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (entry.isFile()) expect(readFileSync(path).includes(Buffer.from(key)), path).toBe(false);
  }
}
function scanGit(root: string) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name);
    if (entry.name.endsWith(".git") || existsSync(join(path, ".git"))) {
      const args = entry.name.endsWith(".git") ? [`--git-dir=${path}`] : ["-C", path];
      // --batch-all-objects includes unreachable objects, not just reachable refs.
      const ids = execFileSync("git", ["--no-pager", ...args, "cat-file", "--batch-all-objects", "--batch-check=%(objectname)"], { encoding: "utf8" }).trim();
      for (const id of ids.split(/\s+/).filter(Boolean)) {
        const type = execFileSync("git", ["--no-pager", ...args, "cat-file", "-t", id], { encoding: "utf8" }).trim();
        expect(execFileSync("git", ["--no-pager", ...args, "cat-file", type, id]).includes(Buffer.from(key)), `${path}:${id}`).toBe(false);
      }
    } else scanGit(path);
  }
}

test("AIR-SAFE-B configured-only requests: redirect/error/offline deny fallback; settings/open/idle/switch/cancel/restart never send", async () => {
  test.setTimeout(60_000);
  const dirs = profile(), endpoints = await egressEndpoints();
  let run = await launch(dirs, isolatedAccount(dirs), { args: ["--rewrite-editor-demo"] });
  const logs: string[] = [];
  try {
    let attempts = await observeEgress(run.app);
    await open(run.page); // Fresh unconfigured profile, no default provider.
    await run.page.waitForTimeout(250);
    expect(endpoints.received).toHaveLength(0);
    expect(await attempts()).toEqual([]);
    await configure(run.page, endpoints.address);
    expect(readFileSync(join(dirs.userData, "rewrite-connection.json"), "utf8")).not.toContain(key);
    // The pre-generation discard action closes without ever starting a request.
    await panel(run.page).getByRole("button", { name: "Discard", exact: true }).click();
    await run.page.evaluate(async (file) => (window as any).focusNotes.windows.open(file), join(dirs.docs, "public", "other.md"));
    await expect.poll(() => run.app.windows().length).toBe(2);
    await run.page.waitForTimeout(250);
    expect(endpoints.received).toHaveLength(0);
    expect(await attempts()).toEqual([]);
    logs.push(...run.log); await run.app.close();
    run = await launch(dirs, isolatedAccount(dirs), { args: ["--rewrite-editor-demo"] });
    attempts = await observeEgress(run.app);
    await open(run.page);
    await run.page.waitForTimeout(250);
    expect((await connection(run.page, "settings")).value).toMatchObject({ configured: true });
    expect(endpoints.received).toHaveLength(0);
    expect(await attempts()).toEqual([]);
    // Frozen candidate deliberately starts with offline fake selected after restart.
    // Select the restored connection explicitly; never count a fake proposal as egress proof.
    await panel(run.page).getByRole("button", { name: "Open connection settings" }).click();
    await panel(run.page).getByRole("button", { name: "Open connection settings" }).click();
    await panel(run.page).getByRole("button", { name: "Switch provider", exact: true }).click();
    await expect(panel(run.page).getByText("Provider: OpenAI-compatible", { exact: true })).toBeVisible();
    for (const mode of ["success", "redirect", "error", "offline"] as const) {
      endpoints.setMode(mode);
      const count = endpoints.received.length;
      await panel(run.page).getByRole("button", { name: mode === "success" || mode === "redirect" ? "Rewrite" : "Try again", exact: true }).click();
      if (mode === "success") {
        await expect(panel(run.page).getByRole("button", { name: "Accept", exact: true })).toBeEnabled();
        await panel(run.page).getByRole("button", { name: "Discard", exact: true }).click();
        await open(run.page);
      } else {
        await expect(panel(run.page).getByText(/The connection could not finish this rewrite/).last()).toBeVisible();
      }
      await run.page.waitForTimeout(250); // Bounded no-retry observation interval.
      expect(endpoints.received).toHaveLength(count + 1);
      expect(endpoints.forbidden).toEqual([]);
      expect(await attempts()).toEqual(Array(count + 1).fill(`${endpoints.address}/chat/completions`));
      await expect(panel(run.page).getByText("Provider: OpenAI-compatible", { exact: true })).toBeVisible();
    }
    expect(endpoints.received.every((r) => r.url === "/v1/chat/completions" && r.authorization === `Bearer ${key}`)).toBe(true);
    expect(readFileSync(dirs.file, "utf8")).toBe(source);
    expect(await connection(run.page, "remove")).toMatchObject({ ok: true });
    expect(existsSync(join(dirs.userData, "rewrite-connection.json"))).toBe(false);
    logs.push(...run.log); await run.app.close();
    run = await launch(dirs, isolatedAccount(dirs), { args: ["--rewrite-editor-demo"] });
    attempts = await observeEgress(run.app);
    expect((await connection(run.page, "settings")).value).toMatchObject({ configured: false });
    await open(run.page); await run.page.waitForTimeout(250);
    expect(await attempts()).toEqual([]);
    expect(endpoints.received).toHaveLength(4);
    await panel(run.page).getByRole("button", { name: "Switch provider", exact: true }).click();
    await panel(run.page).getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(panel(run.page).getByText(/The connection could not finish this rewrite/).last()).toBeVisible();
    expect(await attempts()).toEqual([]);
    expect(endpoints.received).toHaveLength(4);
    logs.push(...run.log);
  } finally {
    await run.app.close(); await endpoints.close();
  }
  expect(logs.join("\n")).not.toContain(key);
  scan(dirs.docs); scan(dirs.userData); scanGit(dirs.docs); scanGit(dirs.userData);
});

test("AIR-SAFE-B corrupt envelope and unavailable safeStorage refuse without sending; key never persists in plaintext", async () => {
  const dirs = profile(), endpoints = await egressEndpoints();
  let run = await launch(dirs, isolatedAccount(dirs), { args: ["--rewrite-editor-demo"] });
  const logs: string[] = [];
  try {
    await open(run.page); await configure(run.page, endpoints.address);
    logs.push(...run.log); await run.app.close();
    const path = join(dirs.userData, "rewrite-connection.json");
    const saved = readFileSync(path, "utf8");
    writeFileSync(path, JSON.stringify({ ...JSON.parse(saved), encrypted: Buffer.from("synthetic corrupt envelope").toString("base64") }));
    run = await launch(dirs, isolatedAccount(dirs), { args: ["--rewrite-editor-demo"] });
    let attempts = await observeEgress(run.app);
    expect(await connection(run.page, "settings")).toEqual({ ok: false });
    await open(run.page);
    await panel(run.page).getByRole("button", { name: "Switch provider", exact: true }).click();
    await panel(run.page).getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(panel(run.page).getByText(/The connection could not finish this rewrite/).last()).toBeVisible();
    await expect(panel(run.page).getByRole("button", { name: "Accept", exact: true })).toBeDisabled();
    await run.page.waitForTimeout(250);
    expect(await attempts()).toEqual([]); expect(endpoints.received).toHaveLength(0);
    logs.push(...run.log); await run.app.close();
    writeFileSync(path, saved);
    run = await launch(dirs, isolatedAccount(dirs), { args: ["--rewrite-editor-demo"] });
    attempts = await observeEgress(run.app);
    // Test fault only: production safeStorage calls still go through their real boundary.
    await run.app.evaluate(({ safeStorage }) => { safeStorage.isEncryptionAvailable = () => false; });
    expect(await connection(run.page, "settings")).toEqual({ ok: false });
    expect(await connection(run.page, "configure", { address: endpoints.address, model: "synthetic", key })).toEqual({ ok: false });
    await open(run.page);
    await panel(run.page).getByRole("button", { name: "Switch provider", exact: true }).click();
    await panel(run.page).getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(panel(run.page).getByRole("button", { name: "Try again", exact: true })).toBeEnabled();
    await expect(panel(run.page).getByRole("button", { name: "Accept", exact: true })).toBeDisabled();
    await run.page.waitForTimeout(250);
    expect(await attempts()).toEqual([]); expect(endpoints.received).toHaveLength(0);
    logs.push(...run.log);
  } finally { await run.app.close(); await endpoints.close(); }
  expect(logs.join("\n")).not.toContain(key);
  scan(dirs.docs); scan(dirs.userData); scanGit(dirs.docs); scanGit(dirs.userData);
});

test("AIR-SAFE-B fresh normal Git workspace launch/open/switch/idle/restart has no default send (frozen activation gate)", async () => {
  const dirs = profile(true), endpoints = await egressEndpoints();
  try { for (let restart = 0; restart < 2; restart++) {
    const run = await launch(dirs, isolatedAccount(dirs));
    try {
      const attempts = await observeEgress(run.app);
      const editor = run.page.getByRole("textbox", { name: "Note", exact: true });
      await expect(editor).toContainText("Synthetic garden");
      await editor.press("Control+Shift+r");
      await expect(panel(run.page)).toHaveCount(0); // f991 normal activation is gated.
      await run.page.evaluate(async (file) => (window as any).focusNotes.windows.open(file), join(dirs.docs, "public", "other.md"));
      await expect.poll(() => run.app.windows().length).toBe(2);
      await run.page.waitForTimeout(500);
      expect(await attempts()).toEqual([]);
      expect(endpoints.received).toEqual([]); expect(endpoints.forbidden).toEqual([]);
      expect(run.log.join("\n")).not.toContain(key);
    } finally { await run.app.close(); }
  } } finally { await endpoints.close(); }
  scan(dirs.docs); scan(dirs.userData); scanGit(dirs.docs); scanGit(dirs.userData);
});
