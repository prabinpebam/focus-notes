/**
 * The Markdown bridge (D-01, EDT-01, EDT-10, EXT-05).
 *
 * Parsing turns Markdown into an editor document (ProseMirror JSON) and remembers the source
 * text of every top-level block. Serializing writes each block back from its original source
 * when it is unchanged, so untouched parts of a file are byte-for-byte identical. Changed blocks
 * are written with mdast-util-to-markdown. Constructs the editor can't represent yet become
 * raw blocks that keep their source verbatim.
 */
import { unified, type Processor } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkDirective from "remark-directive";
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
  /** The source without a leading byte-order mark. */
  source: string;
  /** Whether the file started with a byte-order mark, written back on save. */
  bom: boolean;
  /** The file's line ending, used for any text the serializer generates. */
  eol: "\n" | "\r\n";
}

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]).use(remarkDirective);

const MARK_ORDER = ["link", "bold", "italic", "strike", "code"];
const KEPT_ATTRS: Record<string, string[]> = {
  heading: ["level"],
  orderedList: ["start"],
  codeBlock: ["language"],
  rawMarkdown: ["source"],
  taskItem: ["checked"],
  tableHeader: ["align"],
  tableCell: ["align"],
  link: ["href", "title"],
};

/**
 * A table's layout and set column widths (D-182) live in an HTML comment on the line before it, which
 * GitHub and other readers don't show: `<!-- table: layout=bleed widths=24,40,- -->`. Only what isn't
 * the default is written; a table without one is Fit to column with no set widths.
 */
const TABLE_NOTE = /^<!--\s*table:\s*([\s\S]*?)\s*-->$/;
export interface TableSettings { layout: "fit" | "bleed"; widths: (number | null)[] | null }
export function parseTableNote(html: string): TableSettings | undefined {
  const m = TABLE_NOTE.exec(html.trim());
  if (!m) return undefined;
  const out: TableSettings = { layout: "fit", widths: null };
  for (const part of m[1]!.split(/\s+/)) {
    const [k, v = ""] = part.split("=");
    if (k === "layout" && v === "bleed") out.layout = "bleed";
    if (k === "widths") {
      const ws = v.split(",").map((w) => (/^\d+(\.\d+)?$/.test(w) && Number(w) > 0 ? Number(w) : null));
      if (ws.some((w) => w !== null)) out.widths = ws;
    }
  }
  return out;
}
const tableSettingsOf = (node: PMNode): TableSettings => {
  const ws = Array.isArray(node.attrs?.widths) ? (node.attrs!.widths as unknown[]).map((w) => (typeof w === "number" && w > 0 ? w : null)) : null;
  return { layout: node.attrs?.layout === "bleed" ? "bleed" : "fit", widths: ws && ws.some((w) => w !== null) ? ws : null };
};
export function tableNote(s: TableSettings): string | undefined {
  const parts = [...(s.layout === "bleed" ? ["layout=bleed"] : []), ...(s.widths ? [`widths=${s.widths.map((w) => w ?? "-").join(",")}`] : [])];
  return parts.length ? `<!-- table: ${parts.join(" ")} -->` : undefined;
}

/** A stable description of a node that ignores editor-only attributes. */
export function canonical(node: PMNode): unknown {
  const keep = KEPT_ATTRS[node.type] ?? [];
  const attrs: Record<string, unknown> = node.type === "table" ? { ...tableSettingsOf(node) } : Object.fromEntries(keep.map((k) => [k, node.attrs?.[k] ?? null]));
  const marks = (node.marks ?? [])
    .map((m) => ({ type: m.type, attrs: Object.fromEntries((KEPT_ATTRS[m.type] ?? []).map((k) => [k, m.attrs?.[k] ?? null])) }))
    .sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
  return [node.type, attrs, node.text ?? null, marks, (node.content ?? []).map(canonical)];
}
export const fingerprint = (node: PMNode): string => JSON.stringify(canonical(node));

// ---------------- parse ----------------

let currentSource = "";
type SourcePosition = { start: { offset?: number }; end: { offset?: number } };

