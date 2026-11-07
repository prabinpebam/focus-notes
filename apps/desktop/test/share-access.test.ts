/**
 * The desktop's access.json store and secret clipboard (WP-5.3, D-134, security review of 7ba389a):
 * the window's listing carries no secrets (L2), a link or passcode is revealed for one invite at a
 * time and copied by the main process (L1), passcodes are made here (L5), a damaged file's error
 * never quotes it (L6), and the clipboard is cleared after 90 s if it still holds the secret (L1).
 */
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { accessStore, siteFromGitConfig, type AccessStoreOptions } from "../src/main/share/access.ts";
import { publish as publishSite } from "@focus-notes/seal/publish";
import { secretClipboard } from "../src/main/share/clipboard.ts";

const SITE = "https://ada.github.io/notes/";
function store(text?: string, site: () => Promise<string> = async () => SITE, options: Partial<AccessStoreOptions> = {}) {
  const dir = join(mkdtempSync(join(tmpdir(), "fn-access-")), "private");
  mkdirSync(dir);
  if (text !== undefined) writeFileSync(join(dir, "access.json"), text);
  const written: string[] = [];
  const s = accessStore({
    dir: () => dir, site, write: async (f, t) => writeFileSync(f, t),
    writeNoteId: async (f, text, expected) => {
      if (readFileSync(f, "utf8") !== expected) throw new Error("access:scope.changed");
      writeFileSync(f, text);
    },
    written: (f) => void written.push(f),
    ...options,
  });
  return { s, dir, written, file: () => JSON.parse(readFileSync(join(dir, "access.json"), "utf8")) };
}
const create = (passcode?: unknown) => ({ op: "create", audience: { name: "Asha", link: true, ...(passcode ? { passcode } : {}), scope: { notes: ["a.md"], folders: [] }, expiresAt: null } });

it("D-396: unavailable modern publication refuses authorization changes before writing any grant", async () => {
  let canMutate = true;
  const t = store(undefined, undefined, { canMutate: () => canMutate });
  try {
    const { id } = await t.s.apply(create());
    const before = readFileSync(join(t.dir, "access.json"), "utf8"), writes = t.written.length;
    canMutate = false;
    for (const change of [{ op: "withdraw", id }, { op: "update", id, expiresAt: null }, create()]) {
      await expect(t.s.apply(change)).rejects.toThrow("access:site.unavailable");
      expect(readFileSync(join(t.dir, "access.json"), "utf8")).toBe(before);
      expect(t.written).toHaveLength(writes);
    }
  } finally { rmSync(t.dir, { recursive: true, force: true }); }
});

