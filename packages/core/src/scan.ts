/**
 * Linear-time text scans for the patterns a regular expression would match only with heavy
 * backtracking (CodeQL js/polynomial-redos). Each one does what the regular expression it replaced
 * did, character for character, and runs in time proportional to its input on any string.
 */

const WS = /\s/;
const isWs = (c: string | undefined): boolean => c !== undefined && WS.test(c);
const isSpaceTab = (c: string | undefined): boolean => c === " " || c === "\t";
const isWordChar = (c: string): boolean => /\w/.test(c);
const LINE_BREAK = /[\n\r\u2028\u2029]/;

/**
 * The first index at or after `from` whose character passes `stop`, or -1. Queries must not go
 * backwards; repeated ones reuse the last answer, so all of them together scan the string once.
 */
function finder(s: string, stop: (c: string) => boolean): (from: number) => number {
  let lo = -1;
  let at = -1;
  return (from) => {
    if (lo >= 0 && from >= lo && (at < 0 || from <= at)) return at;
    lo = from;
    at = -1;
    for (let j = from; j < s.length; j++) {
      if (stop(s[j]!)) {
        at = j;
        break;
      }
    }
    return at;
  };
}

/** `s` without the leading and trailing characters that pass `strip` (was `/^[x]+|[x]+$/g`). */
export function trimWhere(s: string, strip: (c: string) => boolean): string {
  let start = 0;
  let end = s.length;
  while (start < end && strip(s[start]!)) start++;
  while (end > start && strip(s[end - 1]!)) end--;
  return s.slice(start, end);
}

/** Links and images as their text: what `s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")` did. */
export function stripLinks(s: string): string {
  const bracket = finder(s, (c) => c === "]");
  const paren = finder(s, (c) => c === ")");
  let out = "";
  let i = 0;
  while (i < s.length) {
    const open = s[i] === "!" && s[i + 1] === "[" ? i + 1 : s[i] === "[" ? i : -1;
    if (open >= 0) {
      const end = bracket(open + 1);
      if (end >= 0 && s[end + 1] === "(") {
        const close = paren(end + 2);
        if (close >= 0) {
          out += s.slice(open + 1, end);
          i = close + 1;
          continue;
        }
      }
    }
    out += s[i];
    i++;
  }
  return out;
}

/**
 * Autolinks as their address, then HTML tags as a space: what
 * `.replace(/<(https?:\/\/[^>\s]+|mailto:[^>\s]+)>/g, "$1").replace(/<\/?[A-Za-z][^>]*>/g, " ")` did.
 */
export function stripAngles(s: string): string {
  const stop = finder(s, (c) => c === ">" || isWs(c));
  let auto = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "<") {
      const scheme = s.startsWith("https://", i + 1) ? 8 : s.startsWith("http://", i + 1) || s.startsWith("mailto:", i + 1) ? 7 : 0;
      if (scheme) {
        const from = i + 1 + scheme;
        const end = stop(from);
        if (end > from && s[end] === ">") {
          auto += s.slice(i + 1, end);
          i = end + 1;
          continue;
        }
      }
    }
    auto += s[i];
    i++;
  }
  const close = finder(auto, (c) => c === ">");
  let out = "";
  i = 0;
  while (i < auto.length) {
    if (auto[i] === "<") {
      const name = auto[i + 1] === "/" && /[A-Za-z]/.test(auto[i + 2] ?? "") ? i + 2 : /[A-Za-z]/.test(auto[i + 1] ?? "") ? i + 1 : -1;
      const end = name >= 0 ? close(name + 1) : -1;
      if (end >= 0) {
        out += " ";
        i = end + 1;
        continue;
      }
    }
    out += auto[i];
    i++;
  }
  return out;
}

/** Underscore emphasis marks gone: what `s.replace(/(^|\s)_+|_+(?=\s|$)/g, "$1")` did. */
export function stripUnderscores(s: string): string {
  const runEnd = (from: number) => {
    let j = from;
    while (s[j] === "_") j++;
    return j;
  };
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (i === 0 && c === "_") {
      i = runEnd(0);
    } else if (isWs(c) && s[i + 1] === "_") {
      out += c;
      i = runEnd(i + 1);
    } else if (c === "_") {
      const end = runEnd(i);
      if (end < s.length && !isWs(s[end])) out += s.slice(i, end);
      i = end;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/**
 * An ATX heading line: its level and its text without the closing hashes, or null. What
 * `/^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/` matched; `text` is undefined for a bare `#`.
 */
export function parseAtx(line: string): { level: number; text: string | undefined } | null {
  if (LINE_BREAK.test(line)) return null;
  let i = 0;
  while (i < 3 && line[i] === " ") i++;
  let level = 0;
  while (line[i + level] === "#") level++;
  if (level < 1 || level > 6) return null;
  i += level;
  if (i === line.length) return { level, text: undefined };
  if (!isSpaceTab(line[i])) {
    return null;
  }
  while (isSpaceTab(line[i])) i++;
  let end = line.length;
  while (end > i && isSpaceTab(line[end - 1])) end--;
  let hashes = end;
  while (hashes > i && line[hashes - 1] === "#") hashes--;
  if (hashes < end && hashes > i && isSpaceTab(line[hashes - 1])) {
    end = hashes;
    while (end > i && isSpaceTab(line[end - 1])) end--;
  }
  return { level, text: line.slice(i, end) };
}

/** A table's delimiter row (`| --- | :-: |`): what `/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/` matched. */
export function isTableRule(line: string): boolean {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row.split("|").every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

/** The last word of a message, before any trailing space: what `/(\w+)\s*$/.exec(s)?.[1]` found. */
export function lastWord(s: string): string | undefined {
  let end = s.length;
  while (end > 0 && isWs(s[end - 1])) end--;
  let start = end;
  while (start > 0 && isWordChar(s[start - 1]!)) start--;
  return start < end ? s.slice(start, end) : undefined;
}

/** `hash seconds subject`: what `/^([0-9a-f]{7,64}) (\d+) ?(.*)$/` matched, as its three groups. */
export function parseCommitHead(head: string): [hash: string, seconds: string, subject: string] | null {
  const space = head.indexOf(" ");
  const hash = head.slice(0, space);
  if (space < 0 || !/^[0-9a-f]{7,64}$/.test(hash)) return null;
  const rest = head.slice(space + 1);
  if (LINE_BREAK.test(rest)) return null;
  let digits = 0;
  while (digits < rest.length && rest[digits]! >= "0" && rest[digits]! <= "9") digits++;
  if (!digits) return null;
  return [hash, rest.slice(0, digits), rest.slice(rest[digits] === " " ? digits + 1 : digits)];
}

/** An http, https, or mailto address with no spaces: what `/^(https?:\/\/[^\s/?#]+|mailto:[^\s@]+@)\S*$/i` matched. */
export const isWebAddress = (href: string): boolean => !/\s/.test(href) && /^(?:https?:\/\/[^/?#]|mailto:[^@]+@)/i.test(href);
