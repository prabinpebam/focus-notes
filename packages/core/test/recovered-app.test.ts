/**
 * Files → Recovered (QLT-06, D-190, D-221) against an in-memory shell: drafts a crash left that
 * couldn't go back in their notes show in Files only when there are some, each with where it was,
 * when, its length and until when it's kept; one opens read-only; Save as a new note… asks for a
 * folder (where it was, when that's still there), never takes another note's name, and deletes the
 * draft only once the note is written; Copy text copies it; Discard asks first. The browser has none.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, titleOfMarkdown, type PlatformBridge, type RecoveredDraft, type RecoveryBridge, type WorkspaceOp } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const PRIV = "/w/private/notes";
const PUB = "/w/notes";
const DAY = 86_400_000;
const AT = new Date(2026, 9, 20, 14, 5).getTime();

const draft = (id: string, path: string, text: string, extra: Partial<RecoveredDraft> = {}): RecoveredDraft & { text: string } => ({
  id, title: titleOfMarkdown(text) ?? "", where: path.slice("/w/".length, path.lastIndexOf("/")), path, at: AT, until: AT + 30 * DAY, chars: text.length, text, ...extra,
});

function setup(opts: { drafts?: (RecoveredDraft & { text: string })[]; files?: Record<string, string>; folders?: string[]; refuse?: string; recovery?: boolean; copy?: boolean } = {}) {
  const files: Record<string, string> = { [`${PRIV}/welcome.md`]: "# Welcome\n", ...opts.files };
  const folders = new Set(opts.folders ?? []);
  let drafts = [...(opts.drafts ?? [])];
  const calls: string[] = [];
  const copied: string[] = [];
  const recovery: RecoveryBridge = {
    keep: async () => {}, saved: async () => {}, discard: async () => {},
    found: async () => ({ matched: [], changed: [], recovered: drafts.length }),
    recovered: async () => drafts.map(({ text: _t, ...d }) => d),
    text: async (id) => {
      const d = drafts.find((x) => x.id === id);
      if (!d) throw new Error("notFound");
      return d.text;
    },
    remove: async (id) => { calls.push(`remove:${id}`); drafts = drafts.filter((d) => d.id !== id); },
    count: async () => drafts.length,
  };
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => { if (!(p in files)) throw new Error("missing"); return files[p]!; },
    writeNote: async (p, t) => void (files[p] = t),
    chooseNote: async () => undefined, newNotePath: async () => `${PRIV}/untitled.md`,
    defaultNotePath: async () => `${PRIV}/welcome.md`,
    loadAppState: async () => ({ version: 1, lastNotePath: `${PRIV}/welcome.md` }), saveAppState: async () => {},
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    ...(opts.copy === false ? {} : { copyText: async (t: string) => void copied.push(t) }),
    workspace: {
      info: async () => ({ folder: "/w", format: '{"formatVersion":1}' }),
      scan: async () => ({
        folder: "/w",
        roots: [{ id: "private", path: PRIV, readOnly: false }, { id: "public", path: PUB, readOnly: false }],
        entries: [...[...folders].map((path) => ({ path, kind: "folder" as const })), ...Object.entries(files).map(([path, text]) => ({ path, kind: "note" as const, title: titleOfMarkdown(text) ?? "" }))],
      }),
      writeFormat: async () => {},
      renameNote: async () => {},
      apply: async (ops: WorkspaceOp[]) => {
        for (const op of ops) {
          calls.push(`${op.op}:${"path" in op ? op.path : ""}`);
          if (op.op !== "create") continue;
          // The shell never writes over a file that's there (create is `wx`).
          if (opts.refuse || op.path in files) throw new Error(`refused ${opts.refuse ?? "taken"}`);
          files[op.path] = op.text;
        }
      },
      deleted: async () => [],
      onChange: () => () => {},
    },
    ...(opts.recovery === false ? {} : { recovery }),
  };
  return { bridge, files, calls, copied, drafts: () => drafts };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
async function started(f: ReturnType<typeof setup>) {
  const app = createApp(f.bridge, messages);
  await app.start();
  await done(app);
  return app;
}
const done = async (app: ReturnType<typeof createApp>) => { for (let i = 0; i < 8; i++) await settle(); await app.idle(); };
type DraftRow = { id: string; title: string; detail: string; until: string; focus: boolean };
type RecoveredVm = {
  available: boolean; open: boolean; listing: boolean; viewing: boolean; loading: boolean; footer: string; footerIcon: string; status: string; drafts: DraftRow[];
  draft: { id: string; title: string; detail: string; until: string; loading: boolean; ready: boolean; blocks: { text: string }[] };
};
const vm = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.recovered", app.store.state) as RecoveredVm;
const lastToast = (app: ReturnType<typeof createApp>) => app.store.state.ui.toasts.at(-1);

const IDEAS = draft("01JDRAFTIDEAS0000000000000", `${PRIV}/ideas/gone.md`, "---\nid: 01JNOTEID\n---\n# Lost ideas\n\nFirst thought.\n\nSecond thought.\n");
const OLD = draft("01JDRAFTOLD000000000000000", `${PUB}/old/essay.md`, "# Essay\n\nWords.\n", { at: AT - DAY, until: AT + 29 * DAY });

describe("QLT-06: Files → Recovered", () => {
  it("shows in Files only when there are drafts, with where each was, when, its length and until when it's kept", async () => {
    const empty = await started(setup());
    await empty.commands.run("files.open");
    expect(vm(empty)).toMatchObject({ available: false, open: false });
    expect(empty.commands.describe("files.showRecovered").enabled).toBe(false);

    const app = await started(setup({ drafts: [IDEAS, OLD], folders: [`${PRIV}/ideas`] }));
    await app.commands.run("files.open");
    expect(vm(app)).toMatchObject({ available: true, open: false, footer: "Recovered · 2", footerIcon: "document" });
    await app.commands.run("files.toggleRecovered");
    await done(app);
    const v = vm(app);
    expect(v).toMatchObject({ open: true, listing: true, viewing: false, footer: "Browse files", footerIcon: "folder", status: "2 drafts couldn't go back in their notes." });
    // In place of the tree, like Recently deleted.
    expect((app.viewModels.select("vm.deleted", app.store.state) as { closed: boolean }).closed).toBe(false);
    expect(v.drafts.map((d) => d.title)).toEqual(["Lost ideas", "Essay"]);
    expect(v.drafts[0]!.detail).toMatch(new RegExp(`^Was in “private/notes/ideas” · Oct 20, 2026 2:05\\sPM · ${IDEAS.text.length} characters$`));
    expect(v.drafts[0]!.until).toBe("Kept until Nov 19, 2026");
    expect(v.drafts.map((d) => d.focus)).toEqual([true, false]);
    await app.commands.run("files.toggleRecovered");
    expect(vm(app)).toMatchObject({ open: false, footer: "Recovered · 2" });
    expect((app.viewModels.select("vm.deleted", app.store.state) as { closed: boolean }).closed).toBe(true);
  });

  it("isn't there in the browser", async () => {
    const app = await started(setup({ recovery: false }));
    await app.commands.run("files.open");
    expect(app.commands.has("files.showRecovered")).toBe(false);
    expect(vm(app).available).toBe(false);
  });

  it("the launch toast's Review opens Recovered; its steps stay out of Spotlight", async () => {
    const app = await started(setup({ drafts: [IDEAS] }));
    expect(lastToast(app)).toMatchObject({ message: "Kept 1 draft that couldn't go back in its note.", action: { command: "recovery.review" } });
    await app.commands.run("recovery.review");
    await done(app);
    expect(app.store.state.ui.files.open).toBe(true);
    expect(vm(app)).toMatchObject({ open: true, listing: true });
    await app.commands.run("spotlight.open");
    await app.commands.run("spotlight.setQuery", { value: "recovered" });
    const s = app.viewModels.select("vm.spotlight", app.store.state) as { groups?: { items: { id: string }[] }[]; items?: { id: string }[] };
    const ids = JSON.stringify(s);
    expect(ids).toContain("files.showRecovered");
    expect(ids).not.toMatch(/files\.(open|save|copy|discard|hide|toggle|close)Recovered/);
  });

  it("opens a draft read-only, without its front matter's note ID; back leads to the list with it focused", async () => {
    const app = await started(setup({ drafts: [OLD, IDEAS] }));
    await app.commands.run("files.showRecovered");
    await done(app);
    await app.commands.run("files.openRecovered", { id: IDEAS.id });
    await done(app);
    const v = vm(app);
    expect(v).toMatchObject({ listing: false, viewing: true, draft: { id: IDEAS.id, title: "Lost ideas", loading: false, ready: true, until: "Kept until Nov 19, 2026" } });
    expect(v.draft.blocks.map((b) => b.text)).toEqual(["# Lost ideas", "First thought.", "Second thought."]);
    await app.commands.run("files.closeRecovered");
    expect(vm(app).drafts.find((d) => d.focus)?.id).toBe(IDEAS.id);
  });

  it("Save as a new note… picks where it was, writes a new note under a free name, then deletes the draft and opens the note", async () => {
    const f = setup({ drafts: [IDEAS], folders: [`${PRIV}/ideas`, `${PRIV}/archive`, `${PUB}/essays`], files: { [`${PRIV}/ideas/lost-ideas.md`]: "# Lost ideas\n\nAnother.\n" } });
    const app = await started(f);
    await app.commands.run("files.showRecovered");
    await done(app);
    await app.commands.run("files.openRecovered", { id: IDEAS.id });
    await done(app);
    await app.commands.run("files.saveRecovered");
    const move = app.viewModels.select("vm.move", app.store.state) as { open: boolean; title: string; activeId: string; items: { id: string }[] };
    expect(move).toMatchObject({ open: true, title: "Save “Lost ideas” as a new note in…", activeId: `${PRIV}/ideas` });
    // Its own section only: saving never changes who can read it.
    expect(move.items.map((i) => i.id).sort()).toEqual([PRIV, `${PRIV}/archive`, `${PRIV}/ideas`].sort());
    expect(f.calls.filter((c) => c.startsWith("remove:"))).toEqual([]);
    await app.commands.run("move.chooseActive");
    await done(app);
    const created = Object.keys(f.files).filter((p) => p.startsWith(`${PRIV}/ideas/`) && p !== `${PRIV}/ideas/lost-ideas.md`);
    expect(created).toHaveLength(1);
    expect(f.files[`${PRIV}/ideas/lost-ideas.md`]).toBe("# Lost ideas\n\nAnother.\n");
    expect(f.files[created[0]!]).toBe("# Lost ideas\n\nFirst thought.\n\nSecond thought.\n");
    expect(f.calls.indexOf(`create:${created[0]}`)).toBeLessThan(f.calls.indexOf(`remove:${IDEAS.id}`));
    expect(f.drafts()).toEqual([]);
    expect(app.store.state.note.path).toBe(created[0]);
    expect(lastToast(app)?.message).toBe("Saved “Lost ideas” as a new note in “ideas”.");
    // None left: Recovered goes, and the tree is back.
    expect(vm(app)).toMatchObject({ available: false, open: false });
  });

  it("saves at the top of its section when its folder is gone, matching paths as Windows does", async () => {
    const gone = draft("01JDRAFTGONEFOLDER00000000", "/W/Private/Notes/vanished/a.md", "# A\n\nText.\n");
    const app = await started(setup({ drafts: [gone], folders: [`${PRIV}/archive`] }));
    await app.commands.run("files.showRecovered");
    await done(app);
    await app.commands.run("files.saveRecovered", { id: gone.id });
    const move = app.viewModels.select("vm.move", app.store.state) as { activeId: string; items: { id: string }[] };
    expect(move.activeId).toBe(PRIV);
    expect(move.items.map((i) => i.id).sort()).toEqual([PRIV, `${PRIV}/archive`].sort());
  });

  it("keeps the draft when the note can't be written, and says so", async () => {
    const f = setup({ drafts: [IDEAS], refuse: "failed" });
    const app = await started(f);
    await app.commands.run("files.showRecovered");
    await done(app);
    await app.commands.run("files.saveRecovered", { id: IDEAS.id });
    await app.commands.run("move.choose", { id: PRIV });
    await done(app);
    expect(f.calls.filter((c) => c.startsWith("remove:"))).toEqual([]);
    expect(f.drafts()).toHaveLength(1);
    expect(lastToast(app)).toMatchObject({ tone: "error", message: "Couldn't save “Lost ideas” as a new note: the file system refused it, and nothing was changed. The draft is still here." });
    expect(vm(app)).toMatchObject({ open: true, drafts: [{ id: IDEAS.id }] });
  });

  it("Copy text puts the draft's text on the clipboard", async () => {
    const f = setup({ drafts: [OLD] });
    const app = await started(f);
    await app.commands.run("files.showRecovered");
    await done(app);
    await app.commands.run("files.openRecovered", { id: OLD.id });
    await done(app);
    await app.commands.run("files.copyRecovered");
    await done(app);
    expect(f.copied).toEqual([OLD.text]);
    expect(lastToast(app)?.message).toBe("Copied the text of “Essay”.");
    expect(f.drafts()).toHaveLength(1);
  });

  it("Discard asks first, then deletes the draft; the list says what's left", async () => {
    const f = setup({ drafts: [IDEAS, OLD] });
    const app = await started(f);
    await app.commands.run("files.showRecovered");
    await done(app);
    await app.commands.run("files.openRecovered", { id: OLD.id });
    await done(app);
    await app.commands.run("files.discardRecovered");
    const confirm = app.viewModels.select("vm.confirm", app.store.state) as { open: boolean; title: string; message: string; confirmLabel: string; danger: boolean };
    expect(confirm).toMatchObject({
      open: true, danger: true, title: "Discard this draft?", confirmLabel: "Discard draft",
      message: "“Essay” and its 16 characters will be deleted from this computer. This can't be undone.",
    });
    expect(f.calls).not.toContain(`remove:${OLD.id}`);
    await app.commands.run("files.confirm");
    await done(app);
    expect(f.calls).toContain(`remove:${OLD.id}`);
    expect(lastToast(app)?.message).toBe("Discarded “Essay”.");
    expect(vm(app)).toMatchObject({ open: true, listing: true, status: "1 draft couldn't go back in its note.", drafts: [{ id: IDEAS.id }] });
  });

  it("a draft gone meanwhile says so, and the list shows what's left", async () => {
    const f = setup({ drafts: [IDEAS, OLD] });
    const app = await started(f);
    await app.commands.run("files.showRecovered");
    await done(app);
    await f.bridge.recovery!.remove(IDEAS.id);
    await app.commands.run("files.openRecovered", { id: IDEAS.id });
    await done(app);
    expect(lastToast(app)).toMatchObject({ tone: "error", message: "“Lost ideas” isn't there anymore. It may have been saved or discarded in another window." });
    expect(vm(app)).toMatchObject({ listing: true, drafts: [{ id: OLD.id }] });
  });
});
