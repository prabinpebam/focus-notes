/**
 * Paste and drop (EDT-09, SEC-02). Markdown text is parsed into blocks; HTML from web pages, Word,
 * and Google Docs is sanitized, then converted to the nearest Markdown the editor supports; what it
 * can't represent yet degrades to plain text. Mod+Shift+V pastes plain text as it is.
 */
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { DOMParser as PMDOMParser, Fragment, Slice, type ParseOptions, type Schema } from "@tiptap/pm/model";
import type * as Md from "mdast";
import { blocksFromMdast, markdownToBlocks, type PMNode } from "@focus-notes/markdown";
import { isSafeHref, sanitizePastedHtml } from "./sanitize.ts";

type Inline = Md.PhrasingContent;
type MarkName = "bold" | "italic" | "strike" | "code" | "link";

const BLOCK_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "hr", "table", "thead",
  "tbody", "tfoot", "tr", "td", "th", "caption", "section", "article", "header", "footer", "main", "aside", "nav",
  "figure", "figcaption", "dl", "dt", "dd", "address", "center", "body", "html",
]);
/** Elements that carry structure or formatting: HTML with none of them is just text (VS Code, a text field). */
const SEMANTIC_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "code", "kbd", "samp", "tt", "table",
  "a", "b", "strong", "i", "em", "s", "del", "strike", "hr", "img",
]);
const CODE_TAGS = new Set(["code", "kbd", "samp", "tt"]);

const isElement = (n: Node): n is Element => n.nodeType === 1;
const styleOf = (el: Element) => el.getAttribute("style") ?? "";
const styleValue = (style: string, name: string) => new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i").exec(style)?.[1]?.trim().toLowerCase() ?? "";
/** Word's list marker (`·` or `1.`) sits in a span marked `mso-list:Ignore`. */
const isWordMarker = (el: Element) => /mso-list\s*:\s*ignore/i.test(styleOf(el));
const wordListLevel = (el: Element): number => {
  if (el.localName !== "p") return 0;
  const m = /mso-list\s*:\s*l\d+\s+level(\d+)/i.exec(styleOf(el));
  return m ? Number(m[1]) : 0;
};
function wordMarker(el: Element): string {
  for (const c of el.querySelectorAll("*")) if (isWordMarker(c)) return (c.textContent ?? "").replace(/\s+/g, "");
  return "";
}

const containsBlock = (el: Element) => [...el.querySelectorAll("*")].some((d) => BLOCK_TAGS.has(d.localName));

/** The marks an element adds: by tag, or by style the way Google Docs and Word write them. */
function marksOf(el: Element): MarkName[] {
  const tag = el.localName;
  const style = styleOf(el);
  const weight = styleValue(style, "font-weight");
  const marks: MarkName[] = [];
  const heavy = weight === "bold" || weight === "bolder" || Number(weight) >= 600;
  const light = weight === "normal" || weight === "lighter" || (Number(weight) > 0 && Number(weight) < 600);
  if (((tag === "b" || tag === "strong") && !light) || heavy) marks.push("bold");
  const fontStyle = styleValue(style, "font-style");
  if (((tag === "i" || tag === "em") && fontStyle !== "normal") || fontStyle === "italic" || fontStyle === "oblique") marks.push("italic");
  const decoration = `${styleValue(style, "text-decoration")} ${styleValue(style, "text-decoration-line")}`;
  if (tag === "s" || tag === "del" || tag === "strike" || decoration.includes("line-through")) marks.push("strike");
  return marks;
}

/** Text with line breaks, for code: `<br>` and line elements become new lines. */
function codeText(node: Node): string {
  let out = "";
  for (const c of node.childNodes) {
    if (c.nodeType === 3) out += c.nodeValue ?? "";
    else if (isElement(c)) {
      if (c.localName === "br") out += "\n";
      else {
        out += codeText(c);
        if ((c.localName === "div" || c.localName === "p") && !out.endsWith("\n")) out += "\n";
      }
    }
  }
  return out;
}

