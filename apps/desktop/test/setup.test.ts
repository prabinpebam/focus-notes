/**
 * Set up my instance (FRE-08): each step of the setup engine against an in-memory GitHub, with no
 * request leaving the process and no Git run (the Git steps are in setup-git.test.ts). Covers
 * idempotency (a done step calls nothing), retrying a failed step, resuming from saved progress,
 * the deploy key and its sealed secret, and that no token reaches the progress, reports, or log (SEC-03).
 */
import { describe, expect, it } from "vitest";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SETUP_STEPS, type SetupOptions, type SetupReport, type SetupStepId } from "@focus-notes/core/setup";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { SetupEngine, SECRET_NAME, checkOptions, problemOf, type SetupDeps } from "../src/main/setup/engine.ts";
import { GitHubError } from "@focus-notes/github";
import { DEPLOY_KEY_TITLE, deployKeyPair } from "../src/main/setup/deploy-key.ts";
import { CREDENTIAL_QUERY, githubFetch, githubToken } from "../src/main/setup/credential.ts";
import type { GitCall } from "../src/main/git/run.ts";

const OPTIONS = (folder = join(tmpdir(), "fn-setup-unused")): SetupOptions => ({ instance: "notes", private: "notes-private", folder, publish: true });

function harness(o: { done?: SetupStepId[]; options?: SetupOptions; gh?: FakeGitHub; token?: string | undefined } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "fn-setup-"));
  const progressFile = join(dir, "setup.json");
  const gh = o.gh ?? new FakeGitHub();
  if (o.done) {
    const steps = Object.fromEntries(o.done.map((id) => [id, { state: "done" }]));
    writeFileSync(progressFile, JSON.stringify({ version: 1, options: o.options ?? OPTIONS(), login: "ada", steps }));
  }
  const logs: string[] = [];
  const reports: SetupReport[] = [];
  const gitCalls: GitCall[] = [];
  let tokenAsked = 0;
  const deps: SetupDeps = {
    git: async (c) => {
      gitCalls.push(c);
      throw new Error("No Git in these tests");
    },
    progressFile,
    token: async () => {
      tokenAsked++;
      return "token" in o ? o.token : gh.token;
    },
    fetch: gh.fetch,
    sleep: async () => {},
    waitTries: 3,
    log: (l) => logs.push(l),
    onReport: (r) => reports.push(r),
  };
  const open = (more: Partial<SetupDeps> = {}) => SetupEngine.open({ ...deps, ...more });
  return { gh, dir, progressFile, logs, reports, gitCalls, open, deps, tokenAsked: () => tokenAsked };
}
const state = (r: SetupReport, id: SetupStepId) => r.steps.find((s) => s.id === id)!;
const before = (id: SetupStepId) => SETUP_STEPS.slice(0, SETUP_STEPS.indexOf(id));

/** The parts of an OpenSSH private key file (PROTOCOL.key). */
function parseOpenSsh(pem: string) {
  const lines = pem.trim().split("\n");
  expect(lines[0]).toBe("-----BEGIN OPENSSH PRIVATE KEY-----");
  expect(lines.at(-1)).toBe("-----END OPENSSH PRIVATE KEY-----");
  const b = Buffer.from(lines.slice(1, -1).join(""), "base64");
  let o = 15;
  const rd = (buf: Buffer, at: { o: number }) => {
    const n = buf.readUInt32BE(at.o);
    const v = buf.subarray(at.o + 4, at.o + 4 + n);
    at.o += 4 + n;
    return v;
  };
  const at = { o };
  const cipher = rd(b, at).toString(), kdf = rd(b, at).toString();
  rd(b, at);
  const count = b.readUInt32BE(at.o);
  at.o += 4;
  const pubBlob = rd(b, at);
  const section = rd(b, at);
  o = at.o;
  const s = { o: 8 };
  const type = rd(section, s).toString(), pub = rd(section, s), priv = rd(section, s), comment = rd(section, s).toString();
  const pad = section.subarray(s.o);
  return { magic: b.subarray(0, 15).toString("latin1"), cipher, kdf, count, pubBlob, type, pub, priv, comment, check: section.readUInt32BE(0) === section.readUInt32BE(4), pad: [...pad], end: o === b.length, sectionLength: section.length };
}
/** That a private key file and an `ssh-ed25519` public key are one pair: sign with one, verify with the other. */
function samePair(privatePem: string, publicKey: string): boolean {
  const k = parseOpenSsh(privatePem);
  const priv = createPrivateKey({ key: { kty: "OKP", crv: "Ed25519", d: k.priv.subarray(0, 32).toString("base64url"), x: k.pub.toString("base64url") }, format: "jwk" });
  const blob = Buffer.from(publicKey.split(" ")[1]!, "base64");
  const pub = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: blob.subarray(blob.length - 32).toString("base64url") }, format: "jwk" });
  const data = Buffer.from("focus notes deploy key");
  return verify(null, data, pub, sign(null, data, priv));
}

