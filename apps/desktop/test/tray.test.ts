/**
 * DSK-11, D-217: on Windows, closing the main window keeps the app running in the tray. The choice
 * and the one-time notice are kept in tray.json; journeys keep the old close unless they opt in,
 * and then the icon is only logged.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ Menu: {}, nativeImage: {}, Tray: class {} }));
const { AppTray, readTraySettings, trayMode } = await import("../src/main/window/tray.ts");

const file = () => join(mkdtempSync(join(tmpdir(), "fn-tray-")), "tray.json");

describe("trayMode", () => {
  it("is on with an icon on Windows only", () => {
    expect(trayMode("win32", {})).toBe("icon");
    expect(trayMode("darwin", {})).toBe("off");
    expect(trayMode("linux", {})).toBe("off");
  });
  it("is off in journeys unless they opt in, and then only logged, never on the screen", () => {
    expect(trayMode("win32", { FOCUS_NOTES_E2E: "1" })).toBe("off");
    expect(trayMode("win32", { FOCUS_NOTES_E2E: "1", FOCUS_NOTES_E2E_TRAY: "1" })).toBe("logged");
  });
});

describe("readTraySettings", () => {
  it("closes to the tray by default, before the notice was shown", () => {
    expect(readTraySettings(file())).toEqual({ version: 1, closeToTray: true, told: false });
  });
  it("keeps a choice to turn it off, and ignores an unknown version", () => {
    const f = file();
    writeFileSync(f, JSON.stringify({ version: 1, closeToTray: false, told: true }));
    expect(readTraySettings(f)).toEqual({ version: 1, closeToTray: false, told: true });
    writeFileSync(f, JSON.stringify({ version: 2, closeToTray: false }));
    expect(readTraySettings(f).closeToTray).toBe(true);
  });
});

describe("AppTray (logged)", () => {
  it("tells once, and remembers it was told", () => {
    const f = file();
    const log = vi.fn();
    const tray = new AppTray({ mode: "logged", file: f, icon: "", open: () => {}, quit: () => {}, log });
    expect(tray.closeToTray).toBe(true);
    tray.hidden();
    tray.hidden();
    expect(log.mock.calls.filter(([l]) => l === "tray: told once")).toHaveLength(1);
    expect(JSON.parse(readFileSync(f, "utf8"))).toMatchObject({ told: true, closeToTray: true });
    const again = new AppTray({ mode: "logged", file: f, icon: "", open: () => {}, quit: () => {}, log });
    again.hidden();
    expect(log.mock.calls.filter(([l]) => l === "tray: told once")).toHaveLength(1);
  });
});
