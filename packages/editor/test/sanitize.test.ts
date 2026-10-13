// @vitest-environment jsdom
/**
 * SEC-02: Markdown and HTML are sanitized everywhere they're rendered. Raw HTML in notes is shown as
 * text, only safe URL schemes are allowed, and the app runs under Trusted Types.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Editor } from "@tiptap/core";
import { coreExtensions, EDITOR_OPTIONS, installTrustedTypes, isSafeHref, MarkdownSession, sanitizePastedHtml, TRUSTED_TYPES_POLICIES, type PMNode } from "../src/index.ts";

let editors: Editor[] = [];
afterEach(() => {
  for (const e of editors) e.destroy();
  editors = [];
});
function open(markdown: string) {
  const session = new MarkdownSession(markdown);
  const editor = new Editor({ ...EDITOR_OPTIONS, extensions: coreExtensions(), content: session.doc as object });
  editors.push(editor);
  return { editor, md: () => session.serialize(editor.getJSON() as PMNode) };
}

describe("safe link schemes (SEC-02)", () => {
  it("allows http, https, mailto, and relative addresses only", () => {
    for (const ok of ["https://example.com", "http://x.y/z?q#h", "HTTPS://EXAMPLE.COM", "mailto:me@example.com", "notes/a.md", "../b.md", "/abs", "#heading", "?q=1"]) expect(isSafeHref(ok), ok).toBe(true);
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\tscript:alert(1)", " javascript:alert(1)", "java\u0000script:x", "data:text/html,<script>", "vbscript:x", "file:///etc/passwd", "ftp://x", "tel:123", "blob:https://x"]) {
      expect(isSafeHref(bad), bad).toBe(false);
    }
  });
});

describe("pasted HTML is sanitized before it's parsed (SEC-02)", () => {
  it("removes scripts, event handlers, frames, and image sources", () => {
    const out = sanitizePastedHtml(`<p onclick="steal()" onmouseover="x">Hi<script>alert(1)</script><img src="https://x/t.png" srcset="a 1x" onerror="alert(1)" alt="cat"></p><iframe src="https://evil.example"></iframe><object data="x"></object><svg onload="alert(1)"><script>alert(2)</script></svg><style>*{}</style><form action="x"><input type="text" onfocus="x"></form>`);
    expect(out).not.toMatch(/script|onerror|onclick|onmouseover|onload|onfocus|iframe|object|svg|style|form|src=|srcset|alert\(2\)/i);
    expect(out).toContain('alt="cat"');
    expect(out).toContain("Hi");
  });
  it("drops links with unsafe schemes, keeping their text", () => {
    const out = sanitizePastedHtml(`<a href="javascript:alert(1)">a</a><a href="java&#x09;script:alert(1)">b</a><a href="data:text/html,x">c</a><a href="https://ok.example/">d</a><a href="mailto:me@example.com">e</a>`);
    expect(out).toBe(`<a>a</a><a>b</a><a>c</a><a href="https://ok.example/">d</a><a href="mailto:me@example.com">e</a>`);
  });
  it("keeps only the styles that carry formatting, and only a code language class", () => {
    const out = sanitizePastedHtml(`<span style="color:red; font-weight:700; background:url(javascript:alert(1)); font-style: italic">x</span><code class="hljs language-ts other">y</code><p class="MsoNormal" style="mso-list:l0 level1 lfo1; margin:0">z</p>`);
    expect(out).toBe(`<span style="font-weight:700;font-style: italic">x</span><code class="language-ts">y</code><p style="mso-list:l0 level1 lfo1">z</p>`);
  });
});

describe("notes render raw HTML as text and unsafe links inertly (SEC-02)", () => {
  it("shows raw HTML as its source, never as elements", () => {
    const src = `<img src="x" onerror="alert(1)">\n\n<div onclick="alert(2)">Hi</div>\n\nText with <b onmouseover="alert(3)">inline</b> html.\n`;
    const { editor, md } = open(src);
    const dom = editor.view.dom;
    expect(dom.querySelector("img, [onerror], [onclick], [onmouseover], b")).toBeNull();
    expect(dom.textContent).toContain(`<img src="x" onerror="alert(1)">`);
    expect(dom.textContent).toContain(`<div onclick="alert(2)">Hi</div>`);
    expect(md()).toBe(src);
  });
  it("renders links with unsafe schemes without an address, and keeps the file as it was", () => {
    const src = "[a](javascript:alert(1)) [b](data:text/html,x) [c](vbscript:x) [d](https://example.com) [e](notes/a.md)\n";
    const { editor, md } = open(src);
    const hrefs = [...editor.view.dom.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["", "", "", "https://example.com", "notes/a.md"]);
    expect(md()).toBe(src);
  });
});

describe("Trusted Types (SEC-02)", () => {
  it("installs one default policy that passes text and sanitizes markup", () => {
    const policies: Record<string, { createHTML?: (s: string) => string; createScript?: unknown; createScriptURL?: unknown }> = {};
    const tt = { createPolicy: vi.fn((name: string, rules: (typeof policies)[string]) => { policies[name] = rules; return rules; }) };
    installTrustedTypes({ trustedTypes: tt });
    installTrustedTypes({ trustedTypes: tt });
    expect(tt.createPolicy).toHaveBeenCalledTimes(1);
    const policy = policies.default!;
    expect(policy.createScript).toBeUndefined();
    expect(policy.createScriptURL).toBeUndefined();
    // A live region clearing itself, and the Markdown parser decoding an entity.
    expect(policy.createHTML!("")).toBe("");
    expect(policy.createHTML!("&copy;")).toBe("&copy;");
    const html = policy.createHTML!(`<p>ok</p><img src=x onerror="alert(1)"><a href="javascript:alert(1)">x</a><script>alert(2)</script>`);
    expect(html).toContain("<p>ok</p>");
    expect(html).not.toMatch(/onerror|javascript:|<script/);
  });
  it("is required by both shells' Content Security Policy, with exactly the app's policy names", () => {
    const template = readFileSync(join(import.meta.dirname, "../../ui/entry/template.mjs"), "utf8");
    expect(template).toContain(`"require-trusted-types-for 'script'"`);
    expect(template).toContain(`"trusted-types ${TRUSTED_TYPES_POLICIES.join(" ")}"`);
  });
});
