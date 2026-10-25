/**
 * The workspace record (FRE-11, D-212): read strictly, written in a fixed shape an older build still
 * opens; the start never re-makes a folder the record names; Documents moved by OneDrive is found.
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  backupToRecord, checkFolder, configUrl, driveOf, envSyncRoots, folderNameOk, movedDocuments, nextFree, parseRecord, recordFor, serializeRecord, shortPath, startDecision, syncService,
} from "../src/main/workspace/record.ts";

const win = process.platform === "win32";
const abs = (p: string) => resolve(win ? `C:\\${p}` : `/${p}`);

describe("the workspace record", () => {
  it("reads a record from before D-212: the folder alone", () => {
    expect(parseRecord(JSON.stringify({ version: 1, folder: abs("Users/you/Documents/prabins-notes") }))).toEqual({ version: 1, folder: abs("Users/you/Documents/prabins-notes") });
  });

  it("reads every field, and drops the ones that don't check out", () => {
    const r = parseRecord(JSON.stringify({
      version: 1, folder: abs("notes"), kind: "github", repository: "you/prabins-notes", privateRepository: "you/prabins-notes-private", account: "you", lastBackup: "2026-10-24T14:41:00Z",
    }));
    expect(r).toEqual({ version: 1, folder: abs("notes"), kind: "github", repository: "you/prabins-notes", privateRepository: "you/prabins-notes-private", account: "you", lastBackup: "2026-10-24T14:41:00Z" });
    const bad = parseRecord(JSON.stringify({ version: 1, folder: abs("notes"), kind: "cloud", repository: "../etc", privateRepository: "a/.git", account: "you/me", lastBackup: "yesterday" }));
    expect(bad).toEqual({ version: 1, folder: abs("notes") });
  });

  it("isn't a record without version 1 and an absolute folder", () => {
    for (const text of [undefined, "", "{", "null", JSON.stringify({ version: 2, folder: abs("x") }), JSON.stringify({ version: 1, folder: "relative" }), JSON.stringify({ version: 1 })]) expect(parseRecord(text)).toBeUndefined();
  });

  it("writes the same record back, with nothing undefined", () => {
    const r = { version: 1 as const, folder: abs("notes"), kind: "local" as const, repository: "you/notes" };
    const text = serializeRecord(r);
    expect(JSON.parse(text)).toEqual(r);
    expect(text).not.toContain("undefined");
    expect(parseRecord(text)).toEqual(r);
  });

  it("reads a remote's URL from a Git config, quoted or not", () => {
    const config = `[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/you/notes.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n[submodule "private"]\n\turl = "C:\\\\remotes\\\\you\\\\notes-private.git"\n`;
    expect(configUrl(config, 'remote "origin"')).toBe("https://github.com/you/notes.git");
    expect(configUrl(config, 'submodule "private"')).toBe("C:\\remotes\\you\\notes-private.git");
    expect(configUrl(config, 'remote "upstream"')).toBeUndefined();
  });
});

describe("at start", () => {
  it("opens a folder that's there, makes one only when none was ever recorded, and otherwise recovers", () => {
    const record = { version: 1 as const, folder: abs("notes") };
    expect(startDecision(record, "ok")).toBe("open");
    expect(startDecision(undefined, "ok")).toBe("open");
    expect(startDecision(undefined, "missing")).toBe("create");
    expect(startDecision(record, "missing")).toBe("recover");
    expect(startDecision(record, "drive")).toBe("recover");
  });

  it("tells a folder, a missing folder and a file in its place apart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fn-record-"));
    mkdirSync(join(dir, "notes"));
    writeFileSync(join(dir, "file"), "");
    expect(await checkFolder(join(dir, "notes"))).toBe("ok");
    expect(await checkFolder(join(dir, "gone"))).toBe("missing");
    expect(await checkFolder(join(dir, "file"))).toBe("missing");
  });

  it.runIf(win)("says when the folder's drive isn't connected", async () => {
    const free = "QRSTUVWXYZ".split("").find((d) => !existsSync(`${d}:\\`));
    if (!free) return;
    expect(await checkFolder(`${free}:\\Notes\\prabins-notes`)).toBe("drive");
    expect(driveOf(`${free}:\\Notes`)).toBe(`${free}:`);
  });
});

describe("recovery's helpers", () => {
  it("finds the folder under the Documents Windows has now", () => {
    expect(movedDocuments(abs("Users/you/Documents/prabins-notes"), abs("Users/you/OneDrive/Documents"))).toBe(resolve(abs("Users/you/OneDrive/Documents"), "prabins-notes"));
    expect(movedDocuments(abs("Users/you/Documents/prabins-notes"), abs("Users/you/Documents"))).toBeUndefined();
    expect(movedDocuments(abs("Notes/prabins-notes"), abs("Users/you/Documents"))).toBeUndefined();
  });

  it("records a backup at most once a minute", () => {
    const t = Date.parse("2026-10-24T14:41:00Z");
    expect(backupToRecord(undefined, t)).toBe("2026-10-24T14:41:00Z");
    expect(backupToRecord("2026-10-24T14:41:00Z", t + 30_000)).toBeUndefined();
    expect(backupToRecord("2026-10-24T14:41:00Z", t + 61_000)).toBe("2026-10-24T14:42:01Z");
  });

  it("names a new folder: the next free name, never one Windows refuses", () => {
    const taken = new Set(["Focus Notes", "Focus Notes 2"]);
    expect(nextFree("Focus Notes", (n) => taken.has(n))).toBe("Focus Notes 3");
    expect(nextFree("Notes", () => false)).toBe("Notes");
    for (const ok of ["Focus Notes", "work.notes", "Notes 2"]) expect(folderNameOk(ok)).toBe(true);
    for (const bad of ["", " ", "a/b", "a\\b", "con", "CON.txt", "notes.", "notes ", " notes", "..", "a:b", "a?b"]) expect(folderNameOk(bad)).toBe(false);
  });
  it("records what a folder is: GitHub stays GitHub, a backup time only for the same notes", () => {
    const home = resolve(tmpdir(), "fn-home");
    const folder = join(home, "Documents", "prabins-notes");
    const prev = { version: 1 as const, folder, kind: "github" as const, repository: "you/prabins-notes", account: "you", lastBackup: "2026-10-24T14:41:00Z" };
    expect(recordFor(folder, { repository: "you/prabins-notes", privateRepository: "you/prabins-notes-private" }, prev)).toEqual({ ...prev, privateRepository: "you/prabins-notes-private" });
    expect(recordFor(folder, { repository: "you/work-notes", account: "you" }, prev)).toEqual({ version: 1, folder, kind: "github", repository: "you/work-notes", account: "you" });
    // The same folder, not a clone any more: out of sync, never quietly offline.
    expect(recordFor(folder, {}, prev)).toEqual(prev);
    expect(recordFor(join(home, "Other"), {}, prev)).toEqual({ version: 1, folder: join(home, "Other"), kind: "local" });
    expect(recordFor(folder, { service: "OneDrive" })).toEqual({ version: 1, folder, kind: "synced" });
    expect(recordFor(join(home, "Focus Notes"), { repository: "x/y" }, prev, { kind: "local", repository: "you/prabins-notes" })).toEqual({ version: 1, folder: join(home, "Focus Notes"), kind: "local", repository: "you/prabins-notes" });
  });

  it("knows a folder a service syncs, and says a path as people do", () => {
    const home = resolve(tmpdir(), "fn-home");
    const roots = envSyncRoots({ OneDrive: join(home, "OneDrive"), OneDriveCommercial: "relative\\nope" }, home);
    expect(roots).toEqual([{ service: "OneDrive", path: join(home, "OneDrive") }, { service: "iCloud Drive", path: join(home, "iCloudDrive") }]);
    expect(syncService(join(home, "OneDrive", "Documents", "notes"), roots)).toBe("OneDrive");
    expect(syncService(join(home, "OneDrive"), roots)).toBe("OneDrive");
    expect(syncService(join(home, "OneDrive2", "notes"), roots)).toBeUndefined();
    expect(syncService(join(home, "Documents", "notes"), roots)).toBeUndefined();
    expect(shortPath(join(home, "Documents", "notes"), home)).toBe(join("Documents", "notes"));
    expect(shortPath(resolve(tmpdir(), "elsewhere"), home)).toBe(resolve(tmpdir(), "elsewhere"));
  });
});
