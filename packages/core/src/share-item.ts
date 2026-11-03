import type { AppState } from "./app.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { TaskTracker } from "./tasks.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { findNode, joinPath, rootOf, stemOf, type TreeNode } from "./workspace.ts";
import { passcodeProblem } from "@focus-notes/seal/access";

interface ReviewRow {
  id: string;
  label: string;
  level: number;
  folder: boolean;
  kind: "folder" | "note";
  parent: string;
  hasChildren: boolean;
  expanded: boolean;
  selected: boolean;
  readOnly: boolean;
}

export interface ItemShareState {
  open: boolean;
  path: string;
  name: string;
  folder: boolean;
  link: boolean;
  passcode: boolean;
  later: boolean;
  expiry: string;
  until: string;
  mode: string;
  own: string;
  reviewOpen: boolean;
  expanded: readonly string[];
  counting: boolean;
  notes: number;
  folders: number;
  contents: readonly ReviewRow[];
  problem: string;
}

export const ITEM_SHARE_CLOSED: ItemShareState = {
  open: false, path: "", name: "", folder: false, link: true, passcode: false,
  later: false, expiry: "30d", until: "", mode: "generate", own: "",
  reviewOpen: false, expanded: [], counting: false, notes: 0, folders: 0, contents: [], problem: "",
};

