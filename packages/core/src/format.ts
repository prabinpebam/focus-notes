/**
 * The formatting toolbar, link editor, and link hover card (IA-CMP-FORMAT, IA-CMP-LINK; EDT-12,
 * EDT-13, UI-06). The editor surface reports the selection; these commands and the vm.format view
 * model drive the view nodes, and editor work goes back to the surface as editor actions.
 */
import type { CommandRegistry } from "./commands.ts";
import { formatChord } from "./commands.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import type { MessageCatalog } from "./messages.ts";
import type { PlatformBridge } from "./bridge.ts";
import type { AppState } from "./app.ts";
import type { Store } from "./store.ts";
import { isReadOnlyPath } from "./notes.ts";
import { registerSlash, SLASH_CLOSED, type SlashMenuState } from "./slash.ts";

export type MarkState = "on" | "off" | "mixed";
const MARKS = ["bold", "italic", "strike", "code"] as const;
/** The Turn into menu, in order; each item is the command that makes the block. */
const TURN_INTO = [
  "block.paragraph", "block.heading1", "block.heading2", "block.heading3",
  "block.bulletList", "block.orderedList", "block.taskList", "block.quote", "block.codeBlock",
] as const;

export interface FormatState {
  /** The editor has a non-empty text selection and the toolbar should show (EDT-12). */
  toolbar: boolean;
  /** The caret is in a link, or the pointer rested on one: the hover card should show (EDT-13). */
  card: boolean;
  bold: MarkState;
  italic: MarkState;
  strike: MarkState;
  code: MarkState;
  /** The Turn into command of the selected blocks, "mixed", or "" for a type it doesn't offer. */
  block: string;
  codeBlock: boolean;
  inlineCode: boolean;
  oneBlock: boolean;
  /** The link the selection or caret is in, or the hovered link. */
  href: string;
  /** Bumped to move focus into the toolbar (Alt+F10). */
  focusToolbar: number;
  link: LinkEditorState;
  /** The slash menu (EDT-06), which belongs to the open note like the toolbar. */
  slash: SlashMenuState;
}
export interface LinkEditorState {
  open: boolean;
  url: string;
  text: string;
  /** Nothing was selected: the editor asks for the link's text too. */
  withText: boolean;
  error: string;
  focus: number;
}
export const FORMAT_CLOSED: FormatState = {
  toolbar: false, card: false, bold: "off", italic: "off", strike: "off", code: "off", block: "", codeBlock: false, inlineCode: false,
  oneBlock: false, href: "", focusToolbar: 0, link: { open: false, url: "", text: "", withText: false, error: "", focus: 0 }, slash: SLASH_CLOSED,
};

