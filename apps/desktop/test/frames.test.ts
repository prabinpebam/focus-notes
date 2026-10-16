/**
 * The frame-integrity journey's mid-transition classifier (DSK-09, D-148, reduced motion): a frame
 * whose main colour is in no theme was caught between two. A steady frame under a modal's scrim
 * (Settings open, a confirmation over it) is the theme's colours composited with `color.scrim`,
 * computed from the built tokens, and isn't a transition; a cross-fade between Paper and Ink is.
 */
import { describe, expect, it } from "vitest";
import { midTransition, themePalettes, type Rgb } from "../e2e/frames.ts";

const pal = themePalettes();
const mix = (a: Rgb, b: Rgb, t: number): Rgb => a.map((x, k) => Math.round(x * (1 - t) + b[k]! * t)) as Rgb;
const paper = pal.light.large[0]!;
const ink = pal.dark.large[0]!;

describe("midTransition", () => {
  it("knows each theme's own canvas", () => {
    expect(midTransition(paper, pal)).toBe(false);
    expect(midTransition(ink, pal)).toBe(false);
  });
  it("accepts the dark theme under the scrim, once and twice (CI saw rgb(8, 8, 12) with Settings open)", () => {
    expect(pal.dark.scrimmed.length).toBeGreaterThan(0);
    expect(midTransition([10, 10, 14], pal)).toBe(false);
    // A confirmation over Settings: two scrims.
    const twice = pal.dark.scrimmed[pal.dark.scrimmed.length / 2]!;
    expect(midTransition(twice.map(Math.round) as Rgb, pal)).toBe(false);
  });
  it("accepts the light theme under its scrim", () => {
    const once = pal.light.scrimmed[0]!;
    expect(midTransition(once.map(Math.round) as Rgb, pal)).toBe(false);
  });
  it("still catches a cross-fade between Paper and Ink: the midpoint, and most frames of it, so a fade can't pass unseen", () => {
    expect(midTransition(mix(paper, ink, 0.5), pal)).toBe(true);
    // Every 5% from 10% to 90%. A few blends equal a steady colour (40% of the way to Ink is Paper
    // under its scrim, 90% is next to Ink's raised surface), but a fade draws many frames, and one
    // caught frame fails the journey.
    const caught = Array.from({ length: 17 }, (_, i) => midTransition(mix(paper, ink, (i + 2) / 20), pal));
    expect(caught.filter(Boolean).length).toBeGreaterThanOrEqual(14);
    for (let i = 0; i + 1 < caught.length; i++) expect(caught[i] || caught[i + 1], `two blends in a row missed at ${(i + 2) * 5}%`).toBe(true);
  });
});