describe("FRE-08: the deploy key pair", () => {
  it("is an Ed25519 pair in OpenSSH's formats, as GitHub and ssh read them", () => {
    const pair = deployKeyPair();
    expect(pair.publicKey).toMatch(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5[A-Za-z0-9+/]+=* focus-notes-publishing$/);
    const k = parseOpenSsh(pair.privateKey);
    expect(k).toMatchObject({ magic: "openssh-key-v1\0", cipher: "none", kdf: "none", count: 1, type: "ssh-ed25519", comment: "focus-notes-publishing", check: true, end: true });
    expect(k.priv).toHaveLength(64);
    expect(k.pubBlob.toString("base64")).toBe(pair.publicKey.split(" ")[1]);
    expect(k.sectionLength % 8).toBe(0);
    expect(k.pad).toEqual(k.pad.map((_, i) => i + 1));
    expect(samePair(pair.privateKey, pair.publicKey)).toBe(true);
    expect(samePair(deployKeyPair().privateKey, pair.publicKey)).toBe(false);
  });
});

describe("SEC-03: the token comes from Git's credential helper, in memory only", () => {
  it("asks `git credential fill` for github.com, with nothing secret in its arguments or input", async () => {
    const calls: GitCall[] = [];
    const token = await githubToken(async (c) => {
      calls.push(c);
      return { code: 0, stdout: "protocol=https\nhost=github.com\nusername=ada\npassword=gho_secret123\n", stderr: "" };
    }, "/home/ada");
    expect(token).toBe("gho_secret123");
    expect(calls).toEqual([expect.objectContaining({ cwd: "/home/ada", args: ["credential", "fill"], input: CREDENTIAL_QUERY })]);
    expect(CREDENTIAL_QUERY).toBe("protocol=https\nhost=github.com\n\n");
  });

  it("is undefined when no helper has a credential (prompts are off, so Git fails rather than asks)", async () => {
    expect(await githubToken(async () => ({ code: 128, stdout: "", stderr: "fatal: could not read Username: terminal prompts disabled" }), "/")).toBeUndefined();
    expect(await githubToken(async () => ({ code: 0, stdout: "protocol=https\nhost=github.com\n", stderr: "" }), "/")).toBeUndefined();
  });

  it("sends API requests only to api.github.com, and never follows a redirect", async () => {
    const seen: (RequestInit | undefined)[] = [];
    const f = githubFetch(async (_i, init) => {
      seen.push(init);
      return new Response("{}");
    });
    await f("https://api.github.com/user");
    expect(seen[0]?.redirect).toBe("error");
    await expect(f("https://example.com/user")).rejects.toThrow(/api\.github\.com/);
    await expect(f("http://api.github.com/user")).rejects.toThrow();
    expect(seen).toHaveLength(1);
  });
});

