import { describe, expect, it, vi } from "vitest";
import { recoverOptions, type RecoverAccount, type RecoverStatus } from "../src/recover.ts";
import { createApp, type PlatformBridge } from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const github: RecoverStatus = { missing: "folder", folder: "C:\\Users\\you\\Documents\\prabins-notes", short: "Documents\\prabins-notes", kind: "github", repository: "you/prabins-notes", account: "you", downloadTo: "Documents\\prabins-notes" };
const local: RecoverStatus = { missing: "folder", folder: "C:\\Users\\you\\Documents\\Focus Notes", short: "Documents\\Focus Notes", kind: "local", downloadTo: "Documents\\Focus Notes" };
const legacy: RecoverStatus = { missing: "folder", folder: "C:\\Users\\you\\Documents\\prabins-notes", short: "Documents\\prabins-notes", downloadTo: "Documents\\prabins-notes" };
const ok: RecoverAccount = { state: "ok", login: "you", repository: "you/prabins-notes", pushedAt: "2026-10-23T14:41:00Z" };

describe("WP-5.14: the recovery view's ways back (IA-VIEW-RECOVER)", () => {
  it.each(["missing", "failed"])("checks recovery before source access when folder verification is %s", async (state) => {
    const error = new Error("Folder verification failed");
    const readNote = vi.fn(async () => "# Must not open");
    const writeNote = vi.fn(async () => {});
    const saveAppState = vi.fn(async () => {});
    const info = vi.fn(async () => ({ folder: "/notes", format: '{"formatVersion":1}' }));
    const settings = vi.fn(async () => ({ available: false }));
    const themes = vi.fn(async () => []);
    const bridge: PlatformBridge = {
      platform: "windows", readNote, writeNote,
      chooseNote: async () => undefined, newNotePath: async () => "/notes/Untitled.md",
      defaultNotePath: async () => "/notes/Original.md",
      loadAppState: async () => ({ version: 1, firstRun: "done", lightTheme: "custom-local" }), saveAppState,
      systemScheme: () => "light", onSystemSchemeChange: () => () => {},
      workspace: {
        info, scan: async () => ({ folder: "/notes", roots: [], entries: [] }),
        writeFormat: async () => {}, renameNote: async () => {},
        onChange: () => () => {},
      },
      settings: { load: settings, save: async () => {}, remove: async () => {} },
      themes: { list: themes },
      recover: {
        status: async () => { if (state === "failed") throw error; return local; },
        account: async () => ({ state: "signedOut" }),
        download: async () => ({ ok: false, problem: "failed" }),
        useFound: async () => ({ ok: false, problem: "failed" }),
        find: async () => undefined, useChosen: async () => ({ ok: false, problem: "failed" }),
        emptyPlace: async () => ({ place: "/notes", short: "/notes", name: "New notes" }),
        choosePlace: async () => undefined, createEmpty: async () => ({ ok: false, problem: "failed" }),
        onFound: () => () => {}, onProgress: () => () => {},
      },
    };
    const app = createApp(bridge, en);
    if (state === "failed") await expect(app.start()).rejects.toBe(error);
    else {
      await app.start();
      expect(app.store.state.recover.open).toBe(true);
    }
    expect(info).not.toHaveBeenCalled();
    expect(settings).not.toHaveBeenCalled();
    expect(themes).not.toHaveBeenCalled();
    expect(readNote).not.toHaveBeenCalled();
    expect(writeNote).not.toHaveBeenCalled();
    expect(saveAppState).not.toHaveBeenCalled();
  });
  it("offers Download first for notes on GitHub, with Choose other notes… under it", () => {
    expect(recoverOptions(github, ok)).toEqual({ found: false, download: "ready", choose: false, signIn: false, link: "other", primary: "download", repository: "you/prabins-notes" });
  });
  it("keeps Download primary while the account is checked, its line a skeleton", () => {
    const o = recoverOptions(github, undefined);
    expect(o).toMatchObject({ download: "checking", primary: "download", signIn: false, link: "" });
  });
  it("says why Download can't work offline, and nothing else takes its place", () => {
    const o = recoverOptions(github, { state: "offline" });
    expect(o).toMatchObject({ download: "offline", signIn: false, choose: false, primary: "find" });
  });
  it("makes Sign in to GitHub again primary when the sign-in is gone or can't reach the notes", () => {
    for (const state of ["signedOut", "noAccess"] as const) {
      const o = recoverOptions(github, { state, login: "you" });
      expect(o).toMatchObject({ download: state, signIn: true, primary: "signIn" });
    }
  });
  it("puts Use this folder first when the same notes were found elsewhere", () => {
    const o = recoverOptions({ ...github, found: { folder: "C:\\Users\\you\\OneDrive\\Documents\\prabins-notes", short: "OneDrive\\Documents\\prabins-notes" } }, ok);
    expect(o).toMatchObject({ found: true, download: "ready", primary: "found" });
  });
  it("offers no Download or Sign in for offline mode; signed in, a quiet link to download notes", () => {
    expect(recoverOptions(local, ok)).toEqual({ found: false, download: "hidden", choose: false, signIn: false, link: "fromGitHub", primary: "find" });
    expect(recoverOptions(local, { state: "signedOut" })).toMatchObject({ download: "hidden", signIn: false, link: "", primary: "find" });
    expect(recoverOptions({ ...local, kind: "synced", service: "OneDrive" }, ok)).toMatchObject({ download: "hidden", signIn: false });
  });
  it("keeps the notes' name after Start with an empty folder, without offering them as if they were on GitHub", () => {
    expect(recoverOptions({ ...local, repository: "you/prabins-notes" }, ok)).toMatchObject({ download: "hidden", link: "fromGitHub" });
  });
  it("for a record from before D-212: the notes named like the folder, or Choose your notes", () => {
    expect(recoverOptions(legacy, ok)).toMatchObject({ download: "ready", choose: false, primary: "download", repository: "you/prabins-notes" });
    expect(recoverOptions(legacy, { state: "ok", login: "you" })).toMatchObject({ download: "hidden", choose: true, primary: "choose" });
    expect(recoverOptions(legacy, { state: "signedOut" })).toMatchObject({ download: "hidden", choose: false, signIn: true, primary: "signIn" });
    expect(recoverOptions(legacy, undefined)).toMatchObject({ download: "hidden", choose: false, signIn: false, primary: "find" });
  });
});
