import { expect } from "@playwright/test";
import { launch, tempDirs, type Launched } from "./helpers.ts";
import { observeEgress } from "./rewrite-egress-http.ts";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";

const sourceId = "11111111-2222-4333-8444-555555555555";
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const exists = async (path: string) => readFile(path).then(() => true, () => false);
// Same isolated Git boundary as the already-adopted lifecycle fixture. No C foundation adoption.
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GIT_|GH_|GITHUB_)/i.test(k)));
async function localGit(cwd: string, args: string[]): Promise<string> {
  return execFileSync("git", ["--no-pager", "-c", "core.hooksPath=", "-c", "commit.gpgSign=false",
    "-c", "core.autocrlf=false", ...args], { cwd, encoding: "utf8", env: { ...gitEnv,
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: "", GIT_CONFIG_GLOBAL: "", GIT_ALLOW_PROTOCOL: "file",
    GIT_AUTHOR_NAME: "Synthetic fixture", GIT_AUTHOR_EMAIL: "synthetic@invalid",
    GIT_COMMITTER_NAME: "Synthetic fixture", GIT_COMMITTER_EMAIL: "synthetic@invalid" } });
}

/** C3's actual workspace/domain setup, launch fence, isolated Git and real safeStorage.
 * No demo activation, runtime mutation, crypt double or replacement of source IDs.
 */
