/**
 * Proof for the Actions catalogue (ACT-02, ACT-07, ACT-16, D-361): every catalogued action runs from
 * the Actions dialog itself, in the context it's listed for, and its outcome is checked where the
 * person would see it. An action whose command can't run in this test app is checked to be shown
 * unavailable with a reason, never as a dead row. The catalogue's own rules (unique labels, objects
 * named when a verb repeats, a proof and a pointer path for each) are checked here too.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANCHORS, answerKey, CATALOG, catalogProblems, createApp, lookAlikes, titleOfMarkdown,
  type App, type AppState, type AppStateFile, type CatalogEntry, type PlatformBridge, type WorkspaceOp,
} from "../src/index.ts";
import { checkingDisk } from "./checking-disk.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const PRIV = "/w/private/notes";
const PUB = "/w/notes";

function desktop(last = `${PRIV}/welcome.md`) {
  const files: Record<string, string> = {
    [`${PRIV}/welcome.md`]: "# Welcome\n\n## Getting started\n\nWrite here.\n\n## Scope\n\nSmall steps.\n",
    [`${PUB}/essays/on-focus.md`]: "# On focus\n\nOne line at a time.\n",
    [`${PRIV}/ideas.md`]: "# Ideas\n\nKeep a list.\n",
  };
  const folders = new Set([`${PUB}/essays`]);
  let state: AppStateFile = { version: 1, firstRun: "done", lastNotePath: last };
  const opened: string[] = [];
  const under = (base: string, p: string) => p === base || p.startsWith(`${base}/`);
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => { if (!(p in files)) throw new Error("missing"); return files[p]!; },
    writeNote: checkingDisk(files).writeNote,
    chooseNote: async () => undefined,
    newNotePath: async (near) => {
      const dir = near ? near.slice(0, near.lastIndexOf("/")) : PRIV;
      for (let i = 1; ; i++) { const p = `${dir}/untitled${i > 1 ? `-${i}` : ""}.md`; if (!(p in files)) return p; }
    },
    defaultNotePath: async () => `${PRIV}/welcome.md`,
    loadAppState: async () => state, saveAppState: async (s) => { state = s; },
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    copyText: async () => {},
    openExternal: async (url: string) => { opened.push(url); },
    // Signed out, with Git's helper there: Settings and signing in are available, as on a real desktop.
    firstRun: new Proxy({ account: async () => ({ gcm: true, gh: false }) } as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : k === "onSignIn" || k === "onProgress" ? () => () => {} : async () => undefined),
    }) as unknown as PlatformBridge["firstRun"],
    workspace: {
      info: async () => ({ folder: "/w", format: '{"formatVersion":1}' }),
      scan: async () => ({
        folder: "/w",
        roots: [{ id: "private", path: PRIV, readOnly: false }, { id: "public", path: PUB, readOnly: false }],
        entries: [
          ...[...folders].map((path) => ({ path, kind: "folder" as const })),
          ...Object.entries(files).map(([path, text]) => ({ path, kind: "note" as const, title: titleOfMarkdown(text) ?? "" })),
        ],
      }),
      writeFormat: async () => {},
      renameNote: async (from, to) => { files[to] = files[from]!; delete files[from]; },
      apply: async (ops: WorkspaceOp[]) => {
        for (const op of ops) {
          if (op.op === "move") for (const p of Object.keys(files)) { if (under(op.from, p)) { files[op.to + p.slice(op.from.length)] = files[p]!; delete files[p]; } }
          else if (op.op === "write") checkingDisk(files).writeOp(op);
          else if (op.op === "delete") for (const p of Object.keys(files)) if (under(op.path, p)) delete files[p];
        }
      },
    },
  } as PlatformBridge;
  return { bridge, files, opened };
}

const apps: App[] = [];
afterEach(() => { apps.splice(0); });
async function started(last = `${PRIV}/welcome.md`): Promise<App> {
  const d = desktop(last);
  const app = createApp(d.bridge, messages);
  apps.push(app);
  await app.start();
  await vi.waitFor(() => expect(app.store.state.workspace.tree.roots.length).toBe(2));
  await vi.waitFor(() => expect(app.store.state.note).toMatchObject({ path: last, status: "ready" }));
  return app;
}
const sp = (app: App) => app.store.state.ui.spotlight;
type Item = { id: string; label: string; header?: boolean; disabled?: boolean; description?: string; state?: string };
const items = (app: App) => {
  const raw = (app.viewModels.select("vm.spotlight", app.store.state) as { items: Item[] }).items;
  let group = "";
  return raw.flatMap((i) => (i.header ? ((group = i.label), []) : [{ ...i, group }]));
};
async function type(app: App, value: string) {
  await app.commands.run("spotlight.setQuery", { value });
  await vi.waitFor(() => expect(sp(app)).toMatchObject({ busy: false, answered: answerKey(sp(app)) }));
}
const words = (key: string) => (messages[key] ?? key).replace(/\{platform, select, macos \{([^}]*)\} other \{([^}]*)\}\}/, "$2");
const GROUP: Record<string, string> = { selection: "This selection", note: "This note", project: "This project", app: "App" };

/** Puts the app in the context the action is listed for: a selection, signed in or out. */
function contextFor(app: App, e: CatalogEntry) {
  app.store.update((s: AppState) => ({
    ...s,
    account: { ...s.account, login: e.id === "account.signOut" ? "octo" : "" },
    ui: { ...s.ui, format: { ...s.ui.format, selection: e.anchor === "selection", toolbar: false } },
  }));
}

