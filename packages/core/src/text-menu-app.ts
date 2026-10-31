/**
 * The right-click menu in text, drawn by the app on Windows and Linux (D-204, EDT-14): the shell
 * sends the menu it decided on (the OS spell checker's suggestions, Add to dictionary, and the edit
 * actions), this shows it in the theme, and a chosen item goes back to the shell, which acts on it.
 * On macOS the menu is the system's own and there's no bridge.
 */
import type { AppState } from "./app.ts";
import type { PlatformBridge } from "./bridge.ts";
import { formatChord, shortcutFor, type CommandRegistry, type Platform } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { parseTextMenu, textMenuItemId, TEXT_MENU_HISTORY, type TextMenuEdit, type TextMenuModel } from "./text-menu.ts";

/** The shell's side of the drawn menu. */
export interface TextMenuBridge {
  /** A new menu to show, or (the same id) its suggestions filled in. Unchecked: it's parsed here. */
  onOpen(listener: (model: unknown) => void): () => void;
  /** The item chosen in menu `id`; the shell checks it against the menu it sent. */
  choose(id: number, item: string): void;
  /** Menu `id` was dismissed: the shell forgets it, so nothing can be chosen from it any more. */
  closed?(id: number): void;
  /** The app draws the menu (Windows and Linux); on macOS it's the system's. */
  drawn: boolean;
  /** Undo or Redo chosen in either menu: the shell asks the page to run the editor's own history. */
  onRun(listener: (command: unknown) => void): () => void;
}

export interface TextMenuState {
  /** Bumped to open the menu at its place. */
  request: number;
  /** The latest menu; kept once it closes, so its late suggestions don't open it again. */
  model?: TextMenuModel;
  open: boolean;
}
export const TEXT_MENU_CLOSED: TextMenuState = { request: 0, open: false };

/** The edit actions' keys, as the system binds them; Undo, Redo and Paste as plain text take the app's own bindings. */
const CHORDS: Partial<Record<TextMenuEdit, string>> = { cut: "Mod+X", copy: "Mod+C", paste: "Mod+V", delete: "Delete", selectAll: "Mod+A" };
const OWN: Partial<Record<TextMenuEdit, string>> = { undo: "edit.undo", redo: "edit.redo", pasteAsPlainText: "keys.pastePlain" };
/** Windows' emoji panel: Win+. (the system's key, not the app's). */
const EMOJI_CHORD = "Meta+.";

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  /** A polite announcement (the suggestions that came after the menu opened). */
  announce: (text: string) => void;
}

/** The model's items as the menu's sections, split at its separators, in the app's words. */
export function textMenuSections(model: TextMenuModel | undefined, catalog: MessageCatalog, platform: Platform, commands?: Pick<CommandRegistry<AppState>, "has" | "describe" | "shortcut">, history = { undo: true, redo: true }) {
  if (!model) return [];
  const chordOf = (role: TextMenuEdit): string | undefined => {
    const own = OWN[role];
    if (!own) return CHORDS[role];
    if (commands?.has(own)) return commands.describe(own).shortcut;
    return shortcutFor(commands?.shortcut(own), platform) ?? (role === "pasteAsPlainText" ? "Mod+Shift+V" : undefined);
  };
  const sections: { id: string; items: { id: string; label: string; shortcut?: string; disabled?: boolean; loading?: boolean }[] }[] = [];
  let items: (typeof sections)[number]["items"] = [];
  const close = () => {
    if (items.length) sections.push({ id: `textMenu${sections.length}`, items });
    items = [];
  };
  model.entries.forEach((e, i) => {
    const id = textMenuItemId(model.entries, i);
    if (e.kind === "separator" || !id) return close();
    if (e.kind === "suggestion") items.push({ id, label: e.word });
    else if (e.kind === "learn") items.push({ id, label: catalog.format("textMenu.learn") });
    else if (e.kind === "checking") items.push({ id, label: catalog.format("textMenu.checking"), disabled: true, loading: true });
    else if (e.kind === "noSuggestions") items.push({ id, label: catalog.format("textMenu.noSuggestions"), disabled: true });
    else if (e.kind === "edit") {
      const chord = chordOf(e.role);
      const enabled = e.enabled && (e.role === "undo" ? history.undo : e.role === "redo" ? history.redo : true);
      items.push({ id, label: catalog.format(`textMenu.${e.role}`), ...(chord ? { shortcut: formatChord(chord, platform) } : {}), ...(enabled ? {} : { disabled: true }) });
    } else if (e.kind === "rewrite") {
      const chord = commands?.has("rewrite.open") ? commands.describe("rewrite.open").shortcut : undefined;
      items.push({ id, label: catalog.format("textMenu.rewrite"), ...(chord ? { shortcut: chord } : {}) });
    } else if (e.kind === "emoji") items.push({ id, label: catalog.format("textMenu.emoji"), ...(platform === "windows" ? { shortcut: formatChord(EMOJI_CHORD, platform) } : {}) });
    else if (e.kind === "copyLink" || e.kind === "openLink") items.push({ id, label: catalog.format(`textMenu.${e.kind}`) });
    // lookUp and speech are macOS's, and macOS shows its own menu.
  });
  close();
  return sections;
}

