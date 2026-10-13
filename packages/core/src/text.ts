/**
 * Text helpers for notes in any script (I18N-02): NFC file names, locale-aware sorting.
 */

/** Characters no file system accepts, plus control characters. */
const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED_WINDOWS = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/**
 * A note's file name from its title (FIL-07): NFC-normalized, without characters file systems
 * reject, trimmed of trailing dots and spaces, and at most 80 characters before ".md".
 */
export function fileNameForTitle(title: string): string {
  let name = title.normalize("NFC").replace(FORBIDDEN, " ").replace(/\s+/g, " ").trim();
  name = name.replace(/[. ]+$/, "");
  if ([...name].length > 80) name = [...name].slice(0, 80).join("").trim();
  if (!name || RESERVED_WINDOWS.test(name)) name = name ? `${name} note` : "Untitled";
  return `${name}.md`;
}

/** Compares names the way people expect in their language, with numbers in numeric order. */
export function compareNames(a: string, b: string, locale = "en"): number {
  return a.normalize("NFC").localeCompare(b.normalize("NFC"), locale, { numeric: true, sensitivity: "base" });
}
