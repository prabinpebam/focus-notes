/**
 * D-431 refinement (owner, 26 November 22:57): a file's shared and published badges are painted in the
 * accent through cmp.fileTree's badge tokens, and each reaches 3:1 (WCAG 1.4.11) on every row state the
 * Files panel draws them on (rest, hover, focused, the open note, selected, selected and focused, and
 * Opened files' active and inactive tabs), in every built-in theme, with the app's accent and with each
 * project accent (D-313: its strong shade in a light context, its soft one in a dark one).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { frost } from "@focus-notes/tokens";
import { BUILT_IN_THEMES, checkContrast, pairRatio, type ContrastPair } from "../src/index.ts";

const src = join(import.meta.dirname, "..", "..", "tokens", "src");
type Tree = { [k: string]: Tree | unknown };
function flatten(obj: Tree, path: string[] = [], out = new Map<string, unknown>()) {
  if ("$value" in obj) return out.set(path.join("."), obj.$value);
  for (const [k, v] of Object.entries(obj)) if (!k.startsWith("$") && v && typeof v === "object") flatten(v as Tree, [...path, k], out);
  return out;
}
const read = (f: string) => flatten(JSON.parse(readFileSync(f, "utf8")) as Tree);
const dirFiles = (d: string) => readdirSync(join(src, d)).filter((f) => f.endsWith(".json")).map((f) => join(src, d, f));
const base = new Map<string, unknown>();
for (const f of [...dirFiles("reference"), ...dirFiles("semantic"), join(src, "component", "fileTree.json"), join(src, "component", "openedFiles.json")]) for (const [k, v] of read(f)) base.set(k, v);
const PRESETS = [...base.keys()].filter((k) => /^ref\.color\.project\.[a-z]+\.strong$/.test(k)).map((k) => k.split(".")[3]!);
const DARK = new Set(BUILT_IN_THEMES.filter((t) => t.kind === "dark").map((t) => t.id));

/** Every token's colour in a theme, with a project accent rebinding the accent roles as the build does (D-313). */
function colorsOf(themeId: string, accent: string | undefined): Record<string, string> {
  const tokens = new Map(base);
  if (themeId !== "paper") for (const [k, v] of read(join(src, "themes", `${themeId}.json`))) tokens.set(k, v);
  if (accent) {
    const shade = DARK.has(themeId) ? "soft" : "strong";
    tokens.set("color.accent", `{ref.color.project.${accent}.${shade}}`);
    tokens.set("color.focusRing", `{ref.color.project.${accent}.${shade}}`);
    tokens.set("color.accentMuted", `{ref.color.project.${accent}.${shade}Tint}`);
  }
  const resolve = (v: unknown): unknown => {
    for (let i = 0; i < 10 && typeof v === "string" && /^\{.+\}$/.test(v); i++) v = tokens.get(v.slice(1, -1));
    return v;
  };
  return Object.fromEntries([...tokens.keys()].map((k) => [k, String(resolve(tokens.get(k)))]));
}

/** The Files panel is a frosted sheet over the note's canvas (D-111): each state's fill is drawn on that. */
const FROST = [{ color: "color.surface", opacity: frost.opacity }];
const STATES: readonly { state: string; badge: string; bg: string; project?: boolean }[] = [
  { state: "row at rest", badge: "cmp.fileTree.badge", bg: "color.surface" },
  { state: "row focused", badge: "cmp.fileTree.badge", bg: "color.surface" },
  { state: "row hovered", badge: "cmp.fileTree.badge", bg: "cmp.fileTree.hover" },
  { state: "open note's row", badge: "cmp.fileTree.badge", bg: "cmp.fileTree.current" },
  { state: "row selected", badge: "cmp.fileTree.badge", bg: "cmp.fileTree.selection" },
  { state: "row selected and focused", badge: "cmp.fileTree.badge", bg: "cmp.fileTree.selection" },
  { state: "inactive tab", badge: "cmp.fileTree.badge", bg: "color.surface" },
  { state: "inactive tab hovered", badge: "cmp.fileTree.badge", bg: "cmp.openedFiles.hover" },
  { state: "active tab", badge: "cmp.fileTree.badge", bg: "cmp.openedFiles.current" },
  { state: "active tab in a project", badge: "cmp.fileTree.badge", bg: "cmp.openedFiles.currentProject", project: true },
];

function badgeRatios() {
  const out: { theme: string; accent: string; state: string; ratio: number }[] = [];
  for (const theme of BUILT_IN_THEMES) {
    for (const accent of [undefined, ...PRESETS]) {
      const colors = colorsOf(theme.id, accent);
      for (const s of STATES) {
        if (s.project && !accent) continue;
        const p: ContrastPair = { fg: s.badge, bg: s.bg, min: 3, minHigh: 3, role: "ui", under: FROST };
        const ratio = pairRatio(colors, p);
        out.push({ theme: theme.id, accent: accent ?? "app", state: s.state, ratio: ratio ?? NaN });
      }
    }
  }
  return out;
}

describe("file badges in the accent (D-431)", () => {
  it("every badge reaches 3:1 on every row and tab state, in every theme and project accent", () => {
    const ratios = badgeRatios();
    expect(ratios.length).toBe(BUILT_IN_THEMES.length * ((PRESETS.length + 1) * (STATES.length - 1) + PRESETS.length));
    const failing = ratios.filter((r) => !(r.ratio >= 3)).map((r) => `${r.theme} · ${r.accent} · ${r.state}: ${r.ratio.toFixed(2)}`);
    expect(failing).toEqual([]);
  });
  it("the contrast guard warns when a custom theme's accent is too faint for the badges", () => {
    const colors = { ...colorsOf("paper", undefined), "color.accent": "#d7e3f8" };
    expect(checkContrast(colors).filter((f) => f.fg === "color.accent" && f.where === "on a frosted sheet").map((f) => f.bg)).toEqual(
      expect.arrayContaining(["color.surface", "color.hover", "color.pressed", "color.selection"]));
  });
});
