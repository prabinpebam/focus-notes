/**
 * The first run's long calls say how they're going (PRF-13, D-149): Git's download percentage from
 * `git clone --progress`, and the workspace checks a few at a time, counted as each finishes.
 */
import { describe, expect, it } from "vitest";
import { clonePercent, mapLimit } from "../src/main/first-run/workspace.ts";

describe("PRF-13: a download's percentage", () => {
  it("reads the latest Receiving objects percentage Git printed, and nothing else", () => {
    expect(clonePercent("Cloning into 'notes'...\nremote: Counting objects: 100% (20/20), done.\n")).toBeUndefined();
    expect(clonePercent("Receiving objects:   7% (2/27)\rReceiving objects:  45% (13/27), 1.2 MiB | 2 MiB/s\r")).toBe(45);
    expect(clonePercent("Receiving objects: 100% (27/27), done.\nResolving deltas:  50% (3/6)\r")).toBe(100);
    expect(clonePercent("Receiving objects: 999% (1/1)")).toBeUndefined();
  });
});

describe("PRF-13: finding the notes, a few at a time, counted", () => {
  it("never runs more than the cap at once, keeps the items' order, and counts every one done", async () => {
    let running = 0, most = 0;
    const counts: string[] = [];
    const out = await mapLimit([5, 1, 4, 2, 3, 1, 2], 3, async (ms, i) => {
      most = Math.max(most, ++running);
      await new Promise((r) => setTimeout(r, ms));
      running--;
      return i * 10;
    }, (n, total) => counts.push(`${n} of ${total}`));
    expect(most).toBe(3);
    expect(out).toEqual([0, 10, 20, 30, 40, 50, 60]);
    expect(counts).toEqual(["1 of 7", "2 of 7", "3 of 7", "4 of 7", "5 of 7", "6 of 7", "7 of 7"]);
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
  });
});
