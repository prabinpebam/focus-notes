import { test, expect } from "@playwright/test";
import { launch, tempDirs, killLeftovers, quit, type Launched } from "./helpers.ts";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

test("AIR-CONNECTION-TX first successful save ack survives immediate owned kill with exact profile and key", async () => {
  const head = process.env.AIR_CONNECTION_PACKAGE_SHA ?? "";
  const hash = process.env.AIR_CONNECTION_PACKAGE_HASH ?? "";
  const exe = process.env.FOCUS_NOTES_E2E_EXE ?? "";
  if (!/^[a-f0-9]{40}$/.test(head) || !/^[A-F0-9]{64}$/.test(hash)
    || !exe.includes(head) || process.env.FOCUS_NOTES_E2E !== "1"
    || process.env.FOCUS_NOTES_E2E_OFFLINE !== "1") throw Error("exact-e2e-package-required");
  const asar = join(dirname(exe), "resources", "app.asar");
  const digest = async () => createHash("sha256").update(await readFile(asar)).digest("hex").toUpperCase();
  expect(await digest()).toBe(hash);
  const dirs = tempDirs(), file = join(dirs.docs, "notes", "synthetic.md");
  const address = "http://127.0.0.1:9/v1", model = "synthetic-connection-tx", key = "SYNTHETIC_CONNECTION_TX_ONLY";
  const cleared = Object.fromEntries(Object.keys(process.env)
    .filter((name) => /^(GIT_|GH_|GITHUB_)/i.test(name)).map((name) => [name, ""]));
  const env = { ...cleared, FOCUS_NOTES_E2E: "1", FOCUS_NOTES_E2E_OFFLINE: "1",
    GH_CONFIG_DIR: join(dirs.userData, "empty-gh"), GH_TOKEN: "", GITHUB_TOKEN: "",
    GH_ENTERPRISE_TOKEN: "", GITHUB_ENTERPRISE_TOKEN: "", GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: "", GIT_CONFIG_GLOBAL: join(dirs.userData, "isolated.gitconfig"),
    GIT_ALLOW_PROTOCOL: "file", GIT_CONFIG_COUNT: "0" };
  let run: Launched | undefined;
  const pids: number[] = [];
  try {
    await mkdir(env.GH_CONFIG_DIR);
    await writeFile(env.GIT_CONFIG_GLOBAL,
      '[protocol]\n allow = never\n[protocol "file"]\n allow = always\n[core]\n hooksPath =\n autocrlf = false\n');
    await mkdir(join(dirs.docs, "notes"));
    await mkdir(join(dirs.docs, ".focus-notes"));
    await writeFile(join(dirs.docs, ".focus-notes", "workspace.json"),
      JSON.stringify({ formatVersion: 1, templateVersion: "0.0.0" }));
    await writeFile(file, "# Synthetic transaction\n\nSynthetic paragraph.\n");
    const git = (args: string[]) => execFileSync("git", ["--no-pager", "-c", "core.hooksPath=",
      "-c", "commit.gpgSign=false", ...args], { cwd: dirs.docs, env: { ...process.env, ...env },
      encoding: "utf8" });
    git(["init", "--quiet", "--template="]);
    expect(git(["remote"]).trim()).toBe("");
    await writeFile(join(dirs.userData, "state.json"),
      JSON.stringify({ version: 1, firstRun: "done", lastNotePath: file }));
    run = await launch(dirs, env); pids.push(run.pid);
    const editor = run.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toContainText("Synthetic paragraph.");
    await editor.getByText("Synthetic paragraph.", { exact: true }).click();
    await editor.press("Control+Shift+r");
    const panel = run.page.getByRole("complementary", { name: "Rewrite with AI", exact: true });
    await panel.getByRole("button", { name: "Open connection settings" }).click();
    await panel.getByRole("textbox", { name: "API base address" }).fill(address);
    await panel.getByRole("textbox", { name: "Model", exact: true }).fill(model);
    await panel.getByRole("textbox", { name: "API key", exact: true }).fill(key);
    const started = Date.now();
    await panel.getByRole("button", { name: "Save connection", exact: true }).click();
    await expect(panel).toContainText("Connection saved locally.", { timeout: 20_000 });
    // Nothing (no rewrite, diagnostic or disk read) intervenes between FIRST ack and kill.
    const acknowledgedMs = Date.now() - started;
    const closed = run.app.waitForEvent("close", { timeout: 10_000 });
    killLeftovers();
    await closed; run = undefined;
    const persistedBeforeRestart = await readFile(join(dirs.userData, "rewrite-connection.json"), "utf8");
    expect(persistedBeforeRestart).not.toContain(key);
    expect(JSON.parse(persistedBeforeRestart)).toEqual({ address, model, encrypted: expect.any(String) });
    run = await launch(dirs, env); pids.push(run.pid);
    const settings = await run.page.evaluate(() => (window as any).focusNotes.rewriteConnection("settings", {}));
    expect(settings).toEqual({ address, model, configured: true });
    const diagnostic = await run.app.evaluate(async ({ app, safeStorage }, expected) => {
      const fs = process.getBuiltinModule("node:fs/promises");
      const path = process.getBuiltinModule("node:path");
      const raw = await fs.readFile(path.join(app.getPath("userData"), "rewrite-connection.json"), "utf8");
      const value = JSON.parse(raw);
      return { exactEnvelope: raw === expected.raw, exactProfile: value.address === expected.address && value.model === expected.model,
        decrypt: safeStorage.decryptString(Buffer.from(value.encrypted, "base64")) === expected.key };
    }, { raw: persistedBeforeRestart, address, model, key });
    expect(diagnostic).toEqual({ exactEnvelope: true, exactProfile: true, decrypt: true });
    expect(await digest()).toBe(hash);
    console.log(JSON.stringify({ head, hash, acknowledgedMs, pids, sameDisposableProfile: true,
      settings, diagnostic, killedImmediatelyAfterFirstAcknowledgment: true }));
    await quit(run); await run.app.close(); run = undefined;
  } finally {
    if (run) { try { await run.app.close(); } finally { killLeftovers(); } }
    await rm(dirs.docs, { recursive: true, force: true });
    await rm(dirs.userData, { recursive: true, force: true });
  }
});
