/**
 * `private/access.json` on the desktop (WP-5.3, D-134): the main process is the only writer. It reads
 * the file, makes each change the window asks for with seal's `applyAccessChange` (every secret is
 * made here), checks the result with the publisher's own `validateAccess`, writes it atomically, and
 * leaves the commit to the save cadence, like a note. The window gets the share audiences with their
 * secrets, so it can show the invite again (the spec keeps them in the private repository), but
 * never the vault's derived key.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { applyAccessChange, parseAccessChange, shareGrants } from "@focus-notes/seal/access";
import { validateAccess, type AccessFile } from "@focus-notes/seal/publish";
import { hasVault } from "@focus-notes/seal/vault";
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

export function accessStore(o: AccessStoreOptions) {
  const file = () => join(o.dir(), "access.json");
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<AccessFile> => {
    if (!existsSync(file())) return { version: 1, grants: [] };
    return validateAccess(JSON.parse(await readFile(file(), "utf8")));
  };
  const listing = async (a: AccessFile | undefined): Promise<AccessListing> => {
    if (!a) return { available: false, vault: false, grants: [] };
    const site = await o.site().catch(() => undefined);
    return { available: true, ...(site ? { site } : {}), vault: hasVault(a), grants: shareGrants(a) };
  };
  return {
    load: async (): Promise<AccessListing> => listing(existsSync(o.dir()) ? await read() : undefined),
    /** One change, after any before it: read, change, check, write. */
    apply: (raw: unknown): Promise<AccessListing & { id: string }> => {
      const run = async () => {
        if (!existsSync(o.dir())) throw new Error("access:failed");
        const change = parseAccessChange(raw);
        const { access, id } = applyAccessChange(await read(), change, (o.now ?? (() => new Date()))());
        validateAccess(access);
        await o.write(file(), `${JSON.stringify(access, null, 2)}\n`);
        o.written(file());
        return { ...(await listing(access)), id };
      };
      const done = queue.then(run, run);
      queue = done.catch(() => {});
      return done;
    },
  };
}
