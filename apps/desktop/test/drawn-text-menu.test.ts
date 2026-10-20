/**
 * D-204, EDT-14: on Windows and Linux the shell sends the page a menu to draw and stays the authority:
 * a choice counts only for the latest menu, for an item it offered that's available, and once.
 */
import { describe, expect, it } from "vitest";
import type { TextMenuModel } from "@focus-notes/core/text-menu";
import { DrawnTextMenu } from "../src/main/spelling/drawn-menu.ts";
import { themeSourceFor } from "../src/main/window/native-theme.ts";

const entries = [
  { kind: "suggestion" as const, word: "mistake" },
  { kind: "separator" as const },
  { kind: "learn" as const, word: "mistaek" },
  { kind: "separator" as const },
  { kind: "edit" as const, role: "cut" as const, enabled: false },
  { kind: "edit" as const, role: "copy" as const, enabled: true },
  { kind: "copyLink" as const },
];

describe("DrawnTextMenu", () => {
  it("sends the page the menu, never the link's address, and acts on a choice once", () => {
    const sent: TextMenuModel[] = [];
    const menu = new DrawnTextMenu((m) => sent.push(m));
    const id = menu.open(10.4, 20.6, entries, "https://example.com/");
    expect(sent).toEqual([{ id, x: 10, y: 21, entries }]);
    expect(JSON.stringify(sent)).not.toContain("example.com");
    expect(menu.choose(id, "copyLink")).toEqual({ action: { kind: "copyLink" }, link: "https://example.com/" });
    expect(menu.choose(id, "copy")).toBeUndefined();
  });

  it("ignores an unavailable item, an item it didn't offer, a malformed reply, and an older menu", () => {
    const menu = new DrawnTextMenu(() => {});
    const first = menu.open(0, 0, entries);
    const second = menu.open(5, 5, entries);
    expect(menu.choose(first, "s0")).toBeUndefined();
    expect(menu.choose(second, "cut")).toBeUndefined();
    expect(menu.choose(second, "paste")).toBeUndefined();
    expect(menu.choose(second, "s1")).toBeUndefined();
    expect(menu.choose(String(second), "s0")).toBeUndefined();
    expect(menu.choose(second, { id: "s0" })).toBeUndefined();
    expect(menu.choose(second, "s0")).toEqual({ action: { kind: "replace", word: "mistake" }, link: "" });
  });

  it("fills in the menu showing when the spell checker answers late, and drops an older menu's answer", () => {
    const sent: TextMenuModel[] = [];
    const menu = new DrawnTextMenu((m) => sent.push(m));
    const old = menu.open(1, 2, [{ kind: "checking" }]);
    const now = menu.open(3, 4, [{ kind: "checking" }]);
    menu.update(old, entries);
    expect(sent).toHaveLength(2);
    menu.update(now, entries);
    expect(sent.at(-1)).toEqual({ id: now, x: 3, y: 4, entries });
    expect(menu.choose(now, "learn")).toEqual({ action: { kind: "learn", word: "mistaek" }, link: "" });
  });
});

describe("themeSourceFor (D-204: macOS's native menus follow the app's appearance)", () => {
  it("follows the app's light or dark on macOS, and the system's otherwise", () => {
    expect(themeSourceFor("macos", "light")).toBe("light");
    expect(themeSourceFor("macos", "dark")).toBe("dark");
    expect(themeSourceFor("macos", "system")).toBe("system");
    expect(themeSourceFor("macos", "sepia")).toBe("system");
    expect(themeSourceFor("macos", undefined)).toBe("system");
    for (const p of ["windows", "linux"] as const) for (const a of ["light", "dark", "system"]) expect(themeSourceFor(p, a)).toBe("system");
  });
});
