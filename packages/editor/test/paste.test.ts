// @vitest-environment jsdom
/**
 * EDT-09: paste. Markdown text becomes blocks, HTML from web pages, Word, and Google Docs becomes the
 * nearest Markdown, what isn't supported yet degrades to plain text, and Mod+Shift+V pastes plain text.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { coreExtensions, EDITOR_OPTIONS, htmlToMarkdown, MarkdownSession, type PMNode } from "../src/index.ts";

let editors: Editor[] = [];
afterEach(() => {
  for (const e of editors) e.destroy();
  editors = [];
});

function open(markdown: string, onPasteNotice?: (kind: string) => void) {
  const session = new MarkdownSession(markdown);
  const editor = new Editor({ ...EDITOR_OPTIONS, extensions: coreExtensions([], onPasteNotice ? { onPasteNotice } : {}), content: session.doc as object });
  editors.push(editor);
  const md = () => session.serialize(editor.getJSON() as PMNode);
  return { editor, md };
}

/** Puts the caret right after the first occurrence of `text`, or at the end of the note. */
function caretAfter(editor: Editor, text?: string) {
  let at = editor.state.doc.content.size - 1;
  if (text) {
    editor.state.doc.descendants((node, pos) => {
      const i = node.isText ? node.text!.indexOf(text) : -1;
      if (i >= 0 && at === editor.state.doc.content.size - 1) at = pos + i + text.length;
    });
  }
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)));
}

/** A paste as the browser delivers it: Mod+V, or Mod+Shift+V for plain text. */
function paste(editor: Editor, data: Record<string, string>, { plain = false, files = [] as File[] } = {}) {
  const view = editor.view;
  if (plain) view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "V", ctrlKey: true, shiftKey: true, bubbles: true }));
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { types: Object.keys(data), getData: (t: string) => data[t] ?? "", files, items: [] },
  });
  view.dom.dispatchEvent(event);
  if (plain) view.dom.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true }));
}

const kinds = (editor: Editor) => (editor.getJSON().content ?? []).map((n) => n.type);

describe("Markdown text (EDT-09)", () => {
  it("becomes blocks, marks, and links", () => {
    const { editor, md } = open("");
    paste(editor, { "text/plain": "# Title\n\n- one\n- two\n\n1. first\n\n> quoted\n\nSome **bold**, *italic*, ~~gone~~, `code`, and [a link](https://example.com).\n\n```js\nlet a = 1;\n```\n\n---\n\n- [ ] task\n" });
    expect(md()).toBe("# Title\n\n- one\n- two\n\n1. first\n\n> quoted\n\nSome **bold**, *italic*, ~~gone~~, `code`, and [a link](https://example.com).\n\n```js\nlet a = 1;\n```\n\n---\n\n- [ ] task\n");
  });
  it("joins the text around the caret when it's one paragraph", () => {
    const { editor, md } = open("Hello world\n");
    caretAfter(editor, "Hello ");
    paste(editor, { "text/plain": "**big** " });
    expect(md()).toBe("Hello **big** world\n");
  });
  it("reads a GFM table as a table (TBL-10; it degraded to text until WP-1.5)", () => {
    const { editor, md } = open("");
    paste(editor, { "text/plain": "| a | b |\n| - | - |\n| 1 | 2 |\n" });
    expect(kinds(editor)[0]).toBe("table");
    expect(md()).toBe("| a | b |\n| - | - |\n| 1 | 2 |\n");
  });
  it("keeps raw HTML as text and drops links with unsafe schemes (SEC-02)", () => {
    const { editor, md } = open("");
    paste(editor, { "text/plain": "<script>alert(1)</script>\n\n[x](javascript:alert(1)) [y](data:text/html,hi) [ok](https://example.com) [rel](notes/a.md)\n" });
    expect(kinds(editor)).toEqual(["paragraph", "paragraph"]);
    expect(editor.view.dom.querySelector("script")).toBeNull();
    expect(md()).toBe("\\<script>alert(1)\\</script>\n\nx y [ok](https://example.com) [rel](notes/a.md)\n");
  });
  it("Mod+Shift+V pastes plain text, Markdown characters and all", () => {
    const { editor, md } = open("");
    paste(editor, { "text/plain": "**not bold** and # not a heading\nsecond line", "text/html": "<b>not bold</b>" }, { plain: true });
    expect(kinds(editor)).toEqual(["paragraph", "paragraph"]);
    expect(editor.state.doc.textContent).toBe("**not bold** and # not a heading" + "second line");
    expect(editor.view.dom.querySelector("strong")).toBeNull();
    expect(md()).toContain("\\*\\*not bold\\*\\*");
  });
  it("never writes Windows line ends into the note (Notepad's clipboard)", () => {
    const { editor, md } = open("");
    paste(editor, { "text/plain": "# Store\r\n\r\n> [!NOTE]\r\n> **TL;DR.** Short.\r\n\r\n- one\r\n- two\r\n" });
    expect(kinds(editor)).toEqual(["heading", "blockquote", "bulletList"]);
    expect(md()).not.toContain("\r");
  });
  it("pastes into a code block as it is", () => {
    const { editor } = open("```\nx\n```\n");
    caretAfter(editor, "x");
    paste(editor, { "text/plain": "# not a heading\n- nor a list" });
    expect(kinds(editor)).toEqual(["codeBlock"]);
    expect(editor.state.doc.textContent).toBe("x# not a heading\n- nor a list");
  });
});

