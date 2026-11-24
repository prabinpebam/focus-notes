import type { App } from "./app.ts";
import { opErrorCode, type AppStateFile } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";
import type { TaskTracker } from "./tasks.ts";
import { BLOCK_LIST_SCHEMA, publicNoteUrl, publicPage } from "./public-page.ts";
import { findNode, joinPath, rootOf, type NoteNode, type TreeNode } from "./workspace.ts";
import type { SharingDraft } from "./sharing-people.ts";
import type { PMNode } from "@focus-notes/markdown";
import { NO_PUBLICATION, PUBLISH_STATUS_COMMAND, PUBLISH_STATUS_TITLE, publishPathOf, publishStatus, type SitePublication } from "./publish-status.ts";

interface Article { id: string; title: string; titleBlocks: PMNode[]; section: string; excerpt: string; updated: string; blocks: PMNode[] }

export const SHARING_WAITS = {
  publish: "sharing.publishDraft",
  preview: "sharing.preview",
  apply: "sharing.previewSave",
  publishSite: "sharing.publishSite",
  unpublishSite: "sharing.unpublishSite",
} as const;

/** `pending`: the build whose commit is on the site but which Pages isn't serving yet; `onLive` says when it is (O4). */
export interface PublishTaskResult { commit: string; published: readonly string[]; changed: readonly string[]; pending?: string }
/** The desktop's Publish and Unpublish (G3): the shell stages, seals, leak-checks, pushes and waits for the exact deploy. */
export interface PublishingBridge {
  /** Notes on the current public site, relative to the notes root. */
  published(): Promise<string[]>;
  /** Rejects with `sharing:<problem>`, or a leak check failure, and then nothing was pushed or recorded. */
  publish(selection: { notes: string[]; folders?: string[] }): Promise<PublishTaskResult>;
  unpublish(paths: string[]): Promise<PublishTaskResult>;
  /** `saving`, `publishing` (the Pages run for the exact commit) or `removing`. */
  onStep?(listener: (step: string) => void): () => void;
  /** A pending build is live, or still isn't after the background checks' ceiling. */
  onLive?(listener: (event: { build: string; live: boolean }) => void): () => void;
  /** D-423: a renamed or moved published note's deploy at its new address: `live`, `pending` (with its build) or `failed`. */
  onRenameFollowed?(listener: (event: { paths: string[]; status: string; build?: string; problem?: string }) => void): () => void;
  /** Deploys the recorded notes at their current paths again, after a rename's deploy failed. */
  followRetry?(): Promise<void>;
}
const PUBLISH_PROBLEMS = ["offline", "signedout", "refused", "media", "scope", "unavailable", "busy", "unacknowledged", "notlive"];
/** The plain problem for a failed Publish or Unpublish: never the note's text, a path or a secret (G3.2). */
function publishProblem(error: unknown): string {
  const text = error instanceof Error ? error.message : "";
  if (/Leak check failed/.test(text)) return "sharing.publish.problem.leak";
  const code = /sharing:([a-z]+)/.exec(text)?.[1];
  return `sharing.publish.problem.${code && PUBLISH_PROBLEMS.includes(code) ? code : "failed"}`;
}

