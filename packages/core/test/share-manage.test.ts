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
import { menuBarModel } from "../src/menu-bar.ts";
import { siteMarksOf } from "../src/share-details.ts";

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

describe("G2 read-only default site confirmation", () => {
  const preview = { project: "ada/book", owner: "ada", name: "notes-site", site: "https://ada.github.io/notes-site/", phase: "unconfigured" as const };
  async function setup() {
    const t = shell();
    t.bridge.workspace!.info = async () => ({ folder: "/w", repo: "ada/book" });
    t.bridge.access!.load = async () => ({ available: true, setupAvailable: true, vault: false, grants: [] });
    t.bridge.access!.setup = {
      describe: vi.fn(async () => preview),
      enable: vi.fn(async () => { throw new Error("sharing:unavailable"); }),
      disable: vi.fn(async () => { throw new Error("sharing:unavailable"); }),
    };
    await t.app.start();
    await settle();
    await t.run("share.manage.load");
    expect(t.vm("vm.sharingSettings").canSetup).toBe(true);
    return t;
  }
  it("shows the default paired public target read-only, retaining it and the note on unavailable Retry", async () => {
    const t = await setup();
    const apply = vi.spyOn(t.bridge.access!, "apply");
    const before = t.app.store.state.note.markdown;
    await t.run("sharing.firstOpen");
    expect(t.vm("vm.sharingSettings")).toMatchObject({ firstOpen: true, repo: "ada/notes-site", setupSite: preview.site, on: false });
    await t.run("sharing.firstAccept");
    expect(t.vm("vm.sharingSettings")).toMatchObject({ firstOpen: true, busy: false, setupProblem: true, repo: "ada/notes-site", on: false });
    await t.run("sharing.firstAccept");
    expect(t.bridge.access!.setup!.enable).toHaveBeenCalledTimes(2);
    expect(t.bridge.access!.setup!.enable).toHaveBeenCalledWith("notes-site");
    expect(apply).not.toHaveBeenCalled();
    expect(t.app.store.state.note.markdown).toBe(before);
    await t.run("sharing.firstClose");
    expect(t.vm("vm.sharingSettings")).toMatchObject({ firstOpen: false, on: false });
  });
  it("names why turning on failed, with its recovery, never that sharing isn't available (G2.2)", async () => {
    const t = await setup();
    await t.run("sharing.firstOpen");
    await t.run("sharing.firstAccept");
    // D-427: the problem names the step it stopped at; nothing was done before it.
    expect(t.vm("vm.sharingSettings").problem).toBe(`Stopped at “Make your notes site”. ${en["sharing.setup.problem.failed"]}`);
    const enable = vi.mocked(t.bridge.access!.setup!.enable);
    enable.mockImplementation(async () => { throw new Error("Error invoking remote method 'sharing:enable': Error: sharing:refused"); });
    await t.run("sharing.firstAccept");
    expect(t.vm("vm.sharingSettings").problem).toBe(`Stopped at “Make your notes site”. ${en["sharing.setup.problem.refused"]}`);
    enable.mockImplementation(async () => { throw new Error("sharing:offline"); });
    await t.run("sharing.firstAccept");
    expect(t.vm("vm.sharingSettings")).toMatchObject({ problem: `Stopped at “Make your notes site”. ${en["sharing.setup.problem.offline"]}`, firstOpen: true, repo: "ada/notes-site" });
  });
  it("enables modern sharing only after the matching ready pairing loads, without an owner vault", async () => {
    const t = await setup();
    t.bridge.access!.setup!.enable = async () => ({ phase: "ready", site: preview.site });
    await t.run("sharing.firstOpen");
    t.bridge.access!.load = async () => ({ available: true, vault: false, configured: true, site: preview.site, grants: [] });
    await t.run("sharing.firstAccept");
    expect(t.vm("vm.sharingSettings")).toMatchObject({ firstOpen: false, on: true });
    expect(t.app.store.state.ui.share.listing).toMatchObject({ configured: true, vault: false, grants: [] });
    expect(t.vm("vm.shareManage").available).toBe(true);
  });
  it("refuses mismatched readiness and ignores completion after the person leaves", async () => {
    const t = await setup();
    await t.run("sharing.firstOpen");
    t.bridge.access!.setup!.enable = async () => ({ phase: "ready", site: "https://ada.github.io/wrong/" });
    await t.run("sharing.firstAccept");
    expect(t.vm("vm.sharingSettings")).toMatchObject({ firstOpen: true, on: false, setupProblem: true });
    let done!: (value: { phase: "ready"; site: string }) => void;
    t.bridge.access!.setup!.enable = () => new Promise(resolve => { done = resolve; });
    const accepting = t.run("sharing.firstAccept");
    expect(t.vm("vm.sharingSettings").busy).toBe(true);
    await t.run("sharing.firstClose");
    done({ phase: "ready", site: preview.site });
    await accepting;
    expect(t.vm("vm.sharingSettings")).toMatchObject({ firstOpen: false, busy: false, on: false });
    expect(t.app.store.state.ui.settings.open).toBe(true);
  });
});

