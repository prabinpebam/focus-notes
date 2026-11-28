/**
 * A Git call stopped by its timeout ends Git's whole process tree (Windows: taskkill /T /F), not just
 * the `git` it started. Git for Windows' `git` is a launcher whose real git.exe, hooks, remote helpers
 * and credential helpers outlived it, still inside the project's folder: a delete then couldn't move
 * the folder to the Recycle Bin (project-offline:331, D-413).
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "pipe" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Every process still alive whose command line holds `needles`: Git, its hook, helpers or their `sleep`. */
function alive(needles: string[]): string[] {
  const script = "Get-CimInstance Win32_Process | ForEach-Object { [string]$_.ProcessId + ' ' + $_.Name + ' ' + $_.CommandLine }";
  const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { encoding: "utf8", windowsHide: true });
  return out.split(/\r?\n/).filter((l) => needles.some((n) => l.includes(n)) && !/powershell\.exe/i.test(l));
}

function project(marker: string) {
  const root = mkdtempSync(join(tmpdir(), "fn-git-timeout-"));
  const remote = join(root, "remote.git");
  git(root, "init", "-q", "--bare", "-b", "main", remote);
  writeFileSync(join(remote, "hooks", "pre-receive"), `#!/bin/sh\nsleep ${marker}\nexit 0\n`);
  const repo = join(root, "notes");
  git(root, "init", "-q", "-b", "main", repo);
  writeFileSync(join(repo, "Welcome.md"), "# Welcome\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "Welcome");
  git(repo, "remote", "add", "origin", remote);
  return { root, remote, repo };
}

describe.runIf(process.platform === "win32")("a Git call stopped by its timeout leaves nothing of Git running", () => {
  for (const here of [false, true]) {
    const where = here ? "this thread" : "the worker";

    it(`a push mid-hook: git.exe, sh and receive-pack are gone within 1 s, and the next commit and push succeed (${where})`, async () => {
      const marker = `3${here ? 1 : 2}.${Date.now() % 1000}`;
      const { root, remote, repo } = project(marker);
      try {
        const { createRunner } = await import("../src/main/git/run.ts");
        const run = createRunner({ here });
        const started = run({ cwd: repo, args: ["push", "-q", "origin", "main"], timeoutMs: 3_000 });
        const r = await started;
        const ended = Date.now();
        expect(r.code).toBe(-1);
        expect(r.stderr).toContain("(timed out)");
        await sleep(Math.max(0, ended + 1_000 - Date.now()));
        expect(alive([root, `sleep ${marker}`])).toEqual([]);
        // Nothing half-done: no lock, and the next sync's commit and push succeed.
        expect(existsSync(join(repo, ".git", "index.lock"))).toBe(false);
        rmSync(join(remote, "hooks", "pre-receive"));
        writeFileSync(join(repo, "Welcome.md"), "# Welcome\n\nMore.\n");
        expect((await run({ cwd: repo, args: ["add", "-A"] })).code).toBe(0);
        expect((await run({ cwd: repo, args: ["-c", "user.name=T", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "More"] })).code).toBe(0);
        expect((await run({ cwd: repo, args: ["push", "-q", "origin", "main"] })).code).toBe(0);
        expect(git(root, "--git-dir", remote, "rev-parse", "main").toString()).toBe(git(repo, "rev-parse", "HEAD").toString());
      } finally {
        for (const l of alive([root, `sleep ${marker}`])) try { process.kill(Number(l.split(" ")[0])); } catch { /* gone */ }
        rmSync(root, { recursive: true, force: true });
      }
    }, 60_000);

    it(`a slow local commit is never killed by its timeout: it completes and keeps every byte (${where})`, async () => {
      const { root, repo } = project(`3.${Date.now() % 1000}`);
      try {
        // Longer than the call's timeout: a local write runs until Git finishes (main, 28 November, D-413).
        writeFileSync(join(repo, ".git", "hooks", "pre-commit"), "#!/bin/sh\nsleep 4\nexit 0\n");
        writeFileSync(join(repo, "Welcome.md"), "# Welcome\n\nSaved words.\n");
        const { createRunner } = await import("../src/main/git/run.ts");
        const run = createRunner({ here });
        const id = ["-c", "user.name=T", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false"];
        const started = Date.now();
        // The app's own commit (git/sync.ts): pathspecs on standard input, which holds index.lock through the hook.
        const r = await run({ cwd: repo, args: [...id, "commit", "-q", "-m", "Save", "--pathspec-from-file=-", "--pathspec-file-nul"], input: "Welcome.md\0", timeoutMs: 1_000 });
        expect(r.code, r.stderr).toBe(0);
        expect(Date.now() - started).toBeGreaterThanOrEqual(3_500);
        expect(existsSync(join(repo, ".git", "index.lock"))).toBe(false);
        expect(git(repo, "show", "HEAD:Welcome.md").toString()).toBe("# Welcome\n\nSaved words.\n");
        expect(git(repo, "status", "--porcelain").toString()).toBe("");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }, 60_000);

    it(`a fetch waiting on its credential helper: git-remote-http and the helper are gone within 1 s (${where})`, async () => {
      const marker = `4${here ? 1 : 2}.${Date.now() % 1000}`;
      const { root, repo } = project(`3.${Date.now() % 1000}`);
      // GitHub asks who you are; the helper never answers.
      const server = createServer((_req, res) => { res.writeHead(401, { "WWW-Authenticate": 'Basic realm="GitHub"' }); res.end(); });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      const port = (server.address() as { port: number }).port;
      try {
        const { createRunner } = await import("../src/main/git/run.ts");
        const run = createRunner({ here });
        const r = await run({ cwd: repo, args: ["-c", `credential.helper=!sleep ${marker}; echo`, "fetch", `http://127.0.0.1:${port}/ada/notes.git`], timeoutMs: 3_000 });
        const ended = Date.now();
        expect(r.code).toBe(-1);
        expect(r.stderr).toContain("(timed out)");
        await sleep(Math.max(0, ended + 1_000 - Date.now()));
        expect(alive([root, `sleep ${marker}`, `127.0.0.1:${port}`])).toEqual([]);
      } finally {
        server.close();
        for (const l of alive([root, `sleep ${marker}`, `127.0.0.1:${port}`])) try { process.kill(Number(l.split(" ")[0])); } catch { /* gone */ }
        rmSync(root, { recursive: true, force: true });
      }
    }, 60_000);
  }
});
