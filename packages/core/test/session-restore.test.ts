import { describe, expect, it } from "vitest";
import { planSessionRestore, type SessionProbe } from "../src/session-restore.ts";

const probe = (states: Record<string, SessionProbe>) => (path: string) => states[path];

describe("planSessionRestore (D-420)", () => {
  it("restores a saved session's tabs in order with its active note, and no Untitled", () => {
    expect(planSessionRestore({ opened: ["a", "b", "c"], active: "b" }, probe({ a: "present", b: "present", c: "present" })))
      .toEqual({ kind: "restore", opened: ["a", "b", "c"], active: "b", dropped: 0 });
  });

  it("lands in Untitled when there's no saved session (new or empty project, D-397)", () => {
    expect(planSessionRestore({ opened: [] }, probe({}))).toEqual({ kind: "untitled", gone: false, dropped: 0 });
  });

  it("drops missing notes quietly and keeps the rest", () => {
    expect(planSessionRestore({ opened: ["a", "b", "c"], active: "b" }, probe({ a: "missing", b: "present", c: "present" })))
      .toEqual({ kind: "restore", opened: ["b", "c"], active: "b", dropped: 1 });
  });

  it("moves to the following tab when the active note is gone", () => {
    expect(planSessionRestore({ opened: ["a", "b", "c"], active: "b" }, probe({ a: "present", b: "missing", c: "present" })))
      .toEqual({ kind: "restore", opened: ["a", "c"], active: "c", dropped: 1 });
    expect(planSessionRestore({ opened: ["a", "b", "c"], active: "c" }, probe({ a: "present", b: "present", c: "missing" })))
      .toMatchObject({ active: "b" });
  });

  it("falls back to Untitled when every note in the session is gone", () => {
    expect(planSessionRestore({ opened: ["a", "b"], active: "b" }, probe({ a: "missing", b: "missing" })))
      .toEqual({ kind: "untitled", gone: true, dropped: 2 });
  });

  it("is an error, never a guess, when a note can't be read", () => {
    expect(planSessionRestore({ opened: ["a", "b"], active: "a" }, probe({ a: "present", b: "error" }))).toEqual({ kind: "error" });
  });

  it("keeps an active note that had no tab of its own", () => {
    expect(planSessionRestore({ opened: ["a"], active: "z" }, probe({ a: "present", z: "present" })))
      .toEqual({ kind: "restore", opened: ["a"], active: "z", dropped: 0 });
  });
});
