/**
 * Deep links (WP-7.3, AGT-06, D-165; Agents → Deep links): read-only, and accepted only in their one
 * exact shape. `focus-notes://open?path=<note>[&heading=<anchor>]` opens a note in one of the two
 * roots, and `focus-notes://search?q=<text>` opens Spotlight. Nothing a link says can write, delete,
 * change who can see a note, or name a file outside the notes. Anything else is ignored.
 */
import { agentPath, rootOf } from "./agents.ts";

export type DeepLink = { kind: "open"; path: string; heading?: string } | { kind: "search"; q: string };

const MAX_LINK = 2048;
const SHAPE = /^focus-notes:\/\/(open|search)\/?\?([^#]*)$/i;
const PARAMS: Record<DeepLink["kind"], readonly string[]> = { open: ["path", "heading"], search: ["q"] };
const HEADING = /^[\p{L}\p{N}_-]{1,200}$/u;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/** The link, or undefined for anything that isn't exactly one of the two shapes. */
export function parseDeepLink(raw: unknown): DeepLink | undefined {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LINK || /\s/.test(raw) || CONTROL.test(raw)) return undefined;
  const m = SHAPE.exec(raw);
  if (!m) return undefined;
  const kind = m[1]!.toLowerCase() as DeepLink["kind"];
  const params = new Map<string, string>();
  for (const part of m[2]!.split("&")) {
    const eq = part.indexOf("=");
    if (eq <= 0) return undefined;
    const key = part.slice(0, eq);
    if (!PARAMS[kind].includes(key) || params.has(key)) return undefined;
    let value: string;
    try {
      value = decodeURIComponent(part.slice(eq + 1));
    } catch {
      return undefined;
    }
    if (!value || CONTROL.test(value)) return undefined;
    params.set(key, value);
  }
  if (kind === "search") {
    const q = params.get("q");
    return q !== undefined && q.length <= 200 ? { kind, q } : undefined;
  }
  const path = agentPath(params.get("path"));
  if (!path || !rootOf(path) || !path.endsWith(".md")) return undefined;
  const heading = params.get("heading");
  if (heading !== undefined && !HEADING.test(heading)) return undefined;
  return { kind, path, ...(heading !== undefined ? { heading } : {}) };
}

/** The link for an open or a search: what the command-line tool's `open` hands to the app. */
export function deepLinkFor(link: DeepLink): string {
  const enc = encodeURIComponent;
  return link.kind === "search" ? `focus-notes://search?q=${enc(link.q)}`
    : `focus-notes://open?path=${enc(link.path)}${link.heading ? `&heading=${enc(link.heading)}` : ""}`;
}

/** A heading's anchor, as `get_outline` and the `heading` parameter spell it (GitHub's style). */
export const headingAnchor = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s+/g, "-");
