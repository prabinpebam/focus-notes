/**
 * New notes without a private repository in the app (D-158, SHR-01): a new note there shows the
 * *Public · not backed up* pill and a placeholder that says it's public, and before its first
 * backup (Save to cloud, or switching away) the app asks once: Make it public, or Keep it on this
 * computer only. With a private repository nothing changes: new notes are private.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, NO_HELD, titleOfMarkdown, type HeldNotes, type PlatformBridge, type SyncReport } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const PUB = "/w/notes";
const PRIV = "/w/private/notes";
const idle: SyncReport = { git: true, state: "idle", waiting: 0 };

function setup(opts: { privateRoot?: boolean } = {}) {
  const files: Record<string, string> = { [`${PUB}/hello.md`]: "# Hello\n" };
  let held: HeldNotes = NO_HELD;
  const answers: [string, string][] = [];
  const saves: string[] = [];
  let n = 0;
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => files[p] ?? "",
    writeNote: async (p, c) => { files[p] = c; },
    chooseNote: async () => undefined,
    // As the shell does (D-158): without a private root, a new note's path is held before it's written.
    newNotePath: async () => {
      const p = opts.privateRoot ? `${PRIV}/Untitled ${++n}.md` : `${PUB}/Untitled ${++n}.md`;
      if (!opts.privateRoot) held = { ...held, waiting: [...held.waiting, p] };
      return p;
    },
    defaultNotePath: async () => `${PUB}/hello.md`,
    loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    sync: {
      now: async (r) => { saves.push(r); return idle; },
      status: async () => idle,
      onStatus: () => () => {},
      held: async () => held,
      answerHeld: async (p, choice) => {
        answers.push([p, choice]);
        held = { waiting: held.waiting.filter((x) => x !== p), local: choice === "local" ? [...held.local.filter((x) => x !== p), p] : held.local.filter((x) => x !== p) };
        return held;
      },
    },
    workspace: {
      info: async () => ({ folder: "/w", format: '{"formatVersion":1}' }),
      scan: async () => ({
        folder: "/w",
        roots: [...(opts.privateRoot ? [{ id: "private" as const, path: PRIV, readOnly: false }] : []), { id: "public", path: PUB, readOnly: false }],
        entries: Object.entries(files).map(([path, text]) => ({ path, kind: "note" as const, title: titleOfMarkdown(text) ?? "" })),
      }),
      writeFormat: async () => {},
      renameNote: async () => {},
      apply: async () => {},
      onChange: () => () => {},
    },
  };
  return { bridge, files, answers, saves };
}
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };
async function started(f: ReturnType<typeof setup>) {
  const app = createApp(f.bridge, messages);
  await app.start();
  await settle();
  return app;
}
type HeldVm = { pill: boolean; pillText: string; placeholder: string; open: boolean; title: string; local: boolean };
const vm = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.held", app.store.state) as HeldVm;

describe("D-158: a new note in a workspace without a private repository", () => {
  it("is marked Public from creation, and its empty note says so", async () => {
    const f = setup();
    const app = await started(f);
    expect(vm(app)).toMatchObject({ pill: false, open: false });
    expect(vm(app).placeholder).toMatch(/^Start writing/);
    await app.commands.run("note.new");
    await settle();
    expect(app.store.state.note.path).toBe(`${PUB}/Untitled 1.md`);
    expect(vm(app)).toMatchObject({ pill: true, pillText: "Public · not backed up", open: false });
    expect(vm(app).placeholder).toBe("Public note · start writing, type / for blocks, or press Ctrl+/");
  });

  it("Save to cloud asks once before its first backup; Keep it on this computer only answers for good", async () => {
    const f = setup();
    const app = await started(f);
    await app.commands.run("note.new");
    await settle();
    const note = `${PUB}/Untitled 1.md`;
    await app.commands.run("note.save");
    await settle();
    expect(vm(app)).toMatchObject({ open: true, title: "Where should “Untitled 1” live?", local: false });
    await app.commands.run("held.answer", { choice: "local" });
    await settle();
    expect(f.answers).toEqual([[note, "local"]]);
    expect(vm(app)).toMatchObject({ open: false, pill: true, pillText: "On this computer only" });
    expect(app.store.state.announcement.text).toBe("“Untitled 1” stays on this computer only.");
    // Answered: saving again doesn't ask.
    await app.commands.run("note.save");
    await settle();
    expect(vm(app).open).toBe(false);
    // The pill offers Make it public again.
    await app.commands.run("held.ask");
    expect(vm(app)).toMatchObject({ open: true, local: true });
    await app.commands.run("held.answer", { choice: "public" });
    await settle();
    expect(f.answers.at(-1)).toEqual([note, "public"]);
    expect(vm(app)).toMatchObject({ open: false, pill: false });
  });

  it("switching away asks once per session; dismissed, it waits, and the pill asks again", async () => {
    const f = setup();
    const app = await started(f);
    await app.commands.run("note.new");
    await settle();
    const note = `${PUB}/Untitled 1.md`;
    await app.commands.run("note.openPath", { path: `${PUB}/hello.md` }).catch(() => {});
    await app.commands.run("files.activate", { id: `${PUB}/hello.md` });
    await settle();
    expect(vm(app)).toMatchObject({ open: true, title: "Where should “Untitled 1” live?" });
    await app.commands.run("held.setOpen", { open: false });
    expect(vm(app).open).toBe(false);
    expect(f.answers).toEqual([]);
    // Back and away again: not asked a second time this session.
    await app.commands.run("files.activate", { id: note });
    await app.commands.run("files.activate", { id: `${PUB}/hello.md` });
    await settle();
    expect(vm(app).open).toBe(false);
    await app.commands.run("files.activate", { id: note });
    await app.commands.run("held.ask");
    expect(vm(app).open).toBe(true);
    await app.commands.run("held.answer", { choice: "public" });
    await settle();
    expect(f.answers).toEqual([[note, "public"]]);
  });

  it("with a private repository nothing is held: new notes are private, with no pill and no question", async () => {
    const f = setup({ privateRoot: true });
    const app = await started(f);
    await app.commands.run("note.new");
    await settle();
    expect(app.store.state.note.path?.startsWith(PRIV)).toBe(true);
    await app.commands.run("note.save");
    await settle();
    expect(vm(app)).toMatchObject({ pill: false, open: false });
    expect(vm(app).placeholder).toMatch(/^Start writing/);
  });
});