describe("FRE-08: the API steps", () => {
  it("account: reads the login with the helper's token; signed out, it fails and asks the helper again on retry", async () => {
    const h = harness({ token: undefined });
    const e = await h.open();
    const r = await e.start(OPTIONS());
    expect(state(r, "account")).toEqual({ id: "account", state: "failed", problem: "signedOut" });
    expect(state(r, "instance").state).toBe("pending");
    const signedIn = await h.open({ token: async () => h.gh.token });
    const r2 = await signedIn.retry("account");
    expect(state(r2, "account").state).toBe("done");
    expect(r2.login).toBe("ada");
  });

  it("instance: makes the repository from the Focus Notes template", async () => {
    const h = harness({ done: before("instance") });
    const r = await (await h.open()).retry("instance");
    expect(state(r, "instance").state).toBe("done");
    expect(h.gh.repo("notes")).toMatchObject({ private: false, template: "prabinpebam/focus-notes-workspace" });
    expect(h.gh.calls).toContainEqual({ method: "POST", path: "/repos/prabinpebam/focus-notes-workspace/generate", body: expect.objectContaining({ owner: "ada", name: "notes", private: false }) });
  });

  it("instance: uses the instance the account already has (made in the browser first), and refuses a repository that isn't one", async () => {
    const h = harness({ done: before("instance") });
    h.gh.add({ owner: "ada", name: "notes", template: "prabinpebam/focus-notes-workspace", files: [".focus-notes/workspace.json"] });
    expect(state(await (await h.open()).retry("instance"), "instance").state).toBe("done");
    expect(h.gh.calls.some((c) => c.path.endsWith("/generate"))).toBe(false);

    const other = harness({ done: before("instance") });
    other.gh.add({ owner: "ada", name: "notes", files: ["index.html"] });
    expect(state(await (await other.open()).retry("instance"), "instance")).toMatchObject({ state: "failed", problem: "notInstance" });
  });

  it("private: makes it private, and never uses a public repository by that name", async () => {
    const h = harness({ done: before("private") });
    expect(state(await (await h.open()).retry("private"), "private").state).toBe("done");
    expect(h.gh.repo("notes-private")).toMatchObject({ private: true });
    expect(h.gh.calls).toContainEqual({ method: "POST", path: "/user/repos", body: expect.objectContaining({ name: "notes-private", private: true, auto_init: true }) });

    const pub = harness({ done: before("private") });
    pub.gh.add({ owner: "ada", name: "notes-private", private: false, files: ["README.md"] });
    expect(state(await (await pub.open()).retry("private"), "private")).toMatchObject({ state: "failed", problem: "notPrivate" });
  });

  it("deployKey: the public half read-only on the private repository, the private half sealed as the instance's secret", async () => {
    const h = harness({ done: before("deployKey") });
    const notes = h.gh.add({ owner: "ada", name: "notes", files: [".focus-notes/workspace.json"] });
    const priv = h.gh.add({ owner: "ada", name: "notes-private", private: true, files: ["README.md"] });
    const other = { id: 99, title: "My laptop", key: "ssh-ed25519 AAAAother", read_only: false };
    priv.keys.push(other, { id: 98, title: DEPLOY_KEY_TITLE, key: "ssh-ed25519 AAAAstale", read_only: true });
    const r = await (await h.open()).retry("deployKey");
    expect(state(r, "deployKey").state).toBe("done");
    // The key a run left behind is replaced; the person's own keys are untouched.
    expect(priv.keys.map((k) => k.title)).toEqual(["My laptop", DEPLOY_KEY_TITLE]);
    const key = priv.keys[1]!;
    expect(key.read_only).toBe(true);
    expect(key.key).not.toContain("AAAAstale");
    // Only GitHub's private key opens the secret, and what's inside is the deploy key's private half.
    expect(notes.secrets.get(SECRET_NAME)?.encrypted_value).not.toContain("OPENSSH");
    const secret = h.gh.openSecret(notes, SECRET_NAME)!;
    expect(samePair(secret, key.key)).toBe(true);
    // Neither half is in the progress file, the reports, or the log.
    const kept = readFileSync(h.progressFile, "utf8") + JSON.stringify(h.reports) + h.logs.join("\n");
    expect(kept).not.toContain(key.key.split(" ")[1]);
    expect(kept).not.toContain("PRIVATE KEY");
  });

  it("pages: turns on GitHub Pages with GitHub Actions as the source, or switches a site to it, and records the address", async () => {
    const h = harness({ done: before("pages") });
    const notes = h.gh.add({ owner: "ada", name: "notes", files: [".focus-notes/workspace.json"] });
    const r = await (await h.open()).retry("pages");
    expect(state(r, "pages").state).toBe("done");
    expect(notes.pages?.build_type).toBe("workflow");
    expect(r.site).toBe("https://ada.github.io/notes/");

    const legacy = harness({ done: before("pages") });
    const n2 = legacy.gh.add({ owner: "ada", name: "notes", files: [".focus-notes/workspace.json"] });
    n2.pages = { build_type: "legacy", html_url: "https://ada.github.io/notes/" };
    await (await legacy.open()).retry("pages");
    expect(n2.pages.build_type).toBe("workflow");
    expect(legacy.gh.calls.at(-2)).toMatchObject({ method: "PUT", path: "/repos/ada/notes/pages" });

    const off = harness({ done: before("pages"), options: { ...OPTIONS(), publish: false } });
    expect(state(await (await off.open()).retry("pages"), "pages").state).toBe("skipped");
    expect(off.gh.calls).toEqual([]);
  });
});

