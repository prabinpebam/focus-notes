import { expect } from "@playwright/test";
import { launch, tempDirs, quit, killLeftovers, type Launched } from "./helpers.ts";
import { observeEgress } from "./rewrite-egress-http.ts";
import { createServer } from "node:http";
import { mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";

const sourceSHA = process.env.AIR_RESTART_PACKAGE_SHA ?? "51d38bda760eb03334782c0e13403f20067bd44b";
const expectedHash = process.env.AIR_RESTART_PACKAGE_HASH ?? "E176B9DC599100E7F63895FAAA1004F50AD3ADB4248532D452DB2D1DE9046213";
const original = "---\r\nid: air-safe-a3-note\r\n---\r\n# Synthetic lifecycle\r\n\r\nOriginal café 📝 paragraph.\r\n";
const complete = "Complete café 📝 paragraph.";
const partial = "UNACCEPTED_PARTIAL_A3";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GIT_|GH_|GITHUB_)/i.test(k)));
function git(cwd: string, args: string[]) {
  return execFileSync("git", ["--no-pager", "-c", "core.hooksPath=", "-c", "commit.gpgSign=false",
    "-c", "core.autocrlf=false", ...args], { cwd, encoding: "utf8", env: { ...gitEnv,
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: "", GIT_CONFIG_GLOBAL: "", GIT_ALLOW_PROTOCOL: "file",
    GIT_AUTHOR_NAME: "Synthetic A3", GIT_AUTHOR_EMAIL: "synthetic@invalid",
    GIT_COMMITTER_NAME: "Synthetic A3", GIT_COMMITTER_EMAIL: "synthetic@invalid" } });
}