export function parseMarkdown(input: string): Parsed {
  const bom = input.startsWith("\uFEFF");
  const source = bom ? input.slice(1) : input;
  const eol = /\r\n/.test(source) ? "\r\n" : "\n";
  currentSource = source;
  const tree = processor.parse(source) as Md.Root;
  const content: PMNode[] = [];
  const blocks: SourceBlock[] = [];
  for (let i = 0; i < tree.children.length; i++) {
    const child = tree.children[i]!;
    const start = child.position?.start.offset ?? 0;
    let end = child.position?.end.offset ?? start;
    let node: PMNode | undefined;
    // A table's settings comment (D-182), on the line right before it, belongs to that table.
    const next = tree.children[i + 1];
    const settings = child.type === "html" ? parseTableNote(child.value) : undefined;
    if (settings && next?.type === "table" && /^\r?\n$/.test(source.slice(end, next.position?.start.offset ?? end))) {
      const table = convertTable(next);
      if (table) {
        node = { ...table, attrs: { layout: settings.layout, widths: settings.widths } };
        end = next.position?.end.offset ?? end;
        i++;
      }
    }
    node ??= blockFromMdast(child, source.slice(start, end));
    content.push(node);
    blocks.push({ fingerprint: fingerprint(node), start, end });
  }
  if (content.length === 0) content.push({ type: "paragraph" });
  return { doc: { type: "doc", content }, blocks, source, bom, eol };
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
      const checks = node.children.map((i) => i.checked);
      const isTask = checks.every((c) => c === true || c === false);
      if (!isTask && checks.some((c) => c === true || c === false)) return undefined; // mixed lists stay verbatim
      const items: PMNode[] = [];
      for (const item of node.children) {
        const kids = item.children.map((c) => convertBlock(c));
        if (kids.some((k) => !k)) return undefined;
        if (kids.length === 0 || kids[0]!.type !== "paragraph") kids.unshift({ type: "paragraph" });
        items.push(isTask ? { type: "taskItem", attrs: { checked: item.checked === true }, content: kids as PMNode[] } : { type: "listItem", content: kids as PMNode[] });
      }
      if (isTask) return node.ordered ? undefined : { type: "taskList", content: items };
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
    case "table":
      return convertTable(node);
    default:
      return undefined;
  }
}

/**
 * A GFM table (TBL-06): a header row of header cells, then body rows, each cell one paragraph of
 * inline content with its column's alignment. Short rows are filled and cells past the header are
 * dropped, as GFM reads them; a table always has a body row.
 */
function convertTable(node: Md.Table): PMNode | undefined {
  const width = node.children[0]?.children.length ?? 0;
  if (!width) return undefined;
  const align = (i: number) => node.align?.[i] ?? null;
  const rows: PMNode[] = [];
  for (const [r, mdRow] of node.children.entries()) {
    const content: PMNode[] = [];
    for (let c = 0; c < width; c++) {
      const kids = mdRow.children[c]?.children ?? [];
      const inline = convertInline(kids, []);
      if (!inline) return undefined;
      content.push(tableCell(r === 0, align(c), inline));
    }
    rows.push({ type: "tableRow", content });
  }
  if (rows.length === 1) rows.push({ type: "tableRow", content: Array.from({ length: width }, (_, c) => tableCell(false, align(c), [])) });
  return { type: "table", content: rows };
}

const tableCell = (header: boolean, align: string | null, inline: PMNode[]): PMNode => ({ type: header ? "tableHeader" : "tableCell", attrs: { align }, content: [para(inline)] });

const para = (content: PMNode[]): PMNode => (content.length ? { type: "paragraph", content } : { type: "paragraph" });

function convertInline(nodes: Md.PhrasingContent[], marks: PMMark[]): PMNode[] | undefined {
  const out = convertInlineRaw(nodes, marks);
  return out ? mergeText(out) : undefined;
}

/** ProseMirror merges adjacent text with the same marks; do the same so fingerprints match. */
function mergeText(nodes: PMNode[]): PMNode[] {
  const out: PMNode[] = [];
  for (const n of nodes) {
    const prev = out.at(-1);
    if (prev && prev.type === "text" && n.type === "text" && JSON.stringify(prev.marks ?? []) === JSON.stringify(n.marks ?? [])) {
      out[out.length - 1] = { ...prev, text: (prev.text ?? "") + (n.text ?? "") };
    } else out.push(n);
  }
  return out;
}

