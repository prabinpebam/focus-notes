/**
 * The slash menu (IA-CMP-SLASH, EDT-06) and what a paste reports (EDT-09). The editor surface reports
 * the `/query` and which blocks are valid there; these commands and the vm.slash view model filter
 * the block registry's entries, track the active row, and send the chosen block back to the editor.
 */
import type { CommandRegistry } from "./commands.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import type { MessageCatalog } from "./messages.ts";
import type { AppState } from "./app.ts";
import type { Store } from "./store.ts";

/** A slash-menu row as the editor's block registry declares it (Editor engine → Block registry contract). */
export interface SlashCatalogEntry {
  id: string;
  /** Message key for its name. `slash.keywords.<id>` and `slash.hint.<id>` hold its synonyms and hint. */
  title: string;
  group: "text" | "lists" | "insert";
  icon: string;
  /** Its Markdown shortcut, shown on the right ("##"). */
  markdown: string;
}

export interface SlashMenuState {
  /** The editor has a `/query` open. */
  open: boolean;
  query: string;
  /** The entries valid where the `/` is, by ID (DD-FMT-08). */
  valid: readonly string[];
  active: string;
}
export const SLASH_CLOSED: SlashMenuState = { open: false, query: "", valid: [], active: "" };

const GROUP_ORDER = ["text", "lists", "insert"] as const;

export interface SlashItem {
  id: string;
  label: string;
  icon: string;
  shortcut: string;
  hint: string;
}

const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * The rows for a query (Text formatting → Slash menu → Filtering): valid entries, grouped Text,
 * Lists, Insert, whose name or synonyms have a word starting with each typed word ("h2", "title",
 * "checkbox").
 */
export function slashItems(entries: readonly SlashCatalogEntry[], valid: readonly string[], query: string, catalog: MessageCatalog): SlashItem[] {
  const allowed = new Set(valid);
  const terms = fold(query).split(/\s+/).filter(Boolean);
  const text = (key: string) => (catalog.has(key) ? catalog.format(key) : "");
  return entries
    .filter((e) => allowed.has(e.id))
    .map((e, i) => ({ e, i, label: text(e.title) || e.id }))
    .filter(({ e, label }) => {
      const words = fold(`${label} ${text(`slash.keywords.${e.id}`)}`).split(/[\s,]+/).filter(Boolean);
      return terms.every((t) => words.some((w) => w.startsWith(t)));
    })
    .sort((a, b) => GROUP_ORDER.indexOf(a.e.group) - GROUP_ORDER.indexOf(b.e.group) || a.i - b.i)
    .map(({ e, label }) => ({ id: e.id, label, icon: e.icon, shortcut: e.markdown, hint: text(`slash.hint.${e.id}`) }));
}

export interface SlashDeps {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  editorAction: (id: string, args?: Record<string, unknown>) => void;
  toast: (message: string) => void;
}

export function registerSlash({ store, commands, viewModels, catalog, editorAction, toast }: SlashDeps): void {
  let entries: SlashCatalogEntry[] = [];
  const get = () => store.state.ui.format.slash;
  const set = (slash: SlashMenuState) => store.update((s) => ({ ...s, ui: { ...s.ui, format: { ...s.ui.format, slash } } }));
  const items = (s: SlashMenuState) => slashItems(entries, s.valid, s.query, catalog);

  commands.register<{ entries: SlashCatalogEntry[] }>({
    id: "slash.register", title: "command.slash.register",
    // The editor's block registry, handed over once when the app mounts.
    run: ({ entries: list }) => {
      if (Array.isArray(list)) entries = list.filter((e) => e && typeof e.id === "string" && typeof e.title === "string");
    },
  });
  commands.register<{ open: boolean; query: string; valid: string }>({
    id: "slash.setState", title: "command.slash.setState",
    run: ({ open, query, valid }) => {
      if (!open) {
        if (get().open) set(SLASH_CLOSED);
        return;
      }
      const prev = get();
      const next: SlashMenuState = {
        open: true,
        query: typeof query === "string" ? query : "",
        valid: typeof valid === "string" ? valid.split(/\s+/).filter(Boolean) : prev.valid,
        active: "",
      };
      const list = items(next);
      // A new query starts at the top; the same query keeps the row the person moved to.
      next.active = next.query === prev.query && prev.open && list.some((i) => i.id === prev.active) ? prev.active : list[0]?.id ?? "";
      set(next);
    },
  });
  commands.register<{ delta: number }>({
    id: "slash.move", title: "command.slash.move",
    run: ({ delta }) => {
      const s = get();
      const list = items(s);
      if (!s.open || !list.length) return;
      const i = list.findIndex((x) => x.id === s.active);
      const n = list.length;
      set({ ...s, active: list[(((i < 0 ? 0 : i) + (Number(delta) < 0 ? -1 : 1)) % n + n) % n]!.id });
    },
  });
  commands.register<{ id: string }>({
    id: "slash.setActive", title: "command.slash.move",
    run: ({ id }) => {
      const s = get();
      if (s.open && typeof id === "string" && items(s).some((x) => x.id === id)) set({ ...s, active: id });
    },
  });
  commands.register<{ id?: string }>({
    id: "slash.choose", title: "command.slash.choose",
    run: ({ id }) => {
      const s = get();
      const chosen = typeof id === "string" && id ? id : s.active;
      if (!s.open || !chosen) return;
      editorAction("slash.insert", { id: chosen });
    },
  });
  commands.register<{ kind: string }>({
    id: "paste.notice", title: "command.paste.notice",
    // Images wait for the image block (EXT-03): they're refused with a message, never dropped silently.
    run: ({ kind }) => {
      if (kind === "images") toast(catalog.format("paste.imagesLeftOut"));
    },
  });

  const ITEM = {
    type: "object" as const,
    properties: { id: { type: "string" as const }, label: { type: "string" as const }, description: { type: "string" as const }, icon: { type: "string" as const }, shortcut: { type: "string" as const } },
  };
  viewModels.register({
    id: "vm.slash",
    reads: ["ui.format.slash"],
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, items: { type: "array", items: ITEM }, activeId: { type: "string" },
        empty: { type: "boolean" }, emptyText: { type: "string" },
      },
    },
    select: (st) => {
      const s = st.ui.format.slash;
      const list = s.open ? items(s) : [];
      // With no match, a space means the `/` was just text: the menu steps aside until a match returns.
      const open = s.open && (list.length > 0 || !/\s/.test(s.query));
      return {
        open,
        items: list.map((i) => ({ id: i.id, label: i.label, icon: i.icon, shortcut: i.shortcut, ...(i.id === s.active && i.hint ? { description: i.hint } : {}) })),
        activeId: open ? s.active : "",
        empty: open && list.length === 0,
        emptyText: open && list.length === 0 ? catalog.format("slash.empty", { query: s.query }) : "",
      };
    },
  });
}
