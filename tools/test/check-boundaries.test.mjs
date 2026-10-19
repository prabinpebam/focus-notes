/**
 * The boundary checker itself (DSY-02, DSY-04, DSY-06; audit DS-A01, D-197). Every invalid probe in
 * the DS-A01 table is fed through the checker's own rules as an in-memory (path, source) pair and
 * must be rejected; the legitimate runtime values the design system relies on must stay accepted.
 */
import { describe, expect, it } from "vitest";
import { checkSource } from "../check-boundaries.mjs";

const IMPORT = `import { style } from "@vanilla-extract/css";\nimport { tokens } from "@focus-notes/tokens";\n`;
const BUTTON = "packages/ui/src/primitives/Button/Button.css.ts";
const errors = (path, src) => checkSource(path, src);
const rejects = (path, src, pattern) => {
  const errs = errors(path, src);
  expect(errs, `expected ${path} to be rejected`).not.toEqual([]);
  if (pattern) expect(errs.join("\n")).toMatch(pattern);
};
const accepts = (path, src) => expect(errors(path, src)).toEqual([]);

describe("DS-A01 probes: token-only styling is enforced", () => {
  it("DSY-04: rejects raw unitless numbers on visual properties in .css.ts", () => {
    rejects(BUTTON, `${IMPORT}export const a = style({ padding: 13 });`, /padding/);
    rejects(BUTTON, `${IMPORT}export const a = style({ borderWidth: 3 });`, /borderWidth/);
    rejects(BUTTON, `${IMPORT}export const a = style({ padding: 13, borderWidth: 3 });`);
    rejects(BUTTON, `${IMPORT}export const a = style({ width: 1, height: 1 });`);
    rejects(BUTTON, `${IMPORT}export const a = style({ marginTop: -4 });`);
    rejects(BUTTON, `${IMPORT}export const a = style({ selectors: { "&:hover": { opacity: 0.5 } } });`);
    rejects(BUTTON, `${IMPORT}export const a = style({ zIndex: 10, fontWeight: 600 });`);
  });

  it("DSY-04: rejects raw durations and lengths in .css.ts strings", () => {
    rejects(BUTTON, `${IMPORT}export const a = style({ transitionDuration: "1s" });`, /duration/);
    rejects(BUTTON, `${IMPORT}export const a = style({ transitionDuration: "200ms" });`);
    rejects(BUTTON, `${IMPORT}export const a = style({ transition: \`opacity 0.2s \${tokens.cmp.button.easing}\` });`);
    rejects(BUTTON, `${IMPORT}export const a = style({ padding: "13px" });`);
    rejects(BUTTON, `${IMPORT}export const a = style({ width: "12ch", height: "40vh" });`);
    rejects(BUTTON, `${IMPORT}export const a = style({ padding: \`\${tokens.cmp.button.padding} 3px\` });`);
  });

  it("DSY-04: the hex literal control is still rejected", () => {
    rejects(BUTTON, `${IMPORT}export const a = style({ color: "#ff0000" });`, /hex/);
    rejects(BUTTON, `${IMPORT}export const a = style({ color: "rgb(255, 0, 0)" });`, /color function/);
  });

  it("DSY-02: rejects handwritten plain .css, in styled directories and elsewhere", () => {
    rejects("packages/ui/src/primitives/Button/Button.css", `.a { color: #ff0000; padding: 13px; }`, /plain CSS/);
    rejects("packages/ui/src/primitives/Button/clean.css", `.a { display: block; }`, /plain CSS/);
    rejects("apps/desktop/src/extra.css", `.a { display: block; }`);
  });

  it("DSY-06: rejects style writes outside packages/ui in every form", () => {
    const app = "apps/desktop/src/renderer/probe.ts";
    rejects(app, `export const f = (element: HTMLElement) => element.style.setProperty("color", "red");`, /style/);
    rejects(app, `export const f = (el: HTMLElement) => { el.style.cssText = "color: red"; };`);
    rejects(app, `export const f = (el: HTMLElement) => { el.style["color"] = "red"; };`);
    rejects(app, `export const f = (el: HTMLElement) => { el.style.color = "red"; };`);
    rejects(app, `export const f = (el: HTMLElement) => { el.style = "color: red"; };`);
    rejects(app, `export const f = (el: HTMLElement) => Object.assign(el.style, { color: "red" });`);
    rejects(app, `export const f = (el: HTMLElement) => el.setAttribute("style", "color: red");`);
    rejects(app, `export const f = (el: HTMLElement) => el.attributeStyleMap.set("color", "red");`);
    rejects("packages/editor/src/probe.ts", `export const f = (el) => el.style.setProperty("--x", "1");`);
  });

  it("DSY-04: rejects reading another component's tokens whatever the binding is called", () => {
    const alias = `import { style } from "@vanilla-extract/css";\nimport { tokens as designTokens } from "@focus-notes/tokens";\n`;
    rejects(BUTTON, `${alias}export const a = style({ color: designTokens.cmp.dialogPanel.background });`, /cmp\.dialogPanel/);
    rejects(BUTTON, `${alias}export const a = style({ color: designTokens.color.text });`, /semantic/);
    const ns = `import { style } from "@vanilla-extract/css";\nimport * as T from "@focus-notes/tokens";\n`;
    rejects(BUTTON, `${ns}export const a = style({ color: T.tokens.cmp.dialogPanel.background });`, /cmp\.dialogPanel/);
    rejects(BUTTON, `${IMPORT}const { cmp } = tokens;\nexport const a = style({ color: cmp.dialogPanel.background });`, /cmp\.dialogPanel/);
    rejects(BUTTON, `${IMPORT}const { dialogPanel: other } = tokens.cmp;\nexport const a = style({ color: other.background });`, /cmp\.dialogPanel/);
    rejects(BUTTON, `${IMPORT}const { cmp: { dialogPanel } } = tokens;\nexport const a = style({ color: dialogPanel.background });`);
    rejects(BUTTON, `${IMPORT}const c = tokens.cmp;\nexport const a = style({ color: c.dialogPanel.background });`);
    rejects(BUTTON, `${IMPORT}const k = "dialogPanel";\nexport const a = style({ color: tokens.cmp[k].background });`, /computed/);
    rejects(BUTTON, `${IMPORT}export const a = style({ color: tokens.cmp["dialogPanel"].background });`, /cmp\.dialogPanel/);
    // Runtime readers in a component folder may not reach into another component's tier either.
    rejects("packages/ui/src/host/EditorSurface/probe.ts", `import { tokens as x } from "@focus-notes/tokens";\nexport const v = x.cmp.button.radius;`, /cmp\.button/);
    // Layouts read layout groups and their own component tokens only.
    const layout = "packages/ui/src/layouts/AppRoot/AppRoot.css.ts";
    rejects(layout, `${alias}export const a = style({ color: designTokens.color.text });`, /layouts may not read/);
    rejects(layout, `${alias}export const a = style({ color: designTokens.cmp.button.background });`, /layouts may not read/);
  });
});

