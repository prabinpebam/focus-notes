/**
 * Custom keybindings in the app (WP-8.3, KEY-07, D-170): `keybindings.json` read through the shell,
 * applied over the defaults in the command registry, and read again whenever the file changes. Its
 * problems and the conflicts it makes show in Settings → Keyboard and the cheat sheet.
 */
import type { AppState } from "./app.ts";
import type { PlatformBridge } from "./bridge.ts";
import { formatChord, type CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { keyConflicts, parseKeybindings, type KeyConflict, type KeybindingProblem } from "./keybindings.ts";

export interface KeybindingsState { loaded: boolean; version: number; applied: number; problems: KeybindingProblem[]; conflicts: KeyConflict[]; /** Reset asks first: it replaces the file. */ confirmingReset?: boolean }
export const KEYBINDINGS_NONE: KeybindingsState = { loaded: false, version: 0, applied: 0, problems: [], conflicts: [] };
export interface KeybindingsBridge {
  /** The file's text, or undefined when there's none. */
  load(): Promise<string | undefined>;
  /** The file changed (saved in an editor, or reset). */
  onChange(listener: () => void): () => void;
  /** Opens the file in the system's editor, making it (`[]`) when it's missing. */
  edit(): Promise<void>;
  /** Back to the defaults: the file becomes `[]`. */
  reset(): Promise<void>;
}

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  toast: (message: string, opts?: { tone?: "info" | "error" }) => number;
}

export function registerKeybindings(ctx: Ctx) {
  const { store, commands, viewModels, catalog, bridge } = ctx;
  const kb = bridge.keybindings;
  const title = (id: string) => (commands.has(id) ? catalog.format(commands.describe(id).title) : id);

  /** The file's text and the bindings' shape as last applied: an unchanged file changes nothing (PRF-14). */
  let last: { text: string | undefined; shape: string } | undefined;
  const shapeOf = (b: ReturnType<typeof parseKeybindings>["bindings"]) =>
    JSON.stringify([[...b.add].sort(), [...b.remove].map(([id, c]) => [id, [...c].sort()]).sort()]);

  async function load(): Promise<void> {
    if (!kb) return;
    const text = await kb.load().catch(() => undefined);
    // The same text as last time: nothing to do, and the store isn't touched.
    if (last && last.text === text) return;
    const parsed = parseKeybindings(text, bridge.platform, (id) => commands.has(id));
    const shape = shapeOf(parsed.bindings);
    // The keys themselves changed: only then do the registry, the editor's keymap (by version), and the conflicts follow.
    const keysChanged = shape !== (last?.shape ?? shapeOf({ add: new Map(), remove: new Map() }));
    last = { text, shape };
    if (keysChanged) commands.setUserBindings(parsed.bindings);
    const conflicts = keysChanged ? keyConflicts(commands.bindings(), bridge.platform, commands.userBound()) : store.state.keybindings.conflicts;
    store.update((s) => ({
      ...s,
      keybindings: { loaded: true, version: s.keybindings.version + (keysChanged ? 1 : 0), applied: parsed.applied, problems: parsed.problems, conflicts, confirmingReset: s.keybindings.confirmingReset },
    }));
  }
  kb?.onChange(() => void load());

  // The system's own reason, when it gives one, is part of the message (an editor that isn't there).
  const reasonOf = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "").trim().slice(0, 200) : "");
  commands.register({
    id: "keybindings.edit", title: "command.keybindings.edit", enabled: () => Boolean(kb),
    run: async () => {
      await kb?.edit().catch((e: unknown) => {
        const reason = reasonOf(e);
        ctx.toast(reason ? catalog.format("keyboard.editFailedWhy", { reason }) : catalog.format("keyboard.editFailed"), { tone: "error" });
      });
    },
  });
  const setConfirming = (confirmingReset: boolean) => store.update((s) => ({ ...s, keybindings: { ...s.keybindings, confirmingReset } }));
  // Reset replaces keybindings.json, so it asks first (review of 8f4e900, LOW #5).
  commands.register({
    id: "keybindings.reset", title: "command.keybindings.reset", enabled: (s) => Boolean(kb) && (s.keybindings.applied > 0 || s.keybindings.problems.length > 0),
    run: () => setConfirming(true),
  });
  commands.register({ id: "keybindings.resetCancel", title: "command.keybindings.resetCancel", run: () => setConfirming(false) });
  commands.register({
    id: "keybindings.resetConfirm", title: "command.keybindings.reset", enabled: (s) => Boolean(kb) && Boolean(s.keybindings.confirmingReset),
    run: async () => {
      setConfirming(false);
      await kb?.reset().then(() => ctx.toast(catalog.format("keyboard.resetDone")), () => ctx.toast(catalog.format("keyboard.editFailed"), { tone: "error" }));
      await load();
    },
  });

  const problemText = (p: KeybindingProblem) => catalog.format("keyboard.problem", {
    position: p.position, command: p.command ?? "none", reason: catalog.format(`keyboard.reason.${p.reason}`),
  });
  /** "Ctrl+Shift+S runs Focus mode, not Save to cloud": the first command is the one that runs. */
  const conflictText = (c: KeyConflict) => catalog.format("keyboard.conflict", {
    keys: formatChord(c.chord, bridge.platform), first: title(c.ids[0]!), others: c.ids.slice(1).map(title).join(", "),
  });

  viewModels.register({
    id: "vm.keyboard",
    schema: {
      type: "object",
      properties: {
        available: { type: "boolean" }, status: { type: "string" }, confirmingReset: { type: "boolean" },
        problems: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } } } },
        conflicts: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } } } },
      },
    },
    reads: ["keybindings"],
    select: (s) => {
      const k = s.keybindings;
      return {
        available: Boolean(kb),
        confirmingReset: Boolean(k.confirmingReset),
        status: catalog.format(k.applied ? "keyboard.status.some" : "keyboard.status.none", { count: k.applied }),
        problems: k.problems.map((p, i) => ({ id: `p${i}`, text: problemText(p) })),
        conflicts: k.conflicts.map((c, i) => ({ id: `c${i}`, text: conflictText(c) })),
      };
    },
  });

  return { load, conflictTexts: (s: AppState) => s.keybindings.conflicts.map(conflictText) };
}
