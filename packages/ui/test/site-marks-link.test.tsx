import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { compileStyles } from "../../../tools/spacing/compile-css.mjs";
import { SiteMarksDescription } from "../src/primitives/FileTree/SiteMarks.tsx";
import type { TreeItem } from "../src/data.ts";

const whole = "Published · live at maya-chen.github.io/notebook/n/What a calm writing app owes the person who opens it every morning/";
const item = { id: "a.md", kind: "note", label: "A", level: 1, published: true, siteDescription: whole,
  siteTooltip: "Published · live at maya-chen.github.io/n…who opens it every morning/" } as TreeItem;

// Main, 27 November: the badge's tooltip is one line, its link cut in the middle; the description keeps it whole.
describe("a published page's live link in Files", () => {
  it("gives screen readers the whole readable link, never the cut one", () => {
    const html = renderToStaticMarkup(<SiteMarksDescription item={item} id="d" />);
    expect(html).toContain(whole);
    expect(html).not.toContain("…");
  });

  it("draws the one-line tooltip on one line, no wider than the window less its edges", { timeout: 60_000 }, async () => {
    const css = (await compileStyles()).filter((f: { file: string }) => f.file.replace(/\\/g, "/").endsWith("primitives/Tooltip/Tooltip.css.ts")).map((f: { css: string }) => f.css).join("\n");
    const rule = /\.[\w-]*oneLine[\w-]*\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/white-space:\s*nowrap/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule).toMatch(/max-width:\s*var\(/);
  });
});
