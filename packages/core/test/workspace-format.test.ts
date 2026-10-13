/** The versioned workspace format (DST-05): read, refuse newer, and migrate only when asked. */
import { describe, expect, it } from "vitest";
import { migrateWorkspaceFile, readWorkspaceFormat, WORKSPACE_FORMAT, type Migrations } from "../src/workspace-format.ts";

describe("reading .focus-notes/workspace.json (DST-05)", () => {
  it("writes the current format, and a folder without the file", () => {
    expect(WORKSPACE_FORMAT).toBe(1);
    expect(readWorkspaceFormat(JSON.stringify({ formatVersion: 1, templateVersion: "1.0.0" }))).toEqual({ access: "write", file: { formatVersion: 1, templateVersion: "1.0.0" } });
    expect(readWorkspaceFormat(undefined)).toEqual({ access: "write" });
  });
  it("refuses to write a newer format", () => {
    expect(readWorkspaceFormat(JSON.stringify({ formatVersion: 2 }))).toEqual({ access: "newer", found: 2 });
  });
  it("never writes over a file it can't read", () => {
    for (const text of ["{", "[]", "null", '{"formatVersion":"1"}', '{"formatVersion":0}', '{"formatVersion":1.5}', '{"templateVersion":"1"}']) {
      expect(readWorkspaceFormat(text)).toEqual({ access: "unreadable" });
    }
  });
  it("asks before migrating an older format, and reads it meanwhile", () => {
    const migrations: Migrations = { 1: (f) => ({ ...f, formatVersion: 2, added: true }) };
    expect(readWorkspaceFormat('{"formatVersion":1}', 2, migrations)).toEqual({ access: "migrate", from: 1, file: { formatVersion: 1 } });
  });
  it("treats an older format with no way to migrate it as unreadable", () => {
    expect(readWorkspaceFormat('{"formatVersion":1}', 3, { 2: (f) => ({ ...f, formatVersion: 3 }) })).toEqual({ access: "unreadable" });
  });
});

describe("migrating (DST-05)", () => {
  it("runs each step in order, keeping keys it doesn't know", () => {
    const migrations: Migrations = {
      1: (f) => ({ ...f, formatVersion: 2, two: true }),
      2: (f) => ({ ...f, formatVersion: 3, three: true }),
    };
    expect(migrateWorkspaceFile({ formatVersion: 1, templateVersion: "1.0.0" }, 3, migrations)).toEqual({ formatVersion: 3, templateVersion: "1.0.0", two: true, three: true });
  });
  it("refuses a step that doesn't land on the next version", () => {
    expect(() => migrateWorkspaceFile({ formatVersion: 1 }, 2, { 1: (f) => f })).toThrow(/version 1/);
  });
});
