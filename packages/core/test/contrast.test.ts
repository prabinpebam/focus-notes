/** THM-13: the contrast guard's pairs, WCAG 2.2 ratios, the one-click fix, and the check before saving. */
import { describe, expect, it } from "vitest";
import { themeValues } from "@focus-notes/tokens";
import {
  BUILT_IN_THEMES, CONTRAST_PAIRS, KEY_COLORS, checkBeforeSave, checkContrast, checkTheme, contrastRatio, fixColor, pairRatio,
  fromOklch, parseColor, textContrast, toHex, toOklch,
} from "../src/index.ts";

const paper = (): Record<string, string> => ({ ...themeValues.paper! });

describe("the pairs the guard checks", () => {
  it("covers body, muted, and placeholder text, links, selection and find highlights, and the non-text parts", () => {
    const has = (fg: string, bg: string) => CONTRAST_PAIRS.find((p) => p.fg === fg && p.bg === bg);
    expect(has("color.text", "color.canvas")).toMatchObject({ min: 4.5, minHigh: 7, role: "text" });
    for (const bg of ["color.canvas", "color.surface", "color.surfaceRaised", "color.surfaceSunken"]) expect(has("color.textMuted", bg)?.min).toBe(4.5);
    expect(has("color.link", "color.canvas")?.min).toBe(4.5);
    expect(has("color.onSelection", "color.selection")?.min).toBe(4.5);
    expect(has("color.onSelection", "color.findMatchActive")?.min).toBe(4.5);
    // Non-text contrast (WCAG 1.4.11) is 3:1.
    for (const [fg, bg] of [["color.focusRing", "color.canvas"], ["color.accent", "color.canvas"], ["trigger.dot", "trigger.ring"]] as const) {
      expect(has(fg, bg)).toMatchObject({ min: 3, role: "ui" });
    }
  });

  it("covers selected and hovered items' text and muted text on every surface they're drawn on (D-111)", () => {
    const where = (fg: string, bg: string) => CONTRAST_PAIRS.filter((p) => p.fg === fg && p.bg === bg).map((p) => p.where ?? "on the canvas");
    const all = ["on the canvas", "on a raised surface", "on a frosted sheet", "on frost over a scrim"];
    for (const [fg, bg] of [["color.onSelection", "color.selection"], ["color.onSelectionMuted", "color.selection"], ["color.text", "color.hover"], ["color.textMuted", "color.hover"]] as const) {
      expect(where(fg, bg), `${fg} on ${bg}`).toEqual(expect.arrayContaining(all));
    }
    expect(where("color.textMuted", "color.surface")).toEqual(expect.arrayContaining(["on a frosted sheet", "on frost over a scrim"]));
  });

  it("measures a background as it's drawn: over a scrim and a frosted surface, not the bare canvas", () => {
    const c = { ...paper(), "color.canvas": "#ffffff", "color.scrim": "#00000080", "color.surface": "#ffffff", "color.selection": "#00000000", "color.onSelectionMuted": "#777777" };
    const p = CONTRAST_PAIRS.find((q) => q.fg === "color.onSelectionMuted" && q.where === "on frost over a scrim")!;
    // White frost at its opacity over a half-black scrim is darker than white, so the ratio drops.
    expect(pairRatio(c, p)!).toBeLessThan(contrastRatio("#777777", "#ffffff"));
  });

  it("measures WCAG 2.2 contrast, with translucent backgrounds over the canvas", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(Number.isNaN(contrastRatio("#00000080", "#ffffff"))).toBe(true);
    // Black at 50% over white is #808080 (to the nearest step).
    const r = pairRatio({ "color.canvas": "#ffffff", "color.selection": "#00000080", "color.onSelection": "#000000" }, { fg: "color.onSelection", bg: "color.selection", min: 4.5, minHigh: 7, role: "text" });
    expect(r).toBeCloseTo(contrastRatio("#000000", "#7f7f7f"), 1);
    expect(parseColor("#2f5fd033")).toMatchObject({ rgb: [47, 95, 208], alpha: 0.2 });
  });

  it("reports each pair, uses the High contrast minimum for High contrast themes, and badges body text", () => {
    const colors = { ...paper(), "color.text": "#8a8580" };
    const failing = checkContrast(colors);
    expect(failing.map((f) => `${f.fg} on ${f.bg}`)).toContain("color.text on color.canvas");
    expect(failing.every((f) => !f.pass && f.ratio < f.need)).toBe(true);
    expect(checkTheme(paper(), true).filter((r) => !r.pass).length).toBeGreaterThan(0);
    expect(textContrast(paper()).level).toBe("AAA");
    expect(textContrast({ ...paper(), "color.text": "#6e685e" }).level).toBe("AA");
    expect(textContrast(colors).level).toBe("low");
  });
});

