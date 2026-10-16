/**
 * macOS's menu bar (DSK-05, Keyboard shortcuts → Toolbar and menus): File, Edit, Format, View, Go,
 * Window, and Help, generated from the command registry. Each command is listed once, with its key
 * from the keymap and its checked and enabled states, and runs through the command runner like any
 * other menu; the system keeps its own items (About, Services, Hide, Quit, cut, copy, and paste, the
 * Window menu, Help's search). Windows and Linux have no menu bar: their shell never asks for one.
 */
import type { AppState } from "./app.ts";
import { BUILT_IN_THEMES, CONTENT_FONTS } from "./themes.ts";
import { shortcutFor, type CommandRegistry, type Platform } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";

/** System items macOS draws and runs itself. */
export const MENU_ROLES = [
  "about", "services", "hide", "hideOthers", "unhide", "quit",
  "undo", "redo", "cut", "copy", "paste", "pasteAndMatchStyle", "selectAll",
  "minimize", "zoom", "front", "close",
] as const;
export type MenuRole = (typeof MENU_ROLES)[number];
/** The menus macOS treats specially: the app menu, the Window menu (its window list), Help (its search). */
export type MenuKind = "app" | "window" | "help";

/** One entry of the layout: a command, a system item (with the command it stands for), a separator, or a submenu. */
export type MenuBarEntry =
  | string
  | { role: MenuRole; command?: string }
  | { submenu: string; items: string[]; radio?: true };

export interface MenuBarMenu {
  id: string;
  /** Message key. The app menu's title is the app's name, which macOS shows whatever it's given. */
  label: string;
  kind?: MenuKind;
  /** "-" is a separator. */
  items: MenuBarEntry[];
}

const themes = (kind: "light" | "dark") => BUILT_IN_THEMES.filter((t) => t.kind === kind).map((t) => `theme.${kind}.${t.id}`);

