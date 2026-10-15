/**
 * Settings → Sharing in the app (WP-5.3, SHR-05, SHR-07, SHR-08, SHR-09, D-134), against an in-memory
 * shell whose access.json is changed by the same `applyAccessChange` the desktop's main process runs:
 * the invite text, adding people by link and passcode, problems explained before asking, changing
 * what an audience opens, extending, withdrawing, and deleting.
 */
import { describe, expect, it } from "vitest";
import { applyAccessChange, audienceOf, shareGrants, type AccessChange } from "@focus-notes/seal/access";
import { shareLink } from "@focus-notes/seal";
import { generatePasscode } from "@focus-notes/seal/words";
import type { AccessFile } from "@focus-notes/seal";
import { createApp, initials, inviteTemplate, inviteText, MessageCatalog, shareables, type AccessListing, type PlatformBridge } from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const catalog = new MessageCatalog("en", en);
const SITE = "https://ada.github.io/notes/";

describe("the invite (SHR-09)", () => {
  const values = { name: "Asha", title: "Trip plan", link: `${SITE}s/#sabc.def`, passcode: "harbor-maple-river-cloud", site: `${SITE}s/`, expires: "14 November 2026" };
  it("fills the template, with the shared-computer line when there's a link and a passcode (D-125)", () => {
    expect(inviteText(inviteTemplate(catalog, true), values)).toBe([
      `Hi Asha, I've shared "Trip plan" with you.`,
      `Open it here: ${values.link}`,
      `Or go to ${values.site} and use your name "Asha" with the passcode harbor-maple-river-cloud.`,
      "On a shared computer, use your name and the passcode: browsers remember links.",
      "It works until 14 November 2026.",
    ].join("\n"));
  });
  it("leaves out the lines for a way in the audience doesn't have, and the expiry when it never ends", () => {
    const { passcode: _p, site: _s, ...linkOnly } = values;
    expect(inviteText(inviteTemplate(catalog, false), linkOnly)).toBe(`Hi Asha, I've shared "Trip plan" with you.\nOpen it here: ${values.link}\nIt works until 14 November 2026.`);
    const { link: _l, expires: _e, ...codeOnly } = values;
    const text = inviteText(inviteTemplate(catalog, false), codeOnly);
    expect(text).not.toContain("Open it here");
    expect(text).not.toContain("It works until");
    expect(text).toContain("with the passcode harbor-maple-river-cloud");
  });
  it("takes any template's placeholders, and nothing in the values is read as a placeholder", () => {
    expect(inviteText("{name}: {link}\n{passcode}", { name: "{link}", link: "L" })).toBe("{link}: L");
  });
});

describe("the invite's title (review L3)", () => {
  it("names a shared folder by its own name, not the private path above it", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("settings.setSection", { value: "sharing" });
    await t.run("share.manage.add");
    await t.run("share.manage.setName", { value: "Asha" });
    await t.run("share.manage.toggleItem", { id: "n:trips/rome.md" });
    await t.run("share.manage.toggleItem", { id: "f:work/clients/acme" });
    await t.run("share.manage.submit");
    await t.run("share.manage.copy", { what: "invite" });
    expect(t.copied.at(-1)).toContain(`I've shared "acme" with you.`);
    expect(t.copied.at(-1)).not.toContain("work/clients");
  });
});

describe("helpers", () => {
  it("initials: one or two letters", () => {
    expect(initials("Asha")).toBe("AS");
    expect(initials("book club")).toBe("BC");
    expect(initials("Élodie  van Dam")).toBe("ÉD");
  });
  it("shareables: the private root's notes and folders, by path under private/notes", () => {
    const tree = { roots: [
      { id: "public" as const, path: "/w/notes", readOnly: false, children: [{ kind: "note" as const, name: "hello.md", published: true }] },
      { id: "private" as const, path: "/w/private/notes", readOnly: false, children: [
        { kind: "folder" as const, name: "trips", children: [{ kind: "note" as const, name: "rome.md", published: true, title: "Rome" }] },
        { kind: "note" as const, name: "diary.md", published: true },
      ] },
    ] };
    expect(shareables(tree)).toEqual([
      { kind: "folder", path: "trips", label: "trips" },
      { kind: "note", path: "trips/rome.md", label: "Rome" },
      { kind: "note", path: "diary.md", label: "diary" },
    ]);
  });
});

