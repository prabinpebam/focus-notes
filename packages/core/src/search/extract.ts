/**
 * What the search index reads from a note's Markdown (Spotlight → What it searches): its title
 * (the first H1), its headings, the front matter's `id`, and its text without Markdown's marks,
 * for full-text matches and their snippets. Line based and forgiving: it never throws.
 */
import { titleOfMarkdown } from "../workspace.ts";

export interface NoteFields {
  title?: string;
  /** Every heading outside code and front matter, in order, the title included. */
  headings: { text: string; level: number }[];
  /** The front matter's `id`, when it has one. */
  id?: string;
  /** The note's words, one line per block, without Markdown's marks. Code is kept as it is. */
  text: string;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;

/** A line's inline Markdown as plain words: links and images keep their text, marks go. */
export function plainInline(s: string): string {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<(https?:\/\/[^>\s]+|mailto:[^>\s]+)>/g, "$1")
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")
    .replace(/[*`]|~~|==/g, "")
    .replace(/(^|\s)_+|_+(?=\s|$)/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!|~])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractNote(markdown: string): NoteFields {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  let i = 0;
  let id: string | undefined;
  if (lines[0] === "---") {
    const end = lines.findIndex((l, n) => n > 0 && (l === "---" || l === "..."));
    if (end > 0) {
      for (const l of lines.slice(1, end)) {
        const m = /^id:\s*["']?([^"'#\s]+)["']?\s*$/.exec(l);
        if (m) id = m[1];
      }
      i = end + 1;
    }
  }
  const headings: NoteFields["headings"] = [];
  const out: string[] = [];
  let fence = "";
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    const f = FENCE.exec(line)?.[1];
    if (fence) {
      if (f && f[0] === fence[0] && f.length >= fence.length && line.trim() === f) fence = "";
      else if (line.trim()) out.push(line.trim());
      continue;
    }
    if (f) {
      fence = f;
      continue;
    }
    const atx = ATX.exec(line);
    if (atx) {
      const text = plainInline(atx[2] ?? "");
      if (text) {
        headings.push({ text, level: atx[1]!.length });
        out.push(text);
      }
      continue;
    }
    const under = SETEXT.exec(lines[i + 1] ?? "");
    if (under && line.trim() && !/^ {0,3}([-*+>#|]|\d+[.)])/.test(line)) {
      const text = plainInline(line);
      if (text) {
        headings.push({ text, level: under[1]![0] === "=" ? 1 : 2 });
        out.push(text);
        i++;
        continue;
      }
    }
    // Block marks: quotes, list markers, tasks, and table pipes and rules.
    if (/^ {0,3}([-*_])( *\1){2,} *$/.test(line) || /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)) continue;
    const body = line
      .replace(/^\s*(>\s?)+/, "")
      .replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, "")
      .replace(/\|/g, " ");
    const text = plainInline(body);
    if (text) out.push(text);
  }
  const title = titleOfMarkdown(markdown);
  return { ...(title ? { title } : {}), headings, ...(id ? { id } : {}), text: out.join("\n") };
}
