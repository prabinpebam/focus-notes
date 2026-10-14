#!/usr/bin/env node
/**
 * Fakes of Git's sign-in helpers for tests (no network, no real keychain): a credential helper,
 * Git Credential Manager's `github login`, and the GitHub CLI's `auth` commands. They share state
 * in $FAKE_GH_DIR: store.json (what the credential helper holds), session.json (the CLI's session),
 * config.json ({ token, login, delayMs }), outcomes.json (how the next sign-ins end: "ok",
 * "declined", "expired", "offline"), and argv.log (every argument list, to check no token is in one).
 */
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.FAKE_GH_DIR;
if (!dir) {
  process.stderr.write("FAKE_GH_DIR isn't set\n");
  process.exit(2);
}
const [role, ...args] = process.argv.slice(2);
appendFileSync(join(dir, "argv.log"), JSON.stringify([role, ...args]) + "\n");
const read = (name, fallback) => (existsSync(join(dir, name)) ? JSON.parse(readFileSync(join(dir, name), "utf8")) : fallback);
const write = (name, value) => writeFileSync(join(dir, name), JSON.stringify(value, null, 2));
const config = read("config.json", { token: "", login: "ada", delayMs: 300 });
const stdin = () => {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
};
const fields = (text) => Object.fromEntries(text.split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const nextOutcome = () => {
  const list = read("outcomes.json", []);
  const o = list.shift() ?? "ok";
  write("outcomes.json", list);
  return o;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (outcome) => {
  const words = { declined: "error: access_denied: The user has denied your application access.", expired: "error: expired_token: The device code has expired.", offline: "error: dial tcp: lookup github.com: no such host" };
  process.stderr.write((words[outcome] ?? "error: failed") + "\n");
  process.exit(1);
};

if (role === "helper") {
  const action = args.at(-1);
  const input = fields(stdin());
  const store = read("store.json", {});
  if (input.host !== "github.com") process.exit(0);
  if (action === "get" && store["github.com"]) process.stdout.write(`username=${store["github.com"].username}\npassword=${store["github.com"].password}\n`);
  if (action === "store" && input.password) write("store.json", { ...store, "github.com": { username: input.username ?? "", password: input.password } });
  if (action === "erase") write("store.json", {});
  process.exit(0);
}

if (role === "gcm") {
  if (args[0] === "--version") process.stdout.write("2.6.0\n");
  else if (args[0] === "github" && args[1] === "login") {
    if (args.includes("--device")) process.stderr.write("To complete authentication please visit https://github.com/login/device and enter the code: ABCD-1234\n");
    await sleep(config.delayMs ?? 300);
    const outcome = nextOutcome();
    if (outcome !== "ok") fail(outcome);
    const store = read("store.json", {});
    write("store.json", { ...store, "github.com": { username: config.login, password: config.token } });
  } else process.exit(1);
  process.exit(0);
}

if (role === "gh") {
  const [a, b] = args;
  if (a === "--version") process.stdout.write("gh version 2.60.0 (2024-10-01)\n");
  else if (a === "auth" && b === "token") {
    const s = read("session.json", undefined);
    if (!s) {
      process.stderr.write("no oauth token found for github.com\n");
      process.exit(1);
    }
    process.stdout.write(s.token + "\n");
  } else if (a === "auth" && b === "login") {
    process.stderr.write("! First copy your one-time code: WDJB-MJHT\nOpen this URL to continue in your web browser: https://github.com/login/device\n");
    await sleep(config.delayMs ?? 300);
    const outcome = nextOutcome();
    if (outcome !== "ok") fail(outcome);
    write("session.json", { token: config.token, login: config.login });
    process.stderr.write("✓ Logged in as " + config.login + "\n");
  } else if (a === "auth" && b === "setup-git") {
    // Git now asks the CLI: here, the store answers with the CLI's token.
    const s = read("session.json", undefined);
    if (s) write("store.json", { "github.com": { username: s.login, password: s.token } });
  } else if (a === "auth" && b === "logout") {
    rmSync(join(dir, "session.json"), { force: true });
  } else process.exit(1);
  process.exit(0);
}
process.exit(1);
