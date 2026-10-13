/**
 * Text helpers for notes in any script (I18N-02): NFC file names from titles (FIL-07), locale-aware sorting.
 */

/** Characters Windows, macOS, or Linux reject in a file name, and control characters. */
const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
export const hasForbiddenChars = (s: string) => /[<>:"/\\|?*\u0000-\u001f\u007f]/.test(s);
/** Names Windows reserves, whatever follows the first dot ("con.txt" too). */
export const RESERVED_WINDOWS = /^(con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3]|conin\$|conout\$)$/i;
/** At most 80 characters (FIL-07), and few enough bytes that Linux's 255-byte limit holds with a suffix. */
export const MAX_NAME_CHARS = 80;
const MAX_NAME_BYTES = 240;
const encoder = new TextEncoder();
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Drops leading and trailing dots, spaces, and hyphens: hidden files, and names Windows trims. */
const trimEnds = (s: string) => s.replace(/^[\s.-]+|[\s.-]+$/gu, "");

/** Shortens to whole characters (never splitting an emoji or an accent) within both limits. */
export function clipName(name: string, maxChars = MAX_NAME_CHARS): string {
  const parts = [...graphemes.segment(name)].map((g) => g.segment);
  let bytes = encoder.encode(name).length;
  while (parts.length > maxChars || bytes > MAX_NAME_BYTES) bytes -= encoder.encode(parts.pop()!).length;
  return trimEnds(parts.join(""));
}

/**
 * A note's file name, without ".md", from its title (FIL-07): lowercase, spaces become hyphens,
 * letters in any language kept, characters a file system rejects removed, no leading or trailing
 * dots, spaces, or hyphens, reserved Windows names suffixed, NFC, and at most 80 characters.
 */
export function fileStemForTitle(title: string, maxChars = MAX_NAME_CHARS): string {
  let s = title.normalize("NFC").toLowerCase().normalize("NFC").replace(FORBIDDEN, " ").trim().replace(/\s+/gu, "-").replace(/-{2,}/g, "-");
  s = clipName(trimEnds(s).replace(/-{2,}/g, "-"), maxChars);
  if (!s) return "untitled";
  const dot = s.indexOf(".");
  const first = dot < 0 ? s : s.slice(0, dot);
  return RESERVED_WINDOWS.test(first) ? `${first}-note${s.slice(first.length)}` : s;
}

/** A note's file name from its title (FIL-07), with ".md". */
export const fileNameForTitle = (title: string): string => `${fileStemForTitle(title)}.md`;

/** Compares names the way people expect in their language, with numbers in numeric order. */
export function compareNames(a: string, b: string, locale = "en"): number {
  return a.normalize("NFC").localeCompare(b.normalize("NFC"), locale, { numeric: true, sensitivity: "base" });
}
