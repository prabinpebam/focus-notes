import type { App } from "./app.ts";
import { opErrorCode, type AppStateFile } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";
import type { TaskTracker } from "./tasks.ts";
import { BLOCK_LIST_SCHEMA, publicPage } from "./public-page.ts";
import { findNode, joinPath, rootOf, type NoteNode, type TreeNode } from "./workspace.ts";
import type { SharingDraft } from "./sharing-people.ts";
import type { PMNode } from "@focus-notes/markdown";

interface Article { id: string; title: string; section: string; excerpt: string; updated: string; blocks: PMNode[] }

export function registerSharingPreview(ctx: {
  store: App["store"]; commands: App["commands"]; viewModels: App["viewModels"]; catalog: MessageCatalog; tracker: TaskTracker;
  appState: () => AppStateFile; persistAppState: (patch: Partial<AppStateFile>) => Promise<void>;
  readNote: (path: string) => Promise<string>; toast: (message: string) => unknown;
}) {
  const { store, commands, viewModels, catalog, tracker } = ctx;
  const state = {
    open: false, publishOpen: false, target: "", name: "", folder: false, notes: 0, hasShares: false,
    page: "home", section: "", article: "", theme: "paper", font: "serif", size: "18",
    readerTheme: "system", readerFocus: false, busy: false, problem: "",
    operation: "", cancelRequested: false, cancelled: false, atomic: false,
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
  const requireLocal = () => { if (!local()) throw new Error(catalog.format("share.item.unavailable")); };
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
  const busy = async (command: string, target: string, message: string, measure: string, labels: string[], work: () => Promise<void>) => {
    if (state.busy) return;
    retry = command;
    parts = labels.map(label => ({ label, status: "waiting" }));
    set({ busy: true, problem: state.operation === target ? state.problem : "", operation: target, cancelRequested: false, cancelled: false, atomic: false });
    try { await tracker.run(target, message, work, undefined, measure, command === "sharing.publish" ? "none" : "success"); retry = undefined; set({ problem: "" }); }
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
    }
    finally { set({ busy: false, atomic: false }); }
  };
  commands.register({ id: "sharing.operationCancel", title: "project.cancel", enabled: () => state.busy && !state.atomic && !state.cancelRequested,
    run: () => set({ cancelRequested: true }) });
  commands.register({ id: "sharing.operationRetry", title: "commit.retry", enabled: () => !state.busy && Boolean(retry),
    run: () => commands.run(retry!) });
  reg<{ path?: string }>("sharing.publishOpen", ({ path }) => {
    if (state.busy) return;
    requireLocal();
    const target = path ?? store.state.note.path;
    const node = target ? findNode(store.state.workspace.tree, target)?.node : undefined;
    if (!node || !target) throw new Error(catalog.format("share.state.deleted"));
    const root = rootOf(store.state.workspace.tree, target);
    if (!root || root.id === "local") throw new Error(catalog.format("share.item.unavailable"));
    const relative = target.slice(root.path.length).split(/[\\/]/).filter(Boolean).join("/");
    set({ publishOpen: true, target, name: node.kind === "note" ? node.title || node.name.replace(/\.md$/i, "") : node.name,
      folder: node.kind === "folder", notes: leaves(node, target).length, problem: "", operation: "", cancelled: false,
      hasShares: Boolean(store.state.ui.share.listing?.grants.some(g => g.item?.path === relative)),
    });
    store.update(s => ({ ...s, ui: { ...s.ui, toolbarOpen: false, files: { ...s.ui.files, open: s.ui.files.pinned } } }));
  });
  reg<Record<string, never>>("sharing.publishClose", () => { if (!state.busy) set({ publishOpen: false }); });
  reg<Record<string, never>>("sharing.publish", async () => {
    if (state.busy) return;
    requireLocal();
    const node = findNode(store.state.workspace.tree, state.target)?.node;
    if (!node) throw new Error(catalog.format("share.state.deleted"));
    await busy("sharing.publish", "sharing.publishDraft", "sharing.publish.saving", "fn:sharing.publishDraft",
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
  commands.register({
    id: "note.publish", title: "command.note.publish", icon: "globe", enabled: () => local() && Boolean(store.state.note.path),
    disabledReason: "sharing.publish.localOnly", run: () => commands.run("sharing.publishOpen"),
  });
  commands.register({
    id: "files.publish", title: "command.note.publish", icon: "globe", enabled: () => local(),
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
    await busy("sharing.preview", "sharing.preview", "sharing.preview.preparing", "fn:site.preview",
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
          blocks: page.model.body });
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
    await busy("sharing.previewApply", "sharing.previewSave", "sharing.preview.saving", "fn:site.settings",
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
  const option = { type: "object" as const, properties: { id: str, label: str } };
  const card = { type: "object" as const, properties: { id: str, title: str, count: str, icon: str, excerpt: str } };
  viewModels.register({
    id: "vm.sharingPreview", reads: "*",
    setters: Object.fromEntries([...Object.keys(choices), "readerFocus"].map(key => [key, `sharing.preview.${key}`])),
    schema: { type: "object", properties: {
      open: bool, publishOpen: bool, publishTitle: str, name: str, detail: str, icon: str, publishText: str, hasShares: bool, busy: bool, problem: str,
      showProgress: bool, failed: bool, recovery: bool, canCancel: bool, cancelRequested: bool, cancelled: bool, appearanceLocked: bool,
      completed: { type: "number" }, total: { type: "number" }, progress: { type: "number" }, progressLabel: str, elapsed: str, cancelLabel: str, cancelReason: str,
      parts: { type: "array", items: { type: "object", properties: { id: str, label: str, icon: str, tone: str, busy: bool } } },
      theme: str, scopeTheme: str, font: str, size: str, contentSize: { type: "number" }, scheme: str, readerTheme: str, readerFocus: bool, page: str,
      themes: { type: "array", items: option }, fonts: { type: "array", items: option }, sizes: { type: "array", items: option }, readerThemes: { type: "array", items: option },
      sections: { type: "array", items: card }, articles: { type: "array", items: card }, homeArticles: { type: "array", items: card },
      section: str, sectionTitle: str, count: str, articleTitle: str, updated: str, blocks: BLOCK_LIST_SCHEMA,
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
        showProgress: Boolean(state.operation) && (state.busy || Boolean(state.problem) || state.cancelled),
        failed: Boolean(state.problem), recovery: Boolean(retry),
        canCancel: state.busy && !state.atomic && !state.cancelRequested,
        appearanceLocked: state.busy && state.operation === "sharing.previewSave",
        completed: done, total: parts.length, progress: parts.length ? done / parts.length * 100 : 0,
        progressLabel: catalog.format("project.new.progress", { done, total: parts.length }),
        elapsed: state.busy && task?.elapsed ? catalog.format("task.elapsed", { words: catalog.format(task.message), seconds: task.elapsed }) : "",
        cancelLabel: catalog.format(state.cancelRequested ? "project.new.stopping" : "project.cancel"),
        cancelReason: catalog.format(state.atomic ? "sharing.operation.finishing" : "project.new.stopping"),
        parts: parts.map((part, index) => ({ id: String(index), label: part.label, icon: part.status === "done" ? "check" : part.status === "failed" ? "error" : "document",
          tone: part.status === "done" ? "success" : part.status === "failed" ? "danger" : "neutral", busy: part.status === "running" && state.busy })),
        detail: state.folder ? catalog.format("site.preview.count", { count: state.notes }) : catalog.format("sharing.article"),
        icon: state.folder ? "folder" : "document", publishText: catalog.format("sharing.publish.text", { title: state.name }),
        scheme: state.readerTheme === "system" ? (["ink", "dusk"].includes(state.theme) ? "dark" : "light") : state.readerTheme,
        scopeTheme: dark ? warm ? "dusk" : "ink" : warm ? "sepia" : "paper",
        contentSize: Number(state.size), sections, articles: list, homeArticles: articles.filter(a => !a.section),
        sectionTitle: state.section, count: catalog.format("site.preview.count", { count: list.length }),
        articleTitle: article?.title ?? "", updated: article?.updated ? catalog.format("sharing.preview.updated", { date: article.updated }) : "", blocks: article?.blocks ?? [],
        themes: choices.theme.map(id => ({ id, label: catalog.format(`sharing.theme.${id}`) })),
        fonts: choices.font.map(id => ({ id, label: catalog.format(`sharing.font.${id}`) })),
        sizes: choices.size.map(id => ({ id, label: catalog.format(`sharing.size.${id}`) })),
        readerThemes: choices.readerTheme.map(id => ({ id, label: catalog.format(`command.appearance.${id}`) })),
      };
    },
  });
}