/** Collapses whitespace as a browser does, and drops breaks and spaces at a paragraph's edges. */
function normalize(nodes: Inline[]): Inline[] {
  const seq: Inline[] = [];
  const visit = (ns: Inline[]) => {
    for (const n of ns) {
      if (n.type === "text") {
        n.value = n.value.replace(/\s+/g, " ");
        seq.push(n);
      } else if (n.type === "break" || n.type === "inlineCode") seq.push(n);
      else if ("children" in n) visit(n.children as Inline[]);
    }
  };
  visit(nodes);
  let space = true;
  for (const n of seq) {
    if (n.type === "text") {
      if (space && n.value.startsWith(" ")) n.value = n.value.slice(1);
      if (n.value) space = n.value.endsWith(" ");
    } else space = n.type === "break";
  }
  space = true;
  const drop = new Set<Inline>();
  for (let i = seq.length - 1; i >= 0; i--) {
    const n = seq[i]!;
    if (n.type === "text") {
      if (space && n.value.endsWith(" ")) n.value = n.value.slice(0, -1);
      if (n.value) space = false;
      else drop.add(n);
    } else if (n.type === "break") {
      if (space) drop.add(n);
      space = true;
    } else space = false;
  }
  // Breaks at the start go too.
  for (const n of seq) {
    if (n.type === "text" && !n.value) continue;
    if (n.type !== "break") break;
    drop.add(n);
  }
  const prune = (ns: Inline[]): Inline[] =>
    ns.flatMap((n) => {
      if (drop.has(n)) return [];
      if (n.type === "text" || n.type === "break" || n.type === "inlineCode") return [n];
      if ("children" in n) {
        const kids = prune(n.children as Inline[]);
        return kids.length ? [{ ...n, children: kids } as Inline] : [];
      }
      return [n];
    });
  return prune(nodes);
}

/** Reads sanitized HTML (in an inert document) as Markdown (mdast). */
class HtmlReader {
  images = 0;
  semantic = false;

  blocks(parent: Node): Md.RootContent[] {
    const out: Md.RootContent[] = [];
    let run: Node[] = [];
    const flush = () => {
      const kids = normalize(run.flatMap((n) => this.inline(n, new Set())));
      if (kids.length) out.push({ type: "paragraph", children: kids });
      run = [];
    };
    const children = [...parent.childNodes];
    for (let i = 0; i < children.length; i++) {
      const c = children[i]!;
      if (!isElement(c) || !BLOCK_TAGS.has(c.localName)) {
        // Google Docs wraps everything in one <b>: an inline element holding blocks is a container.
        if (isElement(c) && containsBlock(c)) {
          flush();
          if (SEMANTIC_TAGS.has(c.localName)) this.semantic = true;
          out.push(...this.blocks(c));
        } else run.push(c);
        continue;
      }
      flush();
      const tag = c.localName;
      if (SEMANTIC_TAGS.has(tag)) this.semantic = true;
      if (wordListLevel(c)) {
        const items: Element[] = [];
        let j = i;
        for (; j < children.length; j++) {
          const n = children[j]!;
          if (isElement(n) && wordListLevel(n)) items.push(n);
          else if (isElement(n) || (n.nodeValue ?? "").trim()) break;
        }
        out.push(...this.wordLists(items));
        i = j - 1;
        continue;
      }
      const heading = /^h([1-6])$/.exec(tag);
      if (heading) {
        const kids = normalize(this.inlineChildren(c, new Set()));
        if (kids.length) out.push({ type: "heading", depth: Number(heading[1]) as Md.Heading["depth"], children: kids });
      } else if (tag === "ul" || tag === "ol") out.push(this.list(c));
      else if (tag === "li") out.push({ type: "list", ordered: false, spread: false, children: [this.item(c)] });
      else if (tag === "blockquote") {
        const kids = this.blocks(c) as Md.BlockContent[];
        if (kids.length) out.push({ type: "blockquote", children: kids });
      } else if (tag === "pre") out.push(this.code(c));
      else if (tag === "hr") out.push({ type: "thematicBreak" });
      else if (tag === "table") out.push(this.table(c));
      else out.push(...this.blocks(c));
    }
    flush();
    return out;
  }

  inlineChildren(el: Node, active: ReadonlySet<MarkName>): Inline[] {
    return [...el.childNodes].flatMap((c) => this.inline(c, active));
  }

  inline(node: Node, active: ReadonlySet<MarkName>): Inline[] {
    if (node.nodeType === 3) return node.nodeValue ? [{ type: "text", value: node.nodeValue }] : [];
    if (!isElement(node) || isWordMarker(node)) return [];
    const tag = node.localName;
    if (SEMANTIC_TAGS.has(tag)) this.semantic = true;
    if (tag === "br") return [{ type: "break" }];
    if (tag === "input") return [];
    if (tag === "img") {
      // Images wait for the image block (EXT-03): the alt text stays, and the paste says so.
      this.images++;
      const alt = node.getAttribute("alt")?.trim();
      return alt ? [{ type: "text", value: alt }] : [];
    }
    if (CODE_TAGS.has(tag)) {
      if (active.has("code")) return this.inlineChildren(node, active);
      const value = (node.textContent ?? "").replace(/\s+/g, " ");
      return value.trim() ? [{ type: "inlineCode", value }] : [];
    }
    if (tag === "a") {
      const href = node.getAttribute("href") ?? "";
      if (!href || !isSafeHref(href) || active.has("link")) return this.inlineChildren(node, active);
      const kids = this.inlineChildren(node, new Set([...active, "link"]));
      return kids.length ? [{ type: "link", url: href, title: node.getAttribute("title"), children: kids }] : [];
    }
    const added = marksOf(node).filter((m) => !active.has(m));
    if (added.length) this.semantic = true;
    let kids = this.inlineChildren(node, new Set([...active, ...added]));
    // A block inside inline content (a paragraph in a table cell) keeps a space from its neighbor.
    if (BLOCK_TAGS.has(tag)) kids = [...kids, { type: "text", value: " " }];
    for (const m of added.reverse()) {
      kids = [{ type: m === "bold" ? "strong" : m === "italic" ? "emphasis" : "delete", children: kids } as Inline];
    }
    return kids;
  }

