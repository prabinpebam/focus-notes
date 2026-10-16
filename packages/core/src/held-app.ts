/**
 * New notes without a private repository (D-158, SHR-01): the open note's *Public · not backed up*
 * pill, and the question asked once per note and session before its first backup: Make it public,
 * or Keep it on this computer only. The shell holds such a note out of Git until it's answered
 * (Desktop and Git → New notes without a private repository).
 */
import type { AppState } from "./app.ts";
import type { PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { NO_HELD, type HeldNotes } from "./held.ts";
import { findNode } from "./workspace.ts";
import { titleOrName } from "./history.ts";

export interface HeldUiState {
  held: HeldNotes;
  /** The note the question is about, while it's open. */
  asking?: string;
  /** Notes asked about in this session: each is asked by itself once; the pill asks again. */
  asked: readonly string[];
  busy: boolean;
}
export const HELD_CLOSED: HeldUiState = { held: NO_HELD, asked: [], busy: false };

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  toast: (message: string, opts?: { tone?: "info" | "error" }) => number;
  announce: (text: string) => void;
}

export function registerHeld(ctx: Ctx) {
  const { store, commands, viewModels, catalog, bridge } = ctx;
  const ui = () => store.state.ui.held;
  const set = (patch: Partial<HeldUiState>) => store.update((s) => ({ ...s, ui: { ...s.ui, held: { ...s.ui.held, ...patch } } }));
  const stateOf = (s: AppState, path: string | undefined) =>
    !path ? undefined : s.ui.held.held.waiting.includes(path) ? "waiting" : s.ui.held.held.local.includes(path) ? "local" : undefined;
  const titleOf = (s: AppState, path: string) => {
    const node = findNode(s.workspace.tree, path)?.node;
    return node?.kind === "note" && node.title ? node.title : titleOrName(s.note.path === path ? s.note.markdown : undefined, path);
  };

  async function refresh(): Promise<void> {
    const held = await bridge.sync?.held?.().catch(() => undefined);
    if (held) set({ held });
  }
  // A held note's line follows renames and moves in the shell: the lists are read again when the tree changes.
  let tree = store.state.workspace.tree;
  let pending: ReturnType<typeof setTimeout> | undefined;
  store.subscribe(() => {
    if (store.state.workspace.tree === tree) return;
    tree = store.state.workspace.tree;
    if (!bridge.sync?.held || pending) return;
    pending = setTimeout(() => {
      pending = undefined;
      void refresh();
    }, 0);
  });
  /** Notes written in this session: only a note with the writer's words in it is asked about. */
  const edited = new Set<string>();
  function ask(path: string): void {
    set({ asking: path, asked: ui().asked.includes(path) ? ui().asked : [...ui().asked, path] });
  }

  commands.register<{ path?: unknown }>({
    id: "held.ask", title: "command.held.ask",
    enabled: (s) => stateOf(s, s.note.path) !== undefined,
    run: ({ path }) => {
      const p = typeof path === "string" ? path : store.state.note.path;
      if (p && stateOf(store.state, p)) ask(p);
    },
  });
  commands.register<{ choice: unknown }>({
    id: "held.answer", title: "command.held.answer",
    run: async ({ choice }) => {
      const path = ui().asking;
      if (!path || (choice !== "public" && choice !== "local") || !bridge.sync?.answerHeld) return;
      set({ busy: true });
      try {
        const held = await bridge.sync.answerHeld(path, choice);
        set({ held, asking: undefined, busy: false });
        ctx.announce(catalog.format(choice === "public" ? "held.madePublic" : "held.keptLocal", { what: catalog.format("files.quoted", { name: titleOf(store.state, path) }) }));
      } catch {
        set({ busy: false });
        ctx.toast(catalog.format("held.failed"), { tone: "error" });
      }
    },
  });
  commands.register<{ open: unknown }>({
    id: "held.setOpen", title: "command.held.ask",
    run: ({ open }) => { if (!open) set({ asking: undefined }); },
  });

  viewModels.register({
    id: "vm.held",
    schema: {
      type: "object",
      properties: {
        pill: { type: "boolean" }, pillText: { type: "string" }, placeholder: { type: "string" },
        open: { type: "boolean" }, title: { type: "string" }, busy: { type: "boolean" }, local: { type: "boolean" },
      },
    },
    reads: ["ui.held", "note.path", "workspace.tree"],
    select: (s) => {
      const state = stateOf(s, s.note.path);
      const asking = s.ui.held.asking;
      return {
        pill: state !== undefined,
        pillText: state ? catalog.format(state === "waiting" ? "held.pill.waiting" : "held.pill.local") : "",
        // The empty note says where it is (D-158): a placeholder that starts Public note.
        placeholder: catalog.format(state === "waiting" ? "canvas.placeholderPublic" : "canvas.placeholder", { platform: bridge.platform }),
        open: asking !== undefined,
        title: asking ? catalog.format("held.title", { what: catalog.format("files.quoted", { name: titleOf(s, asking) }) }) : "",
        busy: s.ui.held.busy,
        // Kept on this computer: only Make it public is offered again.
        local: asking !== undefined && stateOf(s, asking) === "local",
      };
    },
  });

  return {
    refresh,
    /**
     * A backup is about to include this note (Save to cloud, or switching away from it): a note that
     * waits and has the writer's words is asked about, once per session. Its text is saved here
     * either way; Git leaves it out.
     */
    backingUp(path: string | undefined): void {
      if (path && edited.has(path) && stateOf(store.state, path) === "waiting" && !ui().asked.includes(path)) ask(path);
    },
    /** The app wrote a note's text, at `to` when its file name followed its title. */
    written(from: string, to: string | undefined): void {
      edited.add(from);
      if (!to || to === from) return;
      edited.add(to);
      if (ui().asked.includes(from)) set({ asked: [...ui().asked, to] });
      void refresh();
    },
  };
}
