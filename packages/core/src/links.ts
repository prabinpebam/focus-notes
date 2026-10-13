/**
 * Link updates (FIL-09, WP-2.5): when notes and folders are renamed or moved, the relative links
 * that point at them, and the links inside the moved notes themselves, are rewritten so they still
 * reach the same files. Only the characters of a changed destination change; every other byte of
 * the note stays as it was (content-model.md → The Markdown bridge). Planned here, written by the
 * shell in the same all-or-nothing batch as the PathMove (D-94, D-95).
 */
import { linkDestinations } from "@focus-notes/markdown";
import { walk, type WorkspaceTree } from "./workspace.ts";

export interface PathMove { from: string; to: string }

/** A note whose links changed: its path before and after the batch, and its text before and after. */
export interface LinkWrite {
  from: string;
  path: string;
  before: string;
  text: string;
  /** How many destinations changed. */
  links: number;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const PREFIXED = /^(public|private):/;
const fold = (s: string) => s.normalize("NFC").toLowerCase();
const partsOf = (p: string) => p.split(/[\\/]/);
const sepOf = (p: string) => (p.includes("\\") && !p.includes("/") ? "\\" : "/");
/** Parts `..` can't climb above: a drive (`E:`), the file system root, or the instance's `public:` prefix. */
const fixedOf = (parts: readonly string[]) => (parts.length && (parts[0] === "" || /^[A-Za-z]:$/.test(parts[0]!) || PREFIXED.test(parts[0]!)) ? 1 : 0);

const unescape = (s: string) => s.replace(/\\([!-/:-@[-`{-~])/g, "$1");
const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
/** A path segment as written in a destination, as the file name it means. */
const valueOf = (written: string) => decode(unescape(written));
/** A segment written new: what a destination can't hold as is becomes a percent escape. Spaces and parentheses may stay in `<…>`. */
const encode = (seg: string, angle: boolean) =>
  seg.replace(/[\u0000-\u0020%#?<>\\()\u007f]/g, (c) => (angle && (c === " " || c === "(" || c === ")") ? c : `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`));

/** Where a path ends up after the moves, matching names as the file systems and stores do: ignoring case and Unicode form. */
function moved(path: string, moves: readonly PathMove[]): string {
  const p = fold(path);
  for (const m of moves) {
    const f = fold(m.from);
    if (p === f) return m.to;
    if (p.startsWith(f) && (p[f.length] === "/" || p[f.length] === "\\")) return m.to + path.slice(m.from.length);
  }
  return path;
}

function resolve(dir: readonly string[], segs: readonly string[]): string[] | undefined {
  const out = [...dir];
  const fixed = fixedOf(dir);
  for (const s of segs) {
    if (s === "" || s === ".") continue;
    if (s === "..") {
      if (out.length <= fixed) return undefined;
      out.pop();
    } else out.push(s);
  }
  return out;
}

/** The segments from a folder to a path, or undefined when no relative link reaches it (another drive or root). */
function relative(dir: readonly string[], target: readonly string[]): string[] | undefined {
  const fixed = fixedOf(dir);
  if (fixedOf(target) !== fixed || (fixed && fold(dir[0]!) !== fold(target[0]!))) return undefined;
  let common = 0;
  while (common < dir.length && common < target.length && fold(dir[common]!) === fold(target[common]!)) common++;
  return [...Array<string>(dir.length - common).fill(".."), ...target.slice(common)];
}

/**
 * A note's text with its relative links rewritten for moves. `from` and `to` are the note's own
 * path before and after (the same when it doesn't PathMove). Absolute URLs, links within the note
 * (`#…`), site-root links (`/…`), and links in code are left alone.
 */
export function rewriteLinks(text: string, from: string, to: string, moves: readonly PathMove[]): { text: string; links: number } {
  const sep = sepOf(from);
  const fromDir = partsOf(from).slice(0, -1);
  const toDir = partsOf(to).slice(0, -1);
  let out = "";
  let at = 0;
  let links = 0;
  for (const d of linkDestinations(text)) {
    const written = text.slice(d.start, d.end);
    if (/^[/#?]/.test(written) || SCHEME.test(unescape(written))) continue;
    const cut = written.search(/[?#]/);
    const pathPart = cut < 0 ? written : written.slice(0, cut);
    const suffix = cut < 0 ? "" : written.slice(cut);
    if (!pathPart) continue;
    const wsegs = pathPart.split("/");
    const vsegs = wsegs.map(valueOf);
    const target = resolve(fromDir, vsegs);
    if (!target) continue;
    const targetPath = target.join(sep);
    const next = moved(targetPath, moves);
    if (next === targetPath && from === to) continue;
    const segs = relative(toDir, partsOf(next));
    if (!segs || !segs.length) continue;
    const same = vsegs.filter((s) => s !== "" && s !== ".");
    if (segs.length === same.length && segs.every((s, i) => s === same[i])) continue;
    // Segments that didn't change keep their spelling: escapes, percent-encoding, and all.
    const spelled = new Map(vsegs.map((v, i) => [v, wsegs[i]!]));
    let rewritten = segs.map((s) => (s === ".." ? s : spelled.get(s) ?? encode(s, d.angle))).join("/");
    if (wsegs[0] === "." && segs[0] !== "..") rewritten = `./${rewritten}`;
    if (pathPart.endsWith("/")) rewritten += "/";
    out += text.slice(at, d.start) + rewritten + suffix;
    at = d.end;
    links++;
  }
  return links ? { text: out + text.slice(at), links } : { text, links: 0 };
}

/** Whether a note could link to anything moving: its text names one of them, however it's spelled. */
function mentions(text: string, names: readonly string[]): boolean {
  const plain = fold(unescape(text).replace(/(%[0-9A-Fa-f]{2})+/g, decode));
  return names.some((n) => plain.includes(n));
}

/**
 * Every note in the workspace's writable roots whose links change with these moves, read through
 * `read` (the open note's text comes from the editor). The instance's read-only notes are never
 * read or written. A note that isn't moving is parsed only if its text names something that is:
 * a link into a moved file or folder always spells its name.
 */
export async function planLinkWrites(tree: WorkspaceTree, moves: readonly PathMove[], read: (path: string) => Promise<string>): Promise<LinkWrite[]> {
  if (!moves.length) return [];
  const names = moves.map((m) => fold(partsOf(m.from).at(-1) ?? ""));
  const notes = [...walk(tree)].filter((e) => !e.root.readOnly && e.node.kind === "note").map((e) => e.path);
  const out: LinkWrite[] = [];
  const one = async (path: string) => {
    const before = await read(path).catch(() => undefined);
    if (before === undefined) return;
    const to = moved(path, moves);
    if (to === path && !mentions(before, names)) return;
    const r = rewriteLinks(before, path, to, moves);
    if (r.links) out.push({ from: path, path: to, before, text: r.text, links: r.links });
  };
  // A few reads at a time: the desktop reads each over IPC.
  for (let i = 0; i < notes.length; i += 32) await Promise.all(notes.slice(i, i + 32).map(one));
  return out.sort((a, b) => notes.indexOf(a.from) - notes.indexOf(b.from));
}
