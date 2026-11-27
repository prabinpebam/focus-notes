/**
 * D-435: a project's colour takes every accent role, solved per built-in theme. Every colour in every theme
 * passes the contrast guard (THM-13) and the solver's own rules, measured here with independent maths.
 */
import { describe, expect, it } from "vitest";
import { projectAccentValues, themeValues } from "@focus-notes/tokens";
import { checkContrast } from "../src/contrast.ts";

const COLOURS = ["red", "orange", "amber", "lime", "green", "teal", "cyan", "blue", "indigo", "violet", "pink", "slate"];
const THEMES = ["paper", "ink", "sepia", "dusk", "forest-light", "forest-dark", "harbor-light", "harbor-dark", "contrast-light", "contrast-dark"];
const ROLES = ["color.accent", "color.link", "color.focusRing", "color.onAccent", "color.selection", "color.accentMuted"];

type C = { r: number; g: number; b: number; a: number };
const hex = (h: string): C => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(h);
  if (!m) throw new Error(`not hex: ${h}`);
  return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16), a: m[4] ? parseInt(m[4], 16) / 255 : 1 };
};
const on = (top: C, under: C): C => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
const linear = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (c: C) => 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
const ratio = (a: C, b: C) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
const oklab = (c: C) => {
  const [R, G, B] = [linear(c.r), linear(c.g), linear(c.b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s] as const;
};
const distance = (a: C, b: C) => { const p = oklab(a), q = oklab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

describe("project accents (D-435)", () => {
  it("solves all 12 colours in all 10 built-in themes", () => {
    expect(Object.keys(projectAccentValues).sort()).toEqual([...COLOURS].sort());
    for (const c of COLOURS) expect(Object.keys(projectAccentValues[c]!).sort(), c).toEqual([...THEMES].sort());
  });

  for (const colour of COLOURS) for (const theme of THEMES) it(`${colour} in ${theme}`, () => {
    const t = themeValues[theme]!;
    const v = projectAccentValues[colour]![theme]!;
    const high = theme.startsWith("contrast-");
    const text = high ? 7 : 4.5;
    expect(Object.keys(v).sort()).toEqual([...ROLES].sort());
    expect(v["color.link"]).toBe(v["color.accent"]);
    expect(v["color.focusRing"]).toBe(v["color.accent"]);

    // The contrast guard the app runs (THM-13) passes with the project's roles in place.
    expect(checkContrast({ ...t, ...v }, high).map((f) => `${f.fg} on ${f.bg} ${f.where ?? ""} ${f.ratio}:1 < ${f.need}`)).toEqual([]);

    const canvas = hex(t["color.canvas"]!);
    const surfaces = ["color.canvas", "color.surface", "color.surfaceRaised", "color.surfaceSunken"].map((k) => on(hex(t[k]!), canvas));
    const accent = hex(v["color.accent"]!);
    for (const s of surfaces) {
      expect(ratio(accent, s), "accent on a surface").toBeGreaterThanOrEqual(text);
      for (const state of ["color.hover", "color.pressed"]) expect(ratio(accent, on(hex(t[state]!), s)), `accent on ${state}`).toBeGreaterThanOrEqual(3);
      for (const fill of ["color.selection", "color.accentMuted"]) {
        const f = on(hex(v[fill]!), s);
        expect(ratio(accent, f), `accent on ${fill}`).toBeGreaterThanOrEqual(3);
        for (const ink of ["color.onSelection", "color.onSelectionMuted"]) expect(ratio(hex(t[ink]!), f), `${ink} on ${fill}`).toBeGreaterThanOrEqual(text);
      }
    }
    expect(ratio(hex(v["color.onAccent"]!), accent), "on-accent ink").toBeGreaterThanOrEqual(text);
    // Never read as a status: far enough from danger, warning and success.
    for (const status of ["color.danger", "color.warning", "color.success"]) expect(distance(accent, hex(t[status]!)), status).toBeGreaterThanOrEqual(0.07);
  });
});
