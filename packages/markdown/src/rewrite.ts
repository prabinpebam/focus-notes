import { fingerprint, parseMarkdown, type PMNode } from "./index.ts";
import { isSafeHref } from "./href.ts";

export class RewriteTargetError extends Error {
  readonly code: "unsupported-target" | "stale-target" | "invalid-output" | "too-large";
  constructor(code: RewriteTargetError["code"]) {
    super(code);
    this.code = code;
  }
}

export interface RewriteTarget {
  /** Source UTF-16 offsets; byte coordinates below include a preserved BOM. */
  readonly from: number;
  readonly to: number;
  readonly startByte: number;
  readonly endByte: number;
  readonly original: string;
  readonly expanded: boolean;
}

const bytes = (s: string) => new TextEncoder().encode(s).length;
const fail = (code: RewriteTargetError["code"]): never => { throw new RewriteTargetError(code); };
const size = (n: PMNode): number => n.type === "text" ? (n.text?.length ?? 0)
  : n.type === "rawMarkdown" || n.type === "horizontalRule" || n.type === "hardBreak" ? 1
    : 2 + (n.content ?? []).reduce((sum, child) => sum + size(child), 0);
const boundary = (s: string, p: number) => !(p > 0 && p < s.length && /[\uD800-\uDBFF]/.test(s[p - 1]!) && /[\uDC00-\uDFFF]/.test(s[p]!));
const wellFormed = (s: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s);

/** Positional mapping only: raw blocks and stale editor documents never fall back to text search. */
export function resolveRewriteTarget(source: string, doc: PMNode, from: number, to: number): RewriteTarget {
  const parsed = parseMarkdown(source);
  if (fingerprint(doc) !== fingerprint(parsed.doc)) return fail("stale-target");
  const nodes = parsed.doc.content ?? [];
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || !wellFormed(source)) return fail("unsupported-target");
  let offset = 0;
  const blocks = parsed.blocks.map((block, i) => {
    const node = nodes[i]!;
    const pmFrom = offset;
    offset += size(node);
    return { block, node, pmFrom, pmTo: offset };
  });
  if (to > offset) return fail("unsupported-target");
  const selected = blocks.filter((b) => from === to
    ? from >= b.pmFrom && (from < b.pmTo || from === offset && b.pmTo === offset)
    : to > b.pmFrom && from < b.pmTo);
  if (!selected.length || selected.some((b) => b.node.type === "rawMarkdown" || b.node.type === "horizontalRule")) return fail("unsupported-target");
  const first = selected[0]!, last = selected.at(-1)!;
  let start = first.block.start, end = last.block.end, expanded = true;
  if (selected.length === 1 && from !== to) {
    const a = from - first.pmFrom - 1, b = to - first.pmFrom - 1;
    const span = first.block.plainText?.find((s) => a >= s.from && b <= s.to);
    if (span) {
      start = span.start + a - span.from;
      end = span.start + b - span.from;
      expanded = false;
    }
  }
  const bom = parsed.bom ? 1 : 0;
  start += bom;
  end += bom;
  if (!boundary(source, start) || !boundary(source, end)) return fail("unsupported-target");
  const original = source.slice(start, end);
  if (!original.trim()) return fail("unsupported-target");
  if (bytes(original) > 32 * 1024) return fail("too-large");
  return Object.freeze({ from: start, to: end, startByte: bytes(source.slice(0, start)), endByte: bytes(source.slice(0, end)), original, expanded });
}

function walk(nodes: PMNode[], visit: (n: PMNode) => void): void {
  for (const n of nodes) { visit(n); walk(n.content ?? [], visit); }
}

function inventory(nodes: PMNode[]): string[] {
  const result: string[] = [];
  walk(nodes, (n) => {
    if (["heading", "horizontalRule", "bulletList", "orderedList", "taskList", "taskItem", "codeBlock", "table", "tableRow", "tableCell", "tableHeader", "blockquote"].includes(n.type)) {
      const { content: _content, text: _text, ...structure } = n;
      result.push(JSON.stringify(structure));
    }
  });
  return result;
}

function links(nodes: PMNode[], allowChanges: boolean): string[] {
  const result: string[] = [];
  let previous: string | undefined;
  walk(nodes, (n) => {
    if (n.type !== "text" && n.type !== "hardBreak") return;
    if (!n.marks?.some((m) => m.type === "link")) previous = undefined;
    for (const mark of n.marks ?? []) {
      if (mark.type !== "link") continue;
      const href = String(mark.attrs?.href ?? "");
      if (!isSafeHref(href)) fail("invalid-output");
      const key = JSON.stringify([href, mark.attrs?.title ?? null]);
      if (!allowChanges && key !== previous) result.push(key);
      previous = key;
    }
  });
  return result;
}

/** Validates replacement-only bytes, then proves a splice cannot consume neighboring source blocks. */
export function spliceRewriteTarget(source: string, target: RewriteTarget, replacement: string, policy: { allowLinkChanges: boolean } = { allowLinkChanges: false }): string {
  if (source.slice(target.from, target.to) !== target.original || !boundary(source, target.from) || !boundary(source, target.to)) return fail("stale-target");
  if (!replacement.trim() || !wellFormed(replacement) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(replacement)) return fail("invalid-output");
  if (bytes(replacement) > 32 * 1024) return fail("too-large");
  const before = parseMarkdown(source);
  const eol = target.original.includes("\n") ? target.original.includes("\r\n") ? "\r\n" : "\n" : before.eol;
  const normalized = replacement.replace(/\r\n?|\n/g, eol);
  if (bytes(normalized) > 32 * 1024) return fail("too-large");
  const output = parseMarkdown(normalized);
  walk(output.doc.content ?? [], (n) => { if (n.type === "rawMarkdown") fail("invalid-output"); });
  const old = parseMarkdown(target.original);
  if (JSON.stringify(inventory(old.doc.content ?? [])) !== JSON.stringify(inventory(output.doc.content ?? []))
    || JSON.stringify(links(old.doc.content ?? [], policy.allowLinkChanges)) !== JSON.stringify(links(output.doc.content ?? [], policy.allowLinkChanges))) return fail("invalid-output");
  const result = source.slice(0, target.from) + normalized + source.slice(target.to);
  const after = parseMarkdown(result);
  const bom = before.bom ? 1 : 0;
  const delta = normalized.length - target.original.length;
  for (let i = 0; i < after.blocks.length; i++) {
    const block = after.blocks[i]!;
    if (block.start + bom < target.from + normalized.length && block.end + bom > target.from) {
      const node = after.doc.content![i]!;
      if (node.type === "rawMarkdown") return fail("invalid-output");
      links([node], true);
    }
  }
  const outside = before.blocks.filter((b) => b.end + bom <= target.from || b.start + bom >= target.to);
  for (const block of outside) {
    const shift = block.start + bom >= target.to ? delta : 0;
    if (!after.blocks.some((b) => b.start === block.start + shift && b.end === block.end + shift && b.fingerprint === block.fingerprint)) return fail("invalid-output");
  }
  return result;
}
