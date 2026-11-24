import { expect, it, vi } from "vitest";
import { createApp, type PlatformBridge, type ProjectPeople } from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };

async function fixture(owner: "org" | "personal" = "personal") {
  const listed: ProjectPeople = { repository: "ada/book", owner, roles: owner === "personal" ? ["write"] : ["read", "triage", "write", "maintain", "admin"], people: [] };
  const people = { load: vi.fn(async () => listed), invite: vi.fn(async () => ({ ...listed, people: [{ id: 1, login: "octocat", role: "write" }] })), cancel: vi.fn(async () => listed), dismiss: vi.fn(async () => listed), manage: vi.fn(async () => {}) };
  const save = vi.fn(async () => {});
  const bridge: PlatformBridge = {
    platform: "windows", readNote: async () => "# A\n", writeNote: async () => {}, chooseNote: async () => undefined,
    newNotePath: async () => "/w/notes/new.md", defaultNotePath: async () => "/w/notes/a.md",
    loadAppState: async () => ({ version: 1, firstRun: "done", lastNotePath: "/w/notes/a.md" }), saveAppState: save,
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    workspace: { info: async () => ({ folder: "/w" }), scan: async () => ({ folder: "/w", roots: [{ id: "private", path: "/w/notes", readOnly: false }], entries: [{ path: "/w/notes/a.md", kind: "note", title: "A" }] }), writeFormat: async () => {}, renameNote: async () => {} },
    access: {
      people, load: async () => ({ available: false, vault: false, grants: [] }),
      apply: async () => { throw new Error("not used"); }, setTemplate: async () => { throw new Error("not used"); },
      reveal: async () => ({}), copy: async () => {},
    },
  };
  const app = createApp(bridge, en);
  await app.start();
  const run = (id: string, args?: Record<string, unknown>) => app.commands.run(id, args);
  const vm = () => app.viewModels.select("vm.sharingPeople", app.store.state) as Record<string, unknown>;
  await run("sharing.peopleLoad");
  return { app, run, vm, people, save };
}

it("invites through the bridge without saving a local draft or claiming success before acceptance", async () => {
  const t = await fixture();
  await t.run("sharing.inviteOpen");
  await t.run("sharing.inviteUser", { value: "octocat" });
  let accept!: (value: ProjectPeople) => void;
  t.people.invite.mockImplementationOnce(() => new Promise(resolve => { accept = resolve; }));
  t.save.mockClear();
  const work = t.run("sharing.inviteSend");
  expect(t.vm()).toMatchObject({ busy: true, user: "octocat", role: "write", status: "", people: [] });
  await t.run("sharing.inviteUser", { value: "changed" });
  await t.run("sharing.inviteSend");
  await t.run("sharing.inviteClose");
  expect(t.vm()).toMatchObject({ open: false, busy: true, user: "octocat" });
  expect(t.people.invite).toHaveBeenCalledTimes(1);
  accept({ repository: "ada/book", owner: "personal", roles: ["write"], people: [{ id: 1, login: "octocat", role: "write" }] });
  await work;
  expect(t.vm()).toMatchObject({ busy: false, status: en["sharing.invite.accepted"], people: [expect.objectContaining({ login: "octocat" })] });
  expect(t.save).not.toHaveBeenCalled();
  expect(performance.getEntriesByName("fn:sharing.invite").length).toBeGreaterThan(0);
});

it.each(["offline", "signedout", "refused", "ratelimited", "notfound", "duplicate", "role", "failed"])("retains person and role after %s and Retry uses them", async code => {
  const t = await fixture("org");
  await t.run("sharing.inviteOpen");
  await t.run("sharing.inviteUser", { value: "octocat" });
  await t.run("sharing.inviteRole", { value: "maintain" });
  t.people.invite.mockRejectedValueOnce(new Error(`Error invoking sharing:invite: invite:${code}`));
  await t.run("sharing.inviteSend");
  expect(t.vm()).toMatchObject({ open: true, busy: false, user: "octocat", role: "maintain", status: "", people: [], problem: en[`sharing.invite.${code}` as keyof typeof en] });
  await t.run("sharing.inviteSend");
  expect(t.people.invite).toHaveBeenNthCalledWith(2, "ada/book", "octocat", "maintain");
});

it("does not expose a stale invitations list after reload loses project access", async () => {
  const t = await fixture();
  t.people.load.mockRejectedValueOnce(new Error("invite:unlinked"));
  await t.run("sharing.peopleLoad");
  expect(t.vm()).toMatchObject({ ready: false, canOpen: false, people: [], detail: en["sharing.invite.unlinked"] });
});

it("G2/D7: shows accepted, expired and revoked rows with their actions, and Retry repeats a failed row action", async () => {
  const t = await fixture();
  const states: ProjectPeople = { repository: "ada/book", owner: "personal", roles: ["write"], people: [
    { id: 1, login: "grace", role: "write", state: "expired" }, { id: 2, login: "linus", role: "write", state: "revoked" },
    { id: 3, login: "octocat", role: "write", state: "accepted" }, { id: 4, login: "ada2", role: "write" },
  ] };
  t.people.load.mockResolvedValueOnce(states);
  await t.run("sharing.peopleLoad");
  expect(t.vm().people).toEqual([
    expect.objectContaining({ login: "grace", badge: en["share.invite.expired"], again: true, pending: false, revoked: false, detail: en["share.invite.expiredDetail"] }),
    expect.objectContaining({ login: "linus", badge: en["share.invite.revoked"], again: true, revoked: true, detail: en["share.invite.revokedDetail"] }),
    expect.objectContaining({ login: "octocat", badge: en["share.invite.accepted"], again: false, pending: false, detail: "Accepted as a collaborator · can open the whole project on GitHub" }),
    expect.objectContaining({ login: "ada2", badge: en["share.invite.pending"], pending: true }),
  ]);
  t.people.invite.mockRejectedValueOnce(new Error("invite:offline"));
  await t.run("sharing.inviteAgain", { login: "grace", role: "read" });
  expect(t.people.invite).toHaveBeenLastCalledWith("ada/book", "grace", "write");
  expect(t.vm()).toMatchObject({ canRetry: true, problem: en["sharing.invite.offline"], ready: true });
  await t.run("sharing.peopleRetry");
  expect(t.people.invite).toHaveBeenCalledTimes(2);
  expect(t.vm()).toMatchObject({ canRetry: false, problem: "", status: en["sharing.invite.accepted"] });
  await t.run("sharing.inviteDismiss", { login: "linus" });
  expect(t.people.dismiss).toHaveBeenCalledWith("ada/book", "linus");
  expect(t.vm()).toMatchObject({ status: en["sharing.invite.dismissed"] });
});