/** The menu bar, in the order of Keyboard shortcuts → Toolbar and menus. */
export const MENU_BAR: readonly MenuBarMenu[] = [
  {
    id: "app", label: "menu.appName", kind: "app",
    items: [{ role: "about" }, "-", "settings.open", "toolbar.customize", "-", { role: "services" }, "-", { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, "-", { role: "quit" }],
  },
  {
    id: "file", label: "menu.file",
    items: ["note.new", "note.open", "spotlight.quickOpen", "-", "note.save", "sync.now", "-", "note.share", "note.copyPublicLink", "files.makePublic", "files.makePrivate", "-", "notes.import", "-", { role: "close" }],
  },
  {
    id: "edit", label: "menu.edit",
    items: [
      { role: "undo", command: "edit.undo" }, { role: "redo", command: "edit.redo" }, "-",
      { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "pasteAndMatchStyle" }, { role: "selectAll" }, "edit.expandSelection", "edit.shrinkSelection", "-",
      { submenu: "menu.find", items: ["find.open", "find.replace", "find.next", "find.prev", "find.toggle.inSelection", "find.allNotes", "find.nextResult", "find.prevResult"] },
    ],
  },
  {
    id: "format", label: "menu.format",
    items: [
      "format.bold", "format.italic", "format.underline", "format.strike", "format.code", "link.edit", "format.clear", "-",
      "block.paragraph", "block.heading1", "block.heading2", "block.heading3", "-",
      "block.bulletList", "block.orderedList", "block.taskList", "task.toggle", "-",
      "block.quote", "block.codeBlock", "-", "block.moveUp", "block.moveDown", "block.duplicate", "block.delete", "block.select", "block.contextMenu", "-", "format.focusToolbar",
    ],
  },
  {
    id: "view", label: "menu.view",
    items: [
      "toolbar.toggle", "focus.toggle", "-",
      "appearance.toggle",
      { submenu: "menu.appearance", items: ["appearance.system", "appearance.light", "appearance.dark"], radio: true },
      { submenu: "menu.lightTheme", items: themes("light"), radio: true },
      { submenu: "menu.darkTheme", items: themes("dark"), radio: true },
      "theme.manager.open",
      "settings.sync", "-",
      "font.larger", "font.smaller", "font.reset",
      { submenu: "menu.contentFont", items: CONTENT_FONTS.map((f) => `font.content.${f}`), radio: true }, "-",
      "ui.scaleUp", "ui.scaleDown", "ui.scaleReset", "-",
      "window.fullScreen",
    ],
  },
  {
    id: "go", label: "menu.go",
    items: ["spotlight.open", "spotlight.commands", "spotlight.headings", "-", "note.back", "note.forward", "-", "files.open", "files.reveal", "files.togglePin", "files.showDeleted", "-", "edit.docStart", "edit.docEnd", "-", "conflict.open", "toast.focus"],
  },
  { id: "window", label: "menu.window", kind: "window", items: [{ role: "minimize" }, { role: "zoom" }, "-", { role: "front" }] },
  { id: "help", label: "menu.help", kind: "help", items: ["shortcuts.open", "help.open", "-", "diagnostics.copy", "diagnostics.save", "diagnostics.reportProblem"] },
];

/**
 * Commands that aren't in the menu bar, and why (the first that matches). Every registered command
 * is either listed above or matched here, never both, so a new command has to be placed: the menu
 * bar's tests check it.
 */
export const NOT_IN_MENU_BAR: readonly { why: string; ids: RegExp }[] = [
  // What views, the editor, and the shell send as things change: values, events, and their own steps.
  { why: "state", ids: /^(command\.run|app\.ready|note\.setContent|paste\.notice|toolbar\.setOpen|format\.setState|table\.(setState|changed|copied|action)|slash\..+|find\.(setQuery|setReplace|prefill|setResult)|toast\.setPaused|files\.(drop|editBlur|setEditValue|setExpanded|setFilter)|window\.(drag|key)|theme\.color\.set|.+\.set[A-Z]\w*)$/ },
  // Keys of one focused control, listed in the cheat sheet: the find bar, a picker's field, the Files tree, a table, a toolbar.
  { why: "scoped key", ids: /^(find\.(nextInField|prevInField|replaceNext|replaceAll|close|historyOlder|historyNewer|toggle\.(caseSensitive|wholeWord|regex)|toggleReplace)|picker\.(next|prev|chooseActive)|move\.(next|prev|chooseActive)|files\.(selectAll|openItem|delete|rename|cancelEdit|commitEdit|moveTo|newFolder|focusNote)|table\.(nextCell|prevCell|cellBelow|cellAbove|addRowBelow|addRowAbove|moveRowUp|moveRowDown|deleteRow|selectCells|contextMenu)|format\.exitToolbar|link\.cancel|spotlight\.(next|prev|run|runAlt|run[1-9]|actions|actionsRight|copyLink|nextGroup|prevGroup|back|all)|findAll\.(next|prev|openActive|toggle\..+))$/ },
  // Buttons and items of an open panel, dialog, message, or context menu, which act on what they show.
  { why: "in a view", ids: /^(firstRun\..+|setup\..+|share\.manage\..+|account\..+|workspace\..+|note\.readOnlyAction|files\.(close|select|clearSelection|activate|undo|confirm|hideDeleted|toggleDeleted|restore|restoreTo|newNote|duplicate|copyPublicLink)|move\.choose|picker\.choose|link\.(openEditor|apply|open|copy|remove)|table\..+|block\.(action|openMenu|closeMenu|selected)|toast\.(dismiss|action)|unlock\..+|about\.(template|download)|import\.confirm|conflict\.(choose|later)|held\.(ask|answer)|toolbar\.(setCustomizeOpen|pin|unpin|move|resetPinned)|keybindings\.(edit|reset)|spotlight\.choose|findAll\.(close|choose)|theme\.(manager\.(close|revert)|preview|previewEnd|choose|color\.fix)|reading\.reset|diagnostics\.load|agents\..+)$/ },
  // The browser's own: its notes, the vault there, and the visitor's way to an instance of their own.
  { why: "browser", ids: /^(notes\.export|note\.copyToLocal|vault\.(unlock|lock|forget)|about\.open)$/ },
  // The old note list, which Spotlight's quick open replaced (D-109): File's Quick open is Spotlight's.
  { why: "replaced", ids: /^picker\.open$/ },
  // The app-built window of Windows and Linux; on macOS, the Window menu's own items.
  { why: "app-built window", ids: /^window\.(minimize|maximize|restore|toggleMaximize|toggleVertical|close|move|size|systemMenu|snap\..+)$/ },
];

/** A menu bar item as the shell builds it. `chord` is the registry's chord for the platform ("Mod+Shift+L"). */
export type MenuBarItem =
  | { kind: "command"; id: string; label: string; chord?: string; enabled: boolean; checked?: boolean; radio?: true; reason?: string }
  | { kind: "role"; role: MenuRole; id?: string; label?: string; chord?: string }
  | { kind: "separator" }
  | { kind: "submenu"; label: string; items: MenuBarItem[] };
export interface MenuBarModel {
  menus: { id: string; label: string; kind?: MenuKind; items: MenuBarItem[] }[];
}

/**
 * The menu bar now: labels in the app's language, keys for the platform, and each command's state.
 * Commands this shell doesn't have are left out, and so are the separators they'd leave doubled.
 */
export function menuBarModel(commands: CommandRegistry<AppState>, catalog: MessageCatalog, platform: Platform, layout: readonly MenuBarMenu[] = MENU_BAR): MenuBarModel {
  const item = (id: string, radio?: true): MenuBarItem | undefined => {
    if (!commands.has(id)) return undefined;
    const d = commands.describe(id);
    const chord = shortcutFor(commands.shortcut(id), platform);
    return {
      kind: "command", id, label: catalog.format(d.title), enabled: d.enabled,
      ...(chord ? { chord } : {}), ...(d.checked !== undefined ? { checked: d.checked } : {}), ...(radio ? { radio } : {}),
      // An unavailable item says why, as it does in ⋯ (D-100): macOS shows it when the pointer rests on the item.
      ...(d.disabledReason ? { reason: catalog.format(d.disabledReason) } : {}),
    };
  };
  const tidy = (items: (MenuBarItem | undefined)[]): MenuBarItem[] => {
    const out: MenuBarItem[] = [];
    for (const i of items) {
      if (!i || (i.kind === "separator" && (!out.length || out.at(-1)!.kind === "separator"))) continue;
      out.push(i);
    }
    while (out.at(-1)?.kind === "separator") out.pop();
    return out;
  };
  const entry = (e: MenuBarEntry): MenuBarItem | undefined => {
    if (e === "-") return { kind: "separator" };
    if (typeof e === "string") return item(e);
    if ("role" in e) {
      const c = e.command ? item(e.command) : undefined;
      if (c?.kind !== "command") return { kind: "role", role: e.role };
      // The system item stands for the command: its name and key, while macOS does the work (in text fields too).
      return { kind: "role", role: e.role, id: c.id, label: c.label, ...(c.chord ? { chord: c.chord } : {}) };
    }
    const items = tidy(e.items.map((id) => item(id, e.radio)));
    return items.length ? { kind: "submenu", label: catalog.format(e.submenu), items } : undefined;
  };
  return {
    menus: layout
      .map((m) => ({ id: m.id, label: catalog.format(m.label), ...(m.kind ? { kind: m.kind } : {}), items: tidy(m.items.map(entry)) }))
      .filter((m) => m.items.length || m.kind),
  };
}

/** The command IDs a layout lists, in order, with any repeats. */
export function menuBarCommands(layout: readonly MenuBarMenu[] = MENU_BAR): string[] {
  return layout.flatMap((m) => m.items.flatMap((e) => (e === "-" ? [] : typeof e === "string" ? [e] : "role" in e ? (e.command ? [e.command] : []) : e.items)));
}

/** The menu bar's part of the native window (macOS, D-14). */
export interface MenuBarBridge {
  /** The menu bar's items. Sent again whenever anything in it changes. */
  setMenu(model: MenuBarModel): void;
  /** An item was chosen; `byKey` when by its key rather than by pointing. */
  onMenuCommand(listener: (id: string, byKey: boolean) => void): () => void;
}

/** A menu item chosen by its key within this long after the page saw a key press is that same press. */
export const MENU_KEY_WINDOW_MS = 500;
/** The menu bar is rebuilt at most this often while state changes (typing changes state too). */
export const MENU_UPDATE_MS = 100;

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  catalog: MessageCatalog;
  platform: Platform;
  bridge?: MenuBarBridge;
  now?: () => number;
}

export function registerMenuBar({ store, commands, catalog, platform, bridge, now = () => Date.now() }: Ctx) {
  let lastKey = Number.NEGATIVE_INFINITY;
  let sent = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listed = new Set(menuBarCommands());
  const send = () => {
    timer = undefined;
    if (!bridge) return;
    const model = menuBarModel(commands, catalog, platform);
    const json = JSON.stringify(model);
    if (json === sent) return;
    sent = json;
    bridge.setMenu(model);
  };
  return {
    /**
     * The page saw a key press that could be a menu item's key. The page has keys first, so a menu
     * item chosen by that key just after was already run by the page, or deliberately left alone
     * (the key belongs to a field that has focus). Either way the menu doesn't run it again.
     */
    keySeen() {
      lastKey = now();
    },
    start() {
      if (!bridge) return;
      bridge.onMenuCommand((id, byKey) => {
        if (typeof id !== "string" || !listed.has(id) || !commands.has(id)) return;
        if (byKey && now() - lastKey < MENU_KEY_WINDOW_MS) return;
        void commands.run(id).catch(() => {});
      });
      send();
      store.subscribe(() => {
        timer ??= setTimeout(send, MENU_UPDATE_MS);
      });
    },
  };
}