it("D-424: offers Share… for a note where sharing can't start yet, and the dialog says how to fix it", async () => {
  const t = shell();
  const configured = await t.bridge.access!.load();
  t.bridge.access!.load = async () => ({ available: true, site: SITE, vault: false, grants: [] });
  await t.app.start();
  await settle();
  await t.run("settings.setSection", { value: "sharing" });
  await t.run("files.reveal");
  t.app.store.update(s => ({ ...s, toolbarPinned: [...s.toolbarPinned, "note.share"] }));
  expect(t.app.commands.describe("note.share").enabled).toBe(true);
  expect(t.app.commands.describe("files.share").enabled).toBe(true);
  expect(t.vm("vm.files").menu.flatMap((g: { items: { id: string }[] }) => g.items).map((i: { id: string }) => i.id)).toContain("files.share");
  expect(t.vm("vm.toolbar").items.map((i: { id: string }) => i.id)).toContain("note.share");
  expect(menuBarModel(t.app.commands, catalog, "macos").menus.find(m => m.id === "file")!.items).toContainEqual(expect.objectContaining({ id: "note.share", enabled: true }));
  await t.run("note.share");
  expect(t.vm("vm.shareItem")).toMatchObject({ dialogOpen: true, setupVisible: true, setupMessage: en["share.item.setup.unlinked"], setupFixable: true, actionsDisabled: true });
  // Not linked to GitHub: the only reason left (D-425); its fix opens Settings → Project, and nothing changes.
  await t.run("share.item.fixSetup");
  expect(t.app.store.state.ui.share.item.open).toBe(false);
  expect(t.vm("vm.sharingSettings")).toMatchObject({ off: true, localReview: false, offDetail: en["share.item.setup.unlinked"] });
  expect(Object.keys(en).filter(k => /^share\.item\.setup\.legacy$|^sharing\.setup\.unavailable$/.test(k))).toEqual([]);
  expect(t.access().grants).toHaveLength(1);
  t.bridge.access!.load = async () => configured;
  await t.run("share.manage.load");
  await t.run("files.reveal");
  expect(t.app.commands.describe("note.share").enabled).toBe(true);
  expect(t.app.commands.describe("files.share").enabled).toBe(true);
  expect(t.vm("vm.files").menu.flatMap((g: { items: { id: string }[] }) => g.items).map((i: { id: string }) => i.id)).toContain("files.share");
  expect(t.vm("vm.toolbar").items.map((i: { id: string }) => i.id)).toContain("note.share");
});

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