/** What each action changes that the person sees, where this test app can show it. */
const OUTCOMES: Record<string, (s: AppState, before: AppState) => boolean> = {
  "settings.open": (s) => s.ui.settings.open,
  "project.settings": (s) => s.ui.settings.open && s.ui.settings.section === "project",
  "project.rename": (s) => s.ui.settings.open && s.ui.settings.section === "project",
  "ai.connect": (s) => s.ui.settings.open && s.ui.settings.section === "ai",
  "shortcuts.open": (s) => s.ui.shortcuts.open,
  "toolbar.customize": (s) => s.ui.toolbarCustomize.open,
  "theme.manager.open": (s) => s.ui.theme.open,
  "appearance.light": (s) => s.appearance.mode === "light",
  "appearance.dark": (s) => s.appearance.mode === "dark",
  "appearance.system": (s) => s.appearance.mode === "system",
  "focus.toggle": (s, b) => s.focusMode !== b.focusMode,
  "files.open": (s) => s.ui.files.open,
  "find.allNotes": (s) => s.ui.findAll.open,
  "note.reveal": (s) => s.ui.files.open && s.ui.files.selection.focus.endsWith("welcome.md"),
  "note.rename": (s) => s.ui.files.edit?.kind === "rename",
  "note.move": (s) => s.ui.files.move.open,
  // Files deletes into Recently deleted, with Undo (D-94): the note leaves the list, or Files asks first.
  "note.delete": (s) => Boolean(s.ui.files.confirm) || !JSON.stringify(s.workspace.tree).includes("welcome.md"),
  "note.makePublic": (s) => Boolean(s.ui.files.confirm),
  "note.newIn": (s) => s.ui.files.newNote.open,
  "note.new": (s, b) => s.note.path !== b.note.path,
  "files.newFolder": (s) => s.ui.files.edit?.kind === "newFolder",
  "feedback.open": (s) => s.ui.feedback.open,
};

