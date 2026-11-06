#!/usr/bin/env node
// Spacing owned by the layout (the spacing skill's static check, in `pnpm check`): compiles every
// `.css.ts` in the design system and runs the kit's lint-spacing over it. Exemptions are named, each
// with its reason; anything else fails.
import { lintSpacing } from "../../agentic-craft/tools/lint-spacing.mjs";
import { compileStyles } from "./compile-css.mjs";

/**
 * Named exemptions: `file` (a path suffix), `rule` (the start of the kit's rule), `match` (a test on
 * the declaration's text) and why.
 */
export const EXEMPT = [
  // Prose: the note and Help render Markdown the system didn't write; their spacing is the prose rules'.
  { file: "EditorSurface/EditorSurface.css.ts", rule: "outer margin", match: /_prose__|margin-(top|block)/, why: "prose: block rhythm of rendered Markdown" },
  { file: "EditorSurface/EditorSurface.css.ts", rule: "sibling-position", match: /_prose__/, why: "prose: block rhythm of rendered Markdown" },
  { file: "NoteContent/NoteContent.css.ts", rule: "outer margin", match: /./, why: "prose: block rhythm of rendered Markdown" },
  { file: "NoteContent/NoteContent.css.ts", rule: "sibling-position", match: /./, why: "prose: block rhythm of rendered Markdown" },
  // The note's column is centred in the window by computed margins (its measure and gutters).
  { file: "EditorSurface/EditorSurface.css.ts", rule: "outer margin", match: /margin-inline-(start|end): (max|calc|var)/, why: "the note's column centred by its measure" },
  // A Wide image reaches past the reading column by design (D-300).
  { file: "ImageFrame/ImageFrame.css.ts", rule: "outer margin", match: /wide-extra/, why: "Wide image past the column (D-300)" },
  // The morph is the state: the toolbar panel grows to its open size (D-119).
  { file: "MorphPanel/MorphPanel.css.ts", rule: "geometry in a state", match: /data-open/, why: "the panel's open size is its state" },
  // Coordinates measured by script in the window's physical space (anchors, drags, crops).
  { file: "", rule: "physical property", match: /^(left|right): (var\(--[A-Za-z]+(Var|X|x)__|var\(--cornerLeft)/, why: "a coordinate measured by script" },
  // Edge to edge on both sides: the same in either direction.
  { file: "", rule: "physical property", match: /^(left|right): 0$/, why: "pinned to both edges (paired)" },
  // The window's own resize edges and corners, and an image's crop handles, are physical geometry.
  { file: "WindowFrame/WindowFrame.css.ts", rule: "physical property", match: /./, why: "the window's physical edges and corners" },
  { file: "ImageFrame/ImageFrame.css.ts", rule: "physical property", match: /./, why: "an image's physical crop handles" },
  { file: "ImageCrop/ImageCrop.css.ts", rule: "physical property", match: /./, why: "oriented image pixel coordinates and physical crop handles must not mirror in RTL" },
  // The minimap rail sits beside the note's scrollbar, which is at the window's right edge.
  { file: "EditorSurface/DocMinimap.css.ts", rule: "physical property", match: /^right: calc\(var\(--fn-cmp-editor-surface-scrollbar-size\)/, why: "beside the note's scrollbar at the window's right edge" },
  // Centred by `left: 50%` and a translation: the same in either direction.
  { file: "MorphPanel/MorphPanel.css.ts", rule: "physical property", match: /^left: 50%$/, why: "centred by a translation" },
  // The switch's thumb is out of flow inside its track: its place is the state, and nothing beside it moves.
  { file: "Switch/Switch.css.ts", rule: "geometry in a state", match: /Switch_thumb__/, why: "an out-of-flow thumb; its place is the state" },
];

export function disabledPaintErrors(css) {
  const errors = [];
  const forced = [...css.matchAll(/@media[^{]*\(forced-colors:\s*active\)[^{]*\{/g)].map(media => {
    let end = media.index + media[0].length;
    let depth = 1;
    while (end < css.length && depth) {
      if (css[end] === "{") depth++;
      if (css[end] === "}") depth--;
      end++;
    }
    return { start: media.index, end };
  });
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].replace(/:not\([^)]*\)/g, "");
    if (!/\[data-disabled\]|\[aria-disabled=["']?true["']?\]|:disabled\b/.test(selector)) continue;
    for (const declaration of match[2].split(";")) {
      if (/^\s*color:\s*var\(--fn-cmp-menu-button-forced-disabled-text\)\s*$/.test(declaration) &&
        forced.some(range => match.index >= range.start && match.index < range.end)) continue;
      if (/^\s*(?:color|background(?:-color|-image)?|border(?:-[\w-]+)?-color|fill|stroke)\s*:/.test(declaration))
        errors.push(`disabled recolour: use the disabled opacity, preserving the enabled colours: ${declaration.trim()}`);
    }
  }
  return errors;
}

const exempt = (file, f) => EXEMPT.find((e) => file.endsWith(e.file) && f.rule.startsWith(e.rule) && e.match.test(f.text));

export async function lint() {
  const styles = await compileStyles();
  const errors = [];
  const warnings = [];
  for (const { file, css } of styles) {
    for (const error of disabledPaintErrors(css)) errors.push(`${file}: ${error}`);
    // Bare scale step (spacing ST-1): the design system's own form of the kit's --space-<n> rule. Only
    // component tokens read the scale; styles read a role or a component token.
    for (const m of css.matchAll(/[^;{}]*var\(--fn-space-scale-[a-z]+\)[^;{}]*/g))
      errors.push(`${file}: bare scale step: read a spacing role or a component token: ${m[0].trim().replace(/\s+/g, " ")}`);
    for (const f of lintSpacing(css, {})) {
      if (exempt(file, f)) continue;
      (f.level === "error" ? errors : warnings).push(`${file}: ${f.rule}: ${f.text.replace(/\s+/g, " ")}`);
    }
  }
  return { files: styles.length, errors, warnings };
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("tools/spacing/lint.mjs")) {
  const { files, errors, warnings } = await lint();
  for (const e of errors) console.error(e);
  if (process.argv.includes("--warnings")) for (const w of warnings) console.warn(w);
  console.log(errors.length ? `spacing: ${errors.length} error(s) in ${files} style files; let the layout own the space (documentations/design/spacing-audit.md)` : `spacing: owned by the layout in ${files} style files${warnings.length ? `, ${warnings.length} warning(s)` : ""}`);
  process.exitCode = errors.length ? 1 : 0;
}
