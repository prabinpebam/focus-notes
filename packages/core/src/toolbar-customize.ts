/**
 * Choosing the toolbar's six actions (WP-8.3, UI-08, D-170; Main UI → The minimal toolbar). The
 * pinned actions, in order, are kept on this device; the rest of the pinnable actions stay in ⋯.
 * Everything in the dialog is a button, so the keyboard does all of it.
 */
import type { AppState } from "./app.ts";
import type { AppStateFile } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";

export const TOOLBAR_SLOTS = 6;
export interface ToolbarCustomizeState { open: boolean; focus: number }
export const TOOLBAR_CUSTOMIZE_CLOSED: ToolbarCustomizeState = { open: false, focus: 0 };

/** The pinned actions as kept: known, pinnable, once each, at most six; the defaults when there's nothing usable. */
export function validPinned(raw: unknown, pinnable: readonly string[], defaults: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [...defaults];
  const out: string[] = [];
  for (const id of raw) if (typeof id === "string" && pinnable.includes(id) && !out.includes(id) && out.length < TOOLBAR_SLOTS) out.push(id);
  return out;
}

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  persistAppState: (patch: Partial<AppStateFile>) => Promise<void>;
  announce: (text: string) => void;
  /** The actions that can be pinned, in ⋯'s order after the defaults. */
  pinnable: () => readonly string[];
  defaults: readonly string[];
}

export function registerToolbarCustomize(ctx: Ctx) {
  const { store, commands, viewModels, catalog } = ctx;
  const pinned = () => store.state.toolbarPinned;
  const label = (id: string) => catalog.format(commands.describe(id).title);
  // Opening it closes Settings (one dialog at a time), as other settings dialogs do.
  const setOpen = (open: boolean) => store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false, ...(open ? { settings: { ...s.ui.settings, open: false } } : {}), toolbarCustomize: { open, focus: s.ui.toolbarCustomize.focus + (open ? 1 : 0) } } }));
  async function save(next: string[], said: string): Promise<void> {
    store.update((s) => ({ ...s, toolbarPinned: next }));
    ctx.announce(said);
    await ctx.persistAppState({ toolbarPinned: next });
  }
  const id = (a: { id?: unknown }) => (typeof a.id === "string" ? a.id : "");

  commands.register({ id: "toolbar.customize", title: "command.toolbar.customize", icon: "settings", run: () => setOpen(true) });
  commands.register<{ open: unknown }>({ id: "toolbar.setCustomizeOpen", title: "command.toolbar.customize", run: ({ open }) => { if (!open) setOpen(false); } });
  commands.register<{ id: unknown }>({
    id: "toolbar.pin", title: "command.toolbar.pin",
    run: async (a) => {
      const x = id(a);
      if (!ctx.pinnable().includes(x) || pinned().includes(x) || pinned().length >= TOOLBAR_SLOTS) return;
      await save([...pinned(), x], catalog.format("toolbar.customize.pinned", { name: label(x), count: pinned().length + 1 }));
    },
  });
  commands.register<{ id: unknown }>({
    id: "toolbar.unpin", title: "command.toolbar.unpin",
    run: async (a) => {
      const x = id(a);
      if (!pinned().includes(x)) return;
      await save(pinned().filter((p) => p !== x), catalog.format("toolbar.customize.unpinned", { name: label(x) }));
    },
  });
  commands.register<{ id: unknown; by: unknown }>({
    id: "toolbar.move", title: "command.toolbar.move",
    run: async (a) => {
      const x = id(a);
      const i = pinned().indexOf(x);
      const j = i + (a.by === -1 ? -1 : a.by === 1 ? 1 : 0);
      if (i < 0 || j === i || j < 0 || j >= pinned().length) return;
      const next = [...pinned()];
      [next[i], next[j]] = [next[j]!, next[i]!];
      await save(next, catalog.format("toolbar.customize.moved", { name: label(x), position: j + 1, count: next.length }));
    },
  });
  commands.register({
    id: "toolbar.resetPinned", title: "command.toolbar.resetPinned",
    enabled: (s) => s.toolbarPinned.join() !== ctx.defaults.join(),
    run: () => save([...ctx.defaults], catalog.format("toolbar.customize.reset")),
  });

  const ROW = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const } } };
  viewModels.register({
    id: "vm.toolbarCustomize",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, focus: { type: "number" }, count: { type: "string" }, full: { type: "boolean" }, canReset: { type: "boolean" },
        pinned: { type: "array", items: { ...ROW, properties: { ...ROW.properties, up: { type: "string" }, down: { type: "string" }, unpin: { type: "string" }, first: { type: "boolean" }, last: { type: "boolean" } } } },
        available: { type: "array", items: { ...ROW, properties: { ...ROW.properties, pin: { type: "string" } } } },
      },
    },
    reads: ["ui.toolbarCustomize", "toolbarPinned"],
    select: (s) => {
      const c = s.ui.toolbarCustomize;
      if (!c.open) return { open: false, focus: c.focus, count: "", full: false, canReset: false, pinned: [], available: [] };
      const p = s.toolbarPinned;
      return {
        open: true, focus: c.focus, full: p.length >= TOOLBAR_SLOTS, canReset: p.join() !== ctx.defaults.join(),
        count: catalog.format("toolbar.customize.count", { count: p.length, slots: TOOLBAR_SLOTS }),
        pinned: p.map((x, i) => ({
          id: x, label: label(x), first: i === 0, last: i === p.length - 1,
          up: catalog.format("toolbar.customize.up", { name: label(x) }), down: catalog.format("toolbar.customize.down", { name: label(x) }), unpin: catalog.format("toolbar.customize.unpin", { name: label(x) }),
        })),
        available: ctx.pinnable().filter((x) => !p.includes(x)).map((x) => ({ id: x, label: label(x), pin: catalog.format("toolbar.customize.pin", { name: label(x) }) })),
      };
    },
  });
}