export function registerTextMenu({ store, commands, viewModels, catalog, bridge, announce }: Ctx) {
  const set = (t: TextMenuState) => store.update((s) => ({ ...s, textMenu: t }));
  commands.register<{ id?: unknown }>({
    id: "textMenu.choose", title: "command.textMenu.choose",
    run: ({ id }) => {
      const t = store.state.textMenu;
      const model = t.model;
      if (!model || !t.open || typeof id !== "string") return;
      // Only what the menu offers; the shell checks again.
      if (!model.entries.some((_e, i) => textMenuItemId(model.entries, i) === id)) return;
      set({ ...t, open: false });
      // Rewrite… is the page's own: the shell forgets the menu, and the dialog opens on the selection.
      if (id === "rewrite") {
        bridge.textMenu?.closed?.(model.id);
        void commands.run("rewrite.open").catch(() => {});
        return;
      }
      bridge.textMenu?.choose(model.id, id);
    },
  });
  commands.register({
    id: "textMenu.close", title: "command.textMenu.close",
    run: () => {
      const t = store.state.textMenu;
      if (!t.open) return;
      set({ ...t, open: false });
      if (t.model) bridge.textMenu?.closed?.(t.model.id);
    },
  });

  const ITEM = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const }, shortcut: { type: "string" as const }, disabled: { type: "boolean" as const } } };
  const SECTIONS = { type: "array" as const, items: { type: "object" as const, properties: { id: { type: "string" as const }, items: { type: "array" as const, items: ITEM } } } };
  let memo: { key: TextMenuState; undo: boolean; redo: boolean; value: Record<string, unknown> } | undefined;
  viewModels.register({
    id: "vm.textMenu",
    reads: ["textMenu", "ui"],
    schema: {
      type: "object",
      properties: {
        available: { type: "boolean", description: "The app draws the menu (Windows and Linux)." },
        sections: SECTIONS,
        request: { type: "number" },
        x: { type: "number" },
        y: { type: "number" },
      },
    },
    select: (s) => {
      const t = s.textMenu;
      const undo = s.ui.format.canUndo;
      const redo = s.ui.format.canRedo;
      if (memo?.key === t && memo.undo === undo && memo.redo === redo) return memo.value;
      const value = { available: Boolean(bridge.textMenu?.drawn), sections: textMenuSections(t.model, catalog, bridge.platform, commands, { undo, redo }), request: t.request, x: t.model?.x ?? 0, y: t.model?.y ?? 0 };
      memo = { key: t, undo, redo, value };
      return value;
    },
  });

  return {
    start() {
      // Undo and Redo from the menu (either platform's) run the editor's history, as the keys do.
      bridge.textMenu?.onRun((command) => {
        if (typeof command !== "string" || !Object.values(TEXT_MENU_HISTORY).includes(command) || !commands.has(command)) return;
        void commands.run(command).catch(() => {});
      });
      bridge.textMenu?.onOpen((raw) => {
        const model = parseTextMenu(raw);
        if (!model) return;
        const t = store.state.textMenu;
        // The same menu again: its suggestions came; it stays open where it is (and closed, if it was closed).
        if (t.model?.id === model.id) {
          if (!t.open) return;
          set({ ...t, model });
          // The suggestions came after the menu opened: said politely, as focus moves to the first one.
          const was = t.model.entries.some((e) => e.kind === "checking");
          const spelling = model.entries.some((e) => e.kind === "suggestion" || e.kind === "noSuggestions");
          if (was && spelling) announce(catalog.format("textMenu.suggestions", { count: model.entries.filter((e) => e.kind === "suggestion").length }));
        } else set({ request: t.request + 1, model, open: true });
      });
    },
  };
}