describe("ACT-07, ACT-16: the catalogue's own rules", () => {
  it("has unique labels, names objects when a verb repeats, and gives each action a proof and a pointer path", async () => {
    const app = await started();
    const problems = catalogProblems(CATALOG, (c) => app.commands.has(c), words, (k) => (messages[k] ?? "").split(/\s+/).filter(Boolean));
    expect(problems).toEqual([]);
    for (const e of CATALOG) {
      expect(messages[e.label], e.id).toBeTruthy();
      expect(messages[`${e.label}.outcome`], e.id).toBeTruthy();
      expect(e.proof, e.id).toMatch(/(?:actions-proof\.test|ofb-insert-blocks\.spec)\.ts/);
      expect(ANCHORS).toContain(e.anchor);
    }
    // Look-alikes (D8) are listed for review; each pair differs past its verb.
    for (const [a, b] of lookAlikes(CATALOG, words)) expect(words(CATALOG.find((e) => e.id === a)!.label)).not.toBe(words(CATALOG.find((e) => e.id === b)!.label));
  });
  it("catches a duplicate label, a missing command, a missing proof and a bare shared verb", () => {
    const base = CATALOG[0]!;
    const bad: CatalogEntry[] = [
      { ...base, id: "a", label: "x.one" }, { ...base, id: "b", label: "x.one" },
      { ...base, id: "c", label: "x.two", steps: [["no.such"]] }, { ...base, id: "d", label: "x.three", proof: " " },
      { ...base, id: "e", label: "x.four", alsoIn: [] },
    ];
    const words2: Record<string, string> = { "x.one": "Share", "x.two": "Share folder", "x.three": "Delete", "x.four": "Delete it" };
    const problems = catalogProblems(bad, (c) => c !== "no.such", (k) => words2[k] ?? k);
    expect(problems.join("\n")).toMatch(/label "Share" is also a's/);
    expect(problems.join("\n")).toMatch(/c: no command no\.such/);
    expect(problems.join("\n")).toMatch(/d: no proof/);
    expect(problems.join("\n")).toMatch(/e: no pointer path/);
    expect(problems.join("\n")).toMatch(/its verb is shared/);
  });
});

describe("ACT-02: every catalogued action runs from Actions", () => {
  for (const e of CATALOG) {
    it(e.id, async () => {
      // An action for public notes is proven on one.
      const app = await started(e.id === "note.copyPublicLink" ? `${PUB}/essays/on-focus.md` : undefined);
      contextFor(app, e);
      const ran: string[] = [];
      const off = app.commands.onRun((id, error) => { if (!error) ran.push(id); });
      const before = app.store.state;
      await app.commands.run("spotlight.open");
      await type(app, words(e.label));
      const row = items(app).find((i) => i.id.endsWith(`:${e.id}`) && i.label === words(e.label));
      expect(row, `${e.id} is listed when its anchor is present`).toBeTruthy();
      expect(row!.group === GROUP[e.anchor] || row!.group === "Top hit", `${e.id} is in ${GROUP[e.anchor]}`).toBe(true);
      if (row!.disabled) {
        // Unavailable here (this test app lacks what it needs): it says why, and nothing runs.
        expect(row!.description, `${e.id} says why`).toBeTruthy();
        await app.commands.run("spotlight.choose", { id: row!.id });
        expect(ran.filter((id) => e.steps.some(([c]) => c === id))).toEqual([]);
        off();
        return;
      }
      await app.commands.run("spotlight.choose", { id: row!.id });
      await vi.waitFor(() => expect(ran).toEqual(expect.arrayContaining(e.steps.map(([c]) => c))));
      // Its steps ran in order, and Actions closed before its destination took over (SPT-10).
      const order = e.steps.map(([c]) => ran.indexOf(c));
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(sp(app).open).toBe(false);
      const outcome = OUTCOMES[e.id];
      if (outcome) await vi.waitFor(() => expect(outcome(app.store.state, before), `${e.id}'s outcome shows`).toBe(true));
      off();
    });
  }
});

describe("ACT-05, ACT-08: anchors decide what's listed", () => {
  it("hides selection actions without a selection, and shows them first with one", async () => {
    const app = await started();
    await app.commands.run("spotlight.open");
    await type(app, "bold");
    expect(items(app).some((i) => i.label === "Bold")).toBe(false);
    await app.commands.run("spotlight.setOpen", { open: false });
    await app.commands.run("format.setState", { selection: true, toolbar: false });
    await app.commands.run("spotlight.open");
    const groups = items(app).map((i) => i.group).filter((g, i, all) => all.indexOf(g) === i);
    expect(groups.filter((g) => g !== "Recent")[0]).toBe("This selection");
    expect(items(app).filter((i) => i.group === "This selection").length).toBeLessThanOrEqual(4);
  });
  it("> browses every action, with what an absent anchor needs", async () => {
    const app = await started();
    await app.commands.run("spotlight.commands");
    await vi.waitFor(() => expect(items(app).length).toBeGreaterThan(20));
    const bold = items(app).find((i) => i.label === "Bold")!;
    expect(bold).toMatchObject({ disabled: true, description: "Select text first", group: "This selection" });
    expect(new Set(items(app).map((i) => i.group))).toEqual(new Set(["This selection", "This note", "This project", "App"]));
  });
  it("blocks Publish on a private note and lists Make this note public next", async () => {
    const app = await started();
    await app.commands.run("spotlight.open");
    await type(app, "publish");
    const list = items(app);
    const at = list.findIndex((i) => i.label === "Publish this note…");
    expect(list[at]).toMatchObject({ disabled: true, description: "Make this note public first" });
    expect(list[at + 1]?.label).toBe("Make this note public…");
  });
  it("refuses an action on a note that changed since Actions opened, and keeps the query", async () => {
    const app = await started();
    await app.commands.run("spotlight.open");
    await type(app, "show this note in files");
    const row = items(app).find((i) => i.label === "Show this note in Files")!;
    await app.commands.run("files.reveal", { path: `${PRIV}/ideas.md` }).then(() => app.commands.run("files.openItem"));
    await vi.waitFor(() => expect(app.store.state.note).toMatchObject({ path: `${PRIV}/ideas.md`, status: "ready" }));
    await app.commands.run("spotlight.choose", { id: row.id });
    expect(sp(app)).toMatchObject({ open: true, query: "show this note in files" });
    expect(app.store.state.ui.toasts.at(-1)?.message).toBe(messages["actions.stale"]);
  });
  it("never lists a step from inside a dialog or a duplicate label", async () => {
    const app = await started();
    await app.commands.run("spotlight.commands");
    await vi.waitFor(() => expect(items(app).length).toBeGreaterThan(20));
    const labels = items(app).map((i) => i.label);
    for (const step of ["Retry", "Cancel", "Next", "Back", "Save the name", "Got it", "Dismiss", "Lock", "Reset demo", "Open in new window"]) expect(labels).not.toContain(step);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
