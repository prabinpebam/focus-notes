#!/usr/bin/env node
// Moves view documents from scale steps (gap "s", padding "l") to spacing roles (spacing-audit ST-1, SP-7).
// Views name the relationship, never a size: a Stack's gap is a stack role, an Inline's or Columns' an
// inline role, any padding an inset role. A 12 px step ("m") is decided by what it separates: groups
// (layouts, fragments, cards) get the group role, single controls or text the item role.
//
//   node tools/spacing/to-roles.mjs [files or folders…]   (default: packages/views)
//
// Idempotent: role names are left as they are. Prints each file it changed and the count.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const STEP = new Set(["xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "related", "section"]);
const GROUPISH = new Set(["Stack", "Inline", "Columns", "Surface", "Center", "Field", "ItemCard", "StatusRow", "EmptyState", "Sheet", "OpenItem", "ThemeGallery", "VersionPane", "FontChoice"]);

const isGroup = (child) => child && typeof child === "object" && (child.use || GROUPISH.has(child.type));
const groupsInside = (node) => {
  const kids = (node.children ?? []).flatMap((c) => (c && c.type === undefined && !c.use && c.children ? c.children : [c]));
  return kids.length > 0 && kids.filter(isGroup).length * 2 >= kids.length;
};

const STACK = { xxs: "stackPair", xs: "stackPair", s: "stackItem", l: "stackGroup", xl: "stackSection", xxl: "stackSection", xxxl: "stackSection", related: "stackItem", section: "stackGroup" };
const INLINE = { xxs: "inlinePair", xs: "inlinePair", s: "inlineItem", l: "inlineGroup", xl: "gutter", xxl: "gutter", xxxl: "gutter", related: "inlineItem", section: "inlineGroup" };
const COLUMNS = { ...INLINE, m: "inlineGroup" };
const INSET = { xxs: "insetSm", xs: "insetSm", s: "insetSm", l: "insetMd", xl: "insetLg", xxl: "insetLg", xxxl: "insetLg", related: "insetSm", section: "insetMd" };

/** The role for one step on one prop of one node. */
export function roleFor(node, prop, step) {
  if (!STEP.has(step)) return step;
  if (/padding/i.test(prop)) return step === "m" ? (node.type === "Inline" ? "insetSm" : "insetMd") : INSET[step];
  if (prop === "offset") return step === "m" || step === "l" ? "stackItem" : STACK[step];
  if (node.type === "Columns") return COLUMNS[step];
  const map = node.type === "Inline" ? INLINE : STACK;
  if (step === "m") return groupsInside(node) ? (node.type === "Inline" ? "inlineGroup" : "stackGroup") : (node.type === "Inline" ? "inlineItem" : "stackItem");
  return map[step];
}

const PROPS = ["gap", "padding", "shortGap", "shortPadding", "offset"];
const LAYOUTS = new Set(["Stack", "Inline", "Columns", "Surface", "Positioner"]);

export function migrate(doc) {
  let n = 0;
  /** Every (prop, step) pair in document order, with its new value: the text rewrite follows this list. */
  const order = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (PROPS.includes(k) && typeof v === "string" && STEP.has(v)) {
        // A layout's own prop: its parent node carries the type.
        const owner = parentOf.get(node);
        const next = owner && LAYOUTS.has(owner.type) ? roleFor(owner, k, v) : v;
        if (next !== v) { node[k] = next; n++; }
        order.push(next);
      } else if (v && typeof v === "object") { if (k === "props") parentOf.set(v, node); visit(v); }
    }
  };
  const parentOf = new WeakMap();
  visit(doc);
  return { n, order };
}

/** Rewrites the text in place, keeping its formatting. */
export function migrateText(src) {
  const { n, order } = migrate(JSON.parse(src));
  if (!n) return { n, text: src };
  let i = 0;
  const text = src.replace(new RegExp(`"(${PROPS.join("|")})"(\\s*):(\\s*)"(${[...STEP].join("|")})"`, "g"), (_, p, a, b) => `"${p}"${a}:${b}"${order[i++]}"`);
  if (i !== order.length) throw new Error(`to-roles: ${i} matches in the text, ${order.length} in the document`);
  return { n, text };
}

const files = (paths) => paths.flatMap((p) => (statSync(p).isDirectory() ? files(readdirSync(p).filter((f) => f !== "node_modules").map((f) => join(p, f))) : p.endsWith(".json") && !/messages|[\\/]data\.json$/.test(p) ? [p] : []));

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("tools/spacing/to-roles.mjs")) {
  const args = process.argv.slice(2);
  let total = 0;
  for (const f of files(args.length ? args : ["packages/views"])) {
    const { n, text } = migrateText(readFileSync(f, "utf8"));
    if (!n) continue;
    writeFileSync(f, text);
    console.log(`${f}: ${n}`);
    total += n;
  }
  console.log(`spacing roles: ${total} prop(s) moved from scale steps to roles`);
}