/** A web address the shell may open in the browser: http, https, or mailto (EDT-13). */
export const isWebLink = (href: string): boolean => {
  if (!/^(https?:\/\/[^\s/?#]+|mailto:[^\s@]+@)\S*$/i.test(href)) return false;
  try {
    return Boolean(new URL(href));
  } catch {
    return false;
  }
};

/**
 * What the link editor accepts (Text formatting → Invalid address): web and mail addresses, with
 * https added to a bare domain and mailto to a bare email address. Anything else is undefined.
 */
export function normalizeLink(input: string): string | undefined {
  const s = input.trim();
  if (!s || /\s/.test(s)) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return isWebLink(s) ? s : undefined;
  if (/^[^@/]+@[^@/]+\.[a-z]{2,}$/i.test(s)) return `mailto:${s}`;
  if (/^[^\s/@]+\.[a-z]{2,}([/?#]\S*)?$/i.test(s)) return isWebLink(`https://${s}`) ? `https://${s}` : undefined;
  return undefined;
}

/** The hover card's short address: no scheme or www, and long ones end in an ellipsis. */
export function shortLink(href: string, max = 34): string {
  const s = href.replace(/^(https?:\/\/|mailto:)/i, "").replace(/^www\./i, "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export interface FormatDeps {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  editorAction: (id: string, args?: Record<string, unknown>) => void;
  toast: (message: string) => void;
}

export function registerFormatting({ store, commands, viewModels, catalog, bridge, editorAction, toast }: FormatDeps): void {
  registerSlash({ store, commands, viewModels, catalog, editorAction, toast });
  const set = (patch: Partial<FormatState>) => store.update((s) => ({ ...s, ui: { ...s.ui, format: { ...s.ui.format, ...patch } } }));
  const setLink = (patch: Partial<LinkEditorState>) => set({ link: { ...store.state.ui.format.link, ...patch } });
  const writable = (s: AppState) => s.note.status === "ready" && !isReadOnlyPath(s.note.path);
  const mark = (v: unknown): MarkState => (v === "on" || v === "mixed" ? v : "off");

  commands.register<Record<string, unknown>>({
    id: "format.setState", title: "command.format.setState",
    run: (a) => set({
      toolbar: Boolean(a.toolbar), card: Boolean(a.card),
      bold: mark(a.bold), italic: mark(a.italic), strike: mark(a.strike), code: mark(a.code),
      block: typeof a.block === "string" ? a.block : "", codeBlock: Boolean(a.codeBlock), inlineCode: Boolean(a.inlineCode),
      oneBlock: Boolean(a.oneBlock), href: typeof a.href === "string" ? a.href : "",
    }),
  });
  commands.register({
    id: "format.focusToolbar", title: "command.format.focusToolbar",
    shortcut: { default: "Alt+F10" }, layer: "power", group: "formatting",
    enabled: (s) => s.ui.format.toolbar && !s.ui.format.link.open,
    run: () => set({ focusToolbar: store.state.ui.format.focusToolbar + 1 }),
  });
  commands.register({
    id: "format.exitToolbar", title: "command.format.exitToolbar",
    shortcut: { default: "Escape", handledBy: "formatToolbar" }, layer: "power", group: "formatting",
    run: () => editorAction("edit.focus"),
  });

  // ---- links (EDT-13) ----
  commands.register({
    id: "link.edit", title: "command.link.edit", icon: "link",
    shortcut: { default: "Mod+K" }, layer: "writer", group: "formatting",
    enabled: writable,
    // The editor knows the selection: it selects a link the caret is in, then answers with link.openEditor.
    run: () => editorAction("link.edit"),
  });
  commands.register<{ href: string; selected: boolean }>({
    id: "link.openEditor", title: "command.link.edit",
    run: ({ href, selected }) => {
      const f = store.state.ui.format;
      set({ link: { open: true, url: typeof href === "string" ? href : "", text: "", withText: !selected, error: "", focus: f.link.focus + 1 } });
    },
  });
  commands.register<{ value: string }>({ id: "link.setUrl", title: "command.link.setUrl", run: ({ value }) => setLink({ url: typeof value === "string" ? value : "", error: "" }) });
  commands.register<{ value: string }>({ id: "link.setText", title: "command.link.setText", run: ({ value }) => setLink({ text: typeof value === "string" ? value : "" }) });
  commands.register({
    id: "link.apply", title: "command.link.apply",
    run: () => {
      const l = store.state.ui.format.link;
      if (!l.open) return;
      const href = normalizeLink(l.url);
      if (!href) {
        setLink({ error: catalog.format("format.link.invalid"), focus: l.focus + 1 });
        return;
      }
      setLink({ open: false, error: "" });
      editorAction("link.apply", { href, text: l.withText ? l.text.trim() : "" });
    },
  });
  commands.register({
    id: "link.cancel", title: "command.link.cancel",
    shortcut: { default: "Escape", handledBy: "linkEditor" }, layer: "writer", group: "formatting",
    run: () => {
      setLink({ open: false, error: "" });
      editorAction("edit.focus");
    },
  });
  commands.register<{ href?: string }>({
    id: "link.open", title: "command.link.open",
    // Only web links, and only through the shell: the app window never navigates (EDT-13).
    run: ({ href }) => {
      const target = typeof href === "string" && href ? href : store.state.ui.format.href;
      if (isWebLink(target)) bridge.openLink?.(target);
    },
  });
  commands.register({
    id: "link.copy", title: "command.link.copy",
    enabled: () => Boolean(bridge.copyText),
    run: async () => {
      const href = store.state.ui.format.href;
      if (!href || !bridge.copyText) return;
      try {
        await bridge.copyText(href);
        toast(catalog.format("format.link.copied"));
      } catch {
        toast(catalog.format("format.link.copyFailed"));
      }
    },
  });
  commands.register({ id: "link.remove", title: "command.link.remove", enabled: writable, run: () => editorAction("link.remove") });

  // ---- the view model ----
  const describe = (id: string) => {
    const d = commands.describe(id);
    return { label: catalog.format(d.title), shortcut: d.shortcut ? formatChord(d.shortcut, bridge.platform) : "" };
  };
  const markAction = (id: string, state: MarkState) => ({ ...describe(id), pressed: state === "on", mixed: state === "mixed" });
  const ACTION = { type: "object" as const, properties: { label: { type: "string" as const }, shortcut: { type: "string" as const }, pressed: { type: "boolean" as const }, mixed: { type: "boolean" as const } } };
  const ITEM = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const }, shortcut: { type: "string" as const }, checked: { type: "boolean" as const } } };
  let memo: { key: FormatState; value: Record<string, unknown> } | undefined;
  viewModels.register({
    id: "vm.format",
    reads: ["ui.format", "note.path", "note.status"],
    schema: {
      type: "object",
      properties: {
        toolbar: { type: "boolean" }, card: { type: "boolean" }, linkOpen: { type: "boolean" },
        showTurnInto: { type: "boolean" }, showMarks: { type: "boolean" }, showCode: { type: "boolean" }, showLink: { type: "boolean" },
        linkEnabled: { type: "boolean" },
        blockLabel: { type: "string" }, turnIntoLabel: { type: "string" },
        turnInto: { type: "array", items: { type: "object", properties: { id: { type: "string" }, items: { type: "array", items: ITEM } } } },
        bold: ACTION, italic: ACTION, strike: ACTION, codeMark: ACTION, linkAction: ACTION,
        focusToolbar: { type: "number" },
        url: { type: "string" }, text: { type: "string" }, withText: { type: "boolean" }, error: { type: "string" }, hasError: { type: "boolean" }, focusUrl: { type: "number" },
        href: { type: "string" }, shortHref: { type: "string" }, canOpen: { type: "boolean" },
      },
    },
    setters: { url: "link.setUrl", text: "link.setText" },
    // Selected on every store change, so it's memoized on the format state.
    select: (s) => {
      const f = s.ui.format;
      if (memo?.key === f) return memo.value;
      const blockLabel = f.block === "mixed" ? catalog.format("format.mixed") : f.block ? catalog.format(`format.${f.block}`) : catalog.format("format.other");
      const value = {
        toolbar: f.toolbar && !f.link.open,
        card: f.card && !f.toolbar && !f.link.open && Boolean(f.href),
        linkOpen: f.link.open,
        showTurnInto: true,
        showMarks: !f.codeBlock && !f.inlineCode,
        showCode: !f.codeBlock,
        showLink: !f.codeBlock && !f.inlineCode,
        linkEnabled: f.oneBlock,
        blockLabel,
        turnIntoLabel: catalog.format("format.turnIntoLabel", { type: blockLabel }),
        turnInto: [{ id: "turnInto", items: TURN_INTO.map((id) => ({ id, label: catalog.format(`format.${id}`), shortcut: describe(id).shortcut, checked: f.block === id })) }],
        bold: markAction("format.bold", f.bold), italic: markAction("format.italic", f.italic), strike: markAction("format.strike", f.strike),
        codeMark: markAction("format.code", f.code),
        linkAction: { label: catalog.format("format.link"), shortcut: describe("link.edit").shortcut, pressed: Boolean(f.href), mixed: false },
        focusToolbar: f.focusToolbar,
        url: f.link.url, text: f.link.text, withText: f.link.withText, error: f.link.error, hasError: Boolean(f.link.error), focusUrl: f.link.focus,
        href: f.href, shortHref: shortLink(f.href), canOpen: isWebLink(f.href),
      };
      memo = { key: f, value };
      return value;
    },
  });
}
