import { globalStyle, style } from "@vanilla-extract/css";

// Only while a print layout is in the page: everything else in <body> is left off the paper, and the
// window's fixed height and clipped overflow give way so the note flows over as many pages as it needs.
// The paper stays white (backgrounds print, for code and tables, so the page's own must be clear).
const printing = ":root:has(> body > [data-print-root])";

export const root = style({
  display: "none",
  "@media": { print: { display: "block", page: "fn-print" } },
});

globalStyle(`${printing}, ${printing} > body`, {
  "@media": { print: { height: "auto", minHeight: 0, overflow: "visible", backgroundColor: "transparent", backgroundImage: "none" } },
});
globalStyle(`${printing} > body > :not([data-print-root])`, { "@media": { print: { display: "none" } } });
