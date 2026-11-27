import type { SiteFetch } from "@focus-notes/seal";

export const SITE_MANIFEST = "focus-notes.json";

let nonce = 0;
/**
 * The share page's reads of its own site: no cookies, no other origin, no redirects. The site's
 * manifest is never taken from any cache, on the first read or a retry after a build switch (D-436):
 * a stale copy from the Pages CDN can name a build whose files are gone. Build files sit under their
 * build's ID, so the browser may revalidate them as usual.
 */
export function siteFetch(site: URL, get: typeof fetch = fetch): SiteFetch {
  return async (path) => {
    const url = new URL(path, site);
    const manifest = path === SITE_MANIFEST;
    if (manifest) url.searchParams.set("t", `${Date.now().toString(36)}-${(nonce++).toString(36)}`);
    const res = await get(url, { cache: manifest ? "no-store" : "no-cache", credentials: "omit", redirect: "error" });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };
}
