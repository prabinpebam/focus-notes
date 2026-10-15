/**
 * The desktop's access.json store and secret clipboard (WP-5.3, D-134, security review of 7ba389a):
 * the window's listing carries no secrets (L2), a link or passcode is revealed for one invite at a
 * time and copied by the main process (L1), passcodes are made here (L5), a damaged file's error
 * never quotes it (L6), and the clipboard is cleared after 90 s if it still holds the secret (L1).
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { accessStore, siteFromGitConfig } from "../src/main/share/access.ts";
import { secretClipboard } from "../src/main/share/clipboard.ts";

const SITE = "https://ada.github.io/notes/";
function store(text?: string) {
  const dir = join(mkdtempSync(join(tmpdir(), "fn-access-")), "private");
  mkdirSync(dir);
  if (text !== undefined) writeFileSync(join(dir, "access.json"), text);
  const written: string[] = [];
  const s = accessStore({ dir: () => dir, site: async () => SITE, write: async (f, t) => writeFileSync(f, t), written: (f) => void written.push(f) });
  return { s, dir, written, file: () => JSON.parse(readFileSync(join(dir, "access.json"), "utf8")) };
}
const create = (passcode?: unknown) => ({ op: "create", audience: { name: "Asha", link: true, ...(passcode ? { passcode } : {}), scope: { notes: ["a.md"], folders: [] }, expiresAt: null } });

describe("the window's view of access.json", () => {
  it("lists audiences without any secret (L2), and makes passcodes here (L5)", async () => {
    const t = store();
    const r = await t.s.apply(create({ generate: true }));
    const g = t.file().grants[0];
    expect(g.passcode.generated).toBe(true);
    expect(g.passcode.value).toMatch(/^[a-z]+(-[a-z]+){3}$/);
    const listed = JSON.stringify(await t.s.load()) + JSON.stringify(r);
    for (const secret of [g.link.secret, g.passcode.value, g.salt]) expect(listed).not.toContain(secret);
    expect(r.grants[0]).toMatchObject({ id: g.id, name: "Asha", link: true, passcode: true });
    expect(t.written).toEqual([join(t.dir, "access.json")]);
  });
  it("reveals one audience's link and passcode, for its invite", async () => {
    const t = store();
    const { id } = await t.s.apply(create({ value: "blue tractor singing 42" }));
    const g = t.file().grants[0];
    expect(await t.s.reveal(id)).toEqual({ link: `${SITE}s/#${id}.${g.link.secret}`, passcode: "blue tractor singing 42" });
    await expect(t.s.reveal("snosuchgrant")).rejects.toThrow();
  });
  it("fills the invite's secrets itself, from a template the window sends", async () => {
    const t = store();
    const { id } = await t.s.apply(create({ generate: true }));
    const g = t.file().grants[0];
    const text = await t.s.secret(id, "invite", { template: "Hi {name}\nOpen {link}\nPasscode {passcode} at {site}", values: { name: "Asha" } });
    expect(text).toBe(`Hi Asha\nOpen ${SITE}s/#${id}.${g.link.secret}\nPasscode ${g.passcode.value} at ${SITE}s/`);
    expect(await t.s.secret(id, "passcode")).toBe(g.passcode.value);
    await expect(t.s.secret(id, "invite", { template: 3, values: {} })).rejects.toThrow();
  });
  it("never quotes a damaged file in its error (L6)", async () => {
    const t = store('{ "version": 1, "grants": [ "hunter2-secret');
    const e = await t.s.load().catch((x: Error) => x);
    expect(String(e)).toContain("private/access.json couldn't be read");
    expect(String(e)).not.toContain("hunter2");
  });
  it("finds the Pages site from origin", () => {
    expect(siteFromGitConfig('[remote "origin"]\n\turl = https://github.com/Ada/notes.git\n')).toBe("https://ada.github.io/notes/");
    expect(siteFromGitConfig('[remote "origin"]\n\turl = git@github.com:ada/ada.github.io.git\n')).toBe("https://ada.github.io/");
    expect(siteFromGitConfig('[remote "origin"]\n\turl = /tmp/notes.git\n')).toBeUndefined();
  });
});

describe("the secret clipboard (L1)", () => {
  function fake() {
    let text = "";
    const timers: (() => void)[] = [];
    const c = secretClipboard({ writeText: (t) => void (text = t), readText: () => text, clear: () => void (text = "") }, { after: (fn) => void timers.push(fn) });
    return { c, read: () => text, set: (t: string) => void (text = t), fire: () => timers.splice(0).forEach((f) => f()) };
  }
  it("clears the secret after the wait, if it's still there", () => {
    const f = fake();
    f.c.write("secret-words");
    expect(f.read()).toBe("secret-words");
    f.fire();
    expect(f.read()).toBe("");
  });
  it("leaves whatever was copied since", () => {
    const f = fake();
    f.c.write("secret-words");
    f.set("something else");
    f.fire();
    expect(f.read()).toBe("something else");
  });
});