export function registerItemShare({ store, commands, viewModels, catalog, tracker }: {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  tracker: TaskTracker;
}) {
  const state = () => store.state.ui.share.item;
  const set = (patch: Partial<ItemShareState>) => store.update((s) => ({
    ...s, ui: { ...s.ui, share: { ...s.ui.share, item: { ...s.ui.share.item, ...patch } } },
  }));
  let generation = 0;
  const reg = <A extends Record<string, unknown> = Record<string, never>>(id: string, run: (a: A) => void | Promise<void>) =>
    commands.register<A>({ id, title: "command.note.share", run });

  reg<{ path?: string }>("share.item.open", async ({ path }) => {
    const tree = store.state.workspace.tree;
    const target = path ?? store.state.note.path;
    const node = target ? findNode(tree, target)?.node : undefined;
    if (!target || !node) throw new Error(catalog.format("share.state.deleted"));
    const current = ++generation;
    set({
      ...ITEM_SHARE_CLOSED, open: true, path: target,
      name: node.kind === "note" ? node.title || stemOf(node.name) : node.name,
      folder: node.kind === "folder", counting: node.kind === "folder",
    });
    store.update((s) => ({
      ...s, ui: { ...s.ui, toolbarOpen: false,
        files: { ...s.ui.files, open: s.ui.files.pinned },
        share: { ...s.ui.share, note: { open: false } },
      },
    }));
    if (node.kind !== "folder") return;
    try {
      await tracker.run("share.item.count", "share.dialog.counting", async () => {
        const contents: ReviewRow[] = [];
        const pending: { node: TreeNode; path: string; parent: string; level: number }[] = node.children.map((n) => ({ node: n, path: joinPath(target, n.name), parent: "", level: 1 })).reverse();
        let notes = 0, folders = 0;
        while (pending.length && current === generation) {
          const entry = pending.pop()!;
          const folder = entry.node.kind === "folder";
          contents.push({ id: entry.path, label: entry.node.kind === "note" ? entry.node.title || stemOf(entry.node.name) : entry.node.name,
            level: entry.level, folder, kind: folder ? "folder" : "note", parent: entry.parent,
            hasChildren: entry.node.kind === "folder" && entry.node.children.length > 0,
            expanded: false, selected: false, readOnly: true });
          if (entry.node.kind === "folder") {
            folders++;
            for (const child of [...entry.node.children].reverse()) pending.push({ node: child, path: joinPath(entry.path, child.name), parent: entry.path, level: entry.level + 1 });
          } else notes++;
          if (contents.length % 200 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        if (current === generation) set({ counting: false, notes, folders, contents });
      });
    } catch {
      if (current === generation) set({ counting: false, problem: catalog.format("share.item.countFailed") });
    }
  });
  reg<{ open: boolean }>("share.item.setOpen", ({ open }) => {
    if (!open) { generation++; set({ ...ITEM_SHARE_CLOSED }); }
  });
  reg("share.item.toggleLink", () => set({ link: !state().link }));
  reg("share.item.togglePasscode", () => set({ passcode: !state().passcode }));
  reg("share.item.toggleLater", () => set({ later: !state().later }));
  reg<{ value: string }>("share.item.setExpiry", ({ value }) => {
    if (["7d", "30d", "90d", "date", "never"].includes(value)) set({ expiry: value });
  });
  reg<{ value: string }>("share.item.setUntil", ({ value }) => set({ until: value }));
  reg<{ value: string }>("share.item.setMode", ({ value }) => {
    if (value === "generate" || value === "own") set({ mode: value });
  });
  reg<{ value: string }>("share.item.setOwn", ({ value }) => set({ own: value }));
  reg("share.item.review", () => set({ reviewOpen: true }));
  reg<{ open: boolean }>("share.item.setReviewOpen", ({ open }) => set({ reviewOpen: open }));
  reg<{ id: string; expanded: boolean }>("share.item.expand", ({ id, expanded }) => set({
    expanded: expanded ? [...new Set([...state().expanded, id])] : state().expanded.filter((p) => p !== id),
  }));

  const STR = { type: "string" as const }, BOOL = { type: "boolean" as const }, NUM = { type: "number" as const };
  const OPTION = { type: "object" as const, properties: { id: STR, label: STR } };
  viewModels.register({
    id: "vm.shareItem",
    schema: { type: "object", properties: {
      open: BOOL, title: STR, name: STR, folder: BOOL, icon: STR, detail: STR, badge: STR,
      notes: NUM, folders: NUM, counting: BOOL, countingVisible: BOOL, deleted: BOOL, problem: STR, hasProblem: BOOL,
      link: BOOL, passcode: BOOL, later: BOOL, laterDetail: STR, noMethods: BOOL, blockedReason: STR,
      expiry: STR, expiries: { type: "array", items: OPTION }, until: STR, date: BOOL, never: BOOL,
      mode: STR, modes: { type: "array", items: OPTION }, own: STR, ownMode: BOOL, strength: NUM,
      reviewOpen: BOOL, reviewTitle: STR, reviewSummary: STR,
      items: { type: "array", items: { type: "object", properties: {
        id: STR, label: STR, level: NUM, folder: BOOL, kind: STR, parent: STR, hasChildren: BOOL, expanded: BOOL, selected: BOOL, readOnly: BOOL,
      } } },
    } },
    setters: { expiry: "share.item.setExpiry", until: "share.item.setUntil", mode: "share.item.setMode", own: "share.item.setOwn" },
    reads: ["ui.share.item", "workspace.tree", "tasks"],
    select: (s) => {
      const d = s.ui.share.item;
      const root = rootOf(s.workspace.tree, d.path);
      const deleted = d.open && (!root || !findNode(s.workspace.tree, d.path));
      const expanded = new Set(d.expanded);
      const visible: ReviewRow[] = [];
      let hiddenBelow = Number.POSITIVE_INFINITY;
      for (const row of d.contents) {
        if (row.level > hiddenBelow) continue;
        hiddenBelow = row.folder && !expanded.has(row.id) ? row.level : Number.POSITIVE_INFINITY;
        visible.push({ ...row, expanded: expanded.has(row.id) });
      }
      return {
        ...d, title: catalog.format("share.item.title", { name: d.name }),
        countingVisible: d.counting && s.tasks.some((t) => t.target === "share.item.count" && t.phase === "on"),
        icon: d.folder ? "folder" : "document", deleted,
        badge: catalog.format(deleted ? "share.item.deleted" : root?.id === "public" ? "share.item.public" : "share.dialog.private"),
        detail: deleted ? catalog.format("share.item.deleted") : d.folder
          ? catalog.format("share.item.counts", { notes: d.notes, folders: d.folders }) : catalog.format("share.item.note"),
        hasProblem: Boolean(d.problem),
        laterDetail: catalog.format("share.dialog.later.detail", { on: d.later ? "yes" : "no" }),
        noMethods: !d.link && !d.passcode,
        blockedReason: deleted ? catalog.format("share.state.deleted") : !d.link && !d.passcode ? catalog.format("share.dialog.keepOne") : "",
        date: d.expiry === "date", never: d.expiry === "never",
        expiries: ["7d", "30d", "90d", "date", "never"].map((id) => ({ id, label: catalog.format(id === "date" ? "share.item.date" : id === "never" ? "share.item.never" : `share.manage.expiry.${id}`) })),
        modes: ["generate", "own"].map((id) => ({ id, label: catalog.format(`share.item.${id}`) })),
        ownMode: d.mode === "own", strength: !d.own ? 0 : passcodeProblem(d.own) ? 1 : 4,
        reviewTitle: catalog.format("share.item.reviewTitle", { name: d.name }),
        reviewSummary: d.counting ? catalog.format("share.dialog.counting") : catalog.format("share.item.reviewSummary", { notes: d.notes, folders: d.folders }),
        items: visible,
      };
    },
  });
}