export async function packagedNewFile(domain: "public" | "private", withId: boolean) {
  const sourceSHA = process.env.AIR_NEWFILE_PACKAGE_SHA ?? "51d38bda760eb03334782c0e13403f20067bd44b";
  const expectedHash = process.env.AIR_NEWFILE_PACKAGE_HASH ?? "E176B9DC599100E7F63895FAAA1004F50AD3ADB4248532D452DB2D1DE9046213";
  const exe = process.env.FOCUS_NOTES_E2E_EXE;
  if (!/^[a-f0-9]{40}$/.test(sourceSHA) || !/^[A-F0-9]{64}$/.test(expectedHash)
    || !exe?.includes(sourceSHA) || process.env.FOCUS_NOTES_E2E !== "1") throw Error("exact-e2e-package-required");
  const asar = join(dirname(exe), "resources", "app.asar");
  expect(hash(await readFile(asar)).toUpperCase()).toBe(expectedHash);
  const dirs = tempDirs(), privateRepo = join(dirs.docs, "private");
  let run: Launched | undefined;
  const pids: number[] = [], closedPids: number[] = [];
  const requests: string[] = [];
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    requests.push(req.url ?? "");
    expect(body).toContain(`Synthetic ${domain} source`);
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {
      content: `# Synthetic ${domain} result\n\nSynthetic completed rewrite café.\n`,
    }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
  });
  const result = {
    domain, sourceKind: withId ? "existing-frontmatter-ID" : "explicit-supported-body",
    sourceHashBefore: "", sourceHashAfter: "", sourceUnchanged: false, sourceIdRetained: false,
    sourceUnchangedAfterCreation: false,
    sameWindowRefused: false, sourceUnchangedWithOtherWindow: false, otherWindowClosed: false,
    created: false, freshId: false, destinationId: "", collisionRetained: false,
    dirtyRefused: false, dirtyBytesRetained: false, dirtyHash: "",
    historyDomains: [] as string[], historyRecords: 0, encryptedPrivateRecords: 0,
    historyOriginalMatches: false, safeStorage: false, reviewReached: false, panelState: "",
    unexpectedAttempts: [] as string[], requests, pids, closedPids,
  };
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("fixture");
  const endpoint = `http://127.0.0.1:${address.port}/v1`;
  try {
    // Same genuine marker and nested private gitlink as C3, not folder-label authority.
    for (const dir of [join(dirs.docs, "notes"), join(privateRepo, "notes"), join(dirs.docs, ".focus-notes")])
      await mkdir(dir, { recursive: true });
    await writeFile(join(dirs.docs, ".focus-notes", "workspace.json"),
      JSON.stringify({ formatVersion: 1, templateVersion: "0.0.0" }));
    const gh = join(dirs.userData, "empty-gh"); await mkdir(gh);
    for (const repo of [dirs.docs, privateRepo]) {
      await localGit(repo, ["init", "--quiet", "--template="]);
      await localGit(repo, ["symbolic-ref", "HEAD", "refs/heads/main"]);
    }
    for (const d of ["public", "private"]) {
      const root = d === "public" ? dirs.docs : privateRepo;
      await writeFile(join(root, "notes", "source.md"),
        `${withId ? `---\nid: ${sourceId}\ncustom: retained\n---\n\n` : ""}# Synthetic ${d} source\n\nSynthetic original café.\n`);
    }
    await localGit(privateRepo, ["add", "notes/source.md"]);
    await localGit(privateRepo, ["commit", "--quiet", "-m", "Synthetic private baseline"]);
    await localGit(dirs.docs, ["add", "notes", "private", ".focus-notes"]);
    await localGit(dirs.docs, ["commit", "--quiet", "-m", "Synthetic public baseline"]);
    expect(await localGit(dirs.docs, ["ls-files", "--stage", "private"])).toContain("160000");
    const noteDir = join(domain === "public" ? dirs.docs : privateRepo, "notes");
    const file = join(noteDir, "source.md"), bytes = await readFile(file);
    result.sourceHashBefore = hash(bytes);
    await writeFile(join(dirs.userData, "state.json"),
      JSON.stringify({ version: 1, firstRun: "done", lastNotePath: file }));
    run = await launch(dirs, { FOCUS_NOTES_E2E_OFFLINE: "1", GH_CONFIG_DIR: gh,
      GIT_ALLOW_PROTOCOL: "file", GIT_CONFIG_SYSTEM: "", GIT_CONFIG_NOSYSTEM: "1",
      GH_TOKEN: "", GITHUB_TOKEN: "", GH_ENTERPRISE_TOKEN: "", GITHUB_ENTERPRISE_TOKEN: "" });
    pids.push(run.pid);
    const { app, page } = run;
    const attempts = await observeEgress(app);
    result.safeStorage = await app.evaluate(({ safeStorage }) => safeStorage.isEncryptionAvailable());
    expect(result.safeStorage).toBe(true);
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText(`Synthetic ${domain} source`);
    await page.keyboard.press("Control+Shift+e");
    const row = page.getByRole("treeitem").filter({ hasText: `Synthetic ${domain} source` }).first();
    await row.click(); await row.press("Shift+F10");
    await page.getByRole("menuitem", { name: "Rewrite with AI", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "Rewrite with AI", exact: true });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Open connection settings" }).click();
    await panel.getByRole("textbox", { name: "API base address" }).fill(endpoint);
    await panel.getByRole("textbox", { name: "Model", exact: true }).fill("synthetic-newfile");
    await panel.getByRole("textbox", { name: "API key", exact: true }).fill("SYNTH_NEWFILE_KEY");
    await panel.getByRole("button", { name: "Save connection", exact: true }).click();
    await expect(panel).toContainText("Connection saved locally.", { timeout: 20_000 });
    expect(await readFile(join(dirs.userData, "rewrite-connection.json"), "utf8")).not.toContain("SYNTH_NEWFILE_KEY");
    await panel.getByRole("button", { name: "Open connection settings" }).click();
    await panel.getByRole("textbox", { name: "Rewrite instruction", exact: true }).fill("Rewrite this synthetic note.");
    await panel.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    result.reviewReached = (await panel.innerText()).includes("Synthetic completed rewrite");
    if (result.reviewReached) {
      if (!withId) {
        const collision = join(noteDir, "collision.md");
        const outside = Buffer.from("External collision bytes\r\n café \0 retained");
        await writeFile(collision, outside);
        await panel.getByRole("textbox", { name: "New file name", exact: true }).fill("collision.md");
        await panel.getByRole("button", { name: "Create new file", exact: true }).click();
        await expect(panel).toContainText("could not be created");
        result.collisionRetained = outside.equals(await readFile(collision));
        // Existing wp85-windows journey's real Spotlight Mod+Enter path, no new authority binding.
        await page.keyboard.press("Control+/");
        const spotlight = page.getByRole("dialog", { name: "Spotlight" });
        await expect(spotlight).toBeVisible();
        await page.keyboard.type(`Synthetic ${domain} source`);
        await expect(spotlight.getByRole("option").first()).toContainText(`Synthetic ${domain} source`);
        const secondWindow = app.waitForEvent("window");
        await page.keyboard.press("Control+Enter");
        const other = await secondWindow;
        await expect(other.getByRole("textbox", { name: "Note", exact: true })).toContainText(`Synthetic ${domain} source`);
        await panel.getByRole("textbox", { name: "New file name", exact: true }).fill("window-result.md");
        await panel.getByRole("button", { name: "Create new file", exact: true }).click();
        await expect(panel).toContainText("could not be created");
        result.sameWindowRefused = !await exists(join(noteDir, "window-result.md"));
        result.sourceUnchangedWithOtherWindow = bytes.equals(await readFile(file));
        const otherClosed = other.waitForEvent("close");
        await other.evaluate(() => (window as any).focusNotes.window.close());
        await otherClosed; result.otherWindowClosed = true;
      }
      await panel.getByRole("textbox", { name: "New file name", exact: true }).fill("fresh.md");
      await panel.getByRole("button", { name: "Create new file", exact: true }).click();
      await expect.poll(() => exists(join(noteDir, "fresh.md"))).toBe(true);
      const fresh = await readFile(join(noteDir, "fresh.md"), "utf8");
      result.created = true;
      result.destinationId = /^id: ([a-f0-9-]{36})$/m.exec(fresh)?.[1] ?? "";
      result.freshId = Boolean(result.destinationId) && result.destinationId !== sourceId
        && !bytes.toString().includes(result.destinationId);
      result.sourceUnchangedAfterCreation = bytes.equals(await readFile(file));
      if (!withId) {
        // Successful creation closes the panel. Reopen through the real Files command.
        await row.press("Shift+F10");
        await page.getByRole("menuitem", { name: "Rewrite with AI", exact: true }).click();
        await panel.getByRole("textbox", { name: "Rewrite instruction", exact: true }).fill("Rewrite this synthetic note.");
        await panel.getByRole("button", { name: "Rewrite", exact: true }).click();
        await expect(panel.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
        const dirty = Buffer.concat([bytes, Buffer.from("\nExternal synthetic edit retained.\n")]);
        await writeFile(file, dirty); result.dirtyHash = hash(dirty);
        await panel.getByRole("textbox", { name: "New file name", exact: true }).fill("dirty-result.md");
        await panel.getByRole("button", { name: "Create new file", exact: true }).click();
        await expect(panel).toContainText("could not be created");
        result.dirtyRefused = !await exists(join(noteDir, "dirty-result.md"));
        result.dirtyBytesRetained = dirty.equals(await readFile(file));
      }
    }
    result.panelState = await panel.innerText();
    const after = await readFile(file);
    result.sourceHashAfter = hash(after);
    result.sourceUnchanged = bytes.equals(after);
    result.sourceIdRetained = withId && after.includes(Buffer.from(`id: ${sourceId}\n`));
    if (!withId) {
      // Recheck after subsequent IPC/write completion so a stale refusal label cannot pass.
      result.sameWindowRefused &&= !await exists(join(noteDir, "window-result.md"));
      result.collisionRetained &&= (await readFile(join(noteDir, "collision.md")))
        .equals(Buffer.from("External collision bytes\r\n café \0 retained"));
    }
    const historyRoot = join(dirs.userData, "rewrite-history");
    const workspaces = await readdir(historyRoot).catch(() => [] as string[]);
    for (const workspace of workspaces) {
      for (const name of (await readdir(join(historyRoot, workspace))).filter((n) => n.endsWith(".git"))) {
        const repo = join(historyRoot, workspace, name), d = name.slice(0, -4);
        result.historyDomains.push(d);
        const refs = (await localGit(repo, [`--git-dir=${repo}`, "for-each-ref", "--format=%(refname)"])).trim().split("\n").filter(Boolean);
        for (const ref of refs) {
          const decode = async (value: string) => d === "public" ? value : app.evaluate(({ safeStorage }, text) =>
            safeStorage.decryptString(Buffer.from(JSON.parse(text).data, "base64")), value);
          const envelope = await localGit(repo, [`--git-dir=${repo}`, "show", `${ref}:content`]);
          const content = await decode(envelope);
          const record = JSON.parse(await decode(await localGit(repo, [`--git-dir=${repo}`, "show", `${ref}:record.json`])));
          expect(record.domain).toBe(d); expect(record.workspaceKey).toBe(workspace);
          expect(record.noteKey).toBe(createHash("sha256").update(
            domain === "public" ? join("notes", "source.md") : join("private", "notes", "source.md")).digest("hex"));
          result.historyRecords++;
          if (d === "private") { expect(envelope).not.toContain("Synthetic original"); result.encryptedPrivateRecords++; }
          result.historyOriginalMatches ||= content === bytes.toString();
        }
      }
    }
    result.unexpectedAttempts = (await attempts()).filter((url) => url !== `${endpoint}/chat/completions`);
    await app.close(); closedPids.push(run.pid); run = undefined;
    expect(hash(await readFile(asar)).toUpperCase()).toBe(expectedHash);
    return result;
  } finally {
    if (run) { await run.app.close(); closedPids.push(run.pid); }
    server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r()));
    console.log("AIR-NEWFILE-TEARDOWN", JSON.stringify({ domain, withId, pids, closedPids, serverClosed: true }));
    await rm(dirs.docs, { recursive: true, force: true });
    await rm(dirs.userData, { recursive: true, force: true });
  }
}
