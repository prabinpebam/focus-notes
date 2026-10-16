/**
 * The block handle (IA-CMP-HANDLE, EDT-07, D-160): the editor reports which block the grip is for;
 * these commands and vm.block name the grip and build its menu, send its actions back to the editor
 * with the block's position, copy a heading's link, and announce what changed.
 */
import type { CommandRegistry } from "./commands.ts";
import { formatChord } from "./commands.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import type { MessageCatalog } from "./messages.ts";
import type { PlatformBridge } from "./bridge.ts";
import type { AppState } from "./app.ts";
import type { Store } from "./store.ts";

export interface BlockUiState {
  /** The grip shows for a block. */
  visible: boolean;
  /** The block's position in the note, passed back with every action. */
  block: number;
  /** Its node type (paragraph, heading, listItem, …), its heading level, and whether it can move up or down. */
  kind: string;
  level: number;
  first: boolean;
  last: boolean;
  /** A heading's text, for its link. */
  text: string;
  /** Bumped to open the menu at the caret's block (Shift+F10, the Menu key). */
  menuRequest: number;
}
export const BLOCK_CLOSED: BlockUiState = { visible: false, block: -1, kind: "", level: 0, first: false, last: false, text: "", menuRequest: 0 };

/** Turn into, in the order the formatting toolbar offers it. */
const TURN_INTO = ["paragraph", "heading1", "heading2", "heading3", "bulletList", "orderedList", "taskList", "quote", "codeBlock"] as const;
/** What the menu can send back: the block commands, which act on the grip's block. */
const ACTIONS = new Set<string>([...TURN_INTO.map((t) => `block.${t}`), "block.duplicate", "block.moveUp", "block.moveDown", "block.delete", "block.moveTo"]);
const ANNOUNCE: Record<string, string> = {
  "block.moveTo": "block.announce.moved", "block.moveUp": "block.announce.moved", "block.moveDown": "block.announce.moved",
  "block.duplicate": "block.announce.duplicated", "block.delete": "block.announce.deleted",
};

export interface BlockDeps {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  editorAction: (id: string, args?: Record<string, unknown>) => void;
  toast: (message: string) => void;
  announce: (key: string, args?: Record<string, unknown>) => void;
}

const int = (v: unknown, fallback: number) => (typeof v === "number" && Number.isInteger(v) ? v : fallback);
/** GitHub's heading anchor: lower case, punctuation dropped, spaces as hyphens. */
export const headingSlug = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");