describe("FRE-08: every step can be retried on its own", () => {
  it("rerunning a done step is a no-op: nothing is called", async () => {
    const h = harness({ done: before("pages").concat("pages") });
    const e = await h.open();
    for (const id of ["account", "instance", "private", "deployKey", "pages"] as const) expect(state(await e.retry(id), id).state).toBe("done");
    expect(h.gh.calls).toEqual([]);
    expect(h.tokenAsked()).toBe(0);
  });

  it("a failed step says why and works when retried, without repeating the steps before it", async () => {
    const h = harness({ done: before("deployKey") });
    h.gh.add({ owner: "ada", name: "notes", files: [".focus-notes/workspace.json"] });
    const priv = h.gh.add({ owner: "ada", name: "notes-private", private: true, files: ["README.md"] });
    h.gh.fail("POST /repos/ada/notes-private/keys", 403, "Resource not accessible by personal access token");
    const e = await h.open();
    const failed = await e.retry("deployKey");
    expect(state(failed, "deployKey")).toEqual({ id: "deployKey", state: "failed", problem: "permission" });
    expect(priv.keys).toEqual([]);
    const ok = await e.retry("deployKey");
    expect(state(ok, "deployKey").state).toBe("done");
    expect(priv.keys).toHaveLength(1);
    expect(h.gh.calls.filter((c) => c.path === "/user" || c.path.endsWith("/generate"))).toEqual([]);
  });

  it("refuses to run a step whose earlier steps aren't complete", async () => {
    const h = harness({ done: ["account"] });
    const r = await (await h.open()).retry("deployKey");
    expect(state(r, "deployKey")).toMatchObject({ state: "failed", problem: "blocked" });
    expect(h.gh.calls).toEqual([]);
  });

  it("a missing template is the starter notes, not the sign-in: only a real 403 is about permissions", async () => {
    const h = harness({ done: before("instance") });
    h.gh.fail("POST /repos/prabinpebam/focus-notes-workspace/generate", 404, "Not Found");
    const e = await h.open();
    expect(state(await e.retry("instance"), "instance")).toEqual({ id: "instance", state: "failed", problem: "templateMissing" });
    expect(state(await e.retry("instance"), "instance").state).toBe("done");

    const k = harness({ done: before("deployKey") });
    k.gh.add({ owner: "ada", name: "notes", files: [".focus-notes/workspace.json"] });
    k.gh.add({ owner: "ada", name: "notes-private", private: true, files: ["README.md"] });
    k.gh.fail("POST /repos/ada/notes-private/keys", 404, "Not Found");
    expect(state(await (await k.open()).retry("deployKey"), "deployKey").problem).toBe("notFound");
  });

  it("maps GitHub's answers to problems", () => {
    expect(problemOf(new GitHubError(404, "Not Found"))).toBe("notFound");
    expect(problemOf(new GitHubError(403, "Resource not accessible by personal access token"))).toBe("permission");
    expect(problemOf(new GitHubError(403, "API rate limit exceeded"))).toBe("rateLimited");
    expect(problemOf(new GitHubError(429, "Too many"))).toBe("rateLimited");
    expect(problemOf(new GitHubError(401, "Bad credentials"))).toBe("auth");
    expect(problemOf(new GitHubError(0, "fetch failed"))).toBe("offline");
    expect(problemOf(new GitHubError(500, "Server error"))).toBe("failed");
    expect(problemOf(new Error("boom"))).toBe("failed");
  });

  it("says when GitHub can't be reached, or refused the sign-in, and asks the helper again after a refusal", async () => {
    const h = harness();
    h.gh.offline = true;
    const e = await h.open();
    expect(state(await e.start(OPTIONS()), "account").problem).toBe("offline");
    h.gh.offline = false;
    const wrong = harness({ token: "gho_revoked" });
    const w = await wrong.open();
    expect(state(await w.start(OPTIONS()), "account").problem).toBe("auth");
    await w.retry("account");
    expect(wrong.tokenAsked()).toBe(2);
  });
});