function convertInlineRaw(nodes: Md.PhrasingContent[], marks: PMMark[]): PMNode[] | undefined {
  const out: PMNode[] = [];
  for (const n of nodes as (Md.PhrasingContent | { type: "textDirective"; position?: SourcePosition })[]) {
    switch (n.type) {
      case "textDirective": {
        // Ordinary text that happens to look like `:name`, kept as the text it is.
        const p = (n as { position?: SourcePosition }).position;
        if (!p) return undefined;
        out.push(textNode(currentSource.slice(p.start.offset, p.end.offset), marks));
        break;
      }
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
        // A link with no visible text can't be edited; keep its block verbatim instead of losing it.
        if (!inner || inner.length === 0) return undefined;
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

// ---------------- paste (EDT-09) ----------------

/**
 * Plain text, one paragraph per non-empty line: what content the editor can't represent becomes
 * when it's pasted (EDT-09), so nothing pasted is lost or read-only.
 */
export function plainTextBlocks(text: string): PMNode[] {
  return text.split(/\r\n?|\n/).filter((line) => line.trim()).map((line) => para([textNode(line, [])]));
}

/** Pasted Markdown as blocks: what the editor can't represent yet degrades to its text. */
export function markdownToBlocks(markdown: string): PMNode[] {
  const parsed = parseMarkdown(markdown);
  return degrade(parsed.blocks.length ? parsed.doc.content ?? [] : []);
}

/**
 * Markdown (as mdast, from converted HTML) as blocks. A construct the editor can't represent yet
 * (raw HTML, footnotes) becomes its Markdown text, one paragraph per line. Tables are tables (TBL-10).
 */
export function blocksFromMdast(root: Md.Root): PMNode[] {
  currentSource = "";
  const out: PMNode[] = [];
  for (const child of root.children) {
    let node: PMNode | undefined;
    try {
      node = convertBlock(child);
    } catch {
      node = undefined;
    }
    if (node) out.push(node);
    else out.push(...plainTextBlocks(toMarkdown({ type: "root", children: [child] } as Md.Root, MD_OPTIONS)));
  }
  return out;
}

const degrade = (nodes: PMNode[]): PMNode[] => nodes.flatMap((n) => (n.type === "rawMarkdown" ? plainTextBlocks(String(n.attrs?.source ?? "")) : [n]));

// ---------------- link destinations (FIL-09) ----------------

/** Where a link's or image's destination is written, or a reference definition's (`[id]: path.md`). */
export interface LinkDestination {
  /** Offsets into the text as given (a byte-order mark counts), excluding any angle brackets. */
  start: number;
  end: number;
  /** Written as `<…>`, where spaces may appear unencoded. */
  angle: boolean;
}

let foundDestinations: LinkDestination[] = [];
type Token = { start: { offset: number }; end: { offset: number } };
const recordRaw = (t: Token) => { foundDestinations.push({ start: t.start.offset, end: t.end.offset, angle: false }); };
const recordLiteral = (t: Token) => { if (t.end.offset - t.start.offset > 2) foundDestinations.push({ start: t.start.offset + 1, end: t.end.offset - 1, angle: true }); };
/** The parser's own tokens say exactly where each destination is; nothing in code, HTML, or front matter is one. */
function collectDestinations(this: Processor) {
  const data = this.data();
  (data.fromMarkdownExtensions ??= []).push({
    exit: { resourceDestinationRaw: recordRaw, resourceDestinationLiteral: recordLiteral, definitionDestinationRaw: recordRaw, definitionDestinationLiteral: recordLiteral },
  });
}
const linkProcessor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]).use(remarkDirective).use(collectDestinations);

/**
 * Every link, image, and reference definition destination in a note, in source order, so a
 * caller can change just those characters and leave every other byte as it was.
 */
export function linkDestinations(input: string): LinkDestination[] {
  const bom = input.startsWith("\uFEFF") ? 1 : 0;
  foundDestinations = [];
  try {
    linkProcessor.parse(bom ? input.slice(1) : input);
    return foundDestinations.map((d) => ({ ...d, start: d.start + bom, end: d.end + bom })).sort((a, b) => a.start - b.start);
  } finally {
    foundDestinations = [];
  }
}

// ---------------- serialize ----------------

const MD_OPTIONS: ToMarkdownOptions = {
  bullet: "-",
  emphasis: "*",
  strong: "*",
  fence: "`",
  fences: true,
  listItemIndent: "one",
  rule: "-",
  extensions: [gfmToMarkdown()],
};

export function serializeMarkdown(doc: PMNode, original?: Parsed): string {
  const src = original?.source ?? "";
  const blocks = original?.blocks ?? [];
  const eol = original?.eol ?? "\n";
  const bom = original?.bom ? "\uFEFF" : "";
  const generated = (text: string) => (eol === "\n" ? text : text.replace(/\r?\n/g, eol));
  let out = "";
  let written = 0;
  let prev = -1; // index of the previous original block that was reused
  let prevWasReused = false;
  for (const node of doc.content ?? []) {
    const fp = fingerprint(node);
    let match = -1;
    for (let k = prev + 1; k < blocks.length; k++) if (blocks[k]!.fingerprint === fp) { match = k; break; }
    // Markdown can't hold an empty paragraph, so new ones are dropped. Ones that came from the file are kept.
    if (match < 0 && node.type === "paragraph" && !node.content?.length) continue;
    const text = match >= 0 ? src.slice(blocks[match]!.start, blocks[match]!.end) : generated(blockToMarkdown(node));
    if (written === 0) out += match === 0 ? src.slice(0, blocks[0]!.start) : "";
    else if (match >= 0 && prevWasReused && match === prev + 1) out += src.slice(blocks[prev]!.end, blocks[match]!.start);
    else out += eol + eol;
    out += text;
    written++;
    prevWasReused = match >= 0;
    if (match >= 0) prev = match;
  }
  if (written === 0) return bom + (blocks.length === 0 ? src : "");
  const lastIsOriginalLast = prevWasReused && prev === blocks.length - 1;
  out += lastIsOriginalLast ? src.slice(blocks[prev]!.end) : eol;
  return bom + out;
}

export function blockToMarkdown(node: PMNode): string {
  if (node.type === "rawMarkdown") return String(node.attrs?.source ?? "");
  const mdast = { type: "root", children: [toMdastBlock(node)] } as Md.Root;
  const text = toMarkdown(mdast, MD_OPTIONS).replace(/\n+$/, "");
  // A table's layout and set widths go on the line before it (D-182).
  const note = node.type === "table" ? tableNote(tableSettingsOf(node)) : undefined;
  return note ? `${note}\n${text}` : text;
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
    case "taskList":
      return {
        type: "list",
        ordered: false,
        spread: false,
        children: (node.content ?? []).map((li) => ({
          type: "listItem",
          spread: false,
          checked: Boolean(li.attrs?.checked),
          children: (li.content ?? []).map(toMdastBlock) as Md.BlockContent[],
        })),
      };
    case "codeBlock":
      return { type: "code", lang: (node.attrs?.language as string | null) ?? null, value: (node.content ?? []).map((t) => t.text ?? "").join("") };
    case "horizontalRule":
      return { type: "thematicBreak" };
    case "rawMarkdown":
      return { type: "html", value: String(node.attrs?.source ?? "") };
    case "table": {
      const rows = node.content ?? [];
      const header = rows[0]?.content ?? [];
      return {
        type: "table",
        align: header.map((c) => (["left", "center", "right"].includes(String(c.attrs?.align)) ? (c.attrs!.align as Md.AlignType) : null)),
        children: rows.map((r) => ({
          type: "tableRow",
          // A GFM cell is one line: anything that would break it (a stray line break) becomes a space.
          children: (r.content ?? []).map((c) => ({ type: "tableCell", children: toMdastInline(cellInline(c)) })),
        })),
      };
    }
    default:
      return { type: "paragraph", children: toMdastInline(node.content ?? []) };
  }
}

/** A cell's inline content: its paragraphs joined by spaces, line breaks as spaces. */
function cellInline(cell: PMNode): PMNode[] {
  const out: PMNode[] = [];
  for (const [i, p] of (cell.content ?? []).entries()) {
    if (i > 0) out.push({ type: "text", text: " " });
    for (const n of p.content ?? []) out.push(n.type === "hardBreak" ? { type: "text", text: " ", ...(n.marks ? { marks: n.marks } : {}) } : n);
  }
  return mergeText(out);
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
