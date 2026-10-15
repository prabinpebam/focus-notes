/**
 * `private/access.json` on the desktop (WP-5.3, D-134): the main process is the only writer. It reads
 * the file, makes each change the window asks for with seal's `applyAccessChange` (every secret is
 * made here, generated passcodes included), checks the result with the publisher's own
 * `validateAccess`, writes it atomically, and leaves the commit to the save cadence, like a note.
 * The window's listing holds no secrets: it gets one audience's link and passcode only for its open
 * invite (`reveal`), and copies through this process (`secret`), never the vault's derived key.
 */
import { readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { applyAccessChange, audienceOf, hasHiddenText, inviteText, parseAccessChange, parseAccessMessage, shareGrants, templateProblem, type InviteValues } from "@focus-notes/seal/access";
import { shareLink } from "@focus-notes/seal";
import { validateAccess, type AccessFile, type Grant } from "@focus-notes/seal/publish";
import { hasVault } from "@focus-notes/seal/vault";
import { generatePasscode } from "@focus-notes/seal/words";
import type { AccessListing } from "@focus-notes/core";

export interface AccessStoreOptions {
  /** The private repository's folder. */
  dir: () => string;
  /** The Pages site's address, if setup found it. */
  site: () => Promise<string | undefined>;
  write: (file: string, text: string) => Promise<void>;
  /** The file changed: commit it on the cadence. */
  written: (file: string) => void;
  now?: () => Date;
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
  const file = () => join(o.dir(), "access.json");
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<AccessFile> => {
    if (!existsSync(file())) return { version: 1, grants: [] };
    let raw: unknown;
    // Never the file's text in an error: it holds secrets (review L6).
    try { raw = JSON.parse(await readFile(file(), "utf8")); } catch { throw new Error("private/access.json couldn't be read as JSON."); }
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
    return { available: true, ...(site ? { site } : {}), ...(t ? { template: t } : {}), vault: hasVault(a), grants: shareGrants(a).map(audienceOf) };
  };
  const grant = async (id: unknown): Promise<Grant> => {
    const g = typeof id === "string" ? shareGrants(await read()).find((x) => x.id === id) : undefined;
    if (!g) throw NOT();
    return g;
  };
  const secrets = async (g: Grant) => {
    const site = await o.site().catch(() => undefined);
    return {
      ...(site && g.link ? { link: shareLink(site, g.id, g.link.secret) } : {}),
      ...(g.passcode ? { passcode: g.passcode.value } : {}),
      ...(site ? { site: new URL("s/", site.endsWith("/") ? site : `${site}/`).href } : {}),
    };
  };
  return {
    load: async (): Promise<AccessListing> => listing(existsSync(o.dir()) ? await read() : undefined),
    /** One change, after any before it: read, change, check, write. */
    apply: (raw: unknown): Promise<AccessListing & { id: string }> => {
      const run = async () => {
        if (!existsSync(o.dir())) throw new Error("access:failed");
        const change = parseAccessChange(raw);
        const { access, id } = applyAccessChange(await read(), change, (o.now ?? (() => new Date()))(), { generate: generatePasscode });
        validateAccess(access);
        await o.write(file(), `${JSON.stringify(access, null, 2)}\n`);
        o.written(file());
        return { ...(await listing(access)), id };
      };
      const done = queue.then(run, run);
      queue = done.catch(() => {});
      return done;
    },
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
    reveal: async (id: unknown): Promise<{ link?: string; passcode?: string }> => {
      const { link, passcode } = await secrets(await grant(id));
      return { ...(link ? { link } : {}), ...(passcode ? { passcode } : {}) };
    },
    /** What to put on the clipboard: the link, the passcode, or the invite with its secrets filled in here. */
    secret: async (id: unknown, what: unknown, invite?: unknown): Promise<string> => {
      const s = await secrets(await grant(id));
      if (what === "link" && s.link) return s.link;
      if (what === "passcode" && s.passcode) return s.passcode;
      if (what !== "invite") throw NOT();
      const { template, values } = parseInvite(invite);
      const g = await grant(id);
      // The name is the grant's own, never the window's.
      return inviteText(template, { ...values, name: g.name, ...s });
    },
  };
}