export function registerSharingPreview(ctx: {
  store: App["store"]; commands: App["commands"]; viewModels: App["viewModels"]; catalog: MessageCatalog; tracker: TaskTracker;
  appState: () => AppStateFile; persistAppState: (patch: Partial<AppStateFile>) => Promise<void>;
  readNote: (path: string) => Promise<string>; toast: (message: string, opts?: { tone?: "info" | "error" | "success" | "warning"; action?: { command: string; label: string; args?: Record<string, unknown> } }) => unknown;
  publishing?: PublishingBridge; copyText?: (text: string) => Promise<void>;
}) {
  const { store, commands, viewModels, catalog, tracker } = ctx;
  const state = {
    open: false, publishOpen: false, target: "", name: "", folder: false, notes: 0, hasShares: false,
    page: "home", section: "", article: "", theme: "paper", font: "serif", size: "18",
    readerTheme: "system", readerFocus: false, busy: false, problem: "",
    operation: "", cancelRequested: false, cancelled: false, atomic: false,
    /** The build of a Publish that's still waiting for Pages, shown as Still publishing in its dialog (O4). */
    still: "",
  };
  type Part = { label: string; status: "waiting" | "running" | "done" | "failed" };
  let parts: Part[] = [];
  let retry: string | undefined;
  let articles: Article[] = [];
  const changed = () => store.update(s => ({ ...s }));
  const set = (patch: Partial<typeof state>) => { Object.assign(state, patch); changed(); };
  const folder = () => store.state.workspace.folder ?? "";
  const draft = (): SharingDraft => ctx.appState().sharingDrafts?.[folder()] ?? { owner: "personal", people: [] };
  const local = () => Boolean(store.state.ui.share.listing?.localReview || ctx.appState().sharingDrafts?.[folder()]);
  /** Live Publish: the desktop, with a ready paired site and no local review draft (G3). */
  const live = () => !local() && Boolean(ctx.publishing && store.state.ui.share.listing?.configured);
  const requireLocal = () => { if (!local()) throw new Error(catalog.format("share.item.unavailable")); };
  const requirePublish = () => { if (!local() && !live()) throw new Error(catalog.format("share.item.unavailable")); };
  /** A tree path relative to its private notes root, or undefined outside one. */
  const relativeOf = (path: string) => publishPathOf(store.state.workspace.tree, path);
  let unpublishTarget: { paths: string[]; title: string } | undefined;
  /** The site's notes and the Publish in flight live in the store (D-422), so Files and the menus derive their status from them. */
  const publication = () => store.state.ui.share.publication;
  const setPublication = (patch: Partial<SitePublication>) =>
    store.update(s => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, publication: { ...s.ui.share.publication, ...patch } } } }));
  let publishedFor: unknown;
  const refreshPublished = async () => {
    try { setPublication({ published: await ctx.publishing!.published() }); } catch { /* Unknown: Unpublish stays offered only for known notes. */ }
  };
  store.subscribe(() => {
    const listing = store.state.ui.share.listing;
    // Off this site (no live site, or another project's): nothing is Live here until it's read again.
    if (!ctx.publishing || !live()) {
      publishedFor = undefined;
      if (publication() !== NO_PUBLICATION) store.update(s => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, publication: NO_PUBLICATION } } }));
      return;
    }
    if (publishedFor === listing) return;
    publishedFor = listing;
    void refreshPublished();
  });
  /** The notes a path covers that are on the site: the note, or a folder's published descendants. */
  const publishedUnder = (rel: string) => publication().published.filter(p => p === rel || p.startsWith(`${rel}/`));
  const reg = <A extends Record<string, unknown>>(id: string, run: (args: A) => void | Promise<void>) =>
    commands.register<A>({ id, title: "site.preview.title", run });
  const settings = (open: boolean) => store.update(s => ({ ...s, ui: { ...s.ui, settings: { ...s.ui.settings, open, section: "sharing" } } }));
  const leaves = (node: TreeNode, path: string): { path: string; node: NoteNode }[] => node.kind === "note"
    ? [{ path, node }] : node.children.flatMap(child => leaves(child, joinPath(path, child.name)));
  const save = (patch: Partial<SharingDraft>) => ctx.persistAppState({ sharingDrafts: {
    ...ctx.appState().sharingDrafts, [folder()]: { ...draft(), ...patch },
  } });
  const stopped = () => { if (state.cancelRequested) throw new DOMException("Site preview stopped", "AbortError"); };
  const completed = (index: number) => { parts[index]!.status = "done"; changed(); };
  const start = (index: number) => { stopped(); parts[index]!.status = "running"; changed(); };
  const busy = async (command: string, operation: keyof typeof SHARING_WAITS, message: string, measure: string, labels: string[], work: () => Promise<void>) => {
    const target = SHARING_WAITS[operation];
    if (state.busy) return;
    retry = command;
    parts = labels.map(label => ({ label, status: "waiting" }));
    const previousProblem = state.operation === target ? state.problem : "";
    set({ busy: true, problem: previousProblem, operation: target, cancelRequested: false, cancelled: false, atomic: false });
    try { await tracker.run(SHARING_WAITS[operation], message, work, undefined, measure, command === "sharing.publish" ? "none" : "success"); retry = undefined; set({ problem: "" }); }
    catch (error) {
      if (state.cancelRequested && error instanceof DOMException && error.name === "AbortError") {
        parts = parts.map(part => part.status === "running" ? { ...part, status: "waiting" } : part);
        set({ cancelled: true, problem: "" });
        return;
      }
      parts = parts.map(part => part.status === "running" ? { ...part, status: "failed" } : part);
      console.error("Site preview operation failed", target, opErrorCode(error));
      const problem = catalog.format(command === "sharing.preview" ? "sharing.operation.readFailed" : "sharing.operation.saveFailed");
      set({ problem });
      if (problem === previousProblem) tracker.announceOutcome(problem);
    }
    finally { set({ busy: false, atomic: false }); }
  };
  commands.register({ id: "sharing.operationCancel", title: "project.cancel", enabled: () => state.busy && !state.atomic && !state.cancelRequested,
    run: () => set({ cancelRequested: true }) });
  commands.register({ id: "sharing.operationRetry", title: "commit.retry", enabled: () => !state.busy && Boolean(retry),
    run: () => commands.run(retry!) });
  reg<{ path?: string }>("sharing.publishOpen", ({ path }) => {
    if (state.busy) return;
    requirePublish();
    const target = path ?? store.state.note.path;
    const node = target ? findNode(store.state.workspace.tree, target)?.node : undefined;
    if (!node || !target) throw new Error(catalog.format("share.state.deleted"));
    const root = rootOf(store.state.workspace.tree, target);
    if (!root || root.id === "local" || live() && root.id !== "private") throw new Error(catalog.format("share.item.unavailable"));
    const relative = target.slice(root.path.length).split(/[\\/]/).filter(Boolean).join("/");
    set({ publishOpen: true, target, name: node.kind === "note" ? node.title || node.name.replace(/\.md$/i, "") : node.name,
      folder: node.kind === "folder", notes: leaves(node, target).length, problem: "", operation: "", cancelled: false, still: "",
      hasShares: Boolean(store.state.ui.share.listing?.grants.some(g => g.item?.path === relative)),
    });
    store.update(s => ({ ...s, ui: { ...s.ui, toolbarOpen: false, files: { ...s.ui.files, open: s.ui.files.pinned } } }));
  });
  // A live Publish or Unpublish keeps running when its dialog closes (G3.5); a local draft save doesn't close mid-way.
  reg<Record<string, never>>("sharing.publishClose", () => {
    if (!state.busy || state.operation === SHARING_WAITS.publishSite || state.operation === SHARING_WAITS.unpublishSite) set({ publishOpen: false });
  });
  /** One leavable live task: not cancellable once started, its problem shown in the dialog or, when closed, a notification with Retry. */
  const waiters = new Map<string, (live: boolean) => void>();
  ctx.publishing?.onLive?.(({ build, live }) => { const resolve = waiters.get(build); waiters.delete(build); resolve?.(live); });
  /**
   * The push landed but Pages hasn't served it yet (O4): a background task until the shell says it's live, then the
   * outcome; at the shell's ceiling, an error with Retry. The person can close the dialog and keep working meanwhile.
   */
  const awaitLive = (build: string, message: string, command: string, live: () => void, settled?: () => void) => {
    const served = new Promise<boolean>(resolve => waiters.set(build, resolve));
    void tracker.run("sharing.publishLive", message, async () => { if (!await served) throw new Error("sharing:notlive"); },
      undefined, "fn:sharing.publishLive", "none").then(() => {
      settled?.();
      if (state.still === build) { parts = parts.map(part => ({ ...part, status: "done" })); set({ still: "", publishOpen: false }); }
      live();
    }, error => {
      settled?.();
      const problem = catalog.format(publishProblem(error));
      retry = command;
      const inDialog = state.still === build && state.publishOpen;
      if (state.still === build) { parts = parts.map(part => part.status === "running" ? { ...part, status: "failed" } : part); set({ still: "", problem }); }
      if (!inDialog) ctx.toast(problem, { tone: "error", action: { command: "sharing.operationRetry", label: catalog.format("commit.retry") } });
    });
  };
  /**
   * D-423: one notification for a published note that followed its rename: Published at the new address with Copy
   * link (one note), or the problem with Retry while the old page stays live. Pages being slow is Still publishing (O4).
   */
  ctx.publishing?.onRenameFollowed?.(({ paths, status, build, problem }) => {
    void refreshPublished();
    const moved = () => ctx.toast(catalog.format("sharing.publish.followed"), { tone: "success",
      ...(paths.length === 1 ? { action: { command: "sharing.copyPublishedLink", label: catalog.format("sharing.publish.copyLink"), args: { path: paths[0] } } } : {}) });
    if (status === "live") moved();
    else if (status === "pending" && build) awaitLive(build, "sharing.publish.stillPublishing", "sharing.followRetry", moved);
    else {
      retry = "sharing.followRetry";
      ctx.toast(catalog.format(/sharing:offline/.test(problem ?? "") ? "sharing.publish.followOffline" : "sharing.publish.followFailed"),
        { tone: "error", action: { command: "sharing.operationRetry", label: catalog.format("commit.retry") } });
    }
  });
  reg<Record<string, never>>("sharing.followRetry", async () => { await ctx.publishing?.followRetry?.(); });
  const liveTask = async (command: string, operation: "publishSite" | "unpublishSite", message: string, labels: string[], work: () => Promise<void>) => {
    if (state.busy) return;
    const target = SHARING_WAITS[operation], publishing = operation === "publishSite";
    retry = command;
    parts = labels.map(label => ({ label, status: "waiting" }));
    set({ busy: true, problem: "", operation: target, cancelRequested: false, cancelled: false, atomic: true, still: "" });
    const off = ctx.publishing?.onStep?.(step => {
      if (step === "publishing" && parts[0]?.status === "running") { completed(0); parts[1]!.status = "running"; changed(); }
    });
    try {
      await tracker.run(publishing ? "sharing.publishSite" : "sharing.unpublishSite", message, work, undefined,
        publishing ? "fn:sharing.publishSite" : "fn:sharing.unpublishSite", "none");
      retry = undefined;
    } catch (error) {
      parts = parts.map(part => part.status === "running" ? { ...part, status: "failed" } : part);
      console.error("Publish operation failed", target, opErrorCode(error));
      const problem = catalog.format(publishProblem(error));
      set({ problem });
      if (!state.publishOpen) ctx.toast(problem, { tone: "error", action: { command: "sharing.operationRetry", label: catalog.format("commit.retry") } });
    } finally {
      off?.();
      set({ busy: false, atomic: false });
    }
  };
  const publishLive = async (node: TreeNode) => {
    const notes = leaves(node, state.target).map(n => relativeOf(n.path)).filter((p): p is string => Boolean(p));
    const folder = node.kind === "folder" ? relativeOf(state.target) : undefined;
    const title = state.name;
    await liveTask("sharing.publish", "publishSite", "sharing.publish.savingGitHub",
      [catalog.format("sharing.operation.saveGitHub"), catalog.format("sharing.operation.deploy")], async () => {
      parts[0]!.status = "running"; changed();
      setPublication({ publishing: notes });
      let pending = false;
      try {
        const result = await ctx.publishing!.publish({ notes, ...(folder ? { folders: [folder] } : {}) });
        const link = node.kind === "note" ? notes[0] : undefined;
        const published = () => ctx.toast(catalog.format("sharing.publish.published", { title }), { tone: "success",
          ...(link && result.published.includes(link) ? { action: { command: "sharing.copyPublishedLink", label: catalog.format("sharing.publish.copyLink"), args: { path: link, title } } } : {}) });
        if (result.pending) {
          // The notes stay Publishing… (D-422) until Pages serves the build (O4).
          pending = true;
          setPublication({ published: result.published });
          parts[0]!.status = "done"; parts[1]!.status = "running";
          set({ still: result.pending });
          awaitLive(result.pending, "sharing.publish.stillPublishing", "sharing.publish", published, () => setPublication({ publishing: [] }));
          return;
        }
        setPublication({ published: result.published, publishing: [] });
        parts = parts.map(part => ({ ...part, status: "done" }));
        set({ publishOpen: false });
        published();
      } finally {
        if (!pending && publication().publishing.length) setPublication({ publishing: [] });
      }
    });
  };
  reg<Record<string, never>>("sharing.publish", async () => {
    if (state.busy || state.still) return;
    requirePublish();
    const node = findNode(store.state.workspace.tree, state.target)?.node;
    if (!node) throw new Error(catalog.format("share.state.deleted"));
    if (!local()) return publishLive(node);
    await busy("sharing.publish", "publish", "sharing.publish.saving", "fn:sharing.publishDraft",
      [catalog.format("sharing.operation.select"), catalog.format("sharing.operation.saveDraft")], async () => {
      start(0);
      const published = [...new Set([...(draft().published ?? []), ...leaves(node, state.target).map(n => n.path)])];
      completed(0);
      start(1); set({ atomic: true });
      await save({ published });
      completed(1);
      set({ publishOpen: false });
      ctx.toast(catalog.format("sharing.publish.saved"));
    });
  });
  // Unpublish (G3.4): the current site loses the note once that deploy succeeds; the note itself stays.
  reg<Record<string, never>>("sharing.unpublish", async () => {
    const target = unpublishTarget;
    if (!target || !live()) return;
    await liveTask("sharing.unpublish", "unpublishSite", "sharing.unpublish.removing",
      [catalog.format("sharing.operation.removeGitHub"), catalog.format("sharing.operation.deploy")], async () => {
      parts[0]!.status = "running"; changed();
      const result = await ctx.publishing!.unpublish(target.paths);
      setPublication({ published: result.published });
      const done = () => ctx.toast(catalog.format("sharing.unpublish.done", { title: target.title }), { tone: "success" });
      if (result.pending) {
        parts[0]!.status = "done"; parts[1]!.status = "running"; changed();
        awaitLive(result.pending, "sharing.unpublish.stillRemoving", "sharing.unpublish", done);
        return;
      }
      parts = parts.map(part => ({ ...part, status: "done" }));
      done();
    });
  });
  /** Unpublish of a note or folder, with the notes of it that are on the site; undefined when none are. */
  const unpublishOf = (path: string | undefined) => {
    const rel = path ? relativeOf(path) : undefined;
    const paths = rel ? publishedUnder(rel) : [];
    if (!path || !rel || !paths.length) return undefined;
    const node = findNode(store.state.workspace.tree, path)?.node;
    return { paths, title: node?.kind === "note" ? node.title || node.name.replace(/\.md$/i, "") : node?.name ?? rel };
  };
  commands.register({
    id: "note.unpublish", title: "command.note.unpublish", icon: "globe",
    enabled: () => live() && !state.busy && Boolean(unpublishOf(store.state.note.path)),
    disabledReason: () => live() ? "sharing.unpublish.notPublished" : "sharing.unpublish.unavailable",
    run: async () => {
      unpublishTarget = unpublishOf(store.state.note.path);
      if (unpublishTarget) await commands.run("sharing.unpublish");
    },
  });
  commands.register({
    id: "files.unpublish", title: "command.note.unpublish", icon: "globe",
    enabled: () => live() && !state.busy && Boolean(unpublishOf(store.state.ui.files.selection.focus)),
    run: async () => {
      unpublishTarget = unpublishOf(store.state.ui.files.selection.focus);
      if (unpublishTarget) await commands.run("sharing.unpublish");
    },
  });
  reg<{ path: string; title?: string }>("sharing.copyPublishedLink", async ({ path, title }) => {
    const site = store.state.ui.share.listing?.site;
    if (!site || !ctx.copyText || typeof path !== "string") return;
    try {
      await ctx.copyText(publicNoteUrl(site, path));
      ctx.toast(catalog.format("toast.publicLinkCopied", { note: title ?? path }));
    } catch {
      ctx.toast(catalog.format("spotlight.copyFailed"), { tone: "error" });
    }
  });
  commands.register({
    id: "note.publish", title: "command.note.publish", icon: "globe", enabled: () => (local() || live()) && Boolean(store.state.note.path),
    disabledReason: "sharing.publish.localOnly", run: () => commands.run("sharing.publishOpen"),
  });
  // The open note's status line in ⋯ and File (D-422): words, never an action; hidden where it can't publish.
  commands.register({
    id: PUBLISH_STATUS_COMMAND, title: PUBLISH_STATUS_TITLE, icon: "globe", enabled: () => false,
    label: s => {
      const status = live() ? publishStatus(publishPathOf(s.workspace.tree, s.note.path), s.ui.share.publication) : undefined;
      return status ? `sharing.publish.status.${status}` : PUBLISH_STATUS_TITLE;
    },
    run: () => undefined,
  });
  commands.register({
    id: "files.publish", title: "command.note.publish", icon: "globe", enabled: () => local() || live(),
    run: () => commands.run("sharing.publishOpen", { path: store.state.ui.files.selection.focus }),
  });
  reg<Record<string, never>>("sharing.preview", async () => {
    if (state.busy) return;
    requireLocal();
    const tree = store.state.workspace.tree;
    const publicRoot = tree.roots.find(r => r.id === "public");
    const publicNotes = publicRoot?.children.flatMap(n => leaves(n, joinPath(publicRoot.path, n.name))) ?? [];
    const selected = (draft().published ?? []).flatMap(path => {
      const node = findNode(tree, path)?.node;
      return node?.kind === "note" ? [{ path, node }] : [];
    });
    const notes = [...new Map([...publicNotes, ...selected].map(n => [n.path, n])).values()];
    await busy("sharing.preview", "preview", "sharing.preview.preparing", "fn:site.preview",
      [...notes.map(({ node }) => catalog.format("sharing.operation.read", { title: node.title || node.name })), catalog.format("sharing.operation.show")], async () => {
      const paths = new Set(notes.map(n => {
        const root = rootOf(tree, n.path)!;
        return n.path.slice(root.path.length).split(/[\\/]/).filter(Boolean).join("/");
      }));
      const next: Article[] = [];
      for (const [index, { path, node }] of notes.entries()) {
        start(index);
        const root = rootOf(tree, path)!;
        const relative = path.slice(root.path.length).split(/[\\/]/).filter(Boolean).join("/");
        const markdown = path === store.state.note.path ? store.state.note.markdown : await ctx.readNote(path);
        stopped();
        const updated = node.changed ? new Date(node.changed).toISOString() : "";
        const page = publicPage(markdown, relative, updated, paths);
        next.push({ id: path, title: page.title || node.title || node.name, section: relative.includes("/") ? relative.split("/")[0]! : "",
          excerpt: page.excerpt ?? page.description, updated: updated ? new Intl.DateTimeFormat(catalog.locale, { dateStyle: "medium" }).format(new Date(updated)) : "",
          titleBlocks: page.model.title, blocks: page.model.body });
        completed(index);
      }
      start(notes.length);
      articles = next;
      set({ open: true, page: "home", section: "", article: "", theme: draft().theme ?? "paper", font: draft().font ?? "serif", size: String(draft().size ?? 18), readerTheme: "system", readerFocus: false });
      settings(false);
      completed(notes.length);
    });
  });
  reg<Record<string, never>>("sharing.previewClose", () => { if (!state.busy) { set({ open: false }); settings(true); } });
  reg<Record<string, never>>("sharing.previewFiles", async () => {
    if (state.busy) return;
    set({ open: false });
    settings(false);
    if (!store.state.ui.files.open) await commands.run("files.open");
  });
  reg<Record<string, never>>("sharing.previewApply", async () => {
    if (state.busy) return;
    requireLocal();
    await busy("sharing.previewApply", "apply", "sharing.preview.saving", "fn:site.settings",
      [catalog.format("sharing.operation.appearance"), catalog.format("sharing.operation.saveSettings")], async () => {
      start(0);
      const appearance = { theme: state.theme, font: state.font, size: Number(state.size) };
      completed(0);
      start(1); set({ atomic: true });
      await save(appearance);
      completed(1);
      set({ open: false }); settings(true);
    });
  });
  const choices = { theme: ["paper", "sepia", "ink", "dusk"], font: ["serif", "sans", "hyperlegible"], size: ["16", "18", "20"], readerTheme: ["light", "dark", "system"] };
  for (const key of ["theme", "font", "size", "readerTheme"] as const) reg<{ value: string }>(`sharing.preview.${key}`, ({ value }) => {
    if (state.busy && state.operation === "sharing.previewSave") return;
    if (!choices[key].includes(value)) throw new Error("Invalid site appearance");
    set({ [key]: value });
  });
  reg<{ value: boolean }>("sharing.preview.readerFocus", ({ value }) => set({ readerFocus: value }));
  reg<{ id?: string }>("sharing.previewHome", () => set({ page: "home", section: "", article: "" }));
  reg<{ id: string }>("sharing.previewSection", ({ id }) => set({ page: "section", section: id, article: "" }));
  reg<{ id: string }>("sharing.previewArticle", ({ id }) => {
    const article = articles.find(a => a.id === id);
    if (!article) throw new Error(catalog.format("share.state.deleted"));
    set({ page: "article", article: id, section: article.section });
  });
  const str = { type: "string" as const }, bool = { type: "boolean" as const };
  const option = { type: "object" as const, properties: { id: str, label: str, icon: str } };
  const card = { type: "object" as const, properties: { id: str, title: str, count: str, icon: str, excerpt: str } };
  viewModels.register({
    id: "vm.sharingPreview", reads: "*",
    setters: Object.fromEntries([...Object.keys(choices), "readerFocus"].map(key => [key, `sharing.preview.${key}`])),
    schema: { type: "object", properties: {
      open: bool, publishOpen: bool, publishTitle: str, name: str, detail: str, icon: str, publishText: str, hasShares: bool, busy: bool, publishBusy: bool, problem: str,
      showProgress: bool, failed: bool, stillPublishing: bool, recovery: bool, canCancel: bool, cancelRequested: bool, cancelled: bool, appearanceLocked: bool,
      completed: { type: "number" }, total: { type: "number" }, progress: { type: "number" }, progressLabel: str, elapsed: str, cancelLabel: str, cancelReason: str,
      parts: { type: "array", items: { type: "object", properties: { id: str, label: str, icon: str, tone: str, busy: bool } } },
      theme: str, scopeTheme: str, font: str, size: str, contentSize: { type: "number" }, scheme: str, readerTheme: str, readerFocus: bool, page: str,
      themes: { type: "array", items: option }, fonts: { type: "array", items: option }, sizes: { type: "array", items: option }, readerThemes: { type: "array", items: option },
      sections: { type: "array", items: card }, articles: { type: "array", items: card }, homeArticles: { type: "array", items: card },
      section: str, sectionTitle: str, count: str, articleTitle: str, titleBlocks: BLOCK_LIST_SCHEMA, updated: str, blocks: BLOCK_LIST_SCHEMA,
    } },
    select: () => {
      const article = articles.find(a => a.id === state.article);
      const sections = [...new Set(articles.map(a => a.section).filter(Boolean))].map(id => ({
        id, title: id, count: catalog.format("site.preview.count", { count: articles.filter(a => a.section === id).length }), icon: "folder",
      }));
      const list = articles.filter(a => a.section === state.section);
      const dark = state.readerTheme === "system" ? ["ink", "dusk"].includes(state.theme) : state.readerTheme === "dark";
      const warm = ["sepia", "dusk"].includes(state.theme);
      const done = parts.filter(part => part.status === "done").length;
      const task = store.state.tasks.findLast(task => task.target === state.operation);
      return {
        ...state, publishTitle: catalog.format("sharing.publish.title", { title: state.name }),
        showProgress: Boolean(state.operation) && (state.busy || Boolean(state.problem) || state.cancelled || Boolean(state.still)),
        failed: Boolean(state.problem), stillPublishing: Boolean(state.still) && !state.busy && !state.problem, recovery: Boolean(retry),
        // Still publishing keeps Publish busy, so the same notes aren't sent again while GitHub catches up.
        publishBusy: state.busy || Boolean(state.still) && !state.problem,
        canCancel: state.busy && !state.atomic && !state.cancelRequested,
        appearanceLocked: state.busy && state.operation === "sharing.previewSave",
        completed: done, total: parts.length, progress: parts.length ? done / parts.length * 100 : 0,
        progressLabel: catalog.format("project.new.progress", { done, total: parts.length }),
        elapsed: state.busy && task?.elapsed ? catalog.format("task.elapsed", { words: catalog.format(task.message), seconds: task.elapsed }) : "",
        cancelLabel: catalog.format(state.cancelRequested ? "project.new.stopping" : "project.cancel"),
        cancelReason: catalog.format(state.atomic ? "sharing.operation.finishing" : "project.new.stopping"),
        parts: parts.map((part, index) => ({ id: String(index), label: part.label, icon: part.status === "done" ? "check" : part.status === "failed" ? "error" : "document",
          tone: part.status === "done" ? "success" : part.status === "failed" ? "danger" : "neutral", busy: part.status === "running" && (state.busy || Boolean(state.still)) })),
        detail: state.folder ? catalog.format("site.preview.count", { count: state.notes }) : catalog.format("sharing.article"),
        icon: state.folder ? "folder" : "document", publishText: catalog.format(live() ? "sharing.publish.liveText" : "sharing.publish.text", { title: state.name }),
        scheme: state.readerTheme === "system" ? (["ink", "dusk"].includes(state.theme) ? "dark" : "light") : state.readerTheme,
        scopeTheme: dark ? warm ? "dusk" : "ink" : warm ? "sepia" : "paper",
        contentSize: Number(state.size), sections, articles: list, homeArticles: articles.filter(a => !a.section),
        sectionTitle: state.section, count: catalog.format("site.preview.count", { count: list.length }),
        articleTitle: article?.title ?? "", titleBlocks: article?.titleBlocks ?? [], updated: article?.updated ? catalog.format("sharing.preview.updated", { date: article.updated }) : "", blocks: article?.blocks ?? [],
        themes: choices.theme.map(id => ({ id, label: catalog.format(`sharing.theme.${id}`) })),
        fonts: choices.font.map(id => ({ id, label: catalog.format(`sharing.font.${id}`) })),
        sizes: choices.size.map(id => ({ id, label: catalog.format(`sharing.size.${id}`) })),
        readerThemes: choices.readerTheme.map(id => ({ id, label: catalog.format(`command.appearance.${id}`), icon: `${id}Theme` })),
      };
    },
  });
}
