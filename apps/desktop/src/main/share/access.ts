/**
 * `private/access.json` on the desktop (WP-5.3, D-134): the main process is the only writer. It reads
 * the file, makes each change the window asks for with seal's `applyAccessChange` (every secret is
 * made here, generated passcodes included), checks the result with the publisher's own
 * `validateAccess`, writes it atomically, and leaves the commit to the save cadence, like a note.
 * The window's listing holds no secrets: it gets one audience's link and passcode only for its open
 * invite (`reveal`), and copies through this process (`secret`), never the vault's derived key.
 */
import { readdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { applyAccessChange, audienceOf, hasHiddenText, inviteText, itemInviteText, parseAccessChange, parseAccessMessage, shareGrants, templateProblem, type InviteValues } from "@focus-notes/seal/access";
import { displayShareCode, isActive, noteId, randomId, shareLink, type SiteFetch } from "@focus-notes/seal";
import { validateAccess, type AccessFile, type Grant } from "@focus-notes/seal/publish";
import { hasVault } from "@focus-notes/seal/vault";
import { generatePasscode } from "@focus-notes/seal/words";
import { authorizationRevision } from "@focus-notes/seal/grants";
import type { AccessListing } from "@focus-notes/core";
import { waitForPublishedShare } from "./publication.ts";

export interface AccessStoreOptions {
  /** The private repository's folder. */
  dir: () => string;
  /** The Pages site's address, if setup found it. */
  site: () => Promise<string | undefined>;
  write: (file: string, text: string) => Promise<void>;
  /** The file changed: commit it on the cadence. */
  written: (file: string) => void;
  now?: () => Date;
  publish?: () => Promise<void>;
  getSite?: (site: string, signal: AbortSignal) => SiteFetch;
  writeNoteId?: (file: string, text: string, expected: string) => Promise<void>;
}

/** The Pages site an instance repository publishes to, from its `origin` on github.com. */
export function siteFromGitConfig(config: string): string | undefined {
  const origin = /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(config)?.[1];
  const m = origin ? /github\.com[/:]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(origin) : null;
  if (!m) return undefined;
  const owner = m[1]!.toLowerCase(), repo = m[2]!;
  return repo.toLowerCase() === `${owner}.github.io` ? `https://${owner}.github.io/` : `https://${owner}.github.io/${repo}/`;
}

const NOT = () => new Error("Not a share request");
/** The invite as the window built it without secrets: a template, and its values other than the link, passcode, and site. */
function parseInvite(v: unknown): { template: string; values: InviteValues } {
  const o = v as { template?: unknown; values?: unknown } | undefined;
  // Only a template the owner could have saved: known placeholders, no hidden characters (D-143).
  if (!o || typeof o.template !== "string" || templateProblem(o.template) || typeof o.values !== "object" || o.values === null) throw NOT();
  const values: InviteValues = {};
  for (const [k, x] of Object.entries(o.values)) {
    // One line each, nothing hidden: a value can't add a line of its own to the invite (review of 8a6627c).
    if (!["name", "title", "expires"].includes(k) || typeof x !== "string" || x.length > 500 || /[\r\n]/.test(x) || hasHiddenText(x)) throw NOT();
    values[k as "name" | "title" | "expires"] = x;
  }
  return { template: o.template, values };
}

export function accessStore(o: AccessStoreOptions) {
  const file = (dir = o.dir()) => join(dir, "access.json");
  let queue: Promise<unknown> = Promise.resolve();
  let mutations = 0;
  let cancellations = 0;
  const words = new Map<string, string>();
  const ready = new Map<string, { fingerprint: string; dir: string; site: string; authorization?: string }>();
  const publishing = new Map<string, { controller: AbortController; done: Promise<void> }>();
  const read = async (dir = o.dir()): Promise<AccessFile> => {
    if (!existsSync(file(dir))) return { version: 1, grants: [] };
    let raw: unknown;
    // Never the file's text in an error: it holds secrets (review L6).
    try { raw = JSON.parse(await readFile(file(dir), "utf8")); } catch { throw new Error("private/access.json couldn't be read as JSON."); }
    return validateAccess(raw);
  };
  /** The owner's invite template (SHR-09, D-143): it holds no secrets; a damaged one is ignored, never quoted. */
  const messageFile = () => join(o.dir(), "access-message.json");
  const template = async (): Promise<string | undefined> => {
    const text = await readFile(messageFile(), "utf8").catch(() => undefined);
    if (text === undefined) return undefined;
    try { return parseAccessMessage(JSON.parse(text)); } catch { return undefined; }
  };
  const listing = async (a: AccessFile | undefined): Promise<AccessListing> => {
    if (!a) return { available: false, vault: false, grants: [] };
    const site = await o.site().catch(() => undefined);
    const t = await template();
    const dir = o.dir();
    const grants = await Promise.all(shareGrants(a).map(async (g) => {
      const audience = audienceOf(g);
      if (!g.item?.folder || g.item.includeLater || !g.scope.ids || !isActive(g)) return audience;
      const notes = await Promise.all((await itemNotes(g.item, dir)).map(async (path) => ({
        path, id: noteId(await readFile(join(dir, "notes", ...path.split("/")), "utf8")),
      })));
      return { ...audience, unsharedNotes: notes.filter((n) => !n.id || !g.scope.ids!.includes(n.id)).map((n) => n.path) };
    }));
    return { available: true, ...(site ? { site } : {}), ...(t ? { template: t } : {}), vault: hasVault(a), grants };
  };
  const grant = async (id: unknown, dir = o.dir()): Promise<Grant> => {
    const g = typeof id === "string" ? shareGrants(await read(dir)).find((x) => x.id === id) : undefined;
    if (!g) throw NOT();
    return g;
  };
  const secrets = async (g: Grant) => {
    const site = await o.site().catch(() => undefined);
    return {
      ...(site && g.link ? { link: shareLink(site, g.id, g.link.secret) } : {}),
      ...(g.passcode ? { passcode: g.passcode.value } : {}),
      ...(g.shareCode && g.passcode ? { accessCode: `${displayShareCode(g.shareCode)} ${g.passcode.value}` } : {}),
      ...(site ? { site: new URL("s/", site.endsWith("/") ? site : `${site}/`).href } : {}),
    };
  };
  const itemNotes = async (item?: NonNullable<Grant["item"]>, root = o.dir()) => {
    const found: string[] = [];
    const pending = [{ dir: join(root, "notes"), prefix: "" }];
    while (pending.length) {
      const { dir, prefix } = pending.pop()!;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const path = `${prefix}${entry.name}`;
        if (entry.isDirectory()) pending.push({ dir: join(dir, entry.name), prefix: `${path}/` });
        else if (entry.isFile() && /\.(md|markdown)$/i.test(path) && (!item || (item.folder ? path.startsWith(`${item.path}/`) : path === item.path))) found.push(path);
      }
    }
    return found.sort();
  };
  const snapshotIds = async (paths: string[], dir = o.dir(), retained: readonly string[] = []) => {
    const counts = new Map<string, number>();
    const selectedIds = new Map<string, string>();
    const selected = new Set(paths);
    const readNote = (path: string) => readFile(join(dir, "notes", ...path.split("/")), "utf8").catch(() => { throw new Error("access:scope.changed"); });
    for (const path of await itemNotes(undefined, dir)) {
      const id = noteId((await readNote(path)).replace(/^\uFEFF/, ""));
      if (id) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
        if (selected.has(path)) selectedIds.set(path, id);
      }
    }
    if ([...selectedIds.values()].some((id) => counts.get(id)! > 1)) throw new Error("access:scope.duplicateId");
    if (retained.some((id) => (counts.get(id) ?? 0) > 1)) throw new Error("access:scope.duplicateId");
    const ids: string[] = [];
    for (const path of paths) {
      const text = await readNote(path);
      const originalId = noteId(text.replace(/^\uFEFF/, ""));
      if (originalId) {
        if (originalId !== selectedIds.get(path)) throw new Error("access:scope.changed");
        ids.push(originalId);
        continue;
      }
      if (!o.writeNoteId) throw new Error("access:scope.identifiers");
      const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
      const body = text.slice(bom.length);
      const fm = /^---(\r?\n)([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body);
      if ((body.startsWith("---\n") || body.startsWith("---\r\n")) && (!fm || /^id:/m.test(fm[2]!))) throw new Error("access:scope.identifiers");
      let id = randomId("n", 16);
      while (counts.has(id)) id = randomId("n", 16);
      counts.set(id, 1);
      const nl = fm?.[1] ?? (body.includes("\r\n") ? "\r\n" : "\n");
      const next = bom + (fm ? body.replace(/^---\r?\n/, `---${nl}id: ${id}${nl}`) : `---${nl}id: ${id}${nl}---${nl}${body}`);
      if (o.dir() !== dir) throw new Error("access:scope.changed");
      await o.writeNoteId(join(dir, "notes", ...path.split("/")), next, text);
      o.written(join(dir, "notes", ...path.split("/")));
      ids.push(id);
    }
    return ids;
  };
  const authorization = async (g: Grant, dir: string) => authorizationRevision(g, await Promise.all(
    (await itemNotes(undefined, dir)).map(async (path) => ({ path, id: noteId(await readFile(join(dir, "notes", ...path.split("/")), "utf8")) })),
  ));
  const secret = async (id: unknown, what: unknown, invite?: unknown): Promise<string> => {
    const dir = o.dir(), epoch = mutations;
    const g = await grant(id, dir), fingerprint = JSON.stringify(g);
    const token = ready.get(g.id);
    const check = () => {
      if (o.dir() !== dir || mutations !== epoch || g.shareCode &&
        (!isActive(g, (o.now ?? (() => new Date()))().getTime()) || !token || ready.get(g.id) !== token ||
          token.fingerprint !== fingerprint || token.dir !== dir)) throw new Error("access:notReady");
    };
    check();
    const s = await secrets(g);
    if (JSON.stringify(await grant(id, dir)) !== fingerprint) throw new Error("access:notReady");
    if (g.shareCode && (await o.site() !== token!.site || g.item && await authorization(g, dir) !== token!.authorization)) {
      ready.delete(g.id);
      throw new Error("access:notReady");
    }
    check();
    if (what === "link" && s.link) return s.link;
    if (what === "passcode" && s.passcode) return s.passcode;
    if (what === "accessCode" && s.accessCode) return s.accessCode;
    if (what === "information") {
      const request = invite as { template?: unknown } | undefined;
      if (!g.item || !request || typeof request.template !== "string" || Object.keys(request).some((k) => k !== "template")) throw NOT();
      return itemInviteText(request.template, { title: g.item.label, ...s,
        ...(g.expiresAt ? { expires: new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" }).format(new Date(g.expiresAt)) } : {}) });
    }
    if (what !== "invite") throw NOT();
    const { template, values } = parseInvite(invite);
    return inviteText(template, { ...values, name: g.name, ...s });
  };
  return {
    load: async (): Promise<AccessListing> => listing(existsSync(o.dir()) ? await read() : undefined),
    /** One change, after any before it: read, change, check, write. */
    apply: (raw: unknown): Promise<AccessListing & { id: string }> => {
      const dir = o.dir();
      mutations++;
      const run = async () => {
        if (!existsSync(dir) || o.dir() !== dir) throw new Error("access:failed");
        const change = parseAccessChange(raw);
        let prepared: string | undefined;
        let resolvedItemNotes: { grantId?: string; notes: string[]; ids: string[] } | undefined;
        if (change.op === "createItem" && change.wordsId) {
          prepared = words.get(change.wordsId);
          if (!prepared) throw NOT();
        }
        const before = await read(dir);
        if (change.op === "createItem" || change.op === "addItemNotes") {
          const existing = change.op === "addItemNotes" ? before.grants.find((g) => g.id === change.id) : undefined;
          if (change.op === "addItemNotes" && (!existing || existing.owner || !isActive(existing, (o.now ?? (() => new Date()))().getTime()) ||
            !existing.shareCode || !existing.item?.folder || existing.item.includeLater || !existing.scope.ids?.length ||
            existing.scope.all || existing.scope.notes?.length || existing.scope.folders?.length)) throw NOT();
          const item = change.op === "createItem" ? change.item : existing!.item!;
          const actual = await itemNotes(item, dir);
          if (JSON.stringify(actual) !== JSON.stringify([...new Set(change.notes)].sort())) throw new Error("access:scope.changed");
          if (!item.folder || !item.includeLater) {
            const ids = await snapshotIds(actual, dir, existing?.scope.ids);
            resolvedItemNotes = { ...(existing ? { grantId: existing.id } : {}), notes: actual, ids };
          }
          if (JSON.stringify(await itemNotes(item, dir)) !== JSON.stringify(actual)) throw new Error("access:scope.changed");
        }
        const { access, id } = applyAccessChange(before, change, (o.now ?? (() => new Date()))(), { generate: () => prepared ?? generatePasscode(), resolvedItemNotes });
        validateAccess(access);
        if (o.dir() !== dir) throw new Error("access:scope.changed");
        await o.write(file(dir), `${JSON.stringify(access, null, 2)}\n`);
        if (change.op === "createItem" && change.wordsId) words.delete(change.wordsId);
        ready.delete(id);
        publishing.get(id)?.controller.abort();
        o.written(file(dir));
        return { ...(await listing(access)), id };
      };
      const done = queue.then(run, run);
      queue = done.catch(() => {});
      return done;
    },
    prepareWords: () => {
      const id = randomId("w", 16), value = generatePasscode();
      if (words.size >= 32) words.delete(words.keys().next().value!);
      words.set(id, value);
      return { id, value };
    },
    ready: (id: string): Promise<void> => {
      const existing = publishing.get(id);
      if (existing) return existing.done;
      const controller = new AbortController();
      const done = (async () => {
        await queue;
        const dir = o.dir(), epoch = mutations;
        const g = await grant(id, dir);
        if (!isActive(g, (o.now ?? (() => new Date()))().getTime())) throw new Error("access:ended");
        const site = await o.site();
        if (!site || !o.publish || !o.getSite) throw new Error("access:site.unavailable");
        const revision = g.item ? await authorization(g, dir) : undefined;
        await waitForPublishedShare({ grant: g, authorization: revision, publish: o.publish, get: o.getSite(site, controller.signal), signal: controller.signal });
        if (JSON.stringify(await grant(id, dir)) !== JSON.stringify(g) || (g.item && await authorization(g, dir) !== revision) ||
          o.dir() !== dir || await o.site() !== site || mutations !== epoch) throw new Error("access:scope.changed");
        if (controller.signal.aborted) throw new Error("access:cancelled");
        ready.set(id, { fingerprint: JSON.stringify(g), dir, site, ...(revision ? { authorization: revision } : {}) });
      })().finally(() => publishing.delete(id));
      publishing.set(id, { controller, done });
      return done;
    },
    cancelReady: (id: string) => { cancellations++; ready.delete(id); publishing.get(id)?.controller.abort(); },
    /**
     * Saves the owner's invite template to `private/access-message.json`, or with null removes it (back
     * to the default); committed on the cadence like access.json. Checked here again (D-143).
     */
    setTemplate: (raw: unknown): Promise<AccessListing> => {
      const run = async () => {
        if (!existsSync(o.dir())) throw new Error("access:failed");
        if (raw === null) {
          if (existsSync(messageFile())) { await rm(messageFile(), { force: true }); o.written(messageFile()); }
        } else {
          if (typeof raw !== "string") throw NOT();
          const bad = templateProblem(raw);
          if (bad) throw new Error(`access:${bad.problem}`);
          await o.write(messageFile(), `${JSON.stringify({ template: raw.replace(/\r\n/g, "\n") }, null, 2)}\n`);
          o.written(messageFile());
        }
        return listing(await read());
      };
      const done = queue.then(run, run);
      queue = done.catch(() => {});
      return done;
    },
    /** One audience's link and passcode, for its open invite. */
    reveal: async (id: unknown): Promise<{ link?: string; passcode?: string; accessCode?: string }> => {
      const { link, passcode, accessCode } = await secrets(await grant(id));
      return { ...(link ? { link } : {}), ...(passcode ? { passcode } : {}), ...(accessCode ? { accessCode } : {}) };
    },
    /** What to put on the clipboard: the link, the passcode, or the invite with its secrets filled in here. */
    secret,
    /** Linearize the actual native handoff with mutations, not just secret construction. */
    handoff: (id: unknown, what: unknown, invite: unknown, send: (text: string) => void): Promise<void> => {
      const epoch = mutations;
      const cancelled = cancellations;
      const run = async () => {
        const text = await secret(id, what, invite);
        if (mutations !== epoch || cancellations !== cancelled) throw new Error("access:notReady");
        send(text);
      };
      const done = queue.then(run, run);
      queue = done.catch(() => {});
      return done;
    },
  };
}
