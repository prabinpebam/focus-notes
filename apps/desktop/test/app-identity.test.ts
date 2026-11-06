import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appIdentity, carryPreviewProfile } from "../src/main/app-identity.ts";

const release = {
  store: false, packaged: true, executable: "C:\\Program Files\\Focus Notes\\focus-notes.exe",
  defaultUserData: join(tmpdir(), "Focus Notes"),
};
const preview = { ...release, executable: "E:\\Projects\\side-projects\\focus-notes-work\\preview\\builds\\abcdef0\\focus-notes.exe" };
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("channel identity before Electron's profile-scoped single-instance lock", () => {
  it("isolates the unmodified Preview shortcut's app identity and lock profile from Store", () => {
    const store = appIdentity({ ...preview, store: true, channel: "preview" });
    const candidate = appIdentity(preview);
    expect(store).toMatchObject({
      channel: "stable", name: "Focus Notes", appId: "io.github.prabinpebam.focusnotes", userData: release.defaultUserData,
    });
    expect(candidate).toMatchObject({
      channel: "preview", name: "Focus Notes Preview", appId: "io.github.prabinpebam.focusnotes.preview",
      userData: `${release.defaultUserData} Preview`, legacyUserData: release.defaultUserData,
    });
    expect(candidate.userData).not.toBe(store.userData);
    expect(candidate.appId).not.toBe(store.appId);
  });

  it("gives dev its own profile, retains ordinary releases, and preserves explicit project/test profiles", () => {
    expect(appIdentity({ ...release, packaged: false })).toMatchObject({
      channel: "development", userData: `${release.defaultUserData} Development`, appId: "io.github.prabinpebam.focusnotes.development",
    });
    expect(appIdentity(release)).toMatchObject({ channel: "stable", userData: release.defaultUserData });
    expect(appIdentity({ ...preview, userData: release.defaultUserData })).toMatchObject({
      userData: release.defaultUserData, legacyUserData: undefined,
    });
    expect(() => appIdentity({ ...release, channel: "typo" })).toThrow("Invalid Focus Notes channel");
  });

  it("recognizes fallback and candidate Preview paths but not an unrelated folder called preview", () => {
    for (const path of ["app", "candidates\\abcdef0", "candidates\\abcdef0\\win-unpacked"]) {
      expect(appIdentity({ ...release, executable: `E:\\focus-notes-work\\preview\\${path}\\focus-notes.exe` }).channel).toBe("preview");
    }
    expect(appIdentity({ ...release, executable: "C:\\preview\\focus-notes.exe" }).channel).toBe("stable");
  });
});

describe("legacy Preview carry-over", () => {
  it("copies durable settings, recovery and project profiles, remapping the last project without touching the source", async () => {
    const root = mkdtempSync(join(tmpdir(), "fn-channel-"));
    roots.push(root);
    const source = join(root, "legacy");
    const destination = join(root, "preview");
    const profile = join(source, "project-profiles", "project-1");
    mkdirSync(join(source, "recovery"), { recursive: true });
    mkdirSync(join(source, "Chromium"), { recursive: true });
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(source, "state.json"), '{"theme":"dark"}');
    writeFileSync(join(source, "keybindings.json"), '{"keys":[]}');
    writeFileSync(join(source, "last-project.json"), JSON.stringify({ profile }));
    writeFileSync(join(source, "recovery", "note.draft"), "unsaved draft");
    writeFileSync(join(profile, "project-folder.txt"), "D:\\Notes");
    writeFileSync(join(profile, "state.json"), '{"localNotes":true}');
    for (const path of ["lockfile", "project-metadata.sqlite", "Chromium\\cache", "project-profiles\\project-1\\lockfile"]) {
      writeFileSync(join(source, ...path.split("\\")), "do not copy");
    }
    await carryPreviewProfile(source, destination);
    expect(readFileSync(join(destination, "state.json"), "utf8")).toBe('{"theme":"dark"}');
    expect(readFileSync(join(destination, "keybindings.json"), "utf8")).toBe('{"keys":[]}');
    expect(readFileSync(join(destination, "recovery", "note.draft"), "utf8")).toBe("unsaved draft");
    expect(readFileSync(join(destination, "project-profiles", "project-1", "project-folder.txt"), "utf8")).toBe("D:\\Notes");
    expect(JSON.parse(readFileSync(join(destination, "last-project.json"), "utf8"))).toEqual({ profile: join(destination, "project-profiles", "project-1") });
    expect(JSON.parse(readFileSync(join(source, "last-project.json"), "utf8"))).toEqual({ profile });
    expect(existsSync(join(destination, "lockfile"))).toBe(false);
    expect(existsSync(join(destination, "project-metadata.sqlite"))).toBe(false);
    expect(existsSync(join(destination, "Chromium"))).toBe(false);
    expect(existsSync(join(destination, "project-profiles", "project-1", "lockfile"))).toBe(false);
    writeFileSync(join(source, "state.json"), '{"theme":"light"}');
    await carryPreviewProfile(source, destination);
    expect(readFileSync(join(destination, "state.json"), "utf8")).toBe('{"theme":"dark"}');
  });

  it("leaves a malformed legacy profile and any existing destination untouched", async () => {
    const root = mkdtempSync(join(tmpdir(), "fn-channel-"));
    roots.push(root);
    const source = join(root, "legacy");
    const destination = join(root, "preview");
    mkdirSync(source);
    writeFileSync(join(source, "last-project.json"), "broken");
    await expect(carryPreviewProfile(source, destination)).rejects.toThrow();
    expect(existsSync(destination)).toBe(false);
    expect(readFileSync(join(source, "last-project.json"), "utf8")).toBe("broken");
    mkdirSync(destination);
    writeFileSync(join(destination, "state.json"), "kept");
    await carryPreviewProfile(source, destination);
    expect(readFileSync(join(destination, "state.json"), "utf8")).toBe("kept");
  });

  it("remaps a root-profile pointer and leaves a new installation empty", async () => {
    const root = mkdtempSync(join(tmpdir(), "fn-channel-"));
    roots.push(root);
    const source = join(root, "legacy");
    const destination = join(root, "preview");
    await carryPreviewProfile(source, destination);
    expect(existsSync(destination)).toBe(false);
    mkdirSync(source);
    writeFileSync(join(source, "last-project.json"), JSON.stringify({ profile: source }));
    await carryPreviewProfile(source, destination);
    expect(JSON.parse(readFileSync(join(destination, "last-project.json"), "utf8"))).toEqual({ profile: destination });
    expect(JSON.parse(readFileSync(join(source, "last-project.json"), "utf8"))).toEqual({ profile: source });
  });
});