export function registerBlockHandle({ store, commands, viewModels, catalog, bridge, editorAction, toast, announce }: BlockDeps): void {
  const get = () => store.state.ui.format.blockHandle;
  const set = (patch: Partial<BlockUiState>) => store.update((s) => ({ ...s, ui: { ...s.ui, format: { ...s.ui.format, blockHandle: { ...s.ui.format.blockHandle, ...patch } } } }));
  const writable = (s: AppState) => s.note.status === "ready";

  commands.register<Record<string, unknown>>({
    id: "block.setState", title: "command.block.setState",
    run: (a) => {
      const prev = get();
      const next: BlockUiState = {
        visible: Boolean(a.visible), block: int(a.block, -1), kind: typeof a.kind === "string" ? a.kind : "", level: int(a.level, 0),
        first: Boolean(a.first), last: Boolean(a.last), text: typeof a.text === "string" ? a.text : "",
        // Counted only while the grip shows: it appears with the request (Shift+F10 moves it to the caret's block).
        menuRequest: a.visible ? prev.menuRequest : 0,
      };
      if (JSON.stringify(next) !== JSON.stringify(prev)) set(next);
    },
  });
  commands.register<Record<string, unknown>>({
    id: "block.action", title: "command.block.action",
    enabled: writable,
    // From the grip's menu or a drag: only the block commands run, on the grip's block.
    run: async (a) => {
      const id = String(a.id ?? "");
      const block = int(a.block, -1);
      if (id === "block.copyLink") return copyLink();
      if (!ACTIONS.has(id) || block < 0) return;
      editorAction(id, id === "block.moveTo" ? { block, to: int(a.to, -1) } : { block });
      const key = ANNOUNCE[id];
      if (key) announce(key);
    },
  });
  const copyLink = async () => {
    const b = get();
    if (b.kind !== "heading" || !b.text.trim() || !bridge.copyText) return;
    const file = (store.state.note.path ?? "").split(/[\\/]/).pop() ?? "";
    try {
      await bridge.copyText(`[${b.text}](${encodeURI(file)}#${headingSlug(b.text)})`);
      toast(catalog.format("block.copiedLink", { name: b.text }));
    } catch {
      toast(catalog.format("table.copyFailed"));
    }
  };
  // Block selection mode (KEY-04): how many blocks are selected, announced politely.
  commands.register<{ count: number }>({
    id: "block.selected", title: "command.block.selected",
    run: ({ count }) => {
      const n = int(count, 0);
      if (n === 1) announce("block.announce.selected");
      else if (n > 1) announce("block.announce.selectedMany", { count: n });
    },
  });
  commands.register({ id: "block.openMenu", title: "command.block.contextMenu", run: () => set({ menuRequest: get().menuRequest + 1 }) });
  // The menu closed, or a drag ended: the caret goes back to the note.
  commands.register({ id: "block.closeMenu", title: "command.block.closeMenu", run: () => editorAction("edit.focus") });

  // ---- the view model ----
  const ITEM = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const }, shortcut: { type: "string" as const }, disabled: { type: "boolean" as const }, checked: { type: "boolean" as const }, items: { type: "array" as const, items: { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const }, shortcut: { type: "string" as const }, checked: { type: "boolean" as const } } } } } };
  const SECTIONS = { type: "array" as const, items: { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const }, items: { type: "array" as const, items: ITEM } } } };
  const keys = (id: string) => {
    const k = commands.shortcut(id);
    const chord = k ? (bridge.platform === "macos" ? (k.macos ?? k.default) : k.default) : undefined;
    return chord ? { shortcut: formatChord(chord, bridge.platform) } : {};
  };
  const item = (id: string, label: string, disabled = false) => ({ id, label: catalog.format(label), ...keys(id), ...(disabled ? { disabled: true } : {}) });
  const current = (b: BlockUiState) => (b.kind === "heading" ? `heading${b.level}` : b.kind === "blockquote" ? "quote" : b.kind === "listItem" || b.kind === "taskItem" ? "" : b.kind);
  let memo: { key: BlockUiState; value: Record<string, unknown> } | undefined;
  viewModels.register({
    id: "vm.block",
    reads: ["ui.format.blockHandle", "note.status"],
    schema: { type: "object", properties: { visible: { type: "boolean" }, label: { type: "string" }, menu: SECTIONS, menuRequest: { type: "number" } } },
    select: (s) => {
      const b = s.ui.format.blockHandle;
      if (memo?.key === b) return memo.value;
      const kind = b.kind === "heading" ? `heading${b.level}` : b.kind;
      const label = catalog.has(`block.handle.${kind}`) ? catalog.format(`block.handle.${kind}`) : catalog.format("block.handle.block");
      // A divider has no text to turn into anything.
      const turnable = b.kind !== "horizontalRule";
      const now = current(b);
      const menu = [
        ...(turnable ? [{ id: "turn", items: [{
          id: "turnInto", label: catalog.format("block.menu.turnInto"),
          items: TURN_INTO.map((t) => ({ id: `block.${t}`, label: catalog.format(`format.block.${t}`), ...keys(`block.${t}`), checked: now === t })),
        }] }] : []),
        { id: "edit", items: [item("block.duplicate", "block.menu.duplicate"), item("block.moveUp", "block.menu.moveUp", b.first), item("block.moveDown", "block.menu.moveDown", b.last)] },
        ...(b.kind === "heading" && b.text.trim() ? [{ id: "link", items: [item("block.copyLink", "block.menu.copyLink", !bridge.copyText)] }] : []),
        { id: "delete", items: [item("block.delete", "block.menu.delete")] },
      ];
      const value = { visible: b.visible && s.note.status === "ready", label, menu, menuRequest: b.menuRequest };
      memo = { key: b, value };
      return value;
    },
  });
}