  item(li: Element): Md.ListItem {
    const box = [...li.querySelectorAll("input[type=checkbox]")].find((b) => b.closest("li") === li);
    const children = this.blocks(li) as Md.BlockContent[];
    return { type: "listItem", spread: false, checked: box ? box.hasAttribute("checked") : null, children };
  }

  list(el: Element): Md.List {
    const ordered = el.localName === "ol";
    const items: Md.ListItem[] = [];
    for (const c of el.children) {
      if (c.localName === "li") items.push(this.item(c));
      else if ((c.localName === "ul" || c.localName === "ol") && items.length) items.at(-1)!.children.push(this.list(c));
    }
    const start = Number(el.getAttribute("start") ?? 1);
    return { type: "list", ordered, start: ordered ? (Number.isFinite(start) ? start : 1) : null, spread: false, children: items };
  }

  /** Word writes lists as paragraphs with a level and a typed marker; they become nested lists. */
  wordLists(paras: Element[]): Md.List[] {
    this.semantic = true;
    const roots: Md.List[] = [];
    const stack: { list: Md.List; level: number }[] = [];
    for (const p of paras) {
      const level = wordListLevel(p);
      const ordered = /^\(?([0-9]+|[a-z]|[ivxlcdm]+)[.)]$/i.test(wordMarker(p));
      const kids = normalize(this.inlineChildren(p, new Set()));
      const item: Md.ListItem = { type: "listItem", spread: false, children: kids.length ? [{ type: "paragraph", children: kids }] : [] };
      while (stack.length && stack.at(-1)!.level > level) stack.pop();
      if (stack.length && stack.at(-1)!.level === level && stack.at(-1)!.list.ordered !== ordered) stack.pop();
      let top = stack.at(-1);
      if (!top || top.level < level) {
        const list: Md.List = { type: "list", ordered, start: ordered ? 1 : null, spread: false, children: [] };
        if (top) top.list.children.at(-1)!.children.push(list);
        else roots.push(list);
        top = { list, level };
        stack.push(top);
      }
      top.list.children.push(item);
    }
    return roots;
  }