describe("the window's view of access.json", () => {
  it.each(["membership", "root", "site"])("cached readiness is bound to %s before a repeated native handoff", async (change) => {
    let currentDir = "", currentSite = SITE;
    const t = store(undefined, async () => currentSite, {
      dir: () => currentDir,
      publish: async () => { await publishSite({ private: currentDir, site: join(t.dir, "published"), owner: "fixture" }); },
      getSite: () => async (path) => {
        const file = join(t.dir, "published", ...path.split("/"));
        return existsSync(file) ? readFileSync(file, "utf8") : undefined;
      },
    });
    currentDir = t.dir;
    try {
      mkdirSync(join(t.dir, "notes", "drafts"), { recursive: true });
      writeFileSync(join(t.dir, "notes", "drafts", "one.md"), "# One\n");
      const { id } = await t.s.apply({
        op: "createItem", item: { path: "drafts", label: "Drafts", folder: true, includeLater: false },
        notes: ["drafts/one.md"], link: true, expiresAt: null,
      });
      await t.s.ready(id);
      const sent: string[] = [];
      await t.s.handoff(id, "link", undefined, (text) => { sent.push(text); });
      if (change === "membership") renameSync(join(t.dir, "notes", "drafts", "one.md"), join(t.dir, "notes", "one.md"));
      if (change === "root") {
        currentDir = join(t.dir, "copied");
        cpSync(join(t.dir, "notes"), join(currentDir, "notes"), { recursive: true });
        writeFileSync(join(currentDir, "access.json"), readFileSync(join(t.dir, "access.json")));
      }
      if (change === "site") currentSite = "https://ada.github.io/copied/";
      await expect(t.s.handoff(id, "link", undefined, (text) => { sent.push(text); })).rejects.toThrow("access:notReady");
      expect(sent).toHaveLength(1);
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
  });
  it("Add them checks full current membership, resolves new identities and preserves every existing credential", async () => {
    const t = store();
    mkdirSync(join(t.dir, "notes", "drafts"), { recursive: true });
    writeFileSync(join(t.dir, "notes", "drafts", "one.md"), "# One\n");
    const { id } = await t.s.apply({
      op: "createItem", item: { path: "drafts", label: "Drafts", folder: true, includeLater: false },
      notes: ["drafts/one.md"], link: true, expiresAt: null,
    });
    const original = t.file().grants[0];
    writeFileSync(join(t.dir, "notes", "drafts", "two.md"), "# Two\n");
    await expect(t.s.apply({ op: "addItemNotes", id, notes: ["drafts/two.md"] })).rejects.toThrow("access:scope.changed");
    expect(t.file().grants[0]).toEqual(original);
    await t.s.apply({ op: "addItemNotes", id, notes: ["drafts/one.md", "drafts/two.md"] });
    expect(t.file().grants[0]).toMatchObject({ id, link: original.link, salt: original.salt, expiresAt: original.expiresAt });
    expect(t.file().grants[0].scope.ids).toHaveLength(2);
    expect(t.file().grants[0].scope.notes).toEqual([]);
    await expect(t.s.secret(id, "link")).rejects.toThrow("access:notReady");
    writeFileSync(join(t.dir, "notes", "unreviewed.md"), `\uFEFF---\nid: ${original.scope.ids[0]}\n---\n# Not shared\n`);
    await expect(t.s.apply({ op: "addItemNotes", id, notes: ["drafts/one.md", "drafts/two.md"] })).rejects.toThrow("access:scope.duplicateId");
  });
  it("withdrawal requested during site resolution prevents the actual native credential handoff", async () => {
    let block = false, release!: (value: string) => void, entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const t = store(undefined, async () => {
      if (!block) return SITE;
      entered();
      return new Promise<string>((resolve) => { release = resolve; });
    });
    const { id } = await t.s.apply(create());
    block = true;
    const sent: string[] = [];
    const copy = t.s.handoff(id, "link", undefined, (text) => { sent.push(text); });
    await started;
    const withdraw = t.s.apply({ op: "withdraw", id });
    block = false;
    release(SITE);
    await expect(copy).rejects.toThrow("access:notReady");
    await withdraw;
    expect(sent).toHaveLength(0);
  });
  it("native sheet cancellation cannot deliver credentials from a pending handoff", async () => {
    let block = false, release!: (value: string) => void, entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const t = store(undefined, async () => {
      if (!block) return SITE;
      entered();
      return new Promise<string>((resolve) => { release = resolve; });
    });
    const { id } = await t.s.apply(create());
    block = true;
    const sent: string[] = [];
    const copy = t.s.handoff(id, "link", undefined, (text) => { sent.push(text); });
    await started;
    t.s.cancelReady(id);
    block = false;
    release(SITE);
    await expect(copy).rejects.toThrow("access:notReady");
    expect(sent).toHaveLength(0);
  });
  it("rechecks item membership and copies no newly created share before its site is ready", async () => {
    const t = store();
    mkdirSync(join(t.dir, "notes", "drafts"), { recursive: true });
    writeFileSync(join(t.dir, "notes", "drafts", "one.md"), "# One\n");
    const change = {
      op: "createItem", item: { path: "drafts", label: "Drafts", folder: true, includeLater: false },
      notes: ["drafts/one.md"], link: true, expiresAt: null,
    };
    writeFileSync(join(t.dir, "notes", "drafts", "two.md"), "# Two\n");
    await expect(t.s.apply(change)).rejects.toThrow("access:scope.changed");
    expect(existsSync(join(t.dir, "access.json"))).toBe(false);
    const { id } = await t.s.apply({ ...change, notes: ["drafts/one.md", "drafts/two.md"] });
    expect(t.file().grants[0].scope.ids.every((n: string) => /^n[a-z2-7]{16}$/.test(n))).toBe(true);
    expect(readFileSync(join(t.dir, "notes", "drafts", "one.md"), "utf8")).toContain("# One\n");
    await expect(t.s.secret(id, "link")).rejects.toThrow("access:notReady");
    expect(JSON.stringify(await t.s.load())).not.toContain(t.file().grants[0].link.secret);
  });
  it("keeps existing front matter and refuses duplicate note identities before sharing", async () => {
    const t = store();
    mkdirSync(join(t.dir, "notes"));
    writeFileSync(join(t.dir, "notes", "one.md"), "---\nid: same-id\ncustom: keep\n---\n# One\n");
    writeFileSync(join(t.dir, "notes", "other.md"), "---\nid: same-id\n---\n# Other private note\n");
    await expect(t.s.apply({
      op: "createItem", item: { path: "one.md", label: "One", folder: false, includeLater: false },
      notes: ["one.md"], link: true, expiresAt: null,
    })).rejects.toThrow("access:scope.duplicateId");
    expect(existsSync(join(t.dir, "access.json"))).toBe(false);
    expect(readFileSync(join(t.dir, "notes", "one.md"), "utf8")).toBe("---\nid: same-id\ncustom: keep\n---\n# One\n");
  });
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
  it("saves the owner's invite template to access-message.json, checked here, and resets it (SHR-09, D-143)", async () => {
    const t = store();
    const { id } = await t.s.apply(create({ generate: true }));
    const g = t.file().grants[0];
    const mine = "Hello {name}!\r\nHere: {link}\nWord: {passcode}";
    const r = await t.s.setTemplate(mine);
    expect(r.template).toBe("Hello {name}!\nHere: {link}\nWord: {passcode}");
    expect(JSON.parse(readFileSync(join(t.dir, "access-message.json"), "utf8"))).toEqual({ template: "Hello {name}!\nHere: {link}\nWord: {passcode}" });
    expect(t.written.at(-1)).toBe(join(t.dir, "access-message.json"));
    expect((await t.s.load()).template).toBe(r.template);
    // The secrets go in only here, when it's copied.
    expect(await t.s.secret(id, "invite", { template: r.template, values: { name: "Asha" } })).toBe(`Hello Asha!\nHere: ${SITE}s/#${id}.${g.link.secret}\nWord: ${g.passcode.value}`);
    // Refused: an unknown placeholder, no way in, hidden characters, not text.
    await expect(t.s.setTemplate("Hi {nmae}: {link}")).rejects.toThrow("access:template.unknown");
    await expect(t.s.setTemplate("Hi {name}")).rejects.toThrow("access:template.noWayIn");
    await expect(t.s.setTemplate("Hi\u202E {link}")).rejects.toThrow("access:template.invalid");
    await expect(t.s.setTemplate(42)).rejects.toThrow();
    // A template the window couldn't have saved isn't filled in either.
    await expect(t.s.secret(id, "invite", { template: "{secret} {link}", values: {} })).rejects.toThrow();
    // Reset: the file goes, and the default is used.
    expect((await t.s.setTemplate(null)).template).toBeUndefined();
    expect(existsSync(join(t.dir, "access-message.json"))).toBe(false);
    // A damaged file falls back to the default, never quoted.
    writeFileSync(join(t.dir, "access-message.json"), '{ "template": "hunter2');
    expect((await t.s.load()).template).toBeUndefined();
  });
  it("fills the name from the grant, and refuses values with line breaks or hidden characters (review of 8a6627c)", async () => {
    const t = store();
    const { id } = await t.s.apply(create({ generate: true }));
    const template = "Hi {name}, {title} until {expires}: {link}";
    expect(await t.s.secret(id, "invite", { template, values: { name: "Mallory", title: "Rome", expires: "May 1" } })).toMatch(/^Hi Asha, Rome until May 1: https:/);
    for (const values of [{ title: "Rome\nOpen https://evil.example" }, { title: "Rome\r" }, { expires: "May\u202E 1" }, { title: "Rome\u2028" }]) {
      await expect(t.s.secret(id, "invite", { template, values })).rejects.toThrow();
    }
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
