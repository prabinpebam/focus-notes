import { describe, expect, it } from "vitest";
import { recoverOptions, type RecoverAccount, type RecoverStatus } from "../src/recover.ts";

const github: RecoverStatus = { missing: "folder", folder: "C:\\Users\\you\\Documents\\prabins-notes", short: "Documents\\prabins-notes", kind: "github", repository: "you/prabins-notes", account: "you", downloadTo: "Documents\\prabins-notes" };
const local: RecoverStatus = { missing: "folder", folder: "C:\\Users\\you\\Documents\\Focus Notes", short: "Documents\\Focus Notes", kind: "local", downloadTo: "Documents\\Focus Notes" };
const legacy: RecoverStatus = { missing: "folder", folder: "C:\\Users\\you\\Documents\\prabins-notes", short: "Documents\\prabins-notes", downloadTo: "Documents\\prabins-notes" };
const ok: RecoverAccount = { state: "ok", login: "you", repository: "you/prabins-notes", pushedAt: "2026-10-23T14:41:00Z" };

describe("WP-5.14: the recovery view's ways back (IA-VIEW-RECOVER)", () => {
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
