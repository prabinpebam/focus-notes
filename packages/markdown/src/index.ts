/**
 * The Markdown bridge (D-01, EDT-01, EDT-10, EXT-05).
 *
 * Parsing turns Markdown into an editor document (ProseMirror JSON) and remembers the source
 * text of every top-level block. Serializing writes each block back from its original source
 * when it is unchanged, so untouched parts of a file are byte-for-byte identical. Changed blocks
 * are written with mdast-util-to-markdown. Constructs the editor can't represent yet become
 * raw blocks that keep their source verbatim.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import { toMarkdown, type Options as ToMarkdownOptions } from "mdast-util-to-markdown";
import { gfmToMarkdown } from "mdast-util-gfm";
import type * as Md from "mdast";

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: PMMark[];
  text?: string;
}
export interface SourceBlock {
  fingerprint: string;
  start: number;
  end: number;
}
export interface Parsed {
  doc: PMNode;
  blocks: SourceBlock[];
  source: string;
}

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]);

const MARK_ORDER = ["link", "bold", "italic", "strike", "code"];
const KEPT_ATTRS: Record<string, string[]> = {
  heading: ["level"],
  orderedList: ["start"],
  codeBlock: ["language"],
  rawMarkdown: ["source"],
  link: ["href", "title"],
};

/** A stable description of a node that ignores editor-only attributes. */
export function canonical(node: PMNode): unknown {
  const keep = KEPT_ATTRS[node.type] ?? [];
  const attrs = Object.fromEntries(keep.map((k) => [k, node.attrs?.[k] ?? null]));
  const marks = (node.marks ?? [])
    .map((m) => ({ type: m.type, attrs: Object.fromEntries((KEPT_ATTRS[m.type] ?? []).map((k) => [k, m.attrs?.[k] ?? null])) }))
    .sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
  return [node.type, attrs, node.text ?? null, marks, (node.content ?? []).map(canonical)];
}
export const fingerprint = (node: PMNode): string => JSON.stringify(canonical(node));

// ---------------- parse ----------------

export function parseMarkdown(source: string): Parsed {
  const tree = processor.parse(source) as Md.Root;
  const content: PMNode[] = [];
  const blocks: SourceBlock[] = [];
  for (const child of tree.children) {
    const start = child.position?.start.offset ?? 0;
    const end = child.position?.end.offset ?? start;
    const node = blockFromMdast(child, source.slice(start, end));
    content.push(node);
    blocks.push({ fingerprint: fingerprint(node), start, end });
  }
  if (content.length === 0) content.push({ type: "paragraph" });
  return { doc: { type: "doc", content }, blocks, source };
}

const raw = (src: string): PMNode => ({ type: "rawMarkdown", attrs: { source: src } });

function blockFromMdast(node: Md.RootContent, src: string): PMNode {
  try {
    const converted = convertBlock(node);
    return converted ?? raw(src);
  } catch {
    return raw(src);
  }
}

function convertBlock(node: Md.RootContent): PMNode | undefined {
  switch (node.type) {
    case "paragraph": {
      const inline = convertInline(node.children, []);
      return inline ? para(inline) : undefined;
    }
    case "heading": {
      const inline = convertInline(node.children, []);
      if (!inline) return undefined;
      return { type: "heading", attrs: { level: node.depth }, ...(inline.length ? { content: inline } : {}) };
    }
    case "blockquote": {
      const kids = node.children.map((c) => convertBlock(c));
      if (kids.some((k) => !k)) return undefined;
      return { type: "blockquote", content: kids as PMNode[] };
    }
    case "list": {
      if (node.children.some((i) => i.checked !== null && i.checked !== undefined)) return undefined;
      const items: PMNode[] = [];
      for (const item of node.children) {
        const kids = item.children.map((c) => convertBlock(c));
        if (kids.some((k) => !k)) return undefined;
        if (kids.length === 0 || kids[0]!.type !== "paragraph") kids.unshift({ type: "paragraph" });
        items.push({ type: "listItem", content: kids as PMNode[] });
      }
      return node.ordered
        ? { type: "orderedList", attrs: { start: node.start ?? 1 }, content: items }
        : { type: "bulletList", content: items };
    }
    case "code":
      if (node.meta) return undefined;
      return {
        type: "codeBlock",
        attrs: { language: node.lang ?? null },
        ...(node.value ? { content: [{ type: "text", text: node.value }] } : {}),
      };
    case "thematicBreak":
      return { type: "horizontalRule" };
    default:
      return undefined;
  }
}

const para = (content: PMNode[]): PMNode => (content.length ? { type: "paragraph", content } : { type: "paragraph" });

function convertInline(nodes: Md.PhrasingContent[], marks: PMMark[]): PMNode[] | undefined {
  const out: PMNode[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case "text":
        if (n.value) out.push(textNode(n.value, marks));
        break;
      case "strong":
      case "emphasis":
      case "delete": {
        const type = n.type === "strong" ? "bold" : n.type === "emphasis" ? "italic" : "strike";
        const inner = convertInline(n.children, [...marks, { type }]);
        if (!inner) return undefined;
        out.push(...inner);
        break;
      }
      case "inlineCode":
        out.push(textNode(n.value, [...marks, { type: "code" }]));
        break;
      case "link": {
        const inner = convertInline(n.children, [...marks, { type: "link", attrs: { href: n.url, title: n.title ?? null } }]);
        if (!inner) return undefined;
        out.push(...inner);
        break;
      }
      case "break":
        out.push({ type: "hardBreak" });
        break;
      default:
        // Images, inline HTML, references, and footnotes keep the whole block verbatim for now.
        return undefined;
    }
  }
  return out;
}

