/**
 * Settings → Sharing in the app (WP-5.3, SHR-05, SHR-07, SHR-08, SHR-09, D-134), against an in-memory
 * shell whose access.json is changed by the same `applyAccessChange` the desktop's main process runs:
 * the invite text, adding people by link and passcode, problems explained before asking, changing
 * what an audience opens, extending, withdrawing, and deleting.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAccessChange, audienceOf, itemInviteText, shareGrants, type AccessChange } from "@focus-notes/seal/access";
import { displayShareCode, shareLink } from "@focus-notes/seal";
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
afterEach(() => vi.useRealTimers());

it("opens Files from a sharing empty state without toggling an already-open panel shut", async () => {
  const t = shell();
  await t.app.start();
  await settle();
  for (const alreadyOpen of [false, true]) {
    t.app.store.update(s => ({ ...s, ui: { ...s.ui, settings: { ...s.ui.settings, open: true }, files: { ...s.ui.files, open: alreadyOpen } } }));
    await t.run("sharing.previewFiles");
    expect(t.app.store.state.ui.files.open).toBe(true);
    expect(t.app.store.state.ui.settings.open).toBe(false);
  }
});

describe("known-empty sharing settings", () => {
  it("never treats an unknown or failed list as empty and retains failure through read-only Retry", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    expect(t.vm("vm.sharingSettings")).toMatchObject({ empty: false });
    t.bridge.access!.load = async () => { throw new Error("private-path-and-token"); };
    await t.run("share.manage.load");
    expect(t.vm("vm.sharingSettings")).toMatchObject({ empty: false, failed: true, retrying: false });
    let done!: (value: AccessListing) => void;
    t.bridge.access!.load = () => new Promise(resolve => { done = resolve; });
    const retry = t.run("share.manage.load");
    expect(t.vm("vm.sharingSettings")).toMatchObject({ empty: false, failed: true, retrying: true });
    await t.run("sharing.query", { value: "kept" });
    done({ available: true, vault: true, site: SITE, grants: [] });
    await retry;
    expect(t.vm("vm.sharingSettings")).toMatchObject({ empty: true, failed: false, query: "kept", emptyTitle: "No matches" });
    expect(shareGrants(t.access())).toHaveLength(0);
    expect(t.app.store.state.note.markdown).toBe("# A\n");
  });
  it("distinguishes known first use and filtered emptiness and clears only the filter before returning real rows", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("share.manage.load");
    expect(t.vm("vm.sharingSettings")).toMatchObject({ empty: true, emptyTitle: "Nothing shared yet", emptyAction: "Open Files" });
    const listing = await t.bridge.access!.load();
    t.bridge.access!.load = async () => ({ ...listing, grants: [{
      id: "gdiary001", name: "Diary", createdAt: "2026-10-01T00:00:00.000Z",
      scope: { all: false, notes: ["diary.md"], folders: [] }, link: true, passcode: false, generated: false,
      item: { path: "diary.md", label: "Diary", folder: false, includeLater: false },
    }] });
    await t.run("share.manage.load");
    expect(t.vm("vm.sharingSettings").rows).toHaveLength(1);
    await t.run("sharing.query", { value: "missing" });
    await t.run("sharing.filter", { value: "withdrawn" });
    expect(t.vm("vm.sharingSettings")).toMatchObject({ empty: true, emptyTitle: "No matches", emptyAction: "Clear filters" });
    const load = vi.spyOn(t.bridge.access!, "load");
    const apply = vi.spyOn(t.bridge.access!, "apply");
    await t.run("sharing.emptyAction");
    expect(t.vm("vm.sharingSettings")).toMatchObject({ empty: false, query: "", filter: "all" });
    expect(t.vm("vm.sharingSettings").rows).toHaveLength(1);
    expect(load).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(t.app.store.state.ui.files.open).toBe(false);
    load.mockRestore();
    apply.mockRestore();
  });
  it("uses the named delayed section only for a first read and holds failure for the full minimum", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    vi.useFakeTimers();
    const measure = vi.spyOn(performance, "measure");
    let reject!: (error: Error) => void;
    t.bridge.access!.load = () => new Promise((_resolve, fail) => { reject = fail; });
    const loading = t.run("share.manage.load");
    await vi.advanceTimersByTimeAsync(299);
    expect(t.vm("vm.sharingSettings")).toMatchObject({ waiting: false, empty: false });
    await vi.advanceTimersByTimeAsync(1);
    expect(t.vm("vm.sharingSettings")).toMatchObject({ waiting: true });
    reject(new Error("refused"));
    await vi.advanceTimersByTimeAsync(499);
    expect(t.vm("vm.sharingSettings")).toMatchObject({ waiting: true, failed: false });
    await vi.advanceTimersByTimeAsync(1);
    await loading;
    expect(t.vm("vm.sharingSettings")).toMatchObject({ waiting: false, failed: true, empty: false });
    expect(measure).toHaveBeenCalledWith("fn:sharing.list", { start: expect.any(Number), end: expect.any(Number) });
    measure.mockRestore();
  });
  it("keeps acknowledged rows through refused refresh and never replaces a newer successful change with an old read", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    const listing = await t.bridge.access!.load();
    const saved: AccessListing = { ...listing, grants: [{
      id: "gdiary001", name: "Diary", createdAt: "2026-10-01T00:00:00.000Z",
      scope: { all: false, notes: ["diary.md"], folders: [] }, link: true, passcode: false, generated: false,
      item: { path: "diary.md", label: "Diary", folder: false, includeLater: false },
    }] };
    t.bridge.access!.load = async () => saved;
    await t.run("share.manage.load");
    t.bridge.access!.load = async () => { throw new Error("refused"); };
    await t.run("share.manage.load");
    expect(t.vm("vm.sharingSettings")).toMatchObject({ failed: true, empty: false, rows: [expect.objectContaining({ item: "Diary" })] });
    let done!: (value: AccessListing) => void;
    const load = vi.fn(() => new Promise<AccessListing>(resolve => { done = resolve; }));
    t.bridge.access!.load = load;
    const retry = t.run("share.manage.load");
    await t.run("share.manage.load");
    expect(load).toHaveBeenCalledTimes(1);
    expect(t.vm("vm.sharingSettings")).toMatchObject({ failed: true, retrying: true, waiting: false, rows: [expect.objectContaining({ item: "Diary" })] });
    t.app.store.update(s => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, listing: { ...saved, grants: [] } } } }));
    done(saved);
    await retry;
    expect(t.vm("vm.sharingSettings")).toMatchObject({ failed: false, empty: true, rows: [] });
  });
});

describe("item-first sharing (SHR-13 to SHR-16, SHR-24)", () => {
  it("holds the share section's shape on a failed load and Retry preserves the editable draft", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    const listing = await t.bridge.access!.load();
    let reject!: (error: Error) => void;
    t.bridge.access!.load = () => new Promise((_resolve, fail) => { reject = fail; });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    const opening = t.run("share.item.open", { path: "/w/private/notes/diary.md" });
    expect(t.vm("vm.shareItem")).toMatchObject({ preparingVisible: false, actionsDisabled: true });
    await vi.advanceTimersByTimeAsync(299);
    expect(t.vm("vm.shareItem")).toMatchObject({ preparingVisible: false });
    await vi.advanceTimersByTimeAsync(1);
    expect(t.vm("vm.shareItem")).toMatchObject({ preparingVisible: true });
    await t.run("share.item.setExpiry", { value: "7d" });
    reject(new Error("load rejected"));
    await vi.advanceTimersByTimeAsync(499);
    expect(t.vm("vm.shareItem")).toMatchObject({ preparingVisible: true });
    await vi.advanceTimersByTimeAsync(1);
    await opening;
    expect(t.vm("vm.shareItem")).toMatchObject({ loadFailed: true, preparingVisible: false, expiry: "7d" });
    await t.run("share.item.action", { what: "information" });
    expect(shareGrants(t.access())).toHaveLength(0);
    let accept!: (value: typeof listing) => void;
    t.bridge.access!.load = () => new Promise(resolve => { accept = resolve; });
    const retry = t.run("share.item.reload");
    expect(t.vm("vm.shareItem")).toMatchObject({ loadFailed: true, retrying: true, expiry: "7d" });
    await t.run("share.item.setExpiry", { value: "90d" });
    await vi.advanceTimersByTimeAsync(300);
    expect(t.vm("vm.shareItem")).toMatchObject({ loadFailed: true, retrying: true, preparingVisible: false });
    accept(listing);
    await vi.advanceTimersByTimeAsync(500);
    await retry;
    expect(t.vm("vm.shareItem")).toMatchObject({ loadFailed: false, retrying: false, expiry: "90d", open: true });
    expect(shareGrants(t.access())).toHaveLength(0);
  });
  it("keeps acknowledged sharing history through a failed refresh and ignores a closed item's late read", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("share.item.open", { path: "/w/private/notes/diary.md" });
    const listing = await t.bridge.access!.load();
    const saved: typeof listing = { ...listing, grants: [{
      id: "ghistory001", name: "Diary", scope: { all: false, notes: ["diary.md"], folders: [] },
      createdAt: "2026-10-01T00:00:00.000Z", link: true, passcode: false, generated: false,
      item: { path: "diary.md", label: "Diary", folder: false, includeLater: false },
    }] };
    t.bridge.access!.load = async () => saved;
    await t.run("share.item.reload");
    expect(t.vm("vm.shareItem")).toMatchObject({ hasHistory: true, historyCount: 1 });
    t.bridge.access!.load = async () => { throw new Error("private-path-and-token"); };
    await t.run("share.item.reload");
    expect(t.vm("vm.shareItem")).toMatchObject({ hasHistory: true, historyCount: 1, loadFailed: true, preparingVisible: false });
    let finish!: (value: typeof listing) => void;
    t.bridge.access!.load = () => new Promise(resolve => { finish = resolve; });
    const old = t.run("share.item.reload");
    await t.run("share.item.setOpen", { open: false });
    t.bridge.access!.load = async () => listing;
    await t.run("share.item.open", { path: "/w/private/notes/trips/rome.md" });
    finish(saved);
    await old;
    expect(t.vm("vm.shareItem")).toMatchObject({ name: "Rome", hasHistory: false, loadFailed: false });
  });
  it("waits for word preparation before any action or draft mutation", async () => {
    const t = shell();
    let finish!: (words: { id: string; value: string }) => void;
    t.bridge.access!.prepareWords = async () => new Promise((resolve) => { finish = resolve; });
    await t.app.start();
    await settle();
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    const preparation = t.run("share.item.togglePasscode");
    await settle();
    await t.run("share.item.action", { what: "information" });
    await t.run("share.item.togglePasscode");
    await t.run("share.item.setMode", { value: "own" });
    expect(shareGrants(t.access())).toHaveLength(0);
    expect(t.vm("vm.shareItem")).toMatchObject({ passcode: true, wordsBusy: true, mode: "generate" });
    finish({ id: "wprepared001", value: "harbor-maple-river-cloud" });
    await preparation;
    expect(t.vm("vm.shareItem")).toMatchObject({ wordsBusy: false, generated: "harbor-maple-river-cloud" });
  });
  it("refreshes readiness after a stale repeat handoff without creating another grant", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    await t.run("share.item.action", { what: "link" });
    const copy = t.bridge.access!.copy;
    t.bridge.access!.copy = async () => { throw new Error("access:notReady"); };
    await t.run("share.item.action", { what: "link" });
    expect(t.vm("vm.shareItem")).toMatchObject({ ready: false, information: "", hasProblem: true });
    let refreshed = 0;
    t.bridge.access!.ready = async () => { refreshed++; };
    t.bridge.access!.copy = copy;
    await t.run("share.item.action", { what: "link" });
    expect(refreshed).toBe(1);
    expect(shareGrants(t.access())).toHaveLength(1);
    expect(t.copied).toHaveLength(2);
  });
  it("lists only this item's history, copies without creating a grant, and confirms withdrawal without changing notes", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    await t.run("share.item.action", { what: "link" });
    const id = shareGrants(t.access())[0]!.id;
    await t.run("share.item.setOpen", { open: false });
    await t.run("share.item.open", { path: "/w/private/notes/diary.md" });
    expect(t.vm("vm.shareItem").history).toHaveLength(0);
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    expect(t.vm("vm.shareItem")).toMatchObject({ hasHistory: true, historyOpen: true });
    expect(t.vm("vm.shareItem").history).toEqual([expect.objectContaining({ id, active: true, link: true })]);
    await t.run("share.item.row", { id, what: "link" });
    expect(shareGrants(t.access())).toHaveLength(1);
    await t.run("share.item.row", { id, what: "withdraw" });
    expect(t.vm("vm.shareItem").confirmOpen).toBe(true);
    expect(catalog.format("share.withdraw.text")).toContain("This cannot be undone.");
    expect(catalog.format("share.withdraw.text")).toContain("Sharing again creates a new link.");
    expect(shareGrants(t.access())[0]!.revokedAt).toBeUndefined();
    await t.run("share.item.setConfirmOpen", { open: false });
    expect(shareGrants(t.access())[0]!.revokedAt).toBeUndefined();
    await t.run("share.item.row", { id, what: "withdraw" });
    await t.run("share.item.withdraw");
    expect(shareGrants(t.access())[0]!.revokedAt).toBeTruthy();
    expect(t.vm("vm.shareItem")).toMatchObject({ open: true, confirmOpen: false, hasHistory: true });
    expect(t.vm("vm.shareItem").history[0].active).toBe(false);
    expect(t.app.store.state.note.path).toBe("/w/private/notes/trips/rome.md");
  });
  it("refuses draft commands during creation and after saving, including regenerated words", async () => {
    const t = shell();
    let finish!: () => void;
    t.bridge.access!.ready = async () => new Promise<void>((resolve) => { finish = resolve; });
    await t.app.start();
    await settle();
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    await t.run("share.item.togglePasscode");
    const draft = t.app.store.state.ui.share.item;
    const action = t.run("share.item.action", { what: "information" });
    await settle();
    const mutate = async () => {
      await t.run("share.item.toggleLink");
      await t.run("share.item.togglePasscode");
      await t.run("share.item.toggleLater");
      await t.run("share.item.setExpiry", { value: "never" });
      await t.run("share.item.setUntil", { value: "2027-01-01" });
      await t.run("share.item.setMode", { value: "own" });
      await t.run("share.item.setOwn", { value: "other-words-for-testing" });
      await t.run("share.item.newWords");
    };
    await mutate();
    const unchanged = () => expect(t.app.store.state.ui.share.item).toMatchObject({
      link: draft.link, passcode: draft.passcode, later: draft.later,
      expiry: draft.expiry, until: draft.until, mode: draft.mode,
      own: draft.own, wordsId: draft.wordsId, generated: draft.generated,
    });
    unchanged();
    finish();
    await action;
    const saved = t.app.store.state.ui.share.item.generated;
    await mutate();
    expect(t.app.store.state.ui.share.item).toMatchObject({
      link: draft.link, passcode: draft.passcode, later: draft.later,
      expiry: draft.expiry, until: draft.until, mode: draft.mode,
      own: draft.own, wordsId: draft.wordsId, generated: saved,
    });
  });
  it("cannot copy a method which is switched off", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    await t.run("share.item.action", { what: "accessCode" });
    expect(t.copied).toHaveLength(0);
    expect(shareGrants(t.access())).toHaveLength(0);
    expect(t.vm("vm.shareItem").hasProblem).toBe(true);
  });
  it("does not reveal or hand off a cancelled publication into a new draft", async () => {
    const t = shell();
    let finish!: () => void;
    t.bridge.access!.ready = async () => new Promise<void>((resolve) => { finish = resolve; });
    await t.app.start();
    await settle();
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    const action = t.run("share.item.action", { what: "information" });
    await settle();
    await t.run("share.item.setOpen", { open: false });
    await t.run("share.item.open", { path: "/w/private/notes/trips/rome.md" });
    finish();
    await action;
    expect(t.copied).toHaveLength(0);
    expect(t.revealed).toHaveLength(0);
    expect(t.vm("vm.shareItem")).toMatchObject({ name: "Rome", id: "", ready: false, busy: false });
  });
  it("creates on the first action, copies only after readiness, and reuses the share within the dialog", async () => {
    const t = shell();
    let finish!: () => void;
    t.bridge.access!.ready = async () => new Promise<void>((r) => { finish = r; });
    await t.app.start();
    await settle();
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    const action = t.run("share.item.action", { what: "primary" });
    await settle();
    expect(shareGrants(t.access())).toHaveLength(1);
    expect(t.copied).toHaveLength(0);
    expect(t.vm("vm.shareItem")).toMatchObject({ busy: true, ready: false });
    finish();
    await action;
    expect(t.copied.at(-1)).toContain("Open: https://ada.github.io/notes/s/#");
    expect(t.vm("vm.shareItem")).toMatchObject({ busy: false, ready: true });
    t.bridge.access!.ready = async () => {};
    await t.run("share.item.action", { what: "link" });
    expect(shareGrants(t.access())).toHaveLength(1);
    await t.run("share.item.setOpen", { open: false });
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    await t.run("share.item.action", { what: "primary" });
    expect(shareGrants(t.access())).toHaveLength(2);
  });

  it("preserves the draft and saved grant after offline failure; retry never creates twice", async () => {
    const t = shell();
    t.bridge.access!.ready = async () => { throw new Error("access:offline"); };
    await t.app.start();
    await settle();
    await t.run("share.item.open", { path: "/w/private/notes/trips/rome.md" });
    await t.run("share.item.togglePasscode");
    await t.run("share.item.setMode", { value: "own" });
    await t.run("share.item.setOwn", { value: "harbor-maple-river-cloud" });
    await t.run("share.item.action", { what: "accessCode" });
    expect(t.copied).toHaveLength(0);
    expect(t.vm("vm.shareItem")).toMatchObject({ open: true, own: "harbor-maple-river-cloud", ready: false, hasProblem: true });
    const id = shareGrants(t.access())[0]!.id;
    t.bridge.access!.ready = async () => {};
    await t.run("share.item.action", { what: "accessCode" });
    expect(shareGrants(t.access()).map((g) => g.id)).toEqual([id]);
    expect(t.copied.at(-1)).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4} harbor-maple-river-cloud$/);
  });
  it("opens a fixed folder directly, counts its contents and creates nothing on opening or cancelling", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    expect(t.vm("vm.shareItem")).toMatchObject({
      open: true, name: "trips", folder: true, notes: 1, folders: 0,
      link: true, passcode: false, later: false, expiry: "30d",
    });
    expect(t.access().grants).toHaveLength(1);
    await t.run("share.item.setOpen", { open: false });
    expect(t.vm("vm.shareItem").open).toBe(false);
    expect(t.access().grants).toHaveLength(1);
  });

  it("preserves the exact draft through reviewing and expanding a read-only contents tree", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    await t.run("share.item.toggleLink");
    await t.run("share.item.togglePasscode");
    await t.run("share.item.setOwn", { value: "harbor maple river cloud" });
    await t.run("share.item.setExpiry", { value: "90d" });
    const before = t.app.store.state.ui.share.item;
    await t.run("share.item.review");
    expect(t.vm("vm.shareItem").reviewOpen).toBe(true);
    expect(t.vm("vm.shareItem").items).toEqual([
      expect.objectContaining({ label: "Rome", level: 1, readOnly: true }),
    ]);
    await t.run("share.item.setReviewOpen", { open: false });
    expect(t.app.store.state.ui.share.item).toMatchObject({
      ...before, reviewOpen: false,
    });
    expect(t.access().grants).toHaveLength(1);
  });

  it("uses the current note for the Note menu and starts a fresh draft on every Share…", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("note.share");
    expect(t.vm("vm.shareItem")).toMatchObject({ open: true, folder: false, name: "Rome" });
    await t.run("share.item.toggleLink");
    await t.run("share.item.setOpen", { open: false });
    await t.run("note.share");
    expect(t.vm("vm.shareItem")).toMatchObject({ link: true, passcode: false, expiry: "30d" });
    expect(t.app.store.state.ui.share.note.open).toBe(false);
  });

  it("allows both methods off with an explicit reason, and never changes the fixed target", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    await t.run("share.item.toggleLink");
    expect(t.vm("vm.shareItem")).toMatchObject({
      noMethods: true, blockedReason: "Keep Link or Passcode on to share this item.",
      name: "trips",
    });
  });

  it("keeps a deleted item visible and never substitutes the current note", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    t.app.store.update((s) => ({
      ...s, workspace: { ...s.workspace, tree: { roots: [] } },
    }));
    expect(t.vm("vm.shareItem")).toMatchObject({ open: true, name: "trips", deleted: true });
    expect(t.access().grants).toHaveLength(1);
  });

  it("counts 10,000 notes with an immediate draft, yielding for input, and discards a cancelled count", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    t.app.store.update((s) => ({
      ...s, workspace: { ...s.workspace, tree: { roots: [{
        id: "private", path: "/w/private/notes", readOnly: false, children: [{
          kind: "folder", name: "large", children: Array.from({ length: 10_000 }, (_, i) => ({
            kind: "note", name: `${i}.md`, title: `Note ${i}`, published: false,
          })),
        }],
      }] } },
    }));
    const opening = t.run("share.item.open", { path: "/w/private/notes/large" });
    expect(t.vm("vm.shareItem")).toMatchObject({ open: true, counting: true });
    await t.run("share.item.togglePasscode");
    await opening;
    expect(t.vm("vm.shareItem")).toMatchObject({ notes: 10_000, counting: false, passcode: true });
    const again = t.run("share.item.open", { path: "/w/private/notes/large" });
    await t.run("share.item.setOpen", { open: false });
    await again;
    expect(t.vm("vm.shareItem")).toMatchObject({ open: false, notes: 0, contents: [] });
    expect(t.access().grants).toHaveLength(1);
  });
});

function shell() {
  let access: AccessFile = { version: 1, grants: [{ id: "gownergrant1", name: "You", owner: true, salt: "AAAAAAAAAAAAAAAAAAAAAA", passcodeKey: "A".repeat(43), scope: { all: true }, createdAt: "2026-10-01T00:00:00.000Z" }] };
  const copied: string[] = [];
  let template: string | undefined;
  const listing = (): AccessListing => ({ available: true, site: SITE, ...(template ? { template } : {}), vault: true, grants: shareGrants(access).map(audienceOf) });
  const secrets = (id: string) => {
    const g = shareGrants(access).find((x) => x.id === id)!;
    return { ...(g.link ? { link: shareLink(SITE, g.id, g.link.secret) } : {}), ...(g.passcode ? { passcode: g.passcode.value } : {}), ...(g.shareCode && g.passcode ? { accessCode: `${displayShareCode(g.shareCode)} ${g.passcode.value}` } : {}) };
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
        const r = applyAccessChange(access, JSON.parse(JSON.stringify(change)) as AccessChange, new Date(), {
          generate: generatePasscode,
          ...(change.op === "createItem" || change.op === "addItemNotes" ? { resolvedItemNotes: {
            ...(change.op === "addItemNotes" ? { grantId: change.id } : {}), notes: change.notes, ids: change.notes.map((_, i) => `fixture-id-${i}`),
          } } : {}),
        });
        access = r.access;
        return { ...listing(), id: r.id };
      },
      reveal: async (id) => (revealed.push(id), secrets(id)),
      ready: async () => {},
      prepareWords: async () => ({ id: "wprepared001", value: generatePasscode() }),
      cancelReady: async () => {},
      setTemplate: async (t) => ((template = t ?? undefined), listing()),
      // As the main process does: the window sends the invite without secrets, and the shell fills them in.
      copy: async (id, what, invite) => {
        const s = secrets(id);
        const g = shareGrants(access).find((x) => x.id === id)!;
        copied.push(what === "information" ? itemInviteText(invite!.template, { title: g.item!.label, ...s, site: `${SITE}s/` }) : what === "invite" ? inviteText(invite!.template, { ...invite!.values, ...s, site: `${SITE}s/` }) : (what === "link" ? s.link : what === "accessCode" ? s.accessCode : s.passcode)!);
      },
    },
  };
  const app = createApp(bridge, en);
  const vm = (id: string) => app.viewModels.select(id, app.store.state) as Record<string, any>;
  const run = (id: string, args?: Record<string, unknown>) => app.commands.run(id, args);
  return { app, bridge, vm, run, copied, revealed, access: () => access, setAccess: (a: AccessFile) => void (access = a), template: () => template };
}

describe("Settings → Sharing (SHR-05, SHR-08)", () => {
  it("is a category on the desktop, empty at first, with the vault not listed as an audience", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("settings.open");
    expect(t.vm("vm.settings").sections.map((s: { id: string }) => s.id)).toEqual(["account", "project", "workspace", "sharing", "ai", "appearance"]);
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
    expect(t.vm("vm.shareConfirm").message).toContain("This cannot be undone.");
    expect(t.vm("vm.shareConfirm").message).toContain("Sharing again creates a new link.");
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

describe("the invite template (SHR-09, D-143)", () => {
  it("opens on the default, previews live with made-up values, refuses a bad placeholder, saves, and is used for Copy invite", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("settings.open");
    await t.run("settings.setSection", { value: "sharing" });
    expect(t.vm("vm.shareManage").templateBadge).toBe("Default");
    await t.run("share.manage.templateOpen");
    let v = t.vm("vm.shareTemplate");
    expect(v).toMatchObject({ open: true, isDefault: true, hasProblem: false, canSave: true });
    expect(v.value).toBe(inviteTemplate(catalog, true));
    expect(v.placeholders.map((p: { label: string }) => p.label)).toEqual(["{name}", "{title}", "{link}", "{passcode}", "{expires}", "{site}"]);
    expect(v.lines[0].text).toBe(`Hi Asha, I've shared "Trip plans" with you.`);
    expect(v.lines[1].text).toBe(`Open it here: ${SITE}s/#example`);
    expect(t.vm("vm.settings").open).toBe(false);
    // A typo is named, and nothing is saved.
    await t.run("share.manage.setTemplate", { value: "Hey {nmae}: {link}" });
    v = t.vm("vm.shareTemplate");
    expect(v).toMatchObject({ invalid: true, canSave: false, problem: "“{nmae}” isn't a placeholder. Use one from the list.", lines: [] });
    await t.run("share.manage.templateSave");
    expect(t.template()).toBeUndefined();
    await t.run("share.manage.setTemplate", { value: "Hey {name}, see {site}" });
    expect(t.vm("vm.shareTemplate").problem).toBe("Add {link} or {passcode}, so they can open it.");
    await t.run("share.manage.setTemplate", { value: "Hey {name}!" });
    await t.run("share.manage.insertPlaceholder", { id: "link" });
    await t.run("share.manage.insertPlaceholder", { id: "nope" });
    expect(t.vm("vm.shareTemplate")).toMatchObject({ value: "Hey {name}! {link}", lines: [{ id: "0", text: `Hey Asha! ${SITE}s/#example` }] });
    await t.run("share.manage.templateSave");
    expect(t.template()).toBe("Hey {name}! {link}");
    expect(t.vm("vm.shareTemplate").open).toBe(false);
    expect(t.vm("vm.settings")).toMatchObject({ open: true, section: "sharing" });
    expect(t.vm("vm.shareManage").templateBadge).toBe("Edited");
    // Copy invite uses it; the shell fills the link in.
    await t.run("share.manage.add");
    await t.run("share.manage.setName", { value: "Asha" });
    await t.run("share.manage.togglePasscode");
    await t.run("share.manage.submit");
    await t.run("share.manage.copy", { what: "invite" });
    const g = shareGrants(t.access())[0]!;
    expect(t.copied.at(-1)).toBe(`Hey Asha! ${SITE}s/#${g.id}.${g.link!.secret}`);
    // Reset puts the default back, and saving it removes the file.
    await t.run("share.manage.setInviteOpen", { open: false });
    await t.run("share.manage.templateOpen");
    expect(t.vm("vm.shareTemplate").value).toBe("Hey {name}! {link}");
    await t.run("share.manage.templateReset");
    expect(t.vm("vm.shareTemplate").isDefault).toBe(true);
    await t.run("share.manage.templateSave");
    expect(t.template()).toBeUndefined();
  });
});

describe("a date for the expiry (D-143)", () => {
  it("works until the end of the picked day; a past day is refused before the shell is asked", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("settings.setSection", { value: "sharing" });
    await t.run("share.manage.add");
    await t.run("share.manage.setName", { value: "Asha" });
    const d = new Date(Date.now() + 10 * 86_400_000);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    await t.run("share.manage.setUntil", { value: day });
    let e = t.vm("vm.shareEditor");
    // The presets let go; the card says the day.
    expect(e).toMatchObject({ expiry: "", until: day });
    expect(e.cardBadge).toMatch(/^Until /);
    await t.run("share.manage.setUntil", { value: "2001-01-01" });
    await t.run("share.manage.submit");
    expect(t.vm("vm.shareEditor")).toMatchObject({ open: true, problem: "Choose how long it works." });
    await t.run("share.manage.setUntil", { value: "2026-02-30" });
    expect(t.vm("vm.shareEditor").until).toBe("2001-01-01");
    await t.run("share.manage.setUntil", { value: day });
    await t.run("share.manage.submit");
    const g = shareGrants(t.access())[0]!;
    const at = new Date(g.expiresAt!);
    expect([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours()]).toEqual([d.getFullYear(), d.getMonth(), d.getDate(), 23]);
    // A preset again clears the day.
    await t.run("share.manage.setInviteOpen", { open: false });
    await t.run("share.manage.row", { id: g.id, action: "edit" });
    await t.run("share.manage.setExpiry", { value: "7d" });
    e = t.vm("vm.shareEditor");
    expect(e).toMatchObject({ expiry: "7d", until: "", cardBadge: "7 days" });
  });
  it("shows who it's for, what it opens, how, and for how long, as a card at the top (VVS anchor)", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("settings.setSection", { value: "sharing" });
    await t.run("share.manage.add");
    expect(t.vm("vm.shareEditor")).toMatchObject({ cardTitle: "Someone new", hasInitials: false, cardDetail: "Rome · Link and passcode", cardBadge: "30 days" });
    await t.run("share.manage.setName", { value: "Book club" });
    await t.run("share.manage.toggleLink");
    await t.run("share.manage.togglePasscode");
    expect(t.vm("vm.shareEditor")).toMatchObject({ cardTitle: "Book club", cardInitials: "BC", hasInitials: true, cardDetail: "Rome · No way in" });
  });
});

describe("the Share popover for the open note (IA-VIEW-SHARE, D-143)", () => {
  it("lists who can read this note, directly or through a folder, copies an invite, and shares it with someone new", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("share.manage.noteOpen");
    let p = t.vm("vm.shareNote");
    expect(p).toMatchObject({ open: true, title: "Share “Rome”", level: "Private", isPrivate: true, onlyYou: true, hasPeople: false, canShare: true });
    expect(t.vm("vm.settings").open).toBe(false);
    // Share this note with…: the editor, this note picked; closing the invite comes back here.
    await t.run("share.manage.add");
    expect(t.vm("vm.shareNote").open).toBe(false);
    expect(t.vm("vm.shareEditor").items.filter((i: { pressed: boolean }) => i.pressed).map((i: { id: string }) => i.id)).toEqual(["n:trips/rome.md"]);
    await t.run("share.manage.setName", { value: "Asha" });
    await t.run("share.manage.submit");
    await t.run("share.manage.setInviteOpen", { open: false });
    expect(t.vm("vm.settings").open).toBe(false);
    p = t.vm("vm.shareNote");
    expect(p).toMatchObject({ open: true, level: "Shared", hasPeople: true, onlyYou: false });
    expect(p.rows).toEqual([expect.objectContaining({ name: "Asha", initials: "AS", detail: "Link and passcode", badge: "Expires in 30 days", copyLabel: "Copy invite" })]);
    // Another audience through the folder, and one that doesn't open it, and a withdrawn one.
    const apply = (c: AccessChange) => t.bridge.access!.apply(c);
    await apply({ op: "create", audience: { name: "Book club", link: true, scope: { notes: [], folders: ["trips"] }, expiresAt: null } });
    await apply({ op: "create", audience: { name: "Ravi", link: true, scope: { notes: ["diary.md"], folders: [] }, expiresAt: null } });
    await t.run("share.manage.load");
    p = t.vm("vm.shareNote");
    expect(p.rows.map((r: { name: string; detail: string }) => `${r.name}: ${r.detail}`)).toEqual(["Asha: Link and passcode", "Book club: Link · via trips/"]);
    const asha = shareGrants(t.access())[0]!;
    await t.run("share.manage.copyInvite", { id: asha.id });
    expect(t.copied.at(-1)).toContain(`Hi Asha, I've shared "Rome" with you.`);
    expect(t.copied.at(-1)).toContain(asha.passcode!.value);
    p = t.vm("vm.shareNote");
    expect(p.rows[0]).toMatchObject({ copyLabel: "Copied", copyIcon: "check" });
    expect(p.copied).toBe("Invite for Asha copied");
    // The window never held the secrets to do it.
    expect(JSON.stringify(t.app.store.state.ui.share)).not.toContain(asha.passcode!.value);
    // All people with access: Settings → Sharing.
    await t.run("share.manage.noteAll");
    expect(t.vm("vm.shareNote").open).toBe(false);
    expect(t.vm("vm.settings")).toMatchObject({ open: true, section: "sharing" });
  });
});


describe("after the security review of 8a6627c (D-143)", () => {
  const grant = (id: string, name: string, scope: { notes?: string[]; folders?: string[]; all?: boolean }) =>
    ({ id, name, salt: "AAAAAAAAAAAAAAAAAAAAAA", link: { secret: "B".repeat(43) }, scope, createdAt: "2026-10-01T00:00:00.000Z", expiresAt: null });
  it("the note's Share dialog finds who can read it as the publisher does: by front-matter id, and by a folder written with a leading slash", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    // The open note's front matter names its id (the publisher's noteId).
    t.app.store.update((s) => ({ ...s, note: { ...s.note, markdown: "---\nid: rome-7f3a\n---\n# Rome\n" } }));
    const base = t.access();
    t.setAccess({
      ...base,
      grants: [
        ...base.grants,
        grant("sbyidaaaaaaaaaaaaaaaa", "By id", { notes: ["rome-7f3a"] }),
        grant("sslashaaaaaaaaaaaaaaa", "By slash", { folders: ["/trips"] }),
        grant("sotheraaaaaaaaaaaaaaa", "Other", { notes: ["diary.md"], folders: ["/trip"] }),
        // `all` counts only on the owner's grant (D-117 (2)).
        grant("sallaaaaaaaaaaaaaaaaa", "All", { all: true }),
      ],
    } as AccessFile);
    await t.run("share.manage.noteOpen");
    const p = t.vm("vm.shareNote");
    expect(p).toMatchObject({ onlyYou: false, hasPeople: true, level: "Shared" });
    expect(p.rows.map((r: { name: string; detail: string }) => `${r.name}: ${r.detail}`)).toEqual(["By id: Link", "By slash: Link · via trips/"]);
  });
  it("refuses a day more than a year away, and never falls back to 30 days for a picked day", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("settings.setSection", { value: "sharing" });
    await t.run("share.manage.add");
    await t.run("share.manage.setName", { value: "Asha" });
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const e = t.vm("vm.shareEditor");
    const latest = new Date();
    latest.setFullYear(latest.getFullYear() + 1);
    expect(e.latest).toBe(iso(latest));
    const far = new Date(latest.getTime() + 2 * 86_400_000);
    await t.run("share.manage.setUntil", { value: iso(far) });
    await t.run("share.manage.submit");
    expect(t.vm("vm.shareEditor")).toMatchObject({ open: true, problem: "Choose a day within a year." });
    expect(shareGrants(t.access())).toHaveLength(0);
    await t.run("share.manage.setUntil", { value: iso(latest) });
    await t.run("share.manage.submit");
    const at = new Date(shareGrants(t.access())[0]!.expiresAt!);
    expect([at.getFullYear(), at.getMonth(), at.getDate()]).toEqual([latest.getFullYear(), latest.getMonth(), latest.getDate()]);
  });
});
