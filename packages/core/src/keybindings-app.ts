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

export interface KeybindingsState { loaded: boolean; version: number; applied: number; problems: KeybindingProblem[]; conflicts: KeyConflict[] }
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

  async function load(): Promise<void> {
    if (!kb) return;
    const text = await kb.load().catch(() => undefined);
    const parsed = parseKeybindings(text, bridge.platform, (id) => commands.has(id));
    commands.setUserBindings(parsed.bindings);
    const conflicts = keyConflicts(commands.bindings(), bridge.platform, commands.userBound());
    store.update((s) => ({ ...s, keybindings: { loaded: true, version: s.keybindings.version + 1, applied: parsed.applied, problems: parsed.problems, conflicts } }));
  }
  kb?.onChange(() => void load());

  commands.register({
    id: "keybindings.edit", title: "command.keybindings.edit", enabled: () => Boolean(kb),
    run: async () => { await kb?.edit().catch(() => ctx.toast(catalog.format("keyboard.editFailed"), { tone: "error" })); },
  });
  commands.register({
    id: "keybindings.reset", title: "command.keybindings.reset", enabled: (s) => Boolean(kb) && (s.keybindings.applied > 0 || s.keybindings.problems.length > 0),
    run: async () => {
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
        available: { type: "boolean" }, status: { type: "string" },
        problems: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } } } },
        conflicts: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } } } },
      },
    },
    reads: ["keybindings"],
    select: (s) => {
      const k = s.keybindings;
      return {
        available: Boolean(kb),
        status: catalog.format(k.applied ? "keyboard.status.some" : "keyboard.status.none", { count: k.applied }),
        problems: k.problems.map((p, i) => ({ id: `p${i}`, text: problemText(p) })),
        conflicts: k.conflicts.map((c, i) => ({ id: `c${i}`, text: conflictText(c) })),
      };
    },
  });

  return { load, conflictTexts: (s: AppState) => s.keybindings.conflicts.map(conflictText) };
}
