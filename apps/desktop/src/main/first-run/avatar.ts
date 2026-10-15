/**
 * The account's picture for the first run's profile card (D-126). The shell fetches it, so the
 * renderer makes no request to anyone (its CSP allows only `data:` images): only from GitHub's
 * avatar host, with no credentials, no redirects, and a size limit. It's cached in the data folder
 * (`avatar.json`, the last account's ID and picture), so the card shows it offline too; missing
 * both, the card shows the account's initials.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const HOST = /^https:\/\/avatars\.githubusercontent\.com\//;
const TYPE = /^image\/(png|jpeg|gif|webp)$/;
const DATA = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5_000;

export interface AvatarDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  /** The data folder's `avatar.json`. */
  file: string;
}

/** The picture as a data URL, or undefined. Cached first: a cached picture shows at once and is refreshed behind. */
export function avatarLoader({ fetch, file }: AvatarDeps) {
  const download = async (url: string, id: number): Promise<string | undefined> => {
    try {
      const r = await fetch(`${url}${url.includes("?") ? "&" : "?"}s=128`, { redirect: "error", credentials: "omit", signal: AbortSignal.timeout(TIMEOUT_MS) });
      const type = (r.headers.get("content-type") ?? "").split(";")[0]!.trim();
      if (!r.ok || !TYPE.test(type)) return undefined;
      const bytes = Buffer.from(await r.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_BYTES) return undefined;
      const data = `data:${type};base64,${bytes.toString("base64")}`;
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, `${JSON.stringify({ version: 1, id, data })}\n`);
      return data;
    } catch {
      return undefined;
    }
  };
  const cached = async (id: number): Promise<string | undefined> => {
    try {
      const c = JSON.parse(await readFile(file, "utf8")) as { id?: unknown; data?: unknown };
      return c.id === id && typeof c.data === "string" && DATA.test(c.data) ? c.data : undefined;
    } catch {
      return undefined;
    }
  };
  return async (url: string | null | undefined, id: number): Promise<string | undefined> => {
    const kept = await cached(id);
    if (!url || !HOST.test(url)) return kept;
    if (kept) {
      void download(url, id);
      return kept;
    }
    return download(url, id);
  };
}
