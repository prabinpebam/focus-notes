/**
 * The share reader's side of sealing (WP-5.4, SHR-10, D-125): the magic link's address and fragment,
 * names matched whatever their case or spacing, and sessions that reopen a share with the derived key
 * alone (never the link secret or the passcode), until the grant expires or is withdrawn.
 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { randomBytes, SealError, SiteReader, toB64url, type ShareSession } from "../src/index.ts";
import { normalizeName, parseShareFragment, shareLink, type Grant } from "../src/grants.ts";
import { publish } from "../src/publish.ts";

const dirs: string[] = [];
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });

const PASSCODE = "orbit maple quiet river";
const salt = () => toB64url(randomBytes(16));
const grant = (over: Partial<Grant>): Grant => ({ id: "gshare001", name: "Sam Lee", salt: salt(), scope: {}, createdAt: "2026-10-01T00:00:00Z", ...over });
const notes = {
  "Work/drafts/Plan.md": "---\nid: n-plan\n---\n# The plan\n\nLaunch quietly on a Tuesday.\n",
  "Diary.md": "# Diary\n\nOnly the owner reads this.\n",
};

async function instance(grants: Grant[]) {
  const root = await mkdtemp(join(tmpdir(), "fn-share-reader-"));
  dirs.push(root);
  for (const [p, t] of Object.entries(notes)) {
    await mkdir(join(root, "private", "notes", ...p.split("/").slice(0, -1)), { recursive: true });
    await writeFile(join(root, "private", "notes", ...p.split("/")), t);
  }
  const write = (gs: Grant[]) => writeFile(join(root, "private", "access.json"), JSON.stringify({ version: 1, nameSalt: "c2FsdHNhbHRzYWx0c2FsdA", grants: gs }));
  await write(grants);
  await mkdir(join(root, "site"), { recursive: true });
  const reader = () => new SiteReader(async (p) => readFile(join(root, "site", ...p.split("/").map(decodeURIComponent)), "utf8").catch(() => undefined));
  const run = () => publish({ site: join(root, "site"), private: join(root, "private"), owner: "octo" });
  return { reader, run, write };
}

const generic = (p: Promise<unknown>) => p.then(() => { throw new Error("opened"); }, (e: unknown) => {
  expect(e).toBeInstanceOf(SealError);
  expect((e as SealError).code).toBe("key");
  expect((e as SealError).message).toBe("key");
});

describe("magic link addresses (SHR-10, D-125)", () => {
  it("puts the grant and its secret in the fragment of the site's /s/ page, never in the path", () => {
    const secret = toB64url(randomBytes(32));
    const url = new URL(shareLink("https://octo.github.io/notes/", "gshare001", secret));
    expect(url.origin + url.pathname).toBe("https://octo.github.io/notes/s/");
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#gshare001.${secret}`);
    expect(shareLink("https://octo.github.io/notes", "gshare001", secret)).toBe(url.href);
    expect(parseShareFragment(url.hash)).toEqual({ id: "gshare001", secret });
  });

  it("reads only well-formed fragments", () => {
    const secret = toB64url(randomBytes(32));
    for (const bad of ["", "#", "#gshare001", `#../vault.${secret}`, `#short.${secret}`, `#gshare001.${secret}x`, `#gshare001.${secret.slice(1)}`, `#gshare001.${secret}.x`, `#gshare001.${secret.replace(/./, "+")}`]) {
      expect(parseShareFragment(bad), bad).toBeUndefined();
    }
    expect(parseShareFragment(`gshare001.${secret}`)).toEqual({ id: "gshare001", secret });
  });
});

describe("names (SHR-10, D-125)", () => {
  it("match whatever their letter case or spacing", () => {
    for (const n of ["Sam Lee", "  sam lee ", "SAM   LEE", "Sam\tLee", "ｓａｍ　ｌｅｅ"]) expect(normalizeName(n), n).toBe("sam lee");
    expect(normalizeName("Sam Lee")).not.toBe(normalizeName("SamLee"));
  });
});

describe("share sessions (SHR-10, D-125)", () => {
  it("a link opens its scope and returns a session with the derived key, the grant, and its expiry, never the secret", async () => {
    const secret = toB64url(randomBytes(32));
    const i = await instance([grant({ link: { secret }, expiresAt: "2099-01-01T00:00:00.000Z", scope: { folders: ["Work/drafts/"] } })]);
    await i.run();
    const { share, session } = await i.reader().openLinkSession("gshare001", secret);
    expect(share.notes.map((n) => n.path)).toEqual(["drafts/Plan.md"]);
    expect(session).toMatchObject({ v: 1, via: "link", ref: "gshare001", expiresAt: "2099-01-01T00:00:00.000Z" });
    expect(JSON.stringify(session)).not.toContain(secret);
    // The session alone opens it again, in another tab or after a reload.
    const again = await new SiteReader(async () => undefined).resume(session).catch(() => undefined);
    expect(again).toBeUndefined();
    const reopened = await i.reader().resume(JSON.parse(JSON.stringify(session)));
    expect(await reopened.share.read("drafts/Plan.md")).toContain("Launch quietly");
  }, 30_000);

  it("a name and passcode open their scope whatever the name's case or spacing, and the session holds no name or passcode", async () => {
    const i = await instance([grant({ passcode: { value: PASSCODE }, scope: { notes: ["n-plan"] } })]);
    await i.run();
    const { share, session } = await i.reader().openPasscodeSession("  SAM   lee ", PASSCODE);
    expect(share.notes.map((n) => n.path)).toEqual(["Plan.md"]);
    expect(session).toMatchObject({ v: 1, via: "passcode", expiresAt: null });
    expect(session.ref).toMatch(/^[0-9a-f]{32}$/);
    const text = JSON.stringify(session).toLowerCase();
    expect(text).not.toContain("sam");
    expect(text).not.toContain("orbit");
    expect((await i.reader().resume(session)).share.notes).toHaveLength(1);
  }, 30_000);

  it("SHR-06: a withdrawn grant's session stops opening after the next publish, with the generic error", async () => {
    const secret = toB64url(randomBytes(32));
    const g = grant({ link: { secret }, passcode: { value: PASSCODE }, scope: { notes: ["n-plan"] } });
    const i = await instance([g]);
    await i.run();
    const viaLink = (await i.reader().openLinkSession("gshare001", secret)).session;
    const viaPasscode = (await i.reader().openPasscodeSession("Sam Lee", PASSCODE)).session;
    // Remembered keys survive a new build of the same grant...
    await i.run();
    await expect(i.reader().resume(viaLink)).resolves.toBeDefined();
    // ...but not its withdrawal.
    await i.write([{ ...g, revokedAt: "2026-10-10T00:00:00Z" }]);
    await i.run();
    await generic(i.reader().resume(viaLink));
    await generic(i.reader().resume(viaPasscode));
  }, 60_000);

  it("SHR-06: expired, damaged, or foreign sessions fail with the generic error, before any request", async () => {
    const secret = toB64url(randomBytes(32));
    const i = await instance([grant({ link: { secret }, scope: { notes: ["n-plan"] } })]);
    await i.run();
    const { session } = await i.reader().openLinkSession("gshare001", secret);
    const asked: string[] = [];
    const watching = new SiteReader(async (p) => { asked.push(p); return undefined; });
    const bad: unknown[] = [
      { ...session, expiresAt: "2020-01-01T00:00:00Z" },
      { ...session, ref: "../vault" },
      { ...session, via: "vault" },
      { ...session, key: toB64url(randomBytes(16)) },
      { ...session, v: 2 },
      { ...session, extra: 1 },
      null, "x", 42,
    ];
    for (const s of bad) await generic(watching.resume(s));
    expect(asked).toEqual([]);
    // A wrong key, or a link session moved onto another grant, opens nothing.
    await generic(i.reader().resume({ ...session, key: toB64url(randomBytes(32)) }));
    await generic(i.reader().resume({ ...session, ref: "gshare002" }));
    await generic(i.reader().resume({ ...session, via: "passcode", ref: "0".repeat(32) } satisfies ShareSession));
  }, 30_000);

  it("SHR-06: an expiry recorded in the keyring ends the session even before the nightly build", async () => {
    const secret = toB64url(randomBytes(32));
    const soon = new Date(Date.now() + 3000).toISOString();
    const i = await instance([grant({ link: { secret }, expiresAt: soon, scope: { notes: ["n-plan"] } })]);
    await i.run();
    const { session } = await i.reader().openLinkSession("gshare001", secret);
    expect(session.expiresAt).toBe(soon);
    await new Promise((r) => setTimeout(r, 3100));
    await generic(i.reader().resume(session));
    await generic(i.reader().openLinkSession("gshare001", secret));
  }, 30_000);
});
