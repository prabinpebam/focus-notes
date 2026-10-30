import { expect } from "@playwright/test";
import { launch, tempDirs, type Launched } from "./helpers.ts";
import { observeEgress } from "./rewrite-egress-http.ts";
import { localGit, scanRepository, sentinelHits, forbidden } from "./rewrite-privacy-local-git.ts";
import { createServer } from "node:http";
import { mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";

/** Actual frozen packaged main, normal entry only. No imports of runtime stores or crypt doubles. */
export async function packagedPrivacy() {
  if (!process.env.FOCUS_NOTES_E2E_EXE?.includes("51d38bda760eb03334782c0e13403f20067bd44b"))
    throw Error("exact51d-package-required");
  const dirs = tempDirs(), privateRepo = join(dirs.docs, "private");
  const logs: string[] = [], domains: string[] = [], normalWriteGates: string[] = [];
  const unexpectedAttempts: string[] = [], historyHits: { sentinel: string }[] = [];
  const receivers: { mode: string; publicArrived: boolean; scan: Awaited<ReturnType<typeof scanRepository>> }[] = [];
  const receiverRoot = join(dirs.userData, "receivers");
  let run: Launched | undefined;
  let mode = "success", domain = "public", requestCount = 0;
  let safeStorage = false, sourceBytesUnchanged = true, freshIds = true;
  const requestUrls: string[] = [];
  let instructionEntered = false, instructionReceived = false;
  const historyDomains: string[] = [];
  const instructionDomains = new Set<string>();
  const historyRecords = { public: 0, private: 0 };
  const stderrStreams: string[][] = [];
  let launches = 0, closed = 0;
  const logSources = { app: 0, stderrAttached: 0, stderr: 0, renderer: 0, profile: 0, task: 0, error: 0 };
  const noteDir = (d: string) => d === "public" ? join(dirs.docs, "notes") : join(privateRepo, "notes");
  function observeLogs(owned: Launched) {
    launches++;
    // The shared helper records stdout only. Attach to the still-buffered stderr stream locally.
    const stderr = owned.app.process().stderr;
    expect(stderr).not.toBeNull();
    const chunks: string[] = [];
    stderrStreams.push(chunks);
    stderr!.on("data", (chunk: Buffer) => { chunks.push(chunk.toString()); logSources.stderr++; });
    logSources.stderrAttached++;
    owned.page.on("pageerror", (e) => { logs.push(e.message); logSources.renderer++; });
    owned.page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") { logs.push(m.text()); logSources.renderer++; } });
  }
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk.toString();
    const received = body.includes(domain === "private" ? "SYNTH_PRIVATE_PROMPT_C" : "SYNTH_PUBLIC_PROMPT_C");
    instructionReceived ||= received;
    if (received) instructionDomains.add(domain);
    requestCount++; requestUrls.push(req.url ?? "");
    if (mode === "error") { res.writeHead(503); res.end(forbidden.join(" ")); return; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const text = domain === "private" ? "SYNTH_PRIVATE_COMPLETE_C" : "SYNTH_PUBLIC_COMPLETE_C";
    if (mode === "cancel") {
      res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: domain === "private" ? "SYNTH_PRIVATE_PARTIAL_C" : "Synthetic partial" }, finish_reason: null }] })}\n\n`);
      return;
    }
    res.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: `# Synthetic ${domain} result\n\n${text}\n` }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("fixture");
  const endpoint = `http://127.0.0.1:${address.port}/v1`;
  try {
    await mkdir(noteDir("private"), { recursive: true });
    await mkdir(noteDir("public"));
    await mkdir(join(dirs.docs, ".focus-notes"));
    await writeFile(join(dirs.docs, ".focus-notes", "workspace.json"),
      JSON.stringify({ formatVersion: 1, templateVersion: "0.0.0" }));
    await mkdir(receiverRoot);
    const gh = join(dirs.userData, "empty-gh"); await mkdir(gh);
    for (const repo of [dirs.docs, privateRepo]) {
      await localGit(repo, ["init", "--quiet", "--template="]);
      await localGit(repo, ["symbolic-ref", "HEAD", "refs/heads/main"]);
    }
    // Both repositories need a starting commit; nested private is committed separately.
    for (const d of ["public", "private"]) {
      await writeFile(join(noteDir(d), "source.md"),
        `# Synthetic ${d} source\n\n${d === "private" ? "SYNTH_PRIVATE_ORIGINAL_C SYNTH_PRIVATE_ID_C" : "Synthetic public original café"}\n`);
    }
    await localGit(privateRepo, ["add", "notes/source.md"]);
    await localGit(privateRepo, ["commit", "--quiet", "-m", "Synthetic private baseline"]);
    await localGit(dirs.docs, ["add", "notes", "private", ".focus-notes"]);
    await localGit(dirs.docs, ["commit", "--quiet", "-m", "Synthetic public baseline"]);
    for (const d of ["public", "private"]) {
      domain = d; domains.push(d);
      const file = join(noteDir(d), "source.md"), bytes = await readFile(file);
      await writeFile(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: file }));
      run = await launch(dirs, { FOCUS_NOTES_E2E_OFFLINE: "1", GH_CONFIG_DIR: gh,
        GH_TOKEN: "", GITHUB_TOKEN: "", GH_ENTERPRISE_TOKEN: "", GITHUB_ENTERPRISE_TOKEN: "" });
      const { app, page } = run;
      observeLogs(run);
      const attempts = await observeEgress(app);
      safeStorage = await app.evaluate(({ safeStorage }) => safeStorage.isEncryptionAvailable());
      expect(safeStorage).toBe(true);
      await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText(`Synthetic ${d} source`);
      // Real normal Files command, not --rewrite-*-demo or renderer-gate mutation.
      await page.keyboard.press("Control+Shift+e");
      const row = page.getByRole("treeitem").filter({ hasText: `Synthetic ${d} source` }).first();
      await row.click(); await row.press("Shift+F10");
      await page.getByRole("menuitem", { name: "Rewrite with AI", exact: true }).click();
      const panel = page.getByRole("complementary", { name: "Rewrite with AI", exact: true });
      await expect(panel).toBeVisible();
      await panel.getByRole("button", { name: "Open connection settings" }).click();
      await panel.getByRole("textbox", { name: "API base address" }).fill(endpoint);
      await panel.getByRole("textbox", { name: "Model", exact: true }).fill("synthetic-C2");
      await panel.getByRole("textbox", { name: "API key", exact: true }).fill("SYNTH_KEY_C");
      await panel.getByRole("button", { name: "Save connection", exact: true }).click();
      await expect(panel).toContainText("Connection saved locally.");
      expect(await readFile(join(dirs.userData, "rewrite-connection.json"), "utf8")).not.toContain("SYNTH_KEY_C");
      await panel.getByRole("button", { name: "Open connection settings" }).click();
      const instruction = panel.getByRole("textbox", { name: "Rewrite instruction", exact: true });
      await instruction.fill(d === "private" ? "SYNTH_PRIVATE_PROMPT_C" : "SYNTH_PUBLIC_PROMPT_C");
      instructionEntered = true;
      const startCount = requestCount;
      for (let i = 0; i < 2; i++) {
        await panel.getByRole("button", { name: i ? "Try again" : "Rewrite", exact: true }).click();
        try {
          await expect(panel).toContainText(d === "private" ? "SYNTH_PRIVATE_COMPLETE_C" : "SYNTH_PUBLIC_COMPLETE_C");
        } catch (e) {
          console.log("C2 bounded failure diagnostics", JSON.stringify({ requestCount, requestUrls,
            attempts: await attempts(), logHits: sentinelHits(run.log, forbidden), logs: run.log.map((s) => s.replace(/SYNTH_[A-Z_]+_C/g, "[synthetic]")) }));
          throw e;
        }
        await expect(panel.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
      }
      mode = "cancel";
      await panel.getByRole("button", { name: "Try again", exact: true }).click();
      await expect(panel.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
      await expect.poll(() => requestCount).toBe(startCount + 3);
      await panel.getByRole("button", { name: "Cancel", exact: true }).click();
      // Cancel ends this panel; reopen through the same normal command.
      await row.press("Shift+F10");
      await page.getByRole("menuitem", { name: "Rewrite with AI", exact: true }).click();
      await instruction.fill(d === "private" ? "SYNTH_PRIVATE_PROMPT_C" : "SYNTH_PUBLIC_PROMPT_C");
      mode = "error";
      await panel.getByRole("button", { name: "Rewrite", exact: true }).click();
      await expect(panel).toContainText("The connection could not finish this rewrite");
      mode = "success";
      await panel.getByRole("button", { name: "Try again", exact: true }).click();
      await expect(panel).toContainText(d === "private" ? "SYNTH_PRIVATE_COMPLETE_C" : "SYNTH_PUBLIC_COMPLETE_C");
      await expect(panel.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
      await expect(panel.getByRole("button", { name: "Create new file", exact: true })).toBeEnabled();
      // Main's ordinary activation still prohibits Accept and restore. Do not waive these gates.
      for (const action of ["accept", "restore"]) {
        const error = await page.evaluate(async (action) => {
          try { await (window as any).focusNotes.rewriteAuthority(action, {}); return "unsafe"; }
          catch (e) { return String(e); }
        }, action);
        expect(error).toContain("preview-only"); normalWriteGates.push(`${d}:${action}`);
      }
      await panel.getByRole("textbox", { name: "New file name", exact: true }).fill("fresh.md");
      await panel.getByRole("button", { name: "Create new file", exact: true }).click();
      const fresh = join(dirname(file), "fresh.md");
      await expect.poll(async () => { try { return await readFile(fresh, "utf8"); } catch { return ""; } }).toContain(d === "private" ? "SYNTH_PRIVATE_COMPLETE_C" : "SYNTH_PUBLIC_COMPLETE_C");
      const created = await readFile(fresh, "utf8"), id = /^id: ([a-f0-9-]{36})$/m.exec(created)?.[1];
      freshIds &&= Boolean(id) && !bytes.toString().includes(id!);
      sourceBytesUnchanged &&= bytes.equals(await readFile(file));
      const observed = await attempts();
      unexpectedAttempts.push(...observed.filter((s) => s !== `${endpoint}/chat/completions`));
      expect(observed).toHaveLength(5);
      await app.close(); closed++; logs.push(run.log.join("")); logSources.app += run.log.length; run = undefined;
    }
    // Decrypt actual safeStorage history in the same profile via an owned normal app.
    run = await launch(dirs, { FOCUS_NOTES_E2E_OFFLINE: "1", GH_CONFIG_DIR: gh,
      GH_TOKEN: "", GITHUB_TOKEN: "", GH_ENTERPRISE_TOKEN: "", GITHUB_ENTERPRISE_TOKEN: "" });
    observeLogs(run);
    const attempts = await observeEgress(run.app);
    const historyRoot = join(dirs.userData, "rewrite-history");
    const decrypted: string[] = [];
    for (const workspace of await readdir(historyRoot)) {
      for (const name of (await readdir(join(historyRoot, workspace))).filter((n) => n.endsWith(".git"))) {
        expect(["public.git", "private.git"]).toContain(name);
        const d = name.slice(0, -4);
        historyDomains.push(d);
        const repo = join(historyRoot, workspace, name);
        historyHits.push(...(await scanRepository(repo, forbidden)).hits);
        expect((await localGit(repo, [`--git-dir=${repo}`, "remote"])).trim()).toBe("");
        const refs = (await localGit(repo, [`--git-dir=${repo}`, "for-each-ref", "--format=%(refname)"])).trim().split("\n").filter(Boolean);
        for (const ref of refs) {
          const envelope = await localGit(repo, [`--git-dir=${repo}`, "show", `${ref}:content`]);
          const decode = async (text: string) => d === "public" ? text : await run!.app.evaluate(({ safeStorage }, value) =>
            safeStorage.decryptString(Buffer.from(JSON.parse(value).data, "base64")), text);
          const content = await decode(envelope);
          const record = JSON.parse(await decode(await localGit(repo, [`--git-dir=${repo}`, "show", `${ref}:record.json`])));
          expect(record.domain).toBe(d);
          expect(record.workspaceKey).toBe(workspace);
          const relativePath = d === "public" ? join("notes", "source.md") : join("private", "notes", "source.md");
          expect(record.noteKey).toBe(createHash("sha256").update(relativePath).digest("hex"));
          expect(sentinelHits([content, JSON.stringify(record)], ["SYNTH_PRIVATE_PROMPT_C", "SYNTH_PUBLIC_PROMPT_C", "SYNTH_KEY_C"])).toEqual([]);
          historyRecords[d as "public" | "private"]++;
          decrypted.push(content);
        }
      }
    }
    expect(decrypted.some((s) => s.includes("SYNTH_PRIVATE_ORIGINAL_C"))).toBe(true);
    expect(decrypted.filter((s) => s.includes("SYNTH_PRIVATE_COMPLETE_C"))).toHaveLength(3);
    expect(decrypted.some((s) => s.includes("SYNTH_PRIVATE_PARTIAL_C"))).toBe(false);
    unexpectedAttempts.push(...await attempts());
    await run.app.close(); closed++; logs.push(run.log.join("")); logSources.app += run.log.length; run = undefined;
    for (const repo of [privateRepo, dirs.docs]) {
      await localGit(repo, ["add", "."]); logs.push(await localGit(repo, ["commit", "--quiet", "-m", "Synthetic complete new files"]));
    }
    await localGit(dirs.docs, ["tag", "-a", "synthetic-public", "-m", "Synthetic tag"]);
    await localGit(dirs.docs, ["update-ref", "refs/synthetic/public", "HEAD"]);
    for (const pushMode of ["normal", "mirror"]) {
      const receiver = join(receiverRoot, `${pushMode}.git`); await mkdir(receiver);
      await localGit(receiver, ["init", "--bare", "--quiet", "--template="]);
      logs.push(await localGit(dirs.docs, pushMode === "mirror" ? ["push", "--mirror", receiver] : ["push", receiver, "HEAD:refs/heads/main"]));
      const scan = await scanRepository(receiver, forbidden);
      const publicArrived = (await localGit(receiver, [`--git-dir=${receiver}`, "show", "refs/heads/main:notes/fresh.md"])).includes("SYNTH_PUBLIC_COMPLETE_C");
      receivers.push({ mode: pushMode, scan, publicArrived });
    }
    // Persisted application/task/error logs only, not encrypted history or synthetic note files.
    async function readLogs(root: string) {
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (entry.name === "receivers" || entry.name === "rewrite-history") continue;
        const path = join(root, entry.name);
        if (entry.isDirectory()) await readLogs(path);
        else if (/\.(log|jsonl)$/i.test(entry.name) || /(?:task|error).*\.json$/i.test(entry.name)) {
          logs.push(await readFile(path, "utf8")); logSources.profile++;
          if (/task/i.test(path)) logSources.task++;
          if (/error/i.test(path)) logSources.error++;
        }
      }
    }
    await readLogs(dirs.userData);
    logs.push(...stderrStreams.map((chunks) => chunks.join("")));
    expect(requestUrls.every((url) => url === "/v1/chat/completions")).toBe(true);
    return { domains, safeStorage, sourceBytesUnchanged, freshIds, normalWriteGates, unexpectedAttempts,
      logHits: sentinelHits(logs, forbidden), historyHits, receivers, requests: requestCount,
      decryptedHistoryEntries: decrypted.length, logChunks: logs.length, historyDomains: historyDomains.sort(),
      instructionEntered, instructionReceived, instructionDomains: [...instructionDomains].sort(),
      logSources, historyRecords, launches, closed };
  } finally {
    if (run) await run.app.close();
    server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r()));
    await rm(dirs.docs, { recursive: true, force: true });
    await rm(dirs.userData, { recursive: true, force: true });
  }
}
