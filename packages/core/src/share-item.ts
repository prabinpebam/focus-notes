import type { AppState } from "./app.ts";
import { shareProgress, shareProgressView } from "./share-progress.ts";
import { siteProblemKey } from "./site-problem.ts";
import { opErrorCode } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { TaskTracker } from "./tasks.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { sharingAvailable, type AccessBridge } from "./share-manage.ts";
import { findNode, joinPath, rootOf, stemOf, type TreeNode } from "./workspace.ts";
import { publicLinkOf } from "./public-link-app.ts";
import { liveSharesOf } from "./share-details.ts";
import { expiryFrom, expiryUntil, itemInviteText, passcodeProblem, type ExpiryChoice } from "@focus-notes/seal/access";

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
  accessCode: string;
  templateInvalid: boolean;
  reviewFocus: string;
  signedOut: boolean;
  resumeAction: string;
  startedAt: number;
  step: number;
  totalSteps: number;
  waitingId: string;
  /** A published (public) note: Share… offers its web address only, no encryption (D-424). */
  published: boolean;
  publicUrl: string;
  /** What's missing before sharing can start (D-424, D-425): outside a project, or a project not linked to GitHub. */
  setup: "" | "notInProject" | "unlinked";
}

export const ITEM_SHARE_CLOSED: ItemShareState = {
  open: false, path: "", name: "", folder: false, link: true, passcode: false,
  later: false, expiry: "30d", until: "", mode: "generate", own: "",
  reviewOpen: false, expanded: [], counting: false, preparing: false, loadFailed: false, notes: 0, folders: 0, contents: [], problem: "",
  id: "", busy: false, ready: false, generated: "", wordsId: "", wordsBusy: false, status: "", information: "", accessCode: "", templateInvalid: false, reviewFocus: "",
  signedOut: false, resumeAction: "", startedAt: 0, step: 0, totalSteps: 4, waitingId: "",
  published: false, publicUrl: "", setup: "",
};

export function defaultItemShareTemplate(catalog: MessageCatalog): string {
  const raw = { title: "{title}", link: "{link}", site: "{site}", accessCode: "{accessCode}", expires: "{expires}" };
  return ["title", "link", "code", "until"].map((key) => catalog.format(`share.item.information.${key}`, raw)).join("\n");
}