  code(pre: Element): Md.Code {
    const classes = `${pre.querySelector("code")?.getAttribute("class") ?? ""} ${pre.getAttribute("class") ?? ""}`;
    const lang = /(?:^|\s)(?:language|lang)-([\w+#.-]+)/.exec(classes)?.[1] ?? null;
    return { type: "code", lang, meta: null, value: codeText(pre).replace(/\n$/, "") };
  }

  /** Tables convert to GFM tables, which open as tables (TBL-10). */
  table(el: Element): Md.Table {
    const rows: Md.TableRow[] = [];
    for (const tr of el.querySelectorAll("tr")) {
      const cells = [...tr.children].filter((c) => c.localName === "td" || c.localName === "th");
      rows.push({ type: "tableRow", children: cells.map((c) => ({ type: "tableCell", children: normalize(this.inlineChildren(c, new Set())) })) });
    }
    return { type: "table", align: [], children: rows };
  }
}

export interface ConvertedHtml {
  blocks: PMNode[];
  /** Images left out, which the paste reports (EXT-03 isn't built yet). */
  images: number;
  /** It had structure or formatting; without any, its text is read as Markdown instead. */
  semantic: boolean;
}

/** Sanitized HTML, already parsed in an inert document, as the editor's blocks. */
export function htmlToBlocks(root: Node): ConvertedHtml {
  const reader = new HtmlReader();
  const tree: Md.Root = { type: "root", children: reader.blocks(root) };
  return { blocks: safeLinks(blocksFromMdast(tree)), images: reader.images, semantic: reader.semantic };
}

/** Pasted Markdown as blocks, keeping links only with safe schemes (SEC-02). */
export const pastedMarkdownBlocks = (text: string): PMNode[] => safeLinks(markdownToBlocks(text));

/** Removes links whose address isn't safe, keeping their text. */
export function safeLinks(nodes: PMNode[]): PMNode[] {
  return nodes.map((n) => {
    const marks = n.marks?.filter((m) => m.type !== "link" || isSafeHref(String(m.attrs?.href ?? "")));
    const out: PMNode = { ...n };
    if (n.marks) {
      if (marks?.length) out.marks = marks;
      else delete out.marks;
    }
    if (n.content) out.content = safeLinks(n.content);
    return out;
  });
}

/** One line pasted between words keeps the spaces at its ends, which Markdown would trim. */
function keepEdgeSpaces(text: string, blocks: PMNode[]): PMNode[] {
  if (/[\r\n]/.test(text) || blocks.length !== 1 || blocks[0]!.type !== "paragraph") return blocks;
  const content = [...(blocks[0]!.content ?? [])];
  const lead = /^[ \t]+/.exec(text)?.[0] ?? "";
  const trail = /[ \t]+$/.exec(text)?.[0] ?? "";
  if (lead) content.unshift({ type: "text", text: lead });
  if (trail) content.push({ type: "text", text: trail });
  return [{ ...blocks[0]!, content }];
}

const hasImageFiles = (data: DataTransfer | null | undefined): boolean =>
  Boolean(data) && [...(data!.files ?? [])].some((f) => f.type.startsWith("image/"));

export interface PasteOptions {
  /** Something pasted or dropped couldn't come in: images, until the image block (EXT-03). */
  onNotice?: (kind: string, args?: Record<string, number>) => void;
}

/**
 * The paste pipeline. ProseMirror reads the clipboard; this decides what it becomes: HTML is
 * sanitized before it's parsed, then read as Markdown; text is parsed as Markdown unless pasted
 * as plain text (Mod+Shift+V) or into code; a copy from the editor itself keeps its structure.
 */
export const SmartPaste = Extension.create<PasteOptions>({
  name: "smartPaste",
  addOptions() {
    return {};
  },
  addProseMirrorPlugins() {
    const editor: Editor = this.editor;
    const notice = this.options.onNotice;
    let clipboard: { text: string; preferText: boolean } | null = null;
    let images = 0;
    const toSlice = (schema: Schema, blocks: PMNode[]) => new Slice(Fragment.fromJSON(schema, blocks), 0, 0);
    const clipboardParser = {
      parseSlice(dom: Node, options?: ParseOptions): Slice {
        const schema = editor.schema;
        const el = dom as Element;
        // A copy from ProseMirror (this editor, or another note) keeps its exact structure, and
        // plain text (Mod+Shift+V) arrives as ProseMirror's own paragraphs, read whitespace and all.
        if (options?.preserveWhitespace || el.closest?.("[data-pm-slice]") || el.querySelector?.("[data-pm-slice]")) {
          clipboard = null;
          return PMDOMParser.fromSchema(schema).parseSlice(dom, options);
        }
        const text = clipboard?.text ?? "";
        const preferText = clipboard?.preferText ?? false;
        clipboard = null;
        const html = htmlToBlocks(dom);
        // Code editors put the Markdown source on the clipboard as styled text; read it as Markdown.
        if ((preferText || !html.semantic) && text.trim()) return toSlice(schema, pastedMarkdownBlocks(text));
        images = html.images;
        return toSlice(schema, html.blocks);
      },
    };
    const report = (empty: boolean, data: DataTransfer | null | undefined) => {
      const left = images > 0 || (empty && hasImageFiles(data));
      images = 0;
      if (left) notice?.("images");
      return left && empty;
    };
    return [new Plugin({
      key: new PluginKey("smartPaste"),
      props: {
        transformPastedHTML: (html) => sanitizePastedHtml(html),
        clipboardParser: clipboardParser as unknown as PMDOMParser,
        clipboardTextParser: (text, _$context, plain) => {
          if (plain) return null as unknown as Slice;
          const blocks = keepEdgeSpaces(text, pastedMarkdownBlocks(text));
          return blocks.length ? Slice.maxOpen(Fragment.fromJSON(editor.schema, blocks)) : (null as unknown as Slice);
        },
        handleDOMEvents: {
          paste: (_view, event) => {
            const data = event.clipboardData;
            clipboard = data ? { text: data.getData("text/plain"), preferText: [...(data.types ?? [])].includes("vscode-editor-data") } : null;
            images = 0;
            return false;
          },
          drop: (view, event) => {
            const data = event.dataTransfer;
            clipboard = data && !view.dragging ? { text: data.getData("text/plain"), preferText: false } : null;
            images = 0;
            return false;
          },
        },
        handlePaste: (_view, event, slice) => report(slice.size === 0, event.clipboardData),
        handleDrop: (_view, event, slice, moved) => !moved && report(slice.size === 0, (event as DragEvent).dataTransfer),
      },
    })];
  },
});