describe("FRE-08: progress survives quitting", () => {
  it("resumes from the saved progress: done steps aren't repeated, and a step that was running runs again", async () => {
    const h = harness();
    h.gh.fail("POST /user/repos", 500, "Server Error");
    const first = await h.open();
    const r = await first.start(OPTIONS());
    expect(r.steps.map((s) => s.state)).toEqual(["done", "done", "failed", "pending", "pending", "pending", "pending", "pending", "pending"]);
    const saved = JSON.parse(readFileSync(h.progressFile, "utf8"));
    expect(saved.steps.private).toEqual({ state: "failed", problem: "failed" });
    // Quit while the deploy key step was running.
    saved.steps.private = { state: "done" };
    saved.steps.deployKey = { state: "running" };
    writeFileSync(h.progressFile, JSON.stringify(saved));
    h.gh.add({ owner: "ada", name: "notes-private", private: true, files: ["README.md"] });
    const calls = h.gh.calls.length;
    const again = await h.open();
    expect(state(again.report(), "deployKey").state).toBe("pending");
    expect(again.report().login).toBe("ada");
    // Its first Git step stops it here (no Git in this test): the API steps before it ran once each.
    const r2 = await again.start(OPTIONS());
    expect(state(r2, "deployKey").state).toBe("done");
    expect(state(r2, "clone").state).toBe("failed");
    const newCalls = h.gh.calls.slice(calls).map((c) => `${c.method} ${c.path}`);
    expect(newCalls.some((c) => c.endsWith("/generate") || c === "POST /user/repos" || c === "GET /user")).toBe(false);
    expect(newCalls).toContain("PUT /repos/ada/notes/actions/secrets/PRIVATE_CONTENT_KEY");
  });

  it("refuses new names once steps are done, until reset", async () => {
    const h = harness({ done: ["account", "instance"] });
    const e = await h.open();
    await expect(e.start({ ...OPTIONS(), instance: "journal" })).rejects.toThrow(/reset/);
    const r = await e.reset();
    expect(r.steps.every((s) => s.state === "pending")).toBe(true);
    // Run setup again forgets the progress file itself (PRV-02, the data inventory).
    expect(existsSync(h.progressFile)).toBe(false);
  });

  it("checks the options: two different repository names GitHub accepts, and an absolute folder", () => {
    const folder = join(tmpdir(), "ws");
    expect(checkOptions({ instance: "notes", private: "notes-private", folder, publish: true })).toEqual({ instance: "notes", private: "notes-private", folder, publish: true });
    for (const bad of [{ instance: "notes", private: "Notes", folder, publish: true }, { instance: "../x", private: "p", folder, publish: true }, { instance: "a", private: "b", folder: "relative", publish: true }, { instance: "a", private: "b", folder }])
      expect(() => checkOptions(bad)).toThrow();
  });

  it("ignores a damaged progress file", async () => {
    const h = harness();
    mkdirSync(h.dir, { recursive: true });
    writeFileSync(h.progressFile, "{ not json");
    expect((await h.open()).report().steps.every((s) => s.state === "pending")).toBe(true);
    writeFileSync(h.progressFile, JSON.stringify({ version: 1, options: { instance: "a" }, steps: { account: { state: "done" } } }));
    expect((await h.open()).report().steps.every((s) => s.state === "pending")).toBe(true);
  });
});

describe("SEC-03: the token stays in memory", () => {
  it("never reaches the progress file, the reports, the log, or any URL; it's sent only as api.github.com's Authorization header", async () => {
    const h = harness();
    const e = await h.open();
    await e.start(OPTIONS());
    const kept = readFileSync(h.progressFile, "utf8") + JSON.stringify(h.reports) + h.logs.join("\n") + JSON.stringify(e.report());
    expect(kept).not.toContain(h.gh.token);
    expect(h.logs.length).toBeGreaterThan(0);
    for (const { url, init } of h.gh.raw) {
      expect(url.startsWith("https://api.github.com/")).toBe(true);
      expect(url).not.toContain(h.gh.token);
      expect(String(init?.body ?? "")).not.toContain(h.gh.token);
      expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${h.gh.token}`);
    }
  });
});