export function registerItemShare({ store, commands, viewModels, catalog, tracker, access, platform, flush, copyText, toast, publishedUrl }: {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  tracker: TaskTracker;
  access: AccessBridge | undefined;
  platform: string;
  flush: () => Promise<boolean>;
  copyText?: (text: string) => Promise<void>;
  toast: (message: string) => unknown;
  publishedUrl?: (path: string) => string | undefined;
}) {
  const state = () => store.state.ui.share.item;
  const set = (patch: Partial<ItemShareState>) => store.update((s) => ({
    ...s, ui: { ...s.ui, share: { ...s.ui.share, item: { ...s.ui.share.item, ...patch } } },
  }));
  let generation = 0;
  let wordsGeneration = 0;
  const editable = () => state().open && !state().busy && !state().wordsBusy && !state().id;
  const edit = (patch: Partial<ItemShareState>) => { if (editable()) set(patch); };
  const progress = shareProgress(store);
  /** Moves the stepper (D-427) with the desktop's phases while `work` runs. */
  const withSteps = async <T>(work: () => Promise<T>): Promise<T> => {
    const off = access?.setup?.onStep?.(step => progress.step(step));
    try { return await work(); } finally { off?.(); }
  };
  const fail = (error: unknown) => {
    // The last match: Electron prefixes the channel ("Error invoking remote method 'access:ready': …").
    const code = [...(error instanceof Error ? error.message : "").matchAll(/access:([A-Za-z.]+)/g)].at(-1)?.[1];
    const pages = /sharing:pages/.test(error instanceof Error ? error.message : "");
    const p = progress.get();
    const stepped = (p.op === "share" || p.op === "withdraw") && !p.failed && p.at < 4;
    if (stepped) progress.fail();
    const stopped = stepped ? `${shareProgressView(progress.get(), catalog, 0).failedStep} ` : "";
    const signedOut = code === "signedOut" || code === "auth";
    const message = code === "offline" ? "share.item.offline" : signedOut ? "share.item.signedOut"
      : code === "scope.changed" ? "share.item.contentsChanged" : code === "notReady" ? "share.item.notReady"
      : code === "expiry.invalid" ? "share.item.expiryInvalid" : siteProblemKey(error) ?? (pages ? "share.item.websiteFailed" : "share.item.failed");
    set({ problem: stopped + catalog.format(message), signedOut, status: "", ready: false, information: "" });
  };
  const reg = <A extends Record<string, unknown> = Record<string, never>>(id: string, run: (a: A) => void | Promise<void>) =>
    commands.register<A>({ id, title: "command.note.share", run });
  const loadListing = async (current: number) => {
    if (!access) return;
    set({ preparing: true });
    try {
      const listing = await tracker.section("share.item.prepare", "share.item.preparing", () => access.load(), "fn:share.item.prepare", "success");
      if (current !== generation) return;
      store.update(s => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, listing } } }));
      set({ loadFailed: false, problem: "" });
      // Sharing off in a project that can turn it on: the first-share confirmation, then this item's dialog (D-418).
      const firstShare = listing.localReview ? store.state.ui.share.settings.off || !listing.site : !sharingAvailable(store.state) && Boolean(listing.available && listing.setupAvailable);
      if (firstShare) await commands.run("sharing.firstOpen", { resume: true });
      // Share… shows for every note (D-424): where the project isn't linked to GitHub yet, the dialog says how to link it.
      else if (!sharingAvailable(store.state) && !listing.localReview) {
        set({ setup: !listing.available ? "notInProject" : "unlinked" });
      }
    } catch (error) {
      if (current === generation) {
        console.error("Sharing preparation failed", opErrorCode(error));
        const problem = catalog.format("share.item.unavailable");
        const retained = state().loadFailed && state().problem === problem;
        set({ problem, loadFailed: true });
        if (retained) tracker.announceOutcome(problem);
      }
    } finally {
      if (current === generation) set({ preparing: false });
    }
  };
  reg("share.item.copyPublished", async () => {
    const d = state();
    if (!d.open || !d.published || !d.publicUrl || !copyText) return;
    try {
      await copyText(d.publicUrl);
      set({ open: false });
      toast(catalog.format("toast.publicLinkCopied", { note: d.name }));
    } catch {
      set({ problem: catalog.format("spotlight.copyFailed") });
    }
  });
  reg("share.item.fixSetup", async () => {
    const setup = state().setup;
    set({ open: false });
    if (setup === "unlinked") {
      await commands.run("settings.open");
      await commands.run("settings.setSection", { value: "project" });
    }
  });
  reg("share.item.reload", async () => {
    if (state().open && !state().busy && !state().preparing) await loadListing(generation);
  });
  const template = (useDefault = false) => (!useDefault && store.state.ui.share.listing?.itemTemplate) || defaultItemShareTemplate(catalog);
  const prepareWords = async () => {
    if (!editable()) return;
    if (!access?.prepareWords) throw new Error(catalog.format("share.item.unavailable"));
    const current = generation;
    const request = ++wordsGeneration;
    const previousId = state().wordsId || undefined;
    set({ wordsBusy: true });
    try {
      const words = await tracker.run("share.item.words", "share.item.wordsPreparing", () => access.prepareWords!(previousId));
      if (current === generation && request === wordsGeneration && !state().busy && !state().id) set({ wordsId: words.id, generated: words.value });
    } catch {
      if (current === generation && request === wordsGeneration) set({ problem: catalog.format("share.item.wordsFailed") });
    } finally {
      if (current === generation && request === wordsGeneration) set({ wordsBusy: false });
    }
  };

  reg<{ path?: string; again?: boolean }>("share.item.open", async ({ path, again }) => {
    const tree = store.state.workspace.tree;
    const target = path ?? store.state.note.path;
    const node = target ? findNode(tree, target)?.node : undefined;
    if (!target || !node) throw new Error(catalog.format("share.state.deleted"));
    // D-431: an item that's already shared has one dialog, Share details…; its Share again comes back here.
    if (!again && liveSharesOf(store.state, target).length) { await commands.run("share.details.open", { path: target }); return; }
    const current = ++generation;
    const pending = state().waitingId;
    if (pending && access?.cancelReady) await access.cancelReady(pending);
    if (current !== generation) return;
    // A published note is already a web page: sharing it is sending its address (D-424).
    // In public notes, or a private note on the live site.
    const siteUrl = node.kind === "note" ? publishedUrl?.(target) : undefined;
    const published = node.kind === "note" && (rootOf(tree, target)?.id === "public" || Boolean(siteUrl));
    set({
      ...ITEM_SHARE_CLOSED, open: true, path: target,
      name: node.kind === "note" ? node.title || stemOf(node.name) : node.name,
      folder: node.kind === "folder", counting: node.kind === "folder",
      published, publicUrl: published ? siteUrl ?? publicLinkOf(tree, store.state.workspace.site, target) ?? "" : "",
    });
    store.update((s) => ({
      ...s, ui: { ...s.ui, toolbarOpen: false,
        files: { ...s.ui.files, open: s.ui.files.pinned },
        share: { ...s.ui.share, note: { open: false } },
      },
    }));
    if (published) return;
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
      if (["share", "withdraw"].includes(progress.get().op)) progress.clear();
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
  reg<{ what: string; useDefault?: boolean }>("share.item.action", async ({ what, useDefault }) => {
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
    if (invalid) { set({ problem: catalog.format(invalid), templateInvalid: false }); return; }
    const needsInfo = what === "primary" || what === "information";
    const activeTpl = template(Boolean(useDefault));
    if (needsInfo) {
      if (!useDefault && store.state.ui.share.listing?.itemTemplateInvalid) {
        set({ problem: catalog.format("share.template.copyProblem"), templateInvalid: true, status: "" });
        return;
      }
      try {
        itemInviteText(activeTpl, {
          title: d.name,
          ...(d.link ? { link: "https://check.invalid/#x" } : {}),
          ...(d.passcode ? { site: "https://check.invalid/s/", accessCode: "AAAA-BBBB check" } : {}),
          ...(d.expiry !== "never" ? { expires: "1 January 2030" } : {}),
        });
      } catch (err) {
        const code = /access:([A-Za-z.]+)/.exec(err instanceof Error ? err.message : "")?.[1];
        if (code?.startsWith("template.")) {
          set({ problem: catalog.format("share.template.copyProblem"), templateInvalid: true, status: "" });
          return;
        }
      }
    }
    const shell = access!;
    set({ busy: true, problem: "", templateInvalid: false, signedOut: false, resumeAction: what, status: catalog.format("share.item.creating"), startedAt: Date.now(), step: 1, totalSteps: 4 });
    if (!d.ready) progress.start("share");
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
        await tracker.run("share.item.publish", "share.item.publishing", () => withSteps(() => shell.ready!(id)));
        progress.step("verify");
      }
      if (current !== generation) return;
      set({ step: 3 });
      const secret = await tracker.run("share.item.reveal", "share.item.preparing", () => shell.reveal(id));
      if (current !== generation) return;
      const granted = store.state.ui.share.listing?.grants.find((g) => g.id === id);
      const infoValues = {
        title: d.name, ...secret, site: store.state.ui.share.listing?.site ? new URL("s/", store.state.ui.share.listing.site).href : undefined,
        ...(granted?.expiresAt ? { expires: new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" }).format(new Date(granted.expiresAt)) } : {}),
      };
      let info = "";
      try { info = itemInviteText(activeTpl, infoValues); } catch (err) {
        if (needsInfo) throw err;
        info = itemInviteText(defaultItemShareTemplate(catalog), infoValues);
      }
      set({ ready: true, information: info, accessCode: secret.accessCode ?? "", generated: secret.accessCode ?? secret.passcode ?? state().generated });
      const inviteArg = { template: activeTpl, ...(useDefault ? { useDefault: true } : {}) };
      await tracker.run("share.item.handoff", "share.item.handingOff", async () => {
        if (current !== generation) return;
        set({ step: 4 });
        if (what === "primary" && platform === "macos") {
          if (!shell.systemShare) throw new Error("access:sheet.unavailable");
          await shell.systemShare(id, inviteArg);
        } else await shell.copy(id, what === "primary" ? "information" : what as "link" | "accessCode" | "information" | "passcode", inviteArg);
      });
      if (current === generation) set({ status: catalog.format(what === "primary" && platform === "macos" ? "share.item.sheetOpen" : needsInfo && useDefault ? "share.template.copiedDefault" : `share.item.copied.${what === "primary" ? "information" : what}`) });
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
      dialogOpen: BOOL, publishedOpen: BOOL, publicUrl: STR, copyDisabled: BOOL, copyReason: STR, setupVisible: BOOL, setupMessage: STR, setupAction: STR, setupFixable: BOOL, signedOut: BOOL, progress: STR,
      restoreDisabled: BOOL, restoreReason: STR,
      lines: { type: "array", items: { type: "object", properties: { id: STR, text: STR, lead: STR, code: STR, hasCode: BOOL } } },
      templateInvalid: BOOL,
      actionsDisabled: BOOL, actionReason: STR, controlReason: STR,
      notes: NUM, folders: NUM, counting: BOOL, countingVisible: BOOL, preparingVisible: BOOL, loadFailed: BOOL, retrying: BOOL, deleted: BOOL, problem: STR, hasProblem: BOOL,
      link: BOOL, passcode: BOOL, later: BOOL, laterDetail: STR, noMethods: BOOL, blockedReason: STR,
      expiry: STR, expiries: { type: "array", items: OPTION }, until: STR, date: BOOL, never: BOOL,
      mode: STR, modes: { type: "array", items: OPTION }, own: STR, ownMode: BOOL, strength: NUM,
      reviewOpen: BOOL, reviewTitle: STR, reviewSummary: STR,
      items: { type: "array", items: { type: "object", properties: {
        id: STR, label: STR, level: NUM, folder: BOOL, kind: STR, parent: STR, hasChildren: BOOL, expanded: BOOL, selected: BOOL, readOnly: BOOL,
      } } },
    } },
    setters: { expiry: "share.item.setExpiry", until: "share.item.setUntil", mode: "share.item.setMode", own: "share.item.setOwn" },
    reads: ["ui.share.item", "ui.share.listing", "ui.share.template", "workspace.tree", "tasks"],
    select: (s) => {
      const d = s.ui.share.item;
      const root = rootOf(s.workspace.tree, d.path);
      const deleted = d.open && (!root || !findNode(s.workspace.tree, d.path));
      const blockedReason = deleted ? catalog.format("share.state.deleted") : d.setup ? catalog.format(`share.item.setup.${d.setup}`) : root?.id !== "private" ? catalog.format("share.item.privateOnly")
        : !d.link && !d.passcode ? catalog.format("share.dialog.keepOne") : d.counting ? catalog.format("share.dialog.counting") : "";
      const expanded = new Set(d.expanded);
      const elapsed = d.startedAt ? Math.floor((Date.now() - d.startedAt) / 1000) : 0;
      const visible: ReviewRow[] = [];
      let hiddenBelow = Number.POSITIVE_INFINITY;
      for (const row of d.contents) {
        if (row.level > hiddenBelow) continue;
        hiddenBelow = row.folder && !expanded.has(row.id) ? row.level : Number.POSITIVE_INFINITY;
        visible.push({ ...row, expanded: expanded.has(row.id) });
      }
      const lines = d.information ? d.information.split("\n").map((text, id) => {
        const idx = d.accessCode ? text.indexOf(d.accessCode) : -1;
        if (idx >= 0) {
          return {
            id: String(id), text,
            lead: text.slice(0, idx).trimEnd(),
            code: text.slice(idx).replace(/ /g, "\u00A0"),
            hasCode: true,
          };
        }
        return { id: String(id), text, lead: "", code: "", hasCode: false };
      }) : [];
      return {
        ...d, lines,
        dialogOpen: d.open && !d.published && !s.ui.share.template.open,
        restoreDisabled: !commands.describe("files.showDeleted").enabled, restoreReason: catalog.format("share.item.restoreUnavailable"),
        progress: d.busy && elapsed >= 3 ? catalog.format("share.item.progress", { step: d.step, total: d.totalSteps, seconds: elapsed }) : "",
        controlsLocked: d.busy || d.wordsBusy || Boolean(d.id), macos: platform === "macos",
        controlReason: catalog.format(d.id ? "share.item.controlsSaved" : d.wordsBusy ? "share.item.wordsPreparing" : "share.item.creating"),
        actionsDisabled: d.busy || d.preparing || d.loadFailed || d.wordsBusy || Boolean(blockedReason),
        actionReason: d.preparing ? catalog.format("share.item.preparing") : d.loadFailed ? catalog.format("share.item.unavailable") : d.busy ? catalog.format("share.item.publishing") : d.wordsBusy ? catalog.format("share.item.wordsPreparing") : blockedReason,
        retrying: d.preparing && d.loadFailed,
        preparingVisible: d.preparing && !d.loadFailed && s.tasks.findLast(t => t.target === "share.item.prepare")?.phase === "on",
        primaryLabel: catalog.format("share.dialog.primary", { system: platform }),
        title: catalog.format("share.item.title", { name: d.name }),
        countingVisible: d.counting && s.tasks.some((t) => t.target === "share.item.count" && t.phase === "on"),
        icon: d.folder ? "folder" : "document", deleted,
        badge: catalog.format(deleted ? "share.item.deleted" : root?.id === "public" ? "share.item.public" : "share.dialog.private"),
        detail: deleted ? catalog.format("share.item.deleted") : d.folder
          ? catalog.format("share.item.counts", { notes: d.notes, folders: d.folders }) : catalog.format("share.item.note"),
        hasProblem: Boolean(d.problem),
        publishedOpen: d.open && d.published,
        copyDisabled: !d.publicUrl || !copyText, copyReason: catalog.format(d.publicUrl ? "spotlight.reason.noClipboard" : "command.note.copyPublicLink.noSite"),
        setupVisible: Boolean(d.setup), setupMessage: d.setup ? catalog.format(`share.item.setup.${d.setup}`) : "",
        setupAction: catalog.format("share.item.setup.action"), setupFixable: d.setup === "unlinked",
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
