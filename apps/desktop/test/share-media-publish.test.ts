/**
 * Images in code-shared notes end to end at the store level (WP-9.6, IMG-06, SHR-23): the publisher
 * seals what the note references, the reader opens it byte-exact, nothing plaintext reaches the site,
 * and withdrawing the share makes the image unreadable like the text.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { publish as publishSite } from "@focus-notes/seal/publish";
import { displayShareCode, SiteReader } from "@focus-notes/seal";
import { accessStore } from "../src/main/share/access.ts";
import { sharedImageDestinations } from "../src/main/share/media.ts";

const SITE = "https://ada.github.io/notes/";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("PRIVATE-PIXELS-7f3a")]);
const all = (dir: string): string[] => readdirSync(dir).flatMap((n) => statSync(join(dir, n)).isDirectory() ? all(join(dir, n)) : [join(dir, n)]);

it("WP-9.6: a code-shared note's image is sealed with it, opens byte-exact, leaks nothing and ends with the share", async () => {
  const base = mkdtempSync(join(tmpdir(), "fn-share-media-")), dir = join(base, "private"), published = join(base, "published");
  const read = (path: string) => { const f = join(published, ...path.split("/")); return Promise.resolve(existsSync(f) ? readFileSync(f, "utf8") : undefined); };
  const publish = () => publishSite({ private: dir, site: published, owner: "fixture", media: sharedImageDestinations });
  try {
    mkdirSync(join(dir, "notes", "Trips"), { recursive: true });
    mkdirSync(join(dir, "assets", "images"), { recursive: true });
    writeFileSync(join(dir, "assets", "images", "q7m4k2.png"), PNG);
    writeFileSync(join(dir, "notes", "Trips", "Lisbon.md"), "# Lisbon\n\n![Desk](../../assets/images/q7m4k2.png)\n");
    const s = accessStore({
      dir: () => dir, site: async () => SITE, write: async (f, t) => writeFileSync(f, t), written: () => {},
      writeNoteId: async (f, text) => writeFileSync(f, text),
      publish: async () => { await publish(); }, getSite: () => read,
    });
    const { id } = await s.apply({ op: "createItem", item: { path: "Trips/Lisbon.md", label: "Lisbon", folder: false, includeLater: false },
      notes: ["Trips/Lisbon.md"], link: true, passcode: { generate: true }, expiresAt: null });
    await s.ready(id);
    const grant = JSON.parse(readFileSync(join(dir, "access.json"), "utf8")).grants[0];

    for (const open of [
      () => new SiteReader(read).openLinkSession(id, grant.link.secret),
      () => new SiteReader(read).openAccessCode(`${displayShareCode(grant.shareCode)} ${grant.passcode.value}`),
    ]) {
      const { share } = await open();
      const [note] = share.notes;
      const text = await share.read(note!.path);
      const [ref] = sharedImageDestinations(text);
      const image = await share.media!(note!.path, ref!);
      expect(image.type).toBe("image/png");
      expect(Buffer.from(image.bytes).equals(PNG)).toBe(true);
    }
    for (const file of all(published)) {
      const body = readFileSync(file);
      expect(body.includes(Buffer.from("PRIVATE-PIXELS"))).toBe(false);
      expect(file.slice(published.length)).not.toMatch(/q7m4k2|Lisbon|Trips|\.png$/);
      expect(body.toString("utf8")).not.toMatch(/q7m4k2|assets\/images/);
    }

    await s.apply({ op: "withdraw", id });
    await publish();
    await expect(new SiteReader(read).openLinkSession(id, grant.link.secret)).rejects.toThrow();
    await expect(new SiteReader(read).openAccessCode(`${displayShareCode(grant.shareCode)} ${grant.passcode.value}`)).rejects.toThrow();
  } finally { rmSync(base, { recursive: true, force: true }); }
});

it("WP-9.6: a shared note whose image is missing blocks publication without naming it", async () => {
  const base = mkdtempSync(join(tmpdir(), "fn-share-media-")), dir = join(base, "private");
  try {
    mkdirSync(join(dir, "notes"), { recursive: true });
    mkdirSync(join(dir, "assets", "images"), { recursive: true });
    writeFileSync(join(dir, "notes", "Lisbon.md"), "---\nid: nabcdefghijklmnop\n---\n# Lisbon\n\n![Desk](../assets/images/gone7x.png)\n");
    const s = accessStore({ dir: () => dir, site: async () => SITE, write: async (f, t) => writeFileSync(f, t), written: () => {} });
    await s.apply({ op: "createItem", item: { path: "Lisbon.md", label: "Lisbon", folder: false, includeLater: false }, notes: ["Lisbon.md"], link: true, expiresAt: null });
    const error = await publishSite({ private: dir, site: join(base, "site"), owner: "fixture", media: sharedImageDestinations }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toMatch(/gone7x|Lisbon/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
