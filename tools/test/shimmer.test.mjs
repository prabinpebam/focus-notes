/**
 * D-208: a skeleton's shimmer. The light passes a few times and then stands still, so the motion stays
 * within 5 seconds (WCAG 2.2.2); with reduced motion it never moves; it's drawn by a transform-only
 * overlay; and the placeholder is always hidden from assistive technology.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const read = (...p) => readFileSync(join(root, ...p), "utf8");
const json = (...p) => JSON.parse(read(...p));
const tokens = join("packages", "tokens", "src");
const structure = json(tokens, "semantic", "structure.json");
const refs = json(tokens, "reference", "base.json").ref.duration;
const ms = (alias) => parseFloat(refs[/^\{ref\.duration\.(\d+)\}$/.exec(alias)[1]].$value);

describe("the shimmer (D-208)", () => {
  it("passes a finite number of times, within 5 seconds of motion", () => {
    const pass = ms(structure.motion.shimmer.$value);
    const passes = structure.motion.shimmerPasses.$value;
    expect(Number.isInteger(passes) && passes > 0).toBe(true);
    expect(pass * passes).toBeLessThanOrEqual(5000);
  });

  it("stands still with reduced motion", () => {
    expect(ms(json(tokens, "modes", "reduced-motion.json").motion.shimmer.$value)).toBe(0);
  });

  it("reads its motion from the shimmer tokens", () => {
    const skeleton = json(tokens, "component", "skeleton.json").cmp.skeleton;
    expect(skeleton.duration.$value).toBe("{motion.shimmer}");
    expect(skeleton.passes.$value).toBe("{motion.shimmerPasses}");
  });

  it("moves only a transform, never forever, and stops for reduced motion and forced colours", () => {
    const css = read("packages", "ui", "src", "primitives", "Skeleton", "Skeleton.css.ts");
    expect(css).not.toMatch(/infinite/);
    expect(css).toMatch(/animationIterationCount: t\.passes/);
    const frames = css.split("\n").find((l) => l.includes("keyframes({"));
    expect([...frames.matchAll(/\{ (\w+): "/g)].map((m) => m[1])).toEqual(["transform", "transform"]);
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
    expect(css).toMatch(/data-motion="reduced"/);
    expect(css).toMatch(/forced-colors: active/);
  });

  it("is always hidden from assistive technology", () => {
    expect(read("packages", "ui", "src", "primitives", "Skeleton", "Skeleton.tsx")).toMatch(/aria-hidden="true"/);
  });
});

describe("the shimmer on any hue (D-353)", () => {
  const base = json(tokens, "semantic", "color.json").color;
  const ref = json(tokens, "reference", "base.json").ref.color;
  const resolve = (alias) => {
    const [, family, step] = /^\{ref\.color\.(\w+)\.(\w+)\}$/.exec(alias) ?? [];
    return ref[family]?.[step]?.$value;
  };
  const themes = ["paper", "sepia", "ink", "dusk", "forest-light", "forest-dark", "harbor-light", "harbor-dark", "contrast-light", "contrast-dark"];

  it("reads its fill and light from the translucent skeleton colours", () => {
    const skeleton = json(tokens, "component", "skeleton.json").cmp.skeleton;
    expect(skeleton.fill.$value).toBe("{color.skeleton}");
    expect(skeleton.highlight.$value).toBe("{color.skeletonHighlight}");
  });

  it("is black or white at an opacity in every theme, never an opaque grey, so a tinted surface keeps its hue", () => {
    for (const theme of themes) {
      const own = json(tokens, "themes", `${theme}.json`).color ?? {};
      for (const key of ["skeleton", "skeletonHighlight"]) {
        const value = resolve((own[key] ?? base[key]).$value);
        expect(value, `${theme} ${key}`).toMatch(/^#(000000|ffffff)[0-9a-f]{2}$/i);
        const alpha = parseInt(value.slice(7), 16);
        expect(alpha > 0 && alpha < 255, `${theme} ${key} alpha`).toBe(true);
      }
    }
  });
});