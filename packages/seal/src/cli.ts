#!/usr/bin/env node
/**
 * focus-notes-seal: the publisher's command line (WP-6.3, WP-6.4).
 *
 *   node packages/seal/src/cli.ts publish --site _site --notes notes --private private --owner <name> [--git]
 *   node packages/seal/src/cli.ts vault-init --private private      (reads the passphrase from stdin)
 *
 * The Deploy app workflow runs `publish`. `vault-init` writes the owner's grant to private/access.json
 * (only the passphrase's derived key, never the passphrase), as the desktop setup does (FRE-08).
 */
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { LeakError, publish, validateAccess, type AccessFile } from "./publish.ts";
import { withVaultGrant } from "./vault.ts";

const run = promisify(execFile);
const [command, ...rest] = process.argv.slice(2);
const args = new Map<string, string>();
for (let i = 0; i < rest.length; i++) {
  const a = rest[i]!;
  if (!a.startsWith("--")) continue;
  const next = rest[i + 1];
  if (next && !next.startsWith("--")) { args.set(a.slice(2), next); i++; } else args.set(a.slice(2), "true");
}

/** The passphrase from stdin. Typed at a terminal, it isn't echoed, so it never sits in scrollback. */
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    process.stderr.write("Vault passphrase (not shown): ");
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    return new Promise((resolve, reject) => {
      let text = "";
      const onData = (chunk: string) => {
        for (const ch of chunk) {
          if (ch === "\r" || ch === "\n") { finish(); return resolve(text); }
          if (ch === "\u0003") { finish(); return reject(new Error("cancelled")); }
          if (ch === "\u007f" || ch === "\b") text = text.slice(0, -1);
          else text += ch;
        }
      };
      const finish = () => { process.stdin.off("data", onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stderr.write("\n"); };
      process.stdin.on("data", onData);
      process.stdin.resume();
    });
  }
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function main() {
  if (command === "publish") {
    const site = args.get("site"), owner = args.get("owner");
    if (!site || !owner) throw new Error("publish needs --site and --owner");
    const gitDate = async (file: string) => {
      try {
        const { stdout } = await run("git", ["log", "-1", "--format=%cI", "--", basename(file)], { cwd: dirname(file) });
        if (stdout.trim()) return new Date(stdout.trim()).toISOString();
      } catch { /* not in Git: fall back to the file time */ }
      const { stat } = await import("node:fs/promises");
      return (await stat(file)).mtime.toISOString();
    };
    await publish({
      site, owner,
      ...(args.get("notes") ? { notes: args.get("notes")! } : {}),
      ...(args.get("private") ? { private: args.get("private")! } : {}),
      ...(args.has("git") ? { updated: gitDate } : {}),
      log: (l) => console.log(l),
    });
    return;
  }
  if (command === "vault-init") {
    const dir = args.get("private");
    if (!dir) throw new Error("vault-init needs --private");
    const passphrase = await readStdin();
    const file = join(dir, "access.json");
    let access: AccessFile = { version: 1, grants: [] };
    try { access = validateAccess(JSON.parse(await readFile(file, "utf8"))); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    await writeFile(file, JSON.stringify(await withVaultGrant(access, passphrase), null, 2) + "\n");
    console.log(`Wrote the vault grant to ${file}. Commit it in the private repository; the next deploy seals your private notes.`);
    return;
  }
  throw new Error("Usage: cli.ts publish --site <dir> --owner <name> [--notes <dir>] [--private <dir>] [--git] | vault-init --private <dir>");
}

main().catch((e) => {
  console.error(e instanceof LeakError ? e.message : `focus-notes-seal: ${(e as Error).message}`);
  process.exit(1);
});