const textNode = (text: string, marks: PMMark[]): PMNode => (marks.length ? { type: "text", text, marks } : { type: "text", text });

// ---------------- serialize ----------------

const MD_OPTIONS: ToMarkdownOptions = {
  bullet: "-",
  emphasis: "_",
  strong: "*",
  fence: "`",
  fences: true,
  listItemIndent: "one",
  rule: "-",
  extensions: [gfmToMarkdown()],
};

export function serializeMarkdown(doc: PMNode, original?: Parsed): string {
  const nodes = (doc.content ?? []).filter((n) => !(n.type === "paragraph" && !n.content?.length));
  const src = original?.source ?? "";
  const blocks = original?.blocks ?? [];
  let out = "";
  let prev = -1; // index of the previous original block that was reused
  let prevWasReused = false;
  nodes.forEach((node, i) => {
    const fp = fingerprint(node);
    let match = -1;
    for (let k = prev + 1; k < blocks.length; k++) if (blocks[k]!.fingerprint === fp) { match = k; break; }
    const text = match >= 0 ? src.slice(blocks[match]!.start, blocks[match]!.end) : blockToMarkdown(node);
    if (i === 0) out += match === 0 ? src.slice(0, blocks[0]!.start) : "";
    else if (match >= 0 && prevWasReused && match === prev + 1) out += src.slice(blocks[prev]!.end, blocks[match]!.start);
    else out += "\n\n";
    out += text;
    prevWasReused = match >= 0;
    if (match >= 0) prev = match;
  });
  if (nodes.length === 0) return blocks.length === 0 ? src : "";
  const lastIsOriginalLast = prevWasReused && prev === blocks.length - 1;
  out += lastIsOriginalLast ? src.slice(blocks[prev]!.end) : "\n";
  return out;
}

export function blockToMarkdown(node: PMNode): string {
  if (node.type === "rawMarkdown") return String(node.attrs?.source ?? "");
  const mdast = { type: "root", children: [toMdastBlock(node)] } as Md.Root;
  return toMarkdown(mdast, MD_OPTIONS).replace(/\n+$/, "");
}

function toMdastBlock(node: PMNode): Md.RootContent {
  switch (node.type) {
    case "paragraph":
      return { type: "paragraph", children: toMdastInline(node.content ?? []) };
    case "heading":
      return { type: "heading", depth: Number(node.attrs?.level ?? 1) as Md.Heading["depth"], children: toMdastInline(node.content ?? []) };
    case "blockquote":
      return { type: "blockquote", children: (node.content ?? []).map(toMdastBlock) as Md.BlockContent[] };
    case "bulletList":
    case "orderedList":
      return {
        type: "list",
        ordered: node.type === "orderedList",
        start: node.type === "orderedList" ? Number(node.attrs?.start ?? 1) : null,
        spread: false,
        children: (node.content ?? []).map((li) => ({
          type: "listItem",
          spread: false,
          children: (li.content ?? []).map(toMdastBlock) as Md.BlockContent[],
        })),
      };
    case "codeBlock":
      return { type: "code", lang: (node.attrs?.language as string | null) ?? null, value: (node.content ?? []).map((t) => t.text ?? "").join("") };
    case "horizontalRule":
      return { type: "thematicBreak" };
    case "rawMarkdown":
      return { type: "html", value: String(node.attrs?.source ?? "") };
    default:
      return { type: "paragraph", children: toMdastInline(node.content ?? []) };
  }
}

function toMdastInline(nodes: PMNode[]): Md.PhrasingContent[] {
  const out: Md.PhrasingContent[] = [];
  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i]!;
    if (n.type === "hardBreak") { out.push({ type: "break" }); i++; continue; }
    const marks = [...(n.marks ?? [])].sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
    if (marks.length === 0) { out.push({ type: "text", value: n.text ?? "" }); i++; continue; }
    const m = marks[0]!;
    const same = (x: PMNode) => (x.marks ?? []).some((y) => y.type === m.type && JSON.stringify(y.attrs ?? {}) === JSON.stringify(m.attrs ?? {}));
    let j = i;
    while (j < nodes.length && nodes[j]!.type === "text" && same(nodes[j]!)) j++;
    const run = nodes.slice(i, j).map((x) => ({ ...x, marks: (x.marks ?? []).filter((y) => y.type !== m.type) }));
    if (m.type === "code") out.push({ type: "inlineCode", value: run.map((x) => x.text ?? "").join("") });
    else if (m.type === "link") out.push({ type: "link", url: String(m.attrs?.href ?? ""), title: (m.attrs?.title as string | null) ?? null, children: toMdastInline(run) });
    else out.push({ type: m.type === "bold" ? "strong" : m.type === "italic" ? "emphasis" : "delete", children: toMdastInline(run) } as Md.PhrasingContent);
    i = j;
  }
  return out;
}