/** Normal editor selection, actual package/storage/HTTP. Never patches authority or filesystem success. */
export async function packagedLifecycle(phase: "checkpoint" | "stream" | "review" | "save", ending: "orderly" | "kill") {
  const exe = process.env.FOCUS_NOTES_E2E_EXE;
  if (!/^[a-f0-9]{40}$/.test(sourceSHA) || !/^[A-F0-9]{64}$/.test(expectedHash)
    || !exe?.includes(sourceSHA) || process.env.FOCUS_NOTES_E2E !== "1") throw Error("exact-e2e-package-required");
  const asar = join(dirname(exe), "resources", "app.asar");
  const packageHashBefore = sha(await readFile(asar));
  expect(packageHashBefore).toBe(expectedHash);
  const dirs = tempDirs(), file = join(dirs.docs, "notes", "source.md");
  const connectionDiagnostic = async (app: Launched["app"]) => app.evaluate(async ({ safeStorage, app }) => {
    const fs = process.getBuiltinModule("node:fs/promises");
    const path = process.getBuiltinModule("node:path");
    const crypto = process.getBuiltinModule("node:crypto");
    const root = app.getPath("userData");
    const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
    let envelopeHash = "", localKeyHash = "", decrypt = "not-read";
    try {
      const raw = await fs.readFile(path.join(root, "rewrite-connection.json"), "utf8");
      envelopeHash = hash(raw);
      const value = JSON.parse(raw);
      try { safeStorage.decryptString(Buffer.from(value.encrypted, "base64")); decrypt = "ok"; }
      catch (error) {
        // Fixed categories only: never emit the exception, envelope, key or plaintext.
        const message = String(error);
        decrypt = /decrypt/i.test(message) ? "decrypt-error" : "other-error";
      }
    } catch { decrypt = "read-or-parse-error"; }
    try {
      const state = JSON.parse(await fs.readFile(path.join(app.getPath("sessionData"), "Local State"), "utf8"));
      localKeyHash = state.os_crypt?.encrypted_key ? hash(state.os_crypt.encrypted_key) : "absent";
    } catch { localKeyHash = "file-absent"; }
    return { available: safeStorage.isEncryptionAvailable(), envelopeHash, localKeyHash, decrypt };
  });
  let run: Launched | undefined, mode: "complete" | "partial" = "complete", requests = 0;
  let launches = 0, closed = 0, killed = 0;
  const unexpectedAttempts: string[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk.toString();
    expect(req.url).toBe("/v1/chat/completions");
    expect(body).toContain("Original café");
    requests++;
    res.writeHead(200, { "content-type": "text/event-stream" });
    const text = mode === "partial" ? partial : complete;
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: mode === "partial" ? null : "stop" }] })}\n\n`);
    if (mode === "complete") res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error("local-server");
  const endpoint = `http://127.0.0.1:${addr.port}/v1`;
  try {
    await mkdir(join(dirs.docs, "notes"));
    await mkdir(join(dirs.docs, ".focus-notes"));
    await writeFile(join(dirs.docs, ".focus-notes", "workspace.json"), JSON.stringify({ formatVersion: 1, templateVersion: "0.0.0" }));
    await writeFile(file, original);
    git(dirs.docs, ["init", "--quiet", "--template="]);
    git(dirs.docs, ["add", "."]);
    git(dirs.docs, ["commit", "--quiet", "-m", "Synthetic lifecycle"]);
    expect(git(dirs.docs, ["remote"]).trim()).toBe("");
    await writeFile(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: file }));
    const gh = join(dirs.userData, "empty-gh"); await mkdir(gh);
    const cleared = Object.fromEntries(Object.keys(process.env).filter((k) => /^(GIT_|GH_|GITHUB_)/i.test(k)).map((k) => [k, ""]));
    const env = { ...cleared, FOCUS_NOTES_E2E_OFFLINE: "1", GH_CONFIG_DIR: gh,
      GH_TOKEN: "", GITHUB_TOKEN: "", GH_ENTERPRISE_TOKEN: "", GITHUB_ENTERPRISE_TOKEN: "",
      GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: "", GIT_CONFIG_GLOBAL: "",
      GIT_ALLOW_PROTOCOL: "file", GIT_CONFIG_COUNT: "0" };
    const start = async () => { const owned = await launch(dirs, env); launches++; return owned; };
    const open = async () => {
      const editor = run!.page.getByRole("textbox", { name: "Note", exact: true });
      await expect(editor).toContainText("Original café");
      // Bind by the actual paragraph, not a document-end position that can become a heading.
      await editor.getByText("Original café 📝 paragraph.", { exact: true }).click();
      await editor.press("Control+Shift+r");
      const panel = run!.page.getByRole("complementary", { name: "Rewrite with AI", exact: true });
      await expect(panel).toBeVisible();
      return panel;
    };
    run = await start();
    const rawAfterOpen = await readFile(file);
    let observed = await observeEgress(run.app);
    expect(await run.app.evaluate(({ safeStorage }) => safeStorage.isEncryptionAvailable())).toBe(true);
    const panel = await open();
    await panel.getByRole("button", { name: "Open connection settings" }).click();
    await panel.getByRole("textbox", { name: "API base address" }).fill(endpoint);
    await panel.getByRole("textbox", { name: "Model", exact: true }).fill("synthetic-A3");
    await panel.getByRole("textbox", { name: "API key", exact: true }).fill("SYNTH_KEY_A3");
    const configureStarted = Date.now();
    await panel.getByRole("button", { name: "Save connection", exact: true }).click();
    await expect(panel).toContainText("Connection saved locally.", { timeout: 20_000 });
    const configureMs = Date.now() - configureStarted;
    expect(await readFile(join(dirs.userData, "rewrite-connection.json"), "utf8")).not.toContain("SYNTH_KEY_A3");
    const connectionBefore = await connectionDiagnostic(run.app);
    await panel.getByRole("button", { name: "Open connection settings" }).click();
    await panel.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(run.page.getByRole("textbox", { name: "Note", exact: true })).toContainText(complete);
    await expect(panel.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    // Every interruption must retain this already completed, unaccepted variation.
    let reason = "", gate = "";
    if (phase === "stream" || phase === "checkpoint") {
      mode = "partial";
      await panel.getByRole("button", { name: "Try again", exact: true }).click();
      await expect(run.page.getByRole("textbox", { name: "Note", exact: true })).toContainText(partial);
      await expect(panel.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
      if (phase === "checkpoint") reason = "No exact checkpoint fault seam without forbidden runtime edits; observed post-checkpoint partial only.";
    }
    if (phase === "save") {
      gate = await run.page.evaluate(async () => {
        try { await (window as any).focusNotes.rewriteAuthority("accept", {}); return "UNSAFE"; }
        catch (e) { return String(e); }
      });
      expect(gate).toContain("preview-only");
      reason = "Normal Accept is preview-only; accepted save never started. Close/kill below is review-only evidence.";
    }
    unexpectedAttempts.push(...(await observed()).filter((s) => s !== `${endpoint}/chat/completions`));
    const ownedPid = run.pid;
    if (ending === "orderly") {
      const exited = run.app.waitForEvent("close", { timeout: 10_000 });
      await quit(run);
      await exited;
      closed++; await run.app.close(); run = undefined;
    } else {
      // Reuse the helper's exact per-worker owned PID registry, never process-name cleanup.
      const exited = run.app.waitForEvent("close", { timeout: 10_000 });
      killLeftovers();
      await exited; killed++; run = undefined;
    }
    const beforeRestart = await readFile(file);
    run = await start();
    observed = await observeEgress(run.app);
    await expect(run.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Original café");
    const restartedConnection = await run.page.evaluate(async () => {
      try { return { ok: true, settings: await (window as any).focusNotes.rewriteConnection("settings", {}) }; }
      catch (e) { return { ok: false, error: String(e) }; }
    });
    const connectionAfter = await connectionDiagnostic(run.app);
    const canonicalExact = beforeRestart.equals(Buffer.from(original)) && (await readFile(file)).equals(Buffer.from(original));
    // Inspect actual history, independently of UI recovery. Do not remove crash-left locks.
    const originals: string[] = [], variations: string[] = [], locks: string[] = [];
    const variationRecords: { replacement: string; contentHash: string }[] = [];
    for (const workspace of await readdir(join(dirs.userData, "rewrite-history"))) {
      const root = join(dirs.userData, "rewrite-history", workspace);
      locks.push(...(await readdir(root)).filter((n) => n.endsWith(".lock")));
      const repo = join(root, "public.git"), args = [`--git-dir=${repo}`];
      const refs = git(repo, [...args, "for-each-ref", "--format=%(refname)"]).trim().split(/\r?\n/).filter(Boolean);
      for (const ref of refs) {
        const record = JSON.parse(git(repo, [...args, "show", `${ref}:record.json`]));
        expect(record.domain).toBe("public");
        const content = git(repo, [...args, "show", `${ref}:content`]);
        if (record.kind === "original") originals.push(content);
        else { variations.push(content); variationRecords.push(record); }
      }
    }
    expect(originals.length).toBeGreaterThan(0);
    const originalsExact = originals.every((s) => Buffer.from(s).equals(Buffer.from(original)));
    const idsRetained = [beforeRestart.toString(), ...originals, ...variations].every((s) => /^id: air-safe-a3-note\r?$/m.test(s));
    // Variations store entire spliced documents, not just provider output.
    const completeRetained = variations.length === 1 && variationRecords[0]?.replacement === complete
      && sha(Buffer.from(variations[0]!)).toLowerCase() === variationRecords[0]?.contentHash
      && /^id: air-safe-a3-note\r?$/m.test(variations[0]!);
    const partialDurable = [...originals, ...variations].some((s) => s.includes(partial));
    unexpectedAttempts.push(...await observed());
    const restartPanel = await open();
    const browse = restartPanel.getByRole("button", { name: "Browse saved variations", exact: true });
    const historyControlPresent = await browse.count() > 0;
    if (historyControlPresent) {
      await browse.click();
      await expect(restartPanel).toContainText(/Variation \d+ of \d+|Saved variations could not be read|No completed variations/);
    }
    const restartPanelText = await restartPanel.innerText();
    const historyReadError = restartPanelText.includes("Saved variations could not be read");
    const rawAfterRestart = await readFile(file);
    await quit(run); closed++; await run.app.close(); run = undefined;
    const safetyPass = canonicalExact && originalsExact && completeRetained && !partialDurable
      && !historyReadError && historyControlPresent && restartedConnection.ok;
    return { cell: `${phase} x ${ending}`, status: !safetyPass ? "FAIL" : reason ? "GATEDUNMEASURED" : "PASS",
      acceptanceStatus: reason ? "GATEDUNMEASURED" : safetyPass ? "PASS" : "FAIL", reason, gate,
      sourceSHA, packageHashBefore, packageHashAfter: sha(await readFile(asar)), ownedPid, requests,
      launches, closed, killed, canonicalExact, originalsExact, completeRetained, partialDurable,
      originalRecords: originals.length, completeVariations: variations.length, locks, historyReadError, idsRetained,
      historyControlPresent, restartedConnection, configureMs, connectionBefore, connectionAfter, restartPanelText,
      rawAfterOpenHex: rawAfterOpen.toString("hex"), rawBeforeRestartHex: beforeRestart.toString("hex"),
      rawAfterRestartHex: rawAfterRestart.toString("hex"), originalHex: Buffer.from(original).toString("hex"),
      checkpointHex: originals.map((s) => Buffer.from(s).toString("hex")),
      variationHex: variations.map((s) => Buffer.from(s).toString("hex")),
      sameProfileRestart: true, originalBytes: Buffer.byteLength(original), originalSHA256: sha(Buffer.from(original)),
      originalID: "air-safe-a3-note", unexpectedAttempts };
  } finally {
    if (run) { try { await run.app.close(); } finally { killLeftovers(); } }
    server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r()));
    await rm(dirs.docs, { recursive: true, force: true });
    await rm(dirs.userData, { recursive: true, force: true });
  }
}