describe("the one-click fix", () => {
  const lightnessOf = (hex: string) => toOklch(parseColor(hex)!.rgb).l;
  const hueOf = (hex: string) => toOklch(parseColor(hex)!.rgb).h;

  it("finds the nearest passing color by changing only lightness, and keeps the hue", () => {
    const colors = { ...paper(), "color.accent": "#7aa2ff", "color.link": "#7aa2ff", "color.focusRing": "#7aa2ff" };
    expect(checkContrast(colors).length).toBeGreaterThan(0);
    const fixed = fixColor(colors, KEY_COLORS.accent)!;
    expect(fixed).toMatch(/^#[0-9a-f]{6}$/);
    const after = { ...colors, "color.accent": fixed, "color.link": fixed, "color.focusRing": fixed };
    expect(checkContrast(after).filter((f) => KEY_COLORS.accent.some((t) => t === f.fg || t === f.bg))).toEqual([]);
    expect(Math.abs(hueOf(fixed) - hueOf("#7aa2ff"))).toBeLessThan(2);
    // Darker, on a light canvas, and nothing nearer passes: every smaller change, either way, still fails.
    const start = toOklch(parseColor("#7aa2ff")!.rgb);
    const delta = lightnessOf(fixed) - start.l;
    expect(delta).toBeLessThan(0);
    const accentPairs = (hex: string) => checkContrast({ ...colors, "color.accent": hex, "color.link": hex, "color.focusRing": hex })
      .filter((f) => KEY_COLORS.accent.some((t) => t === f.fg || t === f.bg));
    for (let d = 0.001; d < Math.abs(delta) - 0.002; d += 0.001) {
      for (const l of [start.l - d, start.l + d]) expect(accentPairs(toHex(fromOklch({ ...start, l }))).length, `ΔL ${d}`).toBeGreaterThan(0);
    }
  });

  it("goes lighter on a dark canvas, and leaves a passing color alone", () => {
    const ink = { ...themeValues.ink!, "color.text": "#55524e", "color.onSelection": "#55524e", "code.text": "#55524e" };
    const fixed = fixColor(ink, KEY_COLORS.text)!;
    expect(lightnessOf(fixed)).toBeGreaterThan(lightnessOf("#55524e"));
    expect(fixColor(paper(), KEY_COLORS.text)).toBe(paper()["color.text"]);
  });

  it("says when lightness alone can't fix it", () => {
    // Mid grey: neither black nor white text reaches 7:1 on it.
    const grey = { "color.canvas": "#777777", "color.text": "#000000" };
    expect(fixColor(grey, ["color.text"], true)).toBeUndefined();
  });
});

describe("before a custom theme is saved", () => {
  it("passes a readable theme and counts the hard-to-read pairs of one that isn't", () => {
    expect(checkBeforeSave(paper())).toEqual({ ok: true, failing: [] });
    const r = checkBeforeSave({ ...paper(), "color.text": "#c9c5be", "color.textMuted": "#d8d4ca" });
    expect(r.ok).toBe(false);
    expect(r.failing.length).toBeGreaterThanOrEqual(2);
  });
});

describe("built-in themes ship passing (never a failing built-in)", () => {
  for (const theme of BUILT_IN_THEMES) {
    it(`${theme.id}: every pair passes, as the app reads the theme at run time`, () => {
      const colors = themeValues[theme.id]!;
      expect(colors, theme.id).toBeDefined();
      expect(checkContrast(colors, theme.contrast === "high").map((f) => `${f.fg} on ${f.bg} ${f.ratio}:1 < ${f.need}`)).toEqual([]);
    });
  }
});
