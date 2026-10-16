/**
 * keybindings.json's poll (D-170, PRF-14): the window is told only when the file really changes,
 * never on a poll that finds it as it was. A real file in a temporary folder; no app.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { watchKeybindings } from "../src/main/keybindings-watch.ts";

const stops: (() => void)[] = [];
afterEach(() => { for (const s of stops.splice(0)) s(); });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("watchKeybindings", () => {
  it("says nothing while the file stays the same, and once when it changes", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "fn-keys-")), "keybindings.json");
    writeFileSync(file, "[]\n");
    let told = 0;
    stops.push(watchKeybindings(file, () => void told++, 20));
    await wait(300);
    expect(told).toBe(0);
    writeFileSync(file, '[{"command":"focus.toggle","key":"Mod+J"}]\n');
    for (let i = 0; i < 50 && told === 0; i++) await wait(20);
    expect(told).toBe(1);
    await wait(200);
    expect(told).toBe(1);
  });

  it("says nothing while there's no file, and once when one appears", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "fn-keys-")), "keybindings.json");
    let told = 0;
    stops.push(watchKeybindings(file, () => void told++, 20));
    await wait(200);
    expect(told).toBe(0);
    writeFileSync(file, "[]\n");
    for (let i = 0; i < 50 && told === 0; i++) await wait(20);
    expect(told).toBe(1);
  });
});
