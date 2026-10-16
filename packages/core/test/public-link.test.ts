/**
 * Copy public link (SHR-03, WP-5.1, D-139): a note in the public root copies its stable page address
 * on the instance's site (`/n/<path>/`), from the ⋯ menu's Note group, the command list, and the
 * note's quick actions in Spotlight, with a toast. A private note, or a workspace whose site isn't
 * known yet, has it disabled with a plain reason.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, MORE_MENU, type AppStateFile, type PlatformBridge, type WorkspaceBridge, type WorkspaceScan } from "../src/index.ts";
import { publicLinkOf } from "../src/public-link-app.ts";
import { actionsFor } from "../src/spotlight.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const W = "C:\\w";
const PRIV = `${W}\\private\\notes`;
const PUB = `${W}\\notes`;
const SITE = "https://ada.github.io/notes/";

function desktop(site: string | undefined, start: string) {
  let state: AppStateFile = { version: 1, lastNotePath: start };
  const files: Record<string, string> = {
    [`${PRIV}\\diary.md`]: "# Diary\n",
    [`${PUB}\\Guides\\Launch plan.md`]: "# Launch plan\n",
  };
  const scan = (): WorkspaceScan => ({
    folder: W,
    roots: [{ id: "private", path: PRIV, readOnly: false }, { id: "public", path: PUB, readOnly: false }],
    entries: [{ path: `${PUB}\\Guides`, kind: "folder" as const }, ...Object.keys(files).map((path) => ({ path, kind: "note" as const }))],
  });
  const workspace: WorkspaceBridge = {
    info: async () => ({ folder: W, format: '{ "formatVersion": 1 }', ...(site ? { site } : {}) }),
    scan: async () => scan(), writeFormat: async () => {}, renameNote: async () => {},
  };
  const copied: string[] = [];
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => { if (!(p in files)) throw new Error("missing"); return files[p]!; },
    writeNote: async (p, c) => { files[p] = c; },
    chooseNote: async () => undefined, newNotePath: async () => `${PRIV}\\untitled.md`,
    defaultNotePath: async () => start,
    loadAppState: async () => state, saveAppState: async (s) => { state = s; },
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    copyText: async (t) => { copied.push(t); },
    workspace,
  };
  return { bridge, copied };
}

async function started(site: string | undefined, start = `${PUB}\\Guides\\Launch plan.md`) {
  const { bridge, copied } = desktop(site, start);
  const app = createApp(bridge, messages);
  await app.start();
  await vi.waitFor(() => expect(app.store.state.workspace.tree.roots.length).toBe(2));
  await vi.waitFor(() => expect(app.store.state.note.path).toBe(start));
  if (site) await vi.waitFor(() => expect(app.store.state.workspace.site).toBe(site));
  return { app, copied };
}

describe("publicLinkOf", () => {
  const tree = { roots: [{ id: "private" as const, path: PRIV, readOnly: false }, { id: "public" as const, path: PUB, readOnly: false }] };
  it("is the note's page on the site for notes in the public root, with each segment encoded", () => {
    expect(publicLinkOf(tree, SITE, `${PUB}\\Guides\\Launch plan.md`)).toBe("https://ada.github.io/notes/n/Guides/Launch%20plan/");
    expect(publicLinkOf(tree, SITE, "public:Guides/Garden.md")).toBeUndefined();
    expect(publicLinkOf({ roots: [{ id: "public", path: "public:" }] }, SITE, "public:Guides/Garden.md")).toBe("https://ada.github.io/notes/n/Guides/Garden/");
  });
  it("is nothing for a private note, or without the site", () => {
    expect(publicLinkOf(tree, SITE, `${PRIV}\\diary.md`)).toBeUndefined();
    expect(publicLinkOf(tree, undefined, `${PUB}\\Guides\\Launch plan.md`)).toBeUndefined();
  });
});

describe("Copy public link (SHR-03)", () => {
  it("is in the ⋯ menu's Note group, after Share", () => {
    // Note history (FIL-13, D-175) follows them.
    expect(MORE_MENU.find((g) => g.id === "note")!.items).toEqual(["note.share", "note.copyPublicLink", "history.open"]);
  });

  it("copies a public note's page address and says so", async () => {
    const { app, copied } = await started(SITE);
    expect(app.commands.describe("note.copyPublicLink")).toMatchObject({ enabled: true, title: "command.note.copyPublicLink" });
    await app.commands.run("note.copyPublicLink");
    expect(copied).toEqual(["https://ada.github.io/notes/n/Guides/Launch%20plan/"]);
    expect(app.store.state.ui.toasts.at(-1)?.message).toBe("Public link to “Launch plan” copied");
  });

  it("is disabled for a private note, saying why in plain words", async () => {
    const { app, copied } = await started(SITE, `${PRIV}\\diary.md`);
    const d = app.commands.describe("note.copyPublicLink");
    expect(d.enabled).toBe(false);
    expect(messages[d.disabledReason!]).toBe("Only public notes have a public link");
    await app.commands.run("note.copyPublicLink");
    expect(copied).toEqual([]);
  });

  it("is disabled until the site's address is known", async () => {
    const { app } = await started(undefined);
    const d = app.commands.describe("note.copyPublicLink");
    expect(d.enabled).toBe(false);
    expect(messages[d.disabledReason!]).toBe("Public links work once your site is set up");
  });

  it("is a quick action on a public note in Spotlight once the site is known", () => {
    const ctx = { writable: true, visibility: "public" as const, otherRoot: true, files: true, clipboard: true, copyToLocal: false };
    expect(actionsFor({ kind: "note" }, ctx).find((a) => a.id === "copyPublicLink")).toMatchObject({ available: true });
    expect(actionsFor({ kind: "note" }, { ...ctx, publicLink: "command.note.copyPublicLink.noSite" }).find((a) => a.id === "copyPublicLink")).toMatchObject({ available: false, reason: "command.note.copyPublicLink.noSite" });
  });
});
