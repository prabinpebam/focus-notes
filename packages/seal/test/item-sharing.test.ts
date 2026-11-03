import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyAccessChange, expiryFrom, itemInviteText, type AccessChange } from "../src/access.ts";
import { parseAccessCode, SHARE_CODE, type AccessFile } from "../src/grants.ts";
import { SiteReader } from "../src/reader.ts";
import { publish } from "../src/publish.ts";
import { generatePasscode } from "../src/words.ts";

const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
const now = new Date();
const change = (later = false): AccessChange => ({
  op: "createItem", item: { path: "Confidential drafts", label: "Private project title", folder: true, includeLater: later },
  notes: ["Confidential drafts/one.md"], link: true, passcode: { generate: true }, expiresAt: expiryFrom("30d", now),
});
const apply = (a: AccessFile, later = false) => applyAccessChange(a, change(later), now, {
  generate: generatePasscode, resolvedItemNotes: { notes: ["Confidential drafts/one.md"], ids: ["one-id"] },
});

describe("item shares (SHR-14, SHR-16, SHR-23; MP.17/18)", () => {
  it("refuses unresolved item snapshots and Add them cannot authorize renderer paths as identities", () => {
    expect(() => applyAccessChange({ version: 1, grants: [] }, change(), now, { generate: generatePasscode })).toThrow("scope");
    const original = apply({ version: 1, grants: [] });
    const g = original.access.grants[0]!;
    const addition: AccessChange = { op: "addItemNotes", id: g.id, notes: ["Confidential drafts/one.md", "Confidential drafts/two.md"] };
    expect(() => applyAccessChange(original.access, addition)).toThrow("scope");
    const result = applyAccessChange(original.access, addition, now, { resolvedItemNotes: {
      grantId: g.id, notes: addition.notes, ids: ["one-id", "two-id"],
    } });
    expect(result.access.grants[0]).toMatchObject({ ...g, scope: { ids: ["one-id", "two-id"], notes: [], folders: [] },
      item: { ...g.item, notePaths: addition.notes } });
    expect(result.access.grants[0]!.link).toEqual(g.link);
  });
  it("rejects name-shaped item identifiers before generating public artifact paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "fn-item-opaque-")); dirs.push(root);
    const priv = join(root, "private"), site = join(root, "site");
    await mkdir(join(priv, "notes"), { recursive: true });
    const a = apply({ version: 1, grants: [] }).access;
    a.grants[0]!.id = "Confidential";
    await writeFile(join(priv, "access.json"), JSON.stringify(a));
    await expect(publish({ site, private: priv, owner: "fixture" })).rejects.toThrow("opaque");
  });
  it("refuses a duplicate snapshot identity introduced after sharing, with either BOM permutation", async () => {
    for (const bom of ["", "\uFEFF"]) {
      const root = await mkdtemp(join(tmpdir(), "fn-item-bom-")); dirs.push(root);
      const priv = join(root, "private"), folder = join(priv, "notes", "Confidential drafts");
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, "one.md"), `${bom}---\nid: one-id\n---\n# Shared original\n`);
      const a = apply({ version: 1, grants: [] }).access;
      a.grants[0]!.scope = { ids: ["one-id"], notes: [], folders: [] };
      await writeFile(join(priv, "access.json"), JSON.stringify(a));
      await publish({ site: join(root, "site"), private: priv, owner: "fixture" });
      await writeFile(join(priv, "notes", "unreviewed.md"), `${bom ? "" : "\uFEFF"}---\nid: one-id\n---\n# Unreviewed private replacement\n`);
      await expect(publish({ site: join(root, "site"), private: priv, owner: "fixture" })).rejects.toThrow("duplicated");
    }
  }, 30_000);
  it("copies only an enabled usable method and rejects old or unusable templates", () => {
    const template = "{title}\nOpen: {link}\nAt {site} enter {accessCode}\nUntil {expires}";
    const common = { title: "One", site: "https://site.example/s/", expires: "Tomorrow" };
    expect(itemInviteText(template, { ...common, link: "https://site.example/s/#opaque.secret" })).not.toContain("enter");
    expect(itemInviteText(template, { ...common, accessCode: "K7QM-4DRP four exact words" })).not.toContain("Open:");
    for (const bad of ["{title}", "{name} {link}", "{passcode}", "{accessCode}", "{site}"]) {
      expect(() => itemInviteText(bad, common)).toThrow("access:template");
    }
    expect(() => itemInviteText("{link}", { ...common, accessCode: "K7QM-4DRP words" })).toThrow("access:template.noWayIn");
  });
  it("creates opaque independent identities on each action, with a fixed snapshot by default", () => {
    const a = apply({ version: 1, grants: [] });
    const b = apply(a.access);
    const first = a.access.grants[0]!, second = b.access.grants[1]!;
    expect(first.id).not.toBe(second.id);
    expect(first.link?.secret).not.toBe(second.link?.secret);
    expect(first.shareCode).toMatch(SHARE_CODE);
    expect(first.shareCode).not.toBe(second.shareCode);
    expect(first.scope).toMatchObject({ ids: ["one-id"], notes: [], folders: [] });
    expect(second.scope).toEqual(first.scope);
    expect(b.access.grants[0]).toEqual(first);
    expect(apply({ version: 1, grants: [] }, true).access.grants[0]?.scope.folders).toEqual(["Confidential drafts"]);
  });

  it("parses identifier case/separators without changing any secret characters", () => {
    expect(parseAccessCode("k7qm-4drp  Mixed CASE  exact  words ")).toEqual({
      code: "K7QM4DRP", passcode: " Mixed CASE  exact  words ",
    });
    for (const bad of ["", "K7QM-4DRP", "../etc secret", "IIII-OOOO some passcode"]) expect(parseAccessCode(bad)).toBeUndefined();
  });

  it("publishes snapshot and following shares; new codes open without names and no legacy alias is emitted", async () => {
    const root = await mkdtemp(join(tmpdir(), "fn-item-share-"));
    dirs.push(root);
    const priv = join(root, "private");
    const noteDir = join(priv, "notes", "Confidential drafts");
    const site = join(root, "site");
    await mkdir(noteDir, { recursive: true });
    await writeFile(join(noteDir, "one.md"), "---\nid: one-id\n---\n# A private title\n\nA private sentence that must remain sealed.\n");
    let access = apply({ version: 1, grants: [] }).access;
    access = apply(access, true).access;
    const snapshot = access.grants[0]!, following = access.grants[1]!;
    await writeFile(join(priv, "access.json"), JSON.stringify(access));
    await publish({ site, private: priv, owner: "fixture" });
    await writeFile(join(noteDir, "two.md"), "# Another private note\n");
    const result = await publish({ site, private: priv, owner: "fixture" });
    const reader = () => new SiteReader(async (p) => readFile(join(site, ...p.split("/")), "utf8").catch(() => undefined));
    const one = await reader().openAccessCode(`${snapshot.shareCode} ${snapshot.passcode!.value}`);
    const two = await reader().openAccessCode(`${following.shareCode} ${following.passcode!.value}`);
    expect(one.share.notes).toHaveLength(1);
    expect(two.share.notes).toHaveLength(2);
    expect(one.session).toMatchObject({ via: "code", ref: snapshot.shareCode });
    expect(one.session.key.extractable).toBe(false);
    expect((await reader().resume(one.session)).share.notes).toHaveLength(1);
    const files = await readdir(join(site, "_access", result.build), { recursive: true });
    expect(files.some((f) => String(f).startsWith("p"))).toBe(false);
    expect(files.join("\n")).not.toContain("Confidential");
    await expect(reader().openAccessCode(`${snapshot.shareCode} wrong words`)).rejects.toThrow("key");
  }, 30_000);
});