const settle = () => new Promise((r) => setTimeout(r, 0));
function shell() {
  let access: AccessFile = { version: 1, grants: [{ id: "gownergrant1", name: "You", owner: true, salt: "AAAAAAAAAAAAAAAAAAAAAA", passcodeKey: "A".repeat(43), scope: { all: true }, createdAt: "2026-10-01T00:00:00.000Z" }] };
  const copied: string[] = [];
  const listing = (): AccessListing => ({ available: true, site: SITE, vault: true, grants: shareGrants(access).map(audienceOf) });
  const secrets = (id: string) => {
    const g = shareGrants(access).find((x) => x.id === id)!;
    return { ...(g.link ? { link: shareLink(SITE, g.id, g.link.secret) } : {}), ...(g.passcode ? { passcode: g.passcode.value } : {}) };
  };
  const revealed: string[] = [];
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async () => "# A\n",
    writeNote: async () => {},
    chooseNote: async () => undefined,
    newNotePath: async () => "/w/private/notes/Untitled.md",
    defaultNotePath: async () => "/w/private/notes/trips/rome.md",
    loadAppState: async () => ({ version: 1, firstRun: "done", lastNotePath: "/w/private/notes/trips/rome.md" }),
    saveAppState: async () => {},
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    workspace: {
      info: async () => ({ folder: "/w" }),
      scan: async () => ({
        folder: "/w",
        roots: [{ id: "public", path: "/w/notes", readOnly: false }, { id: "private", path: "/w/private/notes", readOnly: false }],
        entries: [{ path: "/w/private/notes/trips", kind: "folder" }, { path: "/w/private/notes/trips/rome.md", kind: "note", title: "Rome" }, { path: "/w/private/notes/diary.md", kind: "note" }],
      }),
      writeFormat: async () => {},
      renameNote: async () => {},
    },
    access: {
      load: async () => listing(),
      apply: async (change: AccessChange) => {
        const r = applyAccessChange(access, JSON.parse(JSON.stringify(change)) as AccessChange, new Date(), { generate: generatePasscode });
        access = r.access;
        return { ...listing(), id: r.id };
      },
      reveal: async (id) => (revealed.push(id), secrets(id)),
      // As the main process does: the window sends the invite without secrets, and the shell fills them in.
      copy: async (id, what, invite) => {
        const s = secrets(id);
        copied.push(what === "invite" ? inviteText(invite!.template, { ...invite!.values, ...s, site: `${SITE}s/` }) : (what === "link" ? s.link : s.passcode)!);
      },
    },
  };
  const app = createApp(bridge, en);
  const vm = (id: string) => app.viewModels.select(id, app.store.state) as Record<string, any>;
  const run = (id: string, args?: Record<string, unknown>) => app.commands.run(id, args);
  return { app, vm, run, copied, revealed, access: () => access };
}

