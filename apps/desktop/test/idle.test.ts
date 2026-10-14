/**
 * PRF-04: near-zero idle CPU, with no polling except the 5-minute fetch. Nothing in the app's own
 * code repeats on a timer: no `setInterval`, and the only timer that reschedules itself forever is
 * Git's fetch, every 5 minutes. (The benchmark measures the CPU itself: PRF-04.idleCpuPct.)
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { FETCH_EVERY_MS } from "../src/main/git/cadence.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const sources = [
  ...walk(join(root, "apps", "desktop", "src")),
  ...walk(join(root, "apps", "web", "src")),
  ...readdirSync(join(root, "packages")).flatMap((p) => {
    const src = join(root, "packages", p, "src");
    try {
      return walk(src);
    } catch {
      return [];
    }
  }),
].filter((f) => /\.(ts|tsx|mjs)$/.test(f));

describe("PRF-04: no polling", () => {
  it("has no setInterval anywhere in the app's code", () => {
    expect(sources.length).toBeGreaterThan(50);
    const polling = sources.filter((f) => /\bsetInterval\s*\(/.test(readFileSync(f, "utf8")));
    expect(polling).toEqual([]);
  });
  it("fetches every 5 minutes by default, and main.ts never shortens it", () => {
    expect(FETCH_EVERY_MS).toBe(5 * 60_000);
    expect(readFileSync(join(root, "apps", "desktop", "src", "main", "git", "sync.ts"), "utf8")).toMatch(/fetchEveryMs \?\? FETCH_EVERY_MS\)/);
    expect(readFileSync(join(root, "apps", "desktop", "src", "main", "main.ts"), "utf8")).not.toMatch(/fetchEveryMs/);
  });
});