describe("HTML (EDT-09)", () => {
  it("from a web page: headings, lists, quotes, code, links, and marks", () => {
    const { editor, md } = open("");
    paste(editor, {
      "text/plain": "ignored",
      "text/html": `<meta charset="utf-8"><h2 id="x" class="title">Heading</h2>
        <p>Para with <strong>bold</strong>, <em>italic</em>, <s>gone</s>, <code>code</code>, and a <a href="https://example.com/a" onclick="steal()">link</a>.</p>
        <ul><li>One</li><li>Two<ul><li>Nested</li></ul></li></ul>
        <ol start="3"><li>Three</li></ol>
        <blockquote><p>Quote</p></blockquote>
        <pre class="highlight"><code class="language-js">let a = 1;\nlet b = 2;</code></pre>
        <hr><script>alert(1)</script><style>p{color:red}</style>`,
    });
    expect(md()).toBe("## Heading\n\nPara with **bold**, *italic*, ~~gone~~, `code`, and a [link](https://example.com/a).\n\n- One\n- Two\n  - Nested\n\n3. Three\n\n> Quote\n\n```js\nlet a = 1;\nlet b = 2;\n```\n\n---\n");
  });
  it("from Word: list paragraphs become nested lists, markers and Office tags go", () => {
    const { editor, md } = open("");
    const bullet = (level: number, text: string) => `<p class=MsoListParagraphCxSpMiddle style='text-indent:-.25in;mso-list:l0 level${level} lfo1'><![if !supportLists]><span style='font-family:Symbol;mso-fareast-font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>${text}<o:p></o:p></p>`;
    const numbered = (n: number, text: string) => `<p class=MsoListParagraph style='mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>${n}.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp; </span></span><![endif]>${text}<o:p></o:p></p>`;
    paste(editor, {
      "text/plain": "ignored",
      "text/html": `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0}</style></head><body lang=EN-US><!--StartFragment-->
        <h1>Report</h1>
        <p class=MsoNormal><b>Bold</b> and <i>italic</i> with a <a href="https://example.com/">link</a><o:p></o:p></p>
        ${bullet(1, "First")}
        ${bullet(2, "Inner")}
        ${bullet(1, "Second")}
        ${numbered(1, "One")}
        ${numbered(2, "Two")}
        <p class=MsoNormal><o:p>&nbsp;</o:p></p>
        <!--EndFragment--></body></html>`,
    });
    expect(md()).toBe("# Report\n\n**Bold** and *italic* with a [link](https://example.com/)\n\n- First\n  - Inner\n- Second\n\n1. One\n2. Two\n");
  });
  it("from Google Docs: styled spans become marks inside its one wrapper", () => {
    const { editor, md } = open("");
    paste(editor, {
      "text/plain": "ignored",
      "text/html": `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><h1 dir="ltr"><span style="font-size:20pt;font-weight:400">Docs title</span></h1><p dir="ltr"><span style="font-weight:700">Bold</span><span> and </span><span style="font-style:italic">italic</span><span> and </span><span style="text-decoration:line-through">gone</span></p><ul><li dir="ltr"><p dir="ltr"><span>Item</span></p></li></ul></b>`,
    });
    expect(md()).toBe("# Docs title\n\n**Bold** and *italic* and ~~gone~~\n\n- Item\n");
  });
  it("reads an HTML table as a table, its first row the header (TBL-10; text until WP-1.5)", () => {
    const { editor, md } = open("");
    paste(editor, { "text/html": "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><p>1</p></td><td>2</td></tr></tbody></table>" });
    expect(kinds(editor)[0]).toBe("table");
    expect(md()).toBe("| A | B |\n| - | - |\n| 1 | 2 |\n");
  });
  it("keeps an image's alt text, and says images were left out (EXT-03 isn't built)", () => {
    const notice = vi.fn();
    const { editor, md } = open("", notice);
    paste(editor, { "text/html": `<p>Look <img src="https://example.com/cat.png" alt="a cat" onerror="alert(1)"> here</p>` });
    expect(md()).toBe("Look a cat here\n");
    expect(notice).toHaveBeenCalledWith("images");
    expect(editor.view.dom.querySelector("img")).toBeNull();
  });
  it("says so when only an image file is pasted, and changes nothing", () => {
    const notice = vi.fn();
    const { editor, md } = open("Before\n", notice);
    paste(editor, {}, { files: [new File(["x"], "shot.png", { type: "image/png" })] });
    expect(notice).toHaveBeenCalledWith("images");
    expect(md()).toBe("Before\n");
  });
  it("reads Markdown source copied from a code editor as Markdown", () => {
    const { editor, md } = open("");
    paste(editor, {
      "text/plain": "# Title\n\n- item",
      "text/html": `<div style="color:#ccc"><div><span style="color:#569cd6"># Title</span></div><br><div><span>- item</span></div></div>`,
    });
    expect(md()).toBe("# Title\n\n- item\n");
  });
  it("a copy from the editor keeps its exact structure", () => {
    const from = open("- [x] done\n- [ ] todo\n\n```py\nprint(1)\n```\n");
    const slice = from.editor.state.doc.slice(0, from.editor.state.doc.content.size);
    const { dom, text } = from.editor.view.serializeForClipboard(slice);
    const { editor, md } = open("");
    paste(editor, { "text/plain": text, "text/html": dom.innerHTML });
    expect(md()).toBe("- [x] done\n- [ ] todo\n\n```py\nprint(1)\n```\n");
  });
  it("never lets script, handlers, or unsafe links through (SEC-02)", () => {
    const { editor } = open("");
    paste(editor, {
      "text/html": `<p>A <a href="javascript:alert(1)">js</a> <a href="JaVa&#x09;ScRiPt:alert(1)">tab</a> <a href="data:text/html,<script>alert(1)</script>">data</a> <a href="vbscript:x">vb</a> <a href="mailto:me@example.com">mail</a></p><iframe src="https://evil.example"></iframe><svg><script>alert(1)</script></svg><img src=x onerror="alert(1)"><script>alert(2)</script>`,
    });
    const links = [...editor.view.dom.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(["mailto:me@example.com"]);
    expect(editor.state.doc.textContent).toBe("A js tab data vb mail");
    expect(editor.view.dom.querySelector("iframe, svg, script, img, [onerror]")).toBeNull();
  });
});

describe("Import files: HTML and Word documents as Markdown (FIL-15, D-210)", () => {
  it("reads a whole page as a paste does: headings, emphasis, lists, links and tables; the head, scripts and styles are left out", () => {
    const html = `<!doctype html><html><head><title>Ignored</title><style>p{color:red}</style><script>alert(1)</script></head>
      <body><h1>Report</h1><p>Some <strong>bold</strong> and <em>italic</em> text with <a href="https://example.com">a link</a>.</p>
      <ul><li>One</li><li>Two</li></ul><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
      <p><a href="javascript:alert(1)">bad</a><img src="data:image/png;base64,AAAA" alt="pic"></p></body></html>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain("# Report");
    expect(md).toContain("Some **bold** and *italic* text with [a link](https://example.com).");
    expect(md).toMatch(/[-*] One\n[-*] Two/);
    expect(md).toMatch(/\| A +\| B +\|/);
    expect(md).not.toMatch(/Ignored|color:red|alert|javascript|data:image/);
    expect(md).toContain("bad");
  });
  it("Word's HTML (mammoth's): headings and paragraphs", () => {
    expect(htmlToMarkdown("<h1>Plan</h1><p>First step.</p><h2>Later</h2><p>Second.</p>")).toBe("# Plan\n\nFirst step.\n\n## Later\n\nSecond.\n");
  });
  it("nothing readable is an empty note", () => {
    expect(htmlToMarkdown("<html><head><title>x</title></head><body></body></html>")).toBe("");
  });
});