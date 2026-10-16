// Builds the design tokens: validates the tier rules, then uses Style Dictionary to
// generate CSS custom properties (one block per theme and mode), TypeScript references,
// and the JSON Schema enums that views and themes are validated against.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import StyleDictionary from "style-dictionary";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "src");
const dist = join(here, "dist");
const checkOnly = process.argv.includes("--check");

const list = (dir) => readdirSync(join(src, dir)).filter((f) => f.endsWith(".json")).map((f) => join(src, dir, f));
const BASE = [...list("reference"), ...list("semantic"), ...list("component")];
// Paper is the base light theme (the :root block); every other theme file overrides it.
const THEMES = Object.fromEntries(list("themes").filter((f) => !f.endsWith("paper.json")).map((f) => [f.split(/[\\/]/).at(-1).replace(".json", ""), f]));
// Modes are selectors on :root, or media queries ("@media ..."), applied after themes in this order.
const MODES = {
  '[data-contrast="more"]': join(src, "modes", "contrast-more.json"),
  ...Object.fromEntries(["sans", "serif", "hyperlegible", "dyslexic", "system"].map((f) => [`[data-content-font="${f}"]`, join(src, "modes", `content-font-${f}.json`)])),
  // Paragraph spacing (Theme manager → Reading): Comfortable is the base.
  ...Object.fromEntries(["compact", "airy"].map((p) => [`[data-paragraph-spacing="${p}"]`, join(src, "modes", `paragraph-${p}.json`)])),
  '[data-motion="reduced"]': join(src, "modes", "reduced-motion.json"),
  '[data-transparency="reduced"]': join(src, "modes", "reduced-transparency.json"),
  // Software compositing (D-121, D-151): the frosted surfaces opaque and unblurred, and layers that
  // cover the window (dialogs, menus) appear and leave at once, as each frame of a blur or of a fade
  // over the whole window costs the processor a whole frame of drawing without a GPU.
  '[data-compositing="software"]': join(src, "modes", "software-compositing.json"),
  '[data-pointer="coarse"]': join(src, "modes", "coarse-pointer.json"),
  '[data-platform="macos"]': join(src, "modes", "platform-macos.json"),
  // The app-built window (D-14) is drawn inside the page, inset by its shadow margin: heights that
  // were parts of the viewport are parts of the window instead (AppRoot makes it a size container).
  "[data-window-frame]": join(src, "modes", "window-frame.json"),
  // Windows contrast themes: every color becomes a system color (A11Y-02). Media queries add no
  // specificity, so its selector is raised above the theme and mode blocks (:root[data-…]).
  "@media (forced-colors: active)": join(src, "modes", "forced-colors.json"),
};

// ---------- flatten and validate ----------
function flatten(obj, path = [], inheritedType, out = new Map(), file = "") {
  const type = obj.$type ?? inheritedType;
  if ("$value" in obj) {
    out.set(path.join("."), { value: obj.$value, type, file });
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("$")) continue;
    if (v && typeof v === "object") flatten(v, [...path, k], type, out, file);
  }
  return out;
}
const load = (f) => flatten(JSON.parse(readFileSync(f, "utf8")), [], undefined, new Map(), relative(here, f));
const tierOf = (name) => (name.startsWith("ref.") ? "reference" : name.startsWith("cmp.") ? "component" : "semantic");
const aliasOf = (v) => (typeof v === "string" && /^\{[^}]+\}$/.test(v) ? v.slice(1, -1) : null);
const RAW_OK_SEMANTIC = new Set(["number", "fontWeight"]);

const all = new Map();
for (const f of BASE) for (const [k, v] of load(f)) {
  if (all.has(k)) throw new Error(`Token ${k} is defined twice (${all.get(k).file}, ${v.file})`);
  all.set(k, v);
}
const errors = [];
function checkToken(name, t, context) {
  const tier = tierOf(name);
  const target = aliasOf(t.value);
  if (target && !all.has(target)) errors.push(`${context}: ${name} aliases unknown ${target}`);
  if (tier === "reference" && target) errors.push(`${context}: reference token ${name} must hold a raw value`);
  if (tier === "semantic" && !target && !RAW_OK_SEMANTIC.has(t.type))
    errors.push(`${context}: semantic token ${name} must alias a reference token (raw values only for unitless numbers)`);
  if (tier === "semantic" && target && tierOf(target) !== "reference")
    errors.push(`${context}: semantic token ${name} aliases ${target}, which is not a reference token`);
  if (tier === "component" && (!target || tierOf(target) !== "semantic"))
    errors.push(`${context}: component token ${name} must alias a semantic token`);
  if (!t.type) errors.push(`${context}: ${name} has no $type`);
}
for (const [k, v] of all) checkToken(k, v, v.file);
for (const f of [...Object.values(THEMES), ...Object.values(MODES)]) {
  for (const [k, v] of load(f)) {
    if (tierOf(k) !== "semantic") errors.push(`${relative(here, f)}: themes and modes may only override semantic tokens (${k})`);
    else if (!all.has(k)) errors.push(`${relative(here, f)}: overrides unknown token ${k}`);
    else checkToken(k, v, relative(here, f));
  }
}
if (errors.length) {
  console.error("Token rule violations:\n  " + errors.join("\n  "));
  process.exit(1);
}
if (checkOnly) {
  console.log(`Tokens OK: ${all.size} tokens, rules hold.`);
  process.exit(0);
}

// ---------- CSS via Style Dictionary ----------
mkdirSync(dist, { recursive: true });
const norm = (p) => String(p).replace(/\\/g, "/");
async function css(sources, selector, onlyFile) {
  const sd = new StyleDictionary({
    source: sources,
    log: { verbosity: "silent", warnings: "disabled" },
    platforms: {
      css: {
        transformGroup: "css",
        prefix: "fn",
        files: [{
          format: "css/variables",
          filter: onlyFile ? (token) => norm(token.filePath).endsWith(norm(relative(here, onlyFile))) : undefined,
          options: { selector, outputReferences: true, showFileHeader: false },
        }],
      },
    },
  });
  const [out] = await sd.formatPlatform("css");
  return out.output;
}
const cssName = (name) => "--fn-" + name.split(".").map((s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()).join("-");
// ---------- resolved theme values ----------
// Each built-in theme's colors (and focus dim) resolved to raw values: the contrast guard checks
// them at run time (THM-13), and the theme manager's tiles show samples of them (THM-07).
const THEME_IDS = ["paper", ...Object.keys(THEMES)];
const overridesOf = (id) => (id === "paper" ? new Map() : load(THEMES[id]));
function resolveIn(overrides, name) {
  let v = (overrides.get(name) ?? all.get(name)).value;
  for (let i = 0; i < 20 && aliasOf(v); i++) v = (overrides.get(aliasOf(v)) ?? all.get(aliasOf(v))).value;
  return v;
}
const THEMED = [...all.keys()].filter((k) => (/^(color|trigger|code)\./.test(k) && all.get(k).type === "color") || k === "focus.dimOpacity");
const themeValues = Object.fromEntries(THEME_IDS.map((id) => {
  const o = overridesOf(id);
  return [id, Object.fromEntries(THEMED.map((k) => [k, String(resolveIn(o, k))]))];
}));
// Theme samples: component tokens named cmp.<component>.sample* take each theme's own value
// inside [data-theme-sample="<id>"], so a tile can show a theme that isn't the one showing.
const SAMPLED = [...all.keys()].filter((k) => /^cmp\.[a-zA-Z]+\.sample[A-Z]/.test(k));

const blocks = [];
blocks.push(await css(BASE, ":root"));
for (const [name, file] of Object.entries(THEMES)) blocks.push(await css([...BASE, file], `:root[data-theme="${name}"]`, file));
// Published pages follow the reader's own preference (SHR-06, DD-PUB-01): with data-theme="auto",
// Paper in light and Ink in dark, without a script. The app sets a theme itself, so it's unaffected.
blocks.push(`@media (prefers-color-scheme: dark) {\n${await css([...BASE, THEMES.ink], ':root[data-theme="auto"]', THEMES.ink)}}\n`);
if (SAMPLED.length) {
  for (const id of THEME_IDS) {
    const o = overridesOf(id);
    const lines = SAMPLED.map((k) => `  ${cssName(k)}: ${resolveIn(o, aliasOf(all.get(k).value))};`);
    blocks.push(`[data-theme-sample="${id}"] {\n${lines.join("\n")}\n}\n`);
  }
}
for (const [sel, file] of Object.entries(MODES)) {
  if (sel.startsWith("@media")) blocks.push(`${sel} {\n${await css([...BASE, file], ":root:root:root", file)}}\n`);
  else blocks.push(await css([...BASE, file], `:root${sel}`, file));
}
// UI scale (DSY-03): interface sizes, spacing, and type are multiplied by --fn-ui-scale. Note text
// (font.size and the content ramp) is unaffected.
const SCALED = /^(\s*)(--fn-(?:space|size)-[a-z0-9-]+|--fn-font-ui-(?:caption|secondary|body|emphasis|title)):\s*(.+);$/;
const scaled = blocks.join("\n").split("\n").map((line) => {
  const m = SCALED.exec(line);
  return m ? `${m[1]}${m[2]}: calc(${m[3]} * var(--fn-ui-scale, 1));` : line;
}).join("\n");
const header = "/* Generated by packages/tokens/build.mjs. Do not edit. */\n";
writeFileSync(join(dist, "tokens.css"), header + scaled);

// ---------- TypeScript ----------
const tree = {};
for (const name of all.keys()) {
  if (tierOf(name) === "reference") continue;
  const parts = name.split(".");
  let node = tree;
  for (const p of parts.slice(0, -1)) node = node[p] ??= {};
  node[parts.at(-1)] = `var(${cssName(name)})`;
}
const groupNames = (prefix) => [...all.keys()].filter((k) => k.startsWith(prefix + ".") && k.split(".").length === 2).map((k) => k.split(".")[1]);
const groups = {
  space: groupNames("space"), size: groupNames("size"), layout: groupNames("layout"), radius: groupNames("radius"),
  shadow: groupNames("shadow"), layer: groupNames("layer"), motion: groupNames("motion"),
};
const px = (name) => { let v = all.get(name).value; while (aliasOf(v)) v = all.get(aliasOf(v)).value; return parseFloat(v); };
const breakpoints = { medium: px("breakpoint.medium"), wide: px("breakpoint.wide"), short: px("breakpoint.short") };
// Wait timings in ms, for the task tracker and toasts in packages/core (PRF-08). They're delays, so
// no mode changes them (reduced motion only stills the moving parts of a sign).
const waits = Object.fromEntries([...all.keys()].filter((k) => k.startsWith("wait.")).map((k) => [k.slice(5), px(k)]));
// The app-built window's sizes and timings (D-14), for the desktop's main process, which can't read
// CSS variables: the shadow margin, the resize handles, the minimum size, and the Snap Layouts delay.
const windowMetrics = Object.fromEntries([...all.keys()].filter((k) => k.startsWith("window.")).map((k) => [k.slice(7), px(k)]));
// The note's scroll edge (D-111): how many blur bands to build, which CSS can't loop over.
// The top edge's veil: the canvas color's opacity at the window's edge and at the trigger's place, and
// how far down that place goes, from which the fade's eased curve is built (D-119, amended).
const scrollEdge = {
  bands: px("layout.scrollBands"), blur: px("layout.scrollBlur"), range: px("layout.scrollFade"),
  clear: px("layout.triggerClear"), veil: px("layout.scrollVeil"), triggerVeil: px("layout.triggerVeil"),
  triggerVeilPlain: px("layout.triggerVeilPlain"), blurTop: px("layout.scrollBlurTop"),
};
// The frosted surface's opacity, for the contrast guard: what's on it is measured as it's drawn (THM-13, D-111).
const frost = { opacity: px("frost.opacity") };
// The note's auto-scroll (D-156): script animates it frame by frame (CSS smooth-scroll can't retarget), so
// it needs the curve's numbers. The duration here is the default; reduced motion's 0 is read from the CSS variable.
const resolved = (name) => { let v = all.get(name).value; while (aliasOf(v)) v = all.get(aliasOf(v)).value; return v; };
const autoScroll = { duration: px("motion.autoScroll"), easing: resolved("easing.inOut") };
const ts = `// Generated by packages/tokens/build.mjs. Do not edit.
/** Resolved breakpoints in px, for media queries (which can't read CSS variables). */
export const breakpoints = ${JSON.stringify(breakpoints)} as const;
/** Resolved wait timings in ms (PRF-08), for code that schedules them. */
export const waits = ${JSON.stringify(waits)} as const;
/** Resolved window sizes in px and timings in ms (D-14), for the desktop's main process. */
export const windowMetrics = ${JSON.stringify(windowMetrics)} as const;
/** The note's scroll edge, resolved (D-111, D-119): the blur bands' count, their radii and range in px, and the top's veil. */
export const scrollEdge = ${JSON.stringify(scrollEdge)} as const;
/** The frosted surface's opacity, resolved, for the contrast guard (THM-13). */
export const frost = ${JSON.stringify(frost)} as const;
/** The note's auto-scroll, resolved (D-156): its duration in ms and its in-out cubic Bézier. */
export const autoScroll = ${JSON.stringify(autoScroll)} as const;
export const tokens = ${JSON.stringify(tree, null, 2)} as const;

/** Each built-in theme's colors and focus dim, resolved (THM-13: the contrast guard checks them at run time). */
export const themeValues: Readonly<Record<string, Readonly<Record<string, string>>>> = ${JSON.stringify(themeValues, null, 2)};

export const tokenGroups = ${JSON.stringify(groups, null, 2)} as const;
${Object.keys(groups).map((g) => `export type ${g[0].toUpperCase() + g.slice(1)}Token = (typeof tokenGroups.${g})[number];`).join("\n")}

/** CSS custom property name for a token, for example "color.textMuted" → "--fn-color-text-muted". */
export const cssVarName = (name: string): string =>
  "--fn-" + name.split(".").map((s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()).join("-");
`;
writeFileSync(join(dist, "tokens.ts"), ts);

// ---------- JSON Schema enums ----------
const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://prabinpebam.github.io/focus-notes/schemas/ui/tokens.v1.json",
  title: "Focus Notes token names",
  $defs: Object.fromEntries(Object.entries(groups).map(([g, names]) => [g, { enum: names }])),
};
writeFileSync(join(dist, "tokens.schema.json"), JSON.stringify(schema, null, 2) + "\n");
console.log(`Tokens built: ${all.size} tokens, ${blocks.length} CSS blocks.`);
