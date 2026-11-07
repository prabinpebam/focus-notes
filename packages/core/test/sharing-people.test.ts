import { expect, it, vi } from "vitest";
import { createApp, type PlatformBridge, type ProjectPeople } from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };

async function fixture(owner: "org" | "personal" = "personal") {
  const listed: ProjectPeople = { repository: "ada/book", owner, roles: owner === "personal" ? ["write"] : ["read", "triage", "write", "maintain", "admin"], people: [] };
  const people = { load: vi.fn(async () => listed), invite: vi.fn(async () => ({ ...listed, people: [{ id: 1, login: "octocat", role: "write" }] })), cancel: vi.fn(async () => listed), manage: vi.fn(async () => {}) };
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
