/**
 * A page's address as a person reads it (main, 27 November): no `https://`, and its path decoded for display only
 * (spaces, not %20), so the published badge's tooltip reads "live at maya-chen.github.io/notebook/n/On writing slowly/".
 * Copy and open always use the real, encoded URL; this is words on screen and the row's description.
 */
export function readableLink(url: string): string {
  const bare = url.replace(/^https?:\/\//i, "");
  return bare.split("/").map((segment) => {
    try { return decodeURIComponent(segment); } catch { return segment; }
  }).join("/");
}

/** The longest link a one-line tooltip shows whole; a longer one keeps its start and end around "…". */
export const LINK_DISPLAY_MAX = 60;

/** `text` at most `max` characters (code points, so no letter is split), its middle replaced by "…" when longer. */
export function middleTruncate(text: string, max = LINK_DISPLAY_MAX): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const keep = max - 1;
  // More of the end: a link's end is the note's own name.
  const head = Math.floor(keep * 0.45);
  return `${chars.slice(0, head).join("")}…${chars.slice(chars.length - (keep - head)).join("")}`;
}