describe("Settings → Sharing (SHR-05, SHR-08)", () => {
  it("is a category on the desktop, empty at first, with the vault not listed as an audience", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("settings.open");
    expect(t.vm("vm.settings").sections.map((s: { id: string }) => s.id)).toEqual(["account", "workspace", "sharing", "appearance"]);
    await t.run("settings.setSection", { value: "sharing" });
    expect(t.vm("vm.shareManage")).toMatchObject({ available: true, empty: true, hasAudiences: false, vault: true, rows: [] });
  });
  it("adds people by link and passcode: this private note picked, 30 days, then the invite", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("settings.open");
    await t.run("settings.setSection", { value: "sharing" });
    await t.run("share.manage.add");
    let e = t.vm("vm.shareEditor");
    expect(e).toMatchObject({ open: true, creating: true, link: true, passcode: true, mode: "generate" });
    // The words are made by the shell when it's shared (review L5): the window holds none.
    expect(e.generated).toBe("Four random words, made when you share.");
    expect(e.items.filter((i: { pressed: boolean }) => i.pressed).map((i: { id: string }) => i.id)).toEqual(["n:trips/rome.md"]);
    expect(t.vm("vm.settings").open).toBe(false);
    // Problems are explained before anything is asked of the shell.
    await t.run("share.manage.submit");
    expect(t.vm("vm.shareEditor")).toMatchObject({ hasProblem: true, nameInvalid: true, problem: "Enter a name for who you're sharing with." });
    await t.run("share.manage.setName", { value: "Asha" });
    await t.run("share.manage.setMode", { value: "own" });
    await t.run("share.manage.setOwn", { value: "aaaaaaaaaaaaaaaaaaaa" });
    expect(t.vm("vm.shareEditor")).toMatchObject({ ownInvalid: true, ownNote: "That passcode is too easy to guess. Use a few unrelated words, or generate one." });
    await t.run("share.manage.setMode", { value: "generate" });
    await t.run("share.manage.toggleItem", { id: "f:trips" });
    await t.run("share.manage.submit");
    e = t.vm("vm.shareEditor");
    expect(e.open).toBe(false);
    const g = shareGrants(t.access())[0]!;
    expect(g).toMatchObject({ name: "Asha", scope: { notes: ["trips/rome.md"], folders: ["trips"] } });
    expect(g.link && g.passcode?.generated).toBeTruthy();
    const inv = t.vm("vm.shareInvite");
    expect(inv.open).toBe(true);
    expect(inv.link).toBe(`${SITE}s/#${g.id}.${g.link!.secret}`);
    expect(t.revealed).toEqual([g.id]);
    // The listing itself carries no secret (review L2).
    expect(JSON.stringify(t.app.store.state.ui.share.listing)).not.toContain(g.link!.secret);
    expect(JSON.stringify(t.app.store.state.ui.share.listing)).not.toContain(g.passcode!.value);
    expect(inv.lines.map((l: { text: string }) => l.text)).toContain("On a shared computer, use your name and the passcode: browsers remember links.");
    await t.run("share.manage.copy", { what: "invite" });
    expect(t.copied.at(-1)).toContain(`Hi Asha, I've shared "Rome and 1 more" with you.`);
    expect(t.vm("vm.shareInvite")).toMatchObject({ copyInvite: "Copied", copied: "Invite copied" });
    await t.run("share.manage.copy", { what: "passcode" });
    expect(t.copied.at(-1)).toBe(g.passcode!.value);
    await t.run("share.manage.setInviteOpen", { open: false });
    expect(t.vm("vm.settings")).toMatchObject({ open: true, section: "sharing" });
    // Closing the invite forgets its secrets.
    expect(JSON.stringify(t.app.store.state.ui.share)).not.toContain(g.passcode!.value);
    const row = t.vm("vm.shareManage").rows[0];
    expect(row).toMatchObject({ name: "Asha", initials: "AS", badge: "Expires in 30 days", detail: "trips/ and 1 more · Link and passcode", active: true });
  });
  it("refuses a name already in use, whatever its case", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("settings.setSection", { value: "sharing" });
    for (const name of ["Book club", "BOOK  club"]) {
      await t.run("share.manage.add");
      await t.run("share.manage.setName", { value: name });
      await t.run("share.manage.toggleItem", { id: "n:diary.md" });
      await t.run("share.manage.submit");
    }
    expect(t.vm("vm.shareEditor")).toMatchObject({ open: true, problem: `There's already someone called BOOK  club with access. Use another name, or change theirs.` });
    expect(shareGrants(t.access())).toHaveLength(1);
  });
  it("changes what an audience opens, extends, withdraws (keeping the record), and deletes", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("settings.setSection", { value: "sharing" });
    await t.run("share.manage.add");
    await t.run("share.manage.setName", { value: "Asha" });
    await t.run("share.manage.togglePasscode");
    await t.run("share.manage.submit");
    await t.run("share.manage.setInviteOpen", { open: false });
    const id = shareGrants(t.access())[0]!.id;
    const secret = shareGrants(t.access())[0]!.link!.secret;
    expect(shareGrants(t.access())[0]!.passcode).toBeUndefined();
    await t.run("share.manage.row", { id, action: "edit" });
    expect(t.vm("vm.shareEditor")).toMatchObject({ open: true, creating: false, title: "Change access for Asha", expiry: "" });
    await t.run("share.manage.toggleItem", { id: "n:trips/rome.md" });
    await t.run("share.manage.toggleItem", { id: "n:diary.md" });
    await t.run("share.manage.submit");
    expect(shareGrants(t.access())[0]).toMatchObject({ scope: { notes: ["diary.md"], folders: [] }, link: { secret } });
    await t.run("share.manage.row", { id, action: "withdraw" });
    expect(t.vm("vm.shareConfirm")).toMatchObject({ open: true, title: "Withdraw access for Asha?", confirmLabel: "Withdraw" });
    await t.run("share.manage.confirm");
    expect(shareGrants(t.access())[0]!.revokedAt).toBeTruthy();
    expect(t.vm("vm.shareManage").rows[0]).toMatchObject({ badge: "Withdrawn", active: false });
    expect(t.vm("vm.shareManage").rows[0].menu[0].items.map((i: { id: string }) => i.id)).toEqual(["delete"]);
    await t.run("share.manage.row", { id, action: "delete" });
    await t.run("share.manage.confirm");
    expect(shareGrants(t.access())).toHaveLength(0);
    expect(t.vm("vm.shareManage").empty).toBe(true);
  });
});