describe("item-first sharing (SHR-13 to SHR-16, SHR-24)", () => {
  it.each([0, 1100])("owns initial and repeated sharing section refusals once after %i ms", async delay => {
    const t = shell();
    await t.app.start();
    await settle();
    const load = t.bridge.access!.load;
    let refused = true;
    t.bridge.access!.load = async () => {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (refused) throw new Error("private-path-and-token");
      return load();
    };
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    const said: string[] = [];
    let n = t.app.store.state.announcement.n;
    const stop = t.app.store.subscribe(() => {
      if (t.app.store.state.announcement.n !== n) {
        n = t.app.store.state.announcement.n;
        said.push(t.app.store.state.announcement.text);
      }
    });
    const opening = t.run("share.item.open", { path: "/w/private/notes/diary.md" });
    await vi.advanceTimersByTimeAsync(delay);
    await opening;
    expect(t.vm("vm.shareItem")).toMatchObject({ loadFailed: true });
    expect(said).toEqual(delay ? [en["share.item.preparing"]] : []);
    said.length = 0;
    const retry = t.run("share.item.reload");
    expect(t.vm("vm.shareItem")).toMatchObject({ loadFailed: true, retrying: true });
    await vi.advanceTimersByTimeAsync(delay);
    await retry;
    expect(said).toEqual([...(delay ? [en["share.item.preparing"]] : []), en["share.item.unavailable"]]);
    refused = false;
    const recovered = t.run("share.item.reload");
    await vi.advanceTimersByTimeAsync(delay);
    await recovered;
    expect(t.vm("vm.shareItem")).toMatchObject({ loadFailed: false, retrying: false });
    expect(shareGrants(t.access())).toHaveLength(0);
    stop();
  });
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
  it("keeps the draft through a failed refresh and ignores a closed item's late read", async () => {
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
    expect(t.vm("vm.shareItem")).toMatchObject({ open: true, loadFailed: false });
    t.bridge.access!.load = async () => { throw new Error("private-path-and-token"); };
    await t.run("share.item.reload");
    expect(t.vm("vm.shareItem")).toMatchObject({ open: true, loadFailed: true, preparingVisible: false });
    let finish!: (value: typeof listing) => void;
    t.bridge.access!.load = () => new Promise(resolve => { finish = resolve; });
    const old = t.run("share.item.reload");
    await t.run("share.item.setOpen", { open: false });
    t.bridge.access!.load = async () => listing;
    await t.run("share.item.open", { path: "/w/private/notes/trips/rome.md" });
    finish(saved);
    await old;
    expect(t.vm("vm.shareItem")).toMatchObject({ name: "Rome", loadFailed: false });
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
  it("D-431: Share… on an already-shared item opens Share details; D-433: it has no Share again", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    await t.run("share.item.action", { what: "link" });
    const first = shareGrants(t.access())[0]!.id;
    await t.run("share.item.setOpen", { open: false });
    // Never shared: the Share… form.
    await t.run("share.item.open", { path: "/w/private/notes/diary.md" });
    expect(t.vm("vm.shareItem")).toMatchObject({ dialogOpen: true });
    expect(t.vm("vm.shareDetails").open).toBe(false);
    await t.run("share.item.setOpen", { open: false });
    // Shared: the one dialog for it, Share details.
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    expect(t.vm("vm.shareItem").dialogOpen).toBe(false);
    expect(t.vm("vm.shareDetails")).toMatchObject({ open: true, name: "trips" });
    expect(t.vm("vm.shareDetails")).not.toHaveProperty("againLabel");
    expect(t.app.commands.has("share.details.again")).toBe(false);
    expect(t.vm("vm.shareDetails").rows.map((r: { id: string }) => r.id)).toEqual([first]);
    expect(shareGrants(t.access()).map((g) => g.id)).toEqual([first]);
    expect(t.app.store.state.note.path).toBe("/w/private/notes/trips/rome.md");
  });  it("refuses draft commands during creation and after saving, including regenerated words", async () => {
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
    expect(t.copied.at(-1)).toContain("Open it here: https://ada.github.io/notes/s/#");
    expect(t.vm("vm.shareItem")).toMatchObject({ busy: false, ready: true });
    t.bridge.access!.ready = async () => {};
    await t.run("share.item.action", { what: "link" });
    expect(shareGrants(t.access())).toHaveLength(1);
    await t.run("share.item.setOpen", { open: false });
    // Shared now: Share… opens Share details, never a second share (D-431, D-433).
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    expect(t.vm("vm.shareDetails").open).toBe(true);
    expect(shareGrants(t.access())).toHaveLength(1);
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
      noMethods: true, blockedReason: "Keep Link or Access code on to share this item.",
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
  let itemTemplate: string | undefined;
  const listing = (): AccessListing => ({ available: true, site: SITE, ...(template ? { template } : {}), ...(itemTemplate ? { itemTemplate } : {}), vault: true, grants: shareGrants(access).map(audienceOf) });
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
      setItemTemplate: async (t) => ((itemTemplate = t ?? undefined), listing()),
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
  return { app, bridge, vm, run, copied, revealed, access: () => access, setAccess: (a: AccessFile) => void (access = a), template: () => template, itemTemplate: () => itemTemplate };
}

describe("Settings → Sharing (SHR-05, SHR-08)", () => {
  it("is a category on the desktop, empty at first, with the vault not listed as an audience", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("settings.open");
    expect(t.vm("vm.settings").sections.map((s: { id: string }) => s.id)).toEqual(["account", "project", "sharing", "ai", "appearance"]);
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

describe("the share information template (SHR-19, G6.3, D-409)", () => {
  it("opens on the recipient-voice default, previews live, rejects {name}/{passcode}/unknown, validates at copy time, and resets", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("settings.open");
    await t.run("settings.setSection", { value: "sharing" });
    expect(t.vm("vm.sharingSettings").templateBadge).toBe("Default");
    await t.run("share.manage.templateOpen");
    let v = t.vm("vm.shareTemplate");
    expect(v).toMatchObject({ open: true, isDefault: true, hasProblem: false, canSave: true });
    expect(v.placeholders.map((p: { label: string }) => p.label)).toEqual(["{title}", "{link}", "{site}", "{accessCode}", "{expires}"]);
    expect(v.lines[0].text).toBe("I’ve shared “Trip plans” with you to read.");
    expect(v.lines[1].text).toBe(`Open it here: ${SITE}s/#example`);
    expect(v.lines[2].text).toBe(`To use the access code, open ${SITE}s/ and enter: K7QM-4DRP harbor-maple-river-cloud`);
    expect(t.vm("vm.settings").open).toBe(false);
    // Rejects {name}, {passcode}, typos, and missing opening methods.
    await t.run("share.manage.setTemplate", { value: "Hi {name}, open {link}" });
    expect(t.vm("vm.shareTemplate")).toMatchObject({ invalid: true, canSave: false, problem: "Remove {name}. Shares never ask for a name.", lines: [] });
    await t.run("share.manage.setTemplate", { value: "Open {site} and enter {passcode}" });
    expect(t.vm("vm.shareTemplate")).toMatchObject({ invalid: true, canSave: false, problem: "Use {accessCode} instead of {passcode}.", lines: [] });
    await t.run("share.manage.setTemplate", { value: "Hey {nmae}: {link}" });
    expect(t.vm("vm.shareTemplate")).toMatchObject({ invalid: true, canSave: false, problem: "“{nmae}” isn't a placeholder.", lines: [] });
    await t.run("share.manage.templateSave");
    expect(t.itemTemplate()).toBeUndefined();
    await t.run("share.manage.setTemplate", { value: "Read {title} at {site}" });
    expect(t.vm("vm.shareTemplate").problem).toBe("Add {link}, or {site} and {accessCode}, so people can open the share.");
    // Save a code-only template (valid for code shares, unusable for link-only shares).
    const codeOnly = "I’ve shared “{title}”.\nOpen {site} and enter: {accessCode}";
    await t.run("share.manage.setTemplate", { value: codeOnly });
    expect(t.vm("vm.shareTemplate")).toMatchObject({ canSave: true, hasProblem: false, lines: [
      { id: "0", text: "I’ve shared “Trip plans”." },
      { id: "1", text: `Open ${SITE}s/ and enter: K7QM-4DRP harbor-maple-river-cloud` },
    ] });
    await t.run("share.manage.templateSave");
    expect(t.itemTemplate()).toBe(codeOnly);
    expect(t.vm("vm.shareTemplate").open).toBe(false);
    expect(t.vm("vm.settings")).toMatchObject({ open: true, section: "sharing" });
    expect(t.vm("vm.sharingSettings")).toMatchObject({ templateBadge: "Edited", status: "Share information saved." });
    // Copy-time validation in the item Share dialog: link-only share rejects code-only template without losing draft or copying.
    await t.run("settings.setOpen", { open: false });
    await t.run("share.item.open", { path: "/w/private/notes/trips/rome.md" });
    const copiedBefore = t.copied.length;
    await t.run("share.item.action", { what: "primary" });
    expect(t.copied.length).toBe(copiedBefore);
    expect(t.vm("vm.shareItem")).toMatchObject({
      open: true, dialogOpen: true, link: true, passcode: false, templateInvalid: true,
      problem: "Add a link, or the site address and access code, for this share.", status: "",
    });
    // Edit message from Share dialog opens template editor and closing returns to Share dialog with draft intact.
    await t.run("share.manage.templateOpen");
    expect(t.vm("vm.shareTemplate").open).toBe(true);
    expect(t.vm("vm.shareItem").dialogOpen).toBe(false);
    await t.run("share.manage.setTemplateOpen", { open: false });
    expect(t.vm("vm.shareItem")).toMatchObject({ open: true, dialogOpen: true, link: true, passcode: false });
    // Use default this time succeeds and copies the recipient-voice default without warnings.
    await t.run("share.item.action", { what: "primary", useDefault: true });
    expect(t.copied.length).toBe(copiedBefore + 1);
    expect(t.copied.at(-1)).toContain("I’ve shared “Rome” with you to read.");
    expect(t.copied.at(-1)).toContain("Open it here: https://");
    expect(t.copied.at(-1)).not.toContain("forward");
    expect(t.vm("vm.shareItem").status).toBe("Share information copied with the default message.");
    await t.run("share.item.setOpen", { open: false });
    // Reset puts the default back, and saving it removes itemTemplate.
    await t.run("share.manage.templateOpen");
    expect(t.vm("vm.shareTemplate").value).toBe(codeOnly);
    await t.run("share.manage.templateReset");
    expect(t.vm("vm.shareTemplate").isDefault).toBe(true);
    await t.run("share.manage.templateSave");
    expect(t.itemTemplate()).toBeUndefined();
    expect(t.vm("vm.sharingSettings").templateBadge).toBe("Default");
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

describe("D-431: shared and published marks in Files, and Share details…", () => {
  const rowsOf = (t: ReturnType<typeof shell>) => [...t.vm("vm.files").items, ...t.vm("vm.files").shortcuts, ...t.vm("vm.opened").items] as { id: string; shared?: boolean; published?: boolean; siteLabel?: string }[];
  const menuIds = (t: ReturnType<typeof shell>) => t.vm("vm.files").menu.flatMap((g: { items: { id: string }[] }) => g.items).map((i: { id: string }) => i.id);
  it("marks a shared note in the tree and Opened files, offers Share details… only there, and copies its link from it", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("files.reveal");
    const rome = "/w/private/notes/trips/rome.md";
    expect(rowsOf(t).filter((r) => r.id === rome && r.shared)).toEqual([]);
    await t.run("files.reveal");
    expect(menuIds(t)).toContain("files.share");
    expect(menuIds(t)).not.toContain("files.shareDetails");
    expect(t.app.commands.describe("note.shareDetails").enabled).toBe(false);
    await t.run("share.item.open", { path: rome });
    await t.run("share.item.action", { what: "link" });
    await t.run("share.item.setOpen", { open: false });
    await t.run("files.reveal");
    // Both the tree row and the open note's tab: the icon, named once.
    const marked = rowsOf(t).filter((r) => r.id === rome);
    expect(marked.length).toBeGreaterThanOrEqual(2);
    for (const r of marked) expect(r).toMatchObject({ shared: true, published: false, siteLabel: "Shared" });
    expect(rowsOf(t).find((r) => r.id === "/w/private/notes/diary.md")?.shared).toBeFalsy();
    await t.run("files.reveal");
    // A shared item offers Share details… instead of Share… (D-431).
    expect(menuIds(t)).toContain("files.shareDetails");
    expect(menuIds(t)).not.toContain("files.share");
    expect(t.app.commands.describe("note.shareDetails").enabled).toBe(true);
    const more = t.vm("vm.toolbar").more.flatMap((g: { items: { id: string }[] }) => g.items).map((i: { id: string }) => i.id);
    expect(more).toContain("note.shareDetails");
    expect(more).not.toContain("note.share");
    await t.run("files.shareDetails");
    const details = t.vm("vm.shareDetails");
    expect(details).toMatchObject({ open: true, name: "Rome" });
    expect(details.rows).toHaveLength(1);
    expect(details.rows[0].copyMenu[0].items.map((i: { id: string }) => i.id)).toContain("link");
    const before = t.copied.length;
    await t.run("sharing.copy", { id: details.rows[0].id, action: "link" });
    expect(t.copied.slice(before)).toEqual([expect.stringMatching(/^https:\/\/ada\.github\.io\/notes\/s\/#/)]);
    // The dialog stays, saying so; Settings doesn't open over it.
    expect(t.vm("vm.shareDetails")).toMatchObject({ open: true, hasStatus: true, status: "Copied." });
    expect(t.app.store.state.ui.settings.open).toBe(false);
  });
  it("Withdraw from Share details… takes the mark and the menu item away, and comes back to the dialog", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("files.reveal");
    const rome = "/w/private/notes/trips/rome.md";
    await t.run("share.item.open", { path: rome });
    await t.run("share.item.action", { what: "link" });
    await t.run("share.item.setOpen", { open: false });
    await t.run("files.reveal");
    await t.run("share.details.open", { path: rome });
    const id = t.vm("vm.shareDetails").rows[0].id;
    await t.run("sharing.confirmOpen", { kind: "withdraw", id });
    expect(t.vm("vm.shareDetails").open).toBe(false);
    expect(t.vm("vm.sharingSettings").confirmOpen).toBe(true);
    await t.run("sharing.confirm");
    expect(t.vm("vm.shareDetails")).toMatchObject({ open: true, rows: [], status: expect.stringContaining("Withdrawn") });
    expect(t.app.store.state.ui.settings.open).toBe(false);
    await t.run("share.details.setOpen", { open: false });
    await t.run("files.reveal");
    expect(rowsOf(t).filter((r) => r.id === rome && r.shared)).toEqual([]);
    await t.run("files.reveal");
    expect(menuIds(t)).not.toContain("files.shareDetails");
    expect(menuIds(t)).toContain("files.share");
    expect(t.app.commands.describe("note.shareDetails").enabled).toBe(false);
  });
  it("D-433: Copy on an existing share is local (no website check, no task, never pending); Extend pends only Extend (D-356)", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    const rome = "/w/private/notes/trips/rome.md";
    await t.run("share.item.open", { path: rome });
    await t.run("share.item.action", { what: "link" });
    await t.run("share.item.setOpen", { open: false });
    await t.run("share.details.open", { path: rome });
    const id = t.vm("vm.shareDetails").rows[0].id;
    const ready = vi.spyOn(t.bridge.access!, "ready" as never), copy = vi.spyOn(t.bridge.access!, "copy");
    const tasks = () => t.app.store.state.tasks;
    const before = JSON.stringify(tasks());
    const copying = t.run("sharing.copy", { id, action: "link" });
    expect(t.vm("vm.shareDetails").rows[0]).toMatchObject({ copyBusy: false, extendBusy: false, withdrawBusy: false });
    await copying;
    expect(ready).not.toHaveBeenCalled();
    expect(copy).toHaveBeenCalledWith(id, "link", expect.anything(), { known: true });
    expect(JSON.stringify(tasks())).toBe(before);
    expect(t.vm("vm.shareDetails")).toMatchObject({ busy: false, status: "Copied." });

    let release!: () => void;
    const apply = t.bridge.access!.apply;
    t.bridge.access!.apply = async (change) => { await new Promise<void>((r) => { release = r; }); return apply(change); };
    const extending = t.run("sharing.extend", { id, action: "30d" });
    await settle();
    expect(t.vm("vm.shareDetails").rows[0]).toMatchObject({ copyBusy: false, extendBusy: true, withdrawBusy: false });
    release();
    await extending;
    expect(t.vm("vm.shareDetails").rows[0]).toMatchObject({ copyBusy: false, extendBusy: false, withdrawBusy: false });
  });
  it("Add them in Share details adds a folder's newer notes to that share, with the folder's whole contents", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    await t.run("share.item.action", { what: "link" });
    await t.run("share.item.setOpen", { open: false });
    const id = shareGrants(t.access())[0]!.id;
    const load = t.bridge.access!.load;
    t.bridge.access!.load = async () => { const l = await load(); return { ...l, grants: l.grants.map((g) => (g.id === id ? { ...g, unsharedNotes: ["trips/later.md"] } : g)) }; };
    const apply = vi.spyOn(t.bridge.access!, "apply");
    await t.run("share.item.open", { path: "/w/private/notes/trips" });
    await settle();
    expect(t.vm("vm.shareDetails").rows[0]).toMatchObject({ hasNewer: true, newer: "1 newer note isn't shared" });
    await t.run("share.details.addThem", { id });
    expect(apply).toHaveBeenCalledWith({ op: "addItemNotes", id, notes: ["trips/rome.md"] });
    expect(t.vm("vm.shareDetails")).toMatchObject({ open: true, busy: false, status: "Reviewed notes added to these shares." });
  });  it("names a shared and published note once: Shared and published", () => {
    const tree = { roots: [{ id: "private" as const, path: "/w/p", readOnly: false, children: [{ kind: "note" as const, name: "a.md", published: false }] }] };
    const grant = { id: "g1", name: "", link: true, passcode: false, createdAt: "2026-11-01T00:00:00.000Z", item: { path: "a.md", label: "A", folder: false } };
    const state = (grants: unknown[], published: string[]) => ({ workspace: { tree }, ui: { share: { listing: { available: true, vault: false, grants }, publication: { published, publishing: [] } } } }) as never;
    expect(siteMarksOf(state([grant], ["a.md"]), "/w/p/a.md", catalog)).toEqual({ shared: true, published: true, siteLabel: "Shared and published",
      siteDescription: "Shared privately · anyone with the link can open it · Published · anyone can read it on your website" });
    expect(siteMarksOf(state([], ["a.md"]), "/w/p/a.md", catalog)).toEqual({ shared: false, published: true, siteLabel: "Published", siteDescription: "Published · anyone can read it on your website" });
    expect(siteMarksOf(state([{ ...grant, revokedAt: "2026-11-02T00:00:00.000Z" }], []), "/w/p/a.md", catalog)).toEqual({});
  });
  it("says in plain words who can open a shared note and until when: the latest expiry, none when one never expires (D-431)", () => {
    const tree = { roots: [{ id: "private" as const, path: "/w/p", readOnly: false, children: [{ kind: "note" as const, name: "a.md", published: false }] }] };
    const far = Date.now() + 40 * 86_400_000, near = Date.now() + 10 * 86_400_000;
    const grant = (id: string, link: boolean, passcode: boolean, expiresAt: number | null) =>
      ({ id, name: "", link, passcode, createdAt: "2026-11-01T00:00:00.000Z", expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(), item: { path: "a.md", label: "A", folder: false } });
    const about = (grants: unknown[]) => siteMarksOf({ workspace: { tree }, ui: { share: { listing: { available: true, vault: false, grants }, publication: { published: [], publishing: [] } } } } as never, "/w/p/a.md", catalog).siteDescription;
    const day = (t: number) => new Intl.DateTimeFormat(catalog.locale, { day: "numeric", month: "short" }).format(new Date(t));
    expect(about([grant("g1", true, true, near), grant("g2", true, true, far)])).toBe(`Shared privately · anyone with the link and code can open it · until ${day(far)}`);
    expect(about([grant("g1", false, true, near)])).toBe(`Shared privately · anyone with the code can open it · until ${day(near)}`);
    expect(about([grant("g1", true, false, near), grant("g2", false, true, null)])).toBe("Shared privately · anyone with the link or the code can open it");
  });
  it("D-436: only notes on the site get the globe; a Private + Public project's public notes always, its private notes never; a live check paints it", () => {
    const note = (name: string) => ({ kind: "note" as const, name, published: false });
    const tree = { roots: [
      { id: "private" as const, path: "/w/private/notes", readOnly: false, children: [note("diary.md")] },
      { id: "public" as const, path: "/w/notes", readOnly: false, children: [note("rice-pudding.md"), note("hello.md")] },
    ] };
    const state = (live: unknown[] = [], published: string[] = []) => ({ workspace: { tree, site: "https://ada.github.io/book/" },
      ui: { share: { listing: { available: true, vault: false, grants: [] }, publication: { published, publishing: [] }, live } } }) as never;
    // A private note in a Private + Public project, even if a stale record names it.
    expect(siteMarksOf(state([], ["diary.md"]), "/w/private/notes/diary.md", catalog)).toEqual({});
    // Its row already says *public*, so the globe isn't named twice; its words are the tooltip and description.
    expect(siteMarksOf(state(), "/w/notes/hello.md", catalog)).toEqual({ shared: false, published: true, siteDescription: "Published · live at https://ada.github.io/book/n/hello/" });
    const check = (state: string, reason?: string) => ({ root: "public", path: "rice-pudding.md", url: "https://ada.github.io/book/n/rice-pudding/", action: "publish", state, ...(reason ? { reason } : {}) });
    expect(siteMarksOf(state([check("pending")]), "/w/notes/rice-pudding.md", catalog)).toMatchObject({ published: true, siteLive: "pending", siteDescription: "Publishing · waiting for GitHub Pages to go live" });
    expect(siteMarksOf(state([check("live")]), "/w/notes/rice-pudding.md", catalog)).toMatchObject({ siteLive: "confirmed", siteDescription: "Published · live at https://ada.github.io/book/n/rice-pudding/" });
    expect(siteMarksOf(state([check("failed", "pages")]), "/w/notes/rice-pudding.md", catalog)).toMatchObject({ siteLive: "failed", siteDescription: "Not live yet · GitHub Pages couldn't build your site" });
    // Unpublish moved it back to private: still on the site, so its globe waits there until the page is gone.
    const leaving = { root: "private", path: "diary.md", url: "https://ada.github.io/book/n/diary/", action: "unpublish", state: "pending" };
    expect(siteMarksOf(state([leaving]), "/w/private/notes/diary.md", catalog)).toMatchObject({ published: true, siteLive: "pending", siteDescription: "Unpublishing · waiting for GitHub Pages to take the page down" });
  });
});
