import type { AppState } from "./app.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { TaskTracker } from "./tasks.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import type { AccessBridge } from "./share-manage.ts";
import { findNode, joinPath, rootOf, stemOf, type TreeNode } from "./workspace.ts";
import { audienceState, expiryFrom, expiryUntil, itemInviteText, passcodeProblem, type Audience, type ExpiryChoice } from "@focus-notes/seal/access";

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
  preparing: boolean;
  loadFailed: boolean;
  notes: number;
  folders: number;
  contents: readonly ReviewRow[];
  problem: string;
  id: string;
  busy: boolean;
  ready: boolean;
  generated: string;
  wordsId: string;
  wordsBusy: boolean;
  status: string;
  information: string;
  reviewFocus: string;
  historyOpen: boolean;
  confirmId: string;
  signedOut: boolean;
  resumeAction: string;
  startedAt: number;
  step: number;
  totalSteps: number;
  waitingId: string;
}

export const ITEM_SHARE_CLOSED: ItemShareState = {
  open: false, path: "", name: "", folder: false, link: true, passcode: false,
  later: false, expiry: "30d", until: "", mode: "generate", own: "",
  reviewOpen: false, expanded: [], counting: false, preparing: false, loadFailed: false, notes: 0, folders: 0, contents: [], problem: "",
  id: "", busy: false, ready: false, generated: "", wordsId: "", wordsBusy: false, status: "", information: "", reviewFocus: "",
  historyOpen: true, confirmId: "", signedOut: false, resumeAction: "", startedAt: 0, step: 0, totalSteps: 4, waitingId: "",
};