describe("legitimate values stay accepted", () => {
  it("accepts token reads, zero, identity values, and unitless counts", () => {
    accepts(BUTTON, `${IMPORT}const t = tokens.cmp.button;
export const a = style({
  padding: 0, margin: 0, inset: 0, opacity: 0, flexGrow: 1, flexShrink: 0, order: 2, WebkitLineClamp: 3,
  width: "100%", minWidth: "0px", fontSize: "1em", transitionDuration: "0ms",
  color: t.text, borderRadius: tokens.cmp.button.radius, paddingInline: t.padding,
  height: \`calc(\${t.height} - 2 * \${t.borderWidth})\`, transform: "translate(-50%, -50%)", clipPath: "inset(50%)",
  selectors: { "&:hover": { background: t.backgroundHover } },
  "@media": { "(prefers-reduced-motion: reduce)": { transition: "none" } },
});`);
  });

  it("accepts aliased and destructured reads of the component's own tokens", () => {
    accepts(BUTTON, `import { style } from "@vanilla-extract/css";\nimport { tokens as d } from "@focus-notes/tokens";\nexport const a = style({ color: d.cmp.button.text });`);
    accepts(BUTTON, `${IMPORT}const { cmp: { button: b } } = tokens;\nexport const a = style({ color: b.text });`);
    accepts(BUTTON, `import { style } from "@vanilla-extract/css";\nimport * as T from "@focus-notes/tokens";\nexport const a = style({ color: T.tokens.cmp.button.text, minWidth: \`\${T.breakpoints.medium}px\` });`);
    accepts("packages/ui/src/layouts/AppRoot/AppRoot.css.ts", `${IMPORT}export const a = style({ gap: tokens.space.m, color: tokens.cmp.appRoot.text });`);
  });

  it("accepts runtime geometry, percentages, and validated theme colours inside packages/ui", () => {
    const tsx = "packages/ui/src/primitives/Slider/Slider.tsx";
    accepts(tsx, `export const f = (el: HTMLElement, x: number, pct: number) => { el.style.setProperty("--fill", \`\${pct}%\`); el.style.left = \`\${x}px\`; };`);
    accepts("packages/ui/src/host/EditorSurface/DocMinimap.tsx", `import { tokens } from "@focus-notes/tokens";\nconst t = tokens.cmp.editorSurface.minimap;\nexport const v = [t, tokens.cmp.editorSurface.zoneTop];`);
  });

  it("accepts reading styles outside packages/ui, and style files in tests", () => {
    accepts("packages/editor/src/probe.ts", `export const align = (el: HTMLElement) => el.getAttribute("align") ?? el.style?.textAlign;`);
    accepts("apps/desktop/src/renderer/probe.ts", `export const f = (el: HTMLElement) => el.getAttribute("style");`);
    accepts("apps/desktop/test/probe.test.ts", `export const f = (el: HTMLElement) => el.style.setProperty("color", "red");`);
  });
});