export function registerItemShare({ store, commands, viewModels, catalog, tracker, access, platform, flush }: {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  tracker: TaskTracker;
  access: AccessBridge | undefined;
  platform: string;
  flush: () => Promise<boolean>;
}) {
  const state = () => store.state.ui.share.item;
  const set = (patch: Partial<ItemShareState>) => store.update((s) => ({
    ...s, ui: { ...s.ui, share: { ...s.ui.share, item: { ...s.ui.share.item, ...patch } } },
  }));
  let generation = 0;
  let wordsGeneration = 0;
  const editable = () => state().open && !state().busy && !state().wordsBusy && !state().id;
  const edit = (patch: Partial<ItemShareState>) => { if (editable()) set(patch); };
  const matchesItem = (s: AppState, g: Audience) => {
    const d = s.ui.share.item, root = rootOf(s.workspace.tree, d.path);
    const relative = root ? d.path.slice(root.path.length).split(/[\\/]/).filter(Boolean).join("/") : "";
    return Boolean(g.item && g.item.path === relative && g.item.folder === d.folder);
  };
  const row = (id: string) => store.state.ui.share.listing?.grants.find((g) => g.id === id && matchesItem(store.state, g));
  const fail = (error: unknown) => {
    const code = /access:([A-Za-z.]+)/.exec(error instanceof Error ? error.message : "")?.[1];
    const signedOut = code === "signedOut" || code === "auth";
    const message = code === "offline" ? "share.item.offline" : signedOut ? "share.item.signedOut"
      : code === "scope.changed" ? "share.item.contentsChanged" : code === "notReady" ? "share.item.notReady"
      : code === "expiry.invalid" ? "share.item.expiryInvalid" : "share.item.failed";
    set({ problem: catalog.format(message), signedOut, status: "", ready: false, information: "" });
  };
  const reg = <A extends Record<string, unknown> = Record<string, never>>(id: string, run: (a: A) => void | Promise<void>) =>
    commands.register<A>({ id, title: "command.note.share", run });
  const loadListing = async (current: number) => {
    if (!access) return;
    set({ preparing: true, loadFailed: false, problem: "" });
    try {
      const listing = await tracker.section("share.item.prepare", "share.item.preparing", () => access.load());
      if (current !== generation) return;
      store.update(s => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, listing } } }));
      if (listing.localReview && (store.state.ui.share.settings.off || !listing.site)) await commands.run("sharing.firstOpen", { resume: true });
    } catch {
      if (current === generation) set({ problem: catalog.format("share.item.unavailable"), loadFailed: true });
    } finally {
      if (current === generation) set({ preparing: false });
    }
  };
  reg("share.item.reload", async () => {
    if (state().open && !state().busy && !state().preparing) await loadListing(generation);
  });
  const template = () => ["title", "link", "code", "until", "forward", "copies"].map((key) =>
    catalog.format(`share.item.information.${key}`, { title: "{title}", link: "{link}", site: "{site}", accessCode: "{accessCode}", expires: "{expires}" })).join("\n");
  const prepareWords = async () => {
    if (!editable()) return;
    if (!access?.prepareWords) throw new Error(catalog.format("share.item.unavailable"));
    const current = generation;
    const request = ++wordsGeneration;
    set({ wordsBusy: true });
    try {
      const words = await tracker.run("share.item.words", "share.item.wordsPreparing", () => access.prepareWords!());
      if (current === generation && request === wordsGeneration && !state().busy && !state().id) set({ wordsId: words.id, generated: words.value });
    } catch {
      if (current === generation && request === wordsGeneration) set({ problem: catalog.format("share.item.wordsFailed") });
    } finally {
      if (current === generation && request === wordsGeneration) set({ wordsBusy: false });
    }
  };

  reg<{ path?: string }>("share.item.open", async ({ path }) => {
    const tree = store.state.workspace.tree;
    const target = path ?? store.state.note.path;
    const node = target ? findNode(tree, target)?.node : undefined;
    if (!target || !node) throw new Error(catalog.format("share.state.deleted"));
    const current = ++generation;
    const pending = state().waitingId;
    if (pending && access?.cancelReady) await access.cancelReady(pending);
    if (current !== generation) return;
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
    await loadListing(current);
    if (node.kind !== "folder" || current !== generation) return;
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
          if (contents.length % 200 === 0) {
            set({ notes, folders, contents: [...contents] });
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
          }
        }
        if (current === generation) set({ counting: false, notes, folders, contents });
      });
    } catch {
      if (current === generation) set({ counting: false, problem: catalog.format("share.item.countFailed") });
    }
  });
  reg<{ open: boolean }>("share.item.setOpen", ({ open }) => {
    if (!open) {
      const id = state().waitingId || state().id;
      generation++; set({ ...ITEM_SHARE_CLOSED });
      if (id && access?.cancelReady) return access.cancelReady(id);
    }
  });
  reg("share.item.toggleLink", () => edit({ link: !state().link }));
  reg("share.item.togglePasscode", async () => {
    if (!editable()) return;
    set({ passcode: !state().passcode });
    if (state().passcode && !state().generated) await prepareWords();
  });
  reg("share.item.toggleLater", () => edit({ later: !state().later }));
  reg<{ value: string }>("share.item.setExpiry", ({ value }) => {
    if (["7d", "30d", "90d", "date", "never"].includes(value)) edit({ expiry: value });
  });
  reg<{ value: string }>("share.item.setUntil", ({ value }) => edit({ until: value }));
  reg<{ value: string }>("share.item.setMode", ({ value }) => {
    if (value === "generate" || value === "own") edit({ mode: value });
  });
  reg<{ value: string }>("share.item.setOwn", ({ value }) => edit({ own: value }));
  reg("share.item.review", () => set({ reviewOpen: true }));
  reg<{ id: string }>("share.item.focusReview", ({ id }) => set({ reviewFocus: id }));
  reg("share.item.newWords", prepareWords);
  reg("share.item.toggleHistory", () => set({ historyOpen: !state().historyOpen }));
  reg("share.item.addThem", async () => {
    const d = state(), current = generation, root = rootOf(store.state.workspace.tree, d.path);
    if (!d.open || d.busy || d.preparing || d.loadFailed || d.wordsBusy || d.counting || !access?.ready || root?.id !== "private") return;
    const grants = (store.state.ui.share.listing?.grants ?? []).filter((g) => matchesItem(store.state, g) && g.unsharedNotes?.length);
    const notes = d.contents.filter((r) => !r.folder).map((r) => r.id.slice(root.path.length).split(/[\\/]/).filter(Boolean).join("/"));
    set({ busy: true, problem: "", status: catalog.format("share.item.adding"), startedAt: Date.now(), step: 1, totalSteps: 2 });
    try {
      if (!(await flush()) || current !== generation) throw new Error("access:save.failed");
      for (const g of grants) {
        if (current !== generation) return;
        const listing = await tracker.run("share.item.addNotes", "share.item.adding", () => access.apply({ op: "addItemNotes", id: g.id, notes }));
        if (current !== generation) return;
        store.update((s) => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, listing } } }));
        set({ step: 2, waitingId: g.id });
        await tracker.run("share.item.publish", "share.item.publishing", () => access.ready!(g.id));
      }
      if (current === generation) set({ status: catalog.format("share.item.added") });
    } catch (error) { if (current === generation) fail(error); }
    finally { if (current === generation) set({ busy: false, waitingId: "" }); }
  });
  reg<{ id: string; what: string }>("share.item.row", async ({ id, what }) => {
    const g = row(id), current = generation;
    if (!state().open || state().busy || state().preparing || state().loadFailed || state().wordsBusy || !g) return;
    if (what === "withdraw") { set({ confirmId: id }); return; }
    if (what !== "link" || !g.link || !access?.ready) throw new Error(catalog.format("share.item.methodUnavailable"));
    set({ busy: true, problem: "", status: catalog.format("share.item.publishing"), startedAt: Date.now(), step: 1, totalSteps: 2, waitingId: id });
    try {
      await tracker.run("share.item.publish", "share.item.publishing", () => access.ready!(id));
      if (current !== generation) return;
      set({ step: 2 });
      await tracker.run("share.item.handoff", "share.item.handingOff", () => current === generation ? access.copy(id, "link") : Promise.resolve());
      if (current === generation) set({ status: catalog.format("share.item.copied.link") });
    } catch (error) { if (current === generation) fail(error); }
    finally { if (current === generation) set({ busy: false, waitingId: "" }); }
  });
  reg<{ open: boolean }>("share.item.setConfirmOpen", ({ open }) => { if (!open && !state().busy) set({ confirmId: "" }); });
  reg("share.item.withdraw", async () => {
    const id = state().confirmId, current = generation;
    if (!access || state().busy || !row(id)) return;
    set({ busy: true, problem: "" });
    try {
      const listing = await tracker.run("share.item.withdraw", "share.item.withdrawing", () => access.apply({ op: "withdraw", id }));
      if (current !== generation) return;
      store.update((s) => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, listing } } }));
      set({ confirmId: "", ...(id === state().id ? { ready: false, information: "" } : {}), status: catalog.format("share.item.withdrawn") });
    } catch (error) { if (current === generation) fail(error); }
    finally { if (current === generation) set({ busy: false }); }
  });
  reg("share.item.restore", async () => {
    if (!commands.describe("files.showDeleted").enabled) {
      set({ problem: catalog.format("share.item.restoreUnavailable") });
      return;
    }
    await commands.run("share.item.setOpen", { open: false });
    await commands.run("files.showDeleted");
  });
  reg("share.item.signIn", async () => {
    if (!state().open || state().busy || !state().signedOut) return;
    const current = generation, what = state().resumeAction;
    set({ busy: true });
    try {
      await commands.run("account.signIn");
      if (current !== generation) return;
      set({ busy: false });
      if (store.state.account.login) {
        set({ signedOut: false, problem: "" });
        await commands.run("share.item.action", { what });
      }
    } catch (error) { if (current === generation) fail(error); }
    finally { if (current === generation) set({ busy: false }); }
  });
  reg<{ open: boolean }>("share.item.setReviewOpen", ({ open }) => set({ reviewOpen: open }));
  reg<{ id: string; expanded: boolean }>("share.item.expand", ({ id, expanded }) => set({
    expanded: expanded ? [...new Set([...state().expanded, id])] : state().expanded.filter((p) => p !== id),
  }));
  reg<{ what: string }>("share.item.action", async ({ what }) => {
    if (!["primary", "link", "accessCode", "information", "passcode"].includes(what)) throw new Error("Invalid share action");
    const d = state(), current = generation;
    const root = rootOf(store.state.workspace.tree, d.path);
    if (!d.open || d.busy || d.preparing || d.wordsBusy) return;
    const invalid = d.loadFailed || !access?.ready ? "share.item.unavailable" : !findNode(store.state.workspace.tree, d.path) ? "share.state.deleted"
      : root?.id !== "private" ? "share.item.privateOnly" : d.counting ? "share.dialog.counting"
      : d.wordsBusy ? "share.item.wordsPreparing"
      : !d.link && !d.passcode ? "share.dialog.keepOne"
      : what === "link" && !d.link || (what === "accessCode" || what === "passcode") && !d.passcode ? "share.item.methodUnavailable"
      : d.passcode && d.mode === "own" && passcodeProblem(d.own) ? "share.item.passcodeInvalid" : undefined;
    if (invalid) { set({ problem: catalog.format(invalid) }); return; }
    const shell = access!;
    set({ busy: true, problem: "", signedOut: false, resumeAction: what, status: catalog.format("share.item.creating"), startedAt: Date.now(), step: 1, totalSteps: 4 });
    try {
      let id = d.id;
      if (!id) {
        const expiresAt = d.expiry === "date" ? expiryUntil(d.until) : expiryFrom(d.expiry as ExpiryChoice);
        if (expiresAt === undefined) throw new Error("access:expiry.invalid");
        const relative = (path: string) => path.slice(root!.path.length).split(/[\\/]/).filter(Boolean).join("/");
        const result = await tracker.run("share.item.create", "share.item.creating", async () => {
          if (!(await flush())) throw new Error("access:save.failed");
          if (current !== generation) throw new Error("access:cancelled");
          return shell.apply({
            op: "createItem", item: { path: relative(d.path), label: d.name, folder: d.folder, includeLater: d.later },
            notes: d.folder ? d.contents.filter((row) => !row.folder).map((row) => relative(row.id)) : [relative(d.path)],
            link: d.link, expiresAt,
            ...(d.passcode ? { passcode: d.mode === "own" ? { value: d.own } : { generate: true } } : {}),
            ...(d.passcode && d.mode === "generate" && d.wordsId ? { wordsId: d.wordsId } : {}),
          });
        });
        id = result.id;
        if (current !== generation) return;
        store.update((s) => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, listing: result } } }));
        set({ id });
      }
      if (!d.ready) {
        set({ status: catalog.format("share.item.publishing"), step: 2, waitingId: id });
        await tracker.run("share.item.publish", "share.item.publishing", () => shell.ready!(id));
      }
      if (current !== generation) return;
      set({ step: 3 });
      const secret = await tracker.run("share.item.reveal", "share.item.preparing", () => shell.reveal(id));
      if (current !== generation) return;
      const granted = store.state.ui.share.listing?.grants.find((g) => g.id === id);
      const info = itemInviteText(template(), {
        title: d.name, ...secret, site: store.state.ui.share.listing?.site ? new URL("s/", store.state.ui.share.listing.site).href : undefined,
        ...(granted?.expiresAt ? { expires: new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" }).format(new Date(granted.expiresAt)) } : {}),
      });
      set({ ready: true, information: info, generated: secret.passcode ?? state().generated });
      await tracker.run("share.item.handoff", "share.item.handingOff", async () => {
        if (current !== generation) return;
        set({ step: 4 });
        if (what === "primary" && platform === "macos") {
          if (!shell.systemShare) throw new Error("access:sheet.unavailable");
          await shell.systemShare(id, { template: template() });
        } else await shell.copy(id, what === "primary" ? "information" : what as "link" | "accessCode" | "information" | "passcode", { template: template() });
      });
      if (current === generation) set({ status: catalog.format(what === "primary" && platform === "macos" ? "share.item.sheetOpen" : `share.item.copied.${what === "primary" ? "information" : what}`) });
    } catch (error) {
      if (current === generation) {
        fail(error);
      }
    } finally { if (current === generation) set({ busy: false, waitingId: "" }); }
  });

  const STR = { type: "string" as const }, BOOL = { type: "boolean" as const }, NUM = { type: "number" as const };
  const OPTION = { type: "object" as const, properties: { id: STR, label: STR } };
  viewModels.register({
    id: "vm.shareItem",
    schema: { type: "object", properties: {
      open: BOOL, title: STR, name: STR, folder: BOOL, icon: STR, detail: STR, badge: STR,
      id: STR, busy: BOOL, ready: BOOL, generated: STR, wordsId: STR, wordsBusy: BOOL, status: STR, information: STR, controlsLocked: BOOL,
      primaryLabel: STR, macos: BOOL, reviewFocus: STR,
      dialogOpen: BOOL, historyOpen: BOOL, hasHistory: BOOL, historyCount: NUM, confirmOpen: BOOL, signedOut: BOOL, progress: STR,
      newerCount: NUM, hasNewer: BOOL,
      restoreDisabled: BOOL, restoreReason: STR,
      history: { type: "array", items: { type: "object", properties: { id: STR, methods: STR, detail: STR, badge: STR, link: BOOL, active: BOOL } } },
      lines: { type: "array", items: { type: "object", properties: { id: STR, text: STR } } },
      actionsDisabled: BOOL, actionReason: STR, controlReason: STR,
      notes: NUM, folders: NUM, counting: BOOL, countingVisible: BOOL, preparingVisible: BOOL, loadFailed: BOOL, deleted: BOOL, problem: STR, hasProblem: BOOL,
      link: BOOL, passcode: BOOL, later: BOOL, laterDetail: STR, noMethods: BOOL, blockedReason: STR,
      expiry: STR, expiries: { type: "array", items: OPTION }, until: STR, date: BOOL, never: BOOL,
      mode: STR, modes: { type: "array", items: OPTION }, own: STR, ownMode: BOOL, strength: NUM,
      reviewOpen: BOOL, reviewTitle: STR, reviewSummary: STR,
      items: { type: "array", items: { type: "object", properties: {
        id: STR, label: STR, level: NUM, folder: BOOL, kind: STR, parent: STR, hasChildren: BOOL, expanded: BOOL, selected: BOOL, readOnly: BOOL,
      } } },
    } },
    setters: { expiry: "share.item.setExpiry", until: "share.item.setUntil", mode: "share.item.setMode", own: "share.item.setOwn" },
    reads: ["ui.share.item", "ui.share.listing", "workspace.tree", "tasks"],
    select: (s) => {
      const d = s.ui.share.item;
      const root = rootOf(s.workspace.tree, d.path);
      const deleted = d.open && (!root || !findNode(s.workspace.tree, d.path));
      const blockedReason = deleted ? catalog.format("share.state.deleted") : root?.id !== "private" ? catalog.format("share.item.privateOnly")
        : !d.link && !d.passcode ? catalog.format("share.dialog.keepOne") : d.counting ? catalog.format("share.dialog.counting") : "";
      const expanded = new Set(d.expanded);
      const history = (s.ui.share.listing?.grants ?? []).filter((g) => matchesItem(s, g)).map((g) => {
        const status = audienceState(g);
        const date = (value: string) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(value));
        return { id: g.id, methods: catalog.format(`share.manage.ways.${g.link && g.passcode ? "both" : g.link ? "link" : g.passcode ? "passcode" : "none"}`),
          detail: catalog.format(g.expiresAt ? "share.item.historyDetail" : "share.item.historyNoExpiry", { created: date(g.createdAt), expires: g.expiresAt ? date(g.expiresAt) : "" }),
          badge: catalog.format(`share.item.history.${status}`), link: g.link,
          active: status === "active" || status === "soon" };
      });
      const elapsed = d.startedAt ? Math.floor((Date.now() - d.startedAt) / 1000) : 0;
      const newerCount = new Set((s.ui.share.listing?.grants ?? []).filter((g) => matchesItem(s, g)).flatMap((g) => g.unsharedNotes ?? [])).size;
      const visible: ReviewRow[] = [];
      let hiddenBelow = Number.POSITIVE_INFINITY;
      for (const row of d.contents) {
        if (row.level > hiddenBelow) continue;
        hiddenBelow = row.folder && !expanded.has(row.id) ? row.level : Number.POSITIVE_INFINITY;
        visible.push({ ...row, expanded: expanded.has(row.id) });
      }
      return {
        ...d, lines: d.information ? d.information.split("\n").map((text, id) => ({ id: String(id), text })) : [],
        dialogOpen: d.open && !d.confirmId, confirmOpen: Boolean(d.confirmId),
        history, hasHistory: history.length > 0, historyCount: history.length,
        newerCount, hasNewer: newerCount > 0,
        restoreDisabled: !commands.describe("files.showDeleted").enabled, restoreReason: catalog.format("share.item.restoreUnavailable"),
        progress: d.busy && elapsed >= 3 ? catalog.format("share.item.progress", { step: d.step, total: d.totalSteps, seconds: elapsed }) : "",
        controlsLocked: d.busy || d.wordsBusy || Boolean(d.id), macos: platform === "macos",
        controlReason: catalog.format(d.id ? "share.item.controlsSaved" : d.wordsBusy ? "share.item.wordsPreparing" : "share.item.creating"),
        actionsDisabled: d.busy || d.preparing || d.loadFailed || d.wordsBusy || Boolean(blockedReason),
        actionReason: d.preparing ? catalog.format("share.item.preparing") : d.loadFailed ? catalog.format("share.item.unavailable") : d.busy ? catalog.format("share.item.publishing") : d.wordsBusy ? catalog.format("share.item.wordsPreparing") : blockedReason,
        preparingVisible: d.preparing && !history.length && s.tasks.findLast(t => t.target === "share.item.prepare")?.phase === "on",
        primaryLabel: catalog.format("share.dialog.primary", { system: platform }),
        title: catalog.format("share.item.title", { name: d.name }),
        countingVisible: d.counting && s.tasks.some((t) => t.target === "share.item.count" && t.phase === "on"),
        icon: d.folder ? "folder" : "document", deleted,
        badge: catalog.format(deleted ? "share.item.deleted" : root?.id === "public" ? "share.item.public" : "share.dialog.private"),
        detail: deleted ? catalog.format("share.item.deleted") : d.folder
          ? catalog.format("share.item.counts", { notes: d.notes, folders: d.folders }) : catalog.format("share.item.note"),
        hasProblem: Boolean(d.problem),
        laterDetail: catalog.format("share.dialog.later.detail", { on: d.later ? "yes" : "no" }),
        noMethods: !d.link && !d.passcode,
        blockedReason,
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
