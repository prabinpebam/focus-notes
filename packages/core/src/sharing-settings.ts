import { audienceState, expiryFrom, type ExpiryChoice } from "@focus-notes/seal/access";
import type { AppState } from "./app.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { TaskTracker } from "./tasks.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { sharingAvailable, type AccessBridge, type ShareManageState } from "./share-manage.ts";
import { joinPath, findNode } from "./workspace.ts";
import { opErrorCode } from "./bridge.ts";

export function registerSharingSettings({ store, catalog, commands, viewModels, tracker, access }: {
  store: Store<AppState>; catalog: MessageCatalog; commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>; tracker: TaskTracker; access?: AccessBridge;
}) {
  const state = () => store.state.ui.share.settings;
  const set = (patch: Partial<ShareManageState["settings"]>) => store.update(s => ({
    ...s, ui: { ...s.ui, share: { ...s.ui.share, settings: { ...s.ui.share.settings, ...patch } } },
  }));
  const reg = <A extends Record<string, unknown>>(id: string, run: (args: A) => void | Promise<void>) =>
    commands.register<A>({ id, title: "share.settings.title", run });
  reg<{ value: string }>("sharing.filter", ({ value }) => set({ filter: value }));
  reg<{ value: string }>("sharing.query", ({ value }) => set({ query: value }));
  reg<Record<string, never>>("sharing.emptyAction", async () => {
    if (store.state.ui.share.loading || store.state.ui.share.failed || !store.state.ui.share.listing) return;
    if (state().query.trim() || state().filter !== "all") set({ query: "", filter: "all" });
    else await commands.run("sharing.previewFiles");
  });
  const settingsOpen = (open: boolean) => store.update(s => ({ ...s, ui: { ...s.ui, settings: { ...s.ui.settings, open, section: "sharing" } } }));
  reg<{ id?: string; kind: string }>("sharing.confirmOpen", ({ id = "", kind }) => { set({ dialog: kind, id, problem: "" }); settingsOpen(false); });
  reg<Record<string, never>>("sharing.confirmClose", () => { if (!state().busy) { set({ dialog: "" }); settingsOpen(true); } });
  let setupGeneration = 0;
  let setupPending = false;
  const projectKey = () => `${store.state.workspace.folder ?? ""}:${store.state.workspace.repo ?? ""}`;
  reg<{ resume?: boolean }>("sharing.firstOpen", async ({ resume = false }) => {
    if (setupPending) return;
    const review = store.state.ui.share.listing?.localReview;
    if (!review && !access?.setup) throw new Error(catalog.format("share.item.unavailable"));
    const generation = ++setupGeneration, project = projectKey();
    set({ dialog: "first", more: false, resume, problem: "", setupPreview: undefined, setupStep: "check", busy: !review });
    settingsOpen(false);
    if (resume) store.update(s => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, item: { ...s.ui.share.item, open: false } } } }));
    if (review) return;
    setupPending = true;
    try {
      const preview = await tracker.section("sharing.setup.describe", "share.item.preparing", () => access!.setup!.describe(), "fn:sharing.setup.describe", "success");
      if (generation === setupGeneration && project === projectKey()) set({ setupPreview: preview });
    } catch (error) {
      console.error("Sharing setup preview failed", opErrorCode(error));
      if (generation === setupGeneration && project === projectKey()) set({ problem: catalog.format("sharing.setup.unavailable") });
    } finally {
      setupPending = false;
      if (generation === setupGeneration && project === projectKey()) set({ busy: false });
    }
  });
  reg<Record<string, never>>("sharing.firstMore", () => set({ more: !state().more }));
  const firstClose = (accepted: boolean) => {
    const resume = state().resume;
    ++setupGeneration;
    set({ dialog: "", busy: false, ...(accepted ? { off: false } : {}) });
    if (resume) store.update(s => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, item: { ...s.ui.share.item, open: accepted } } } }));
    else settingsOpen(true);
  };
  reg<Record<string, never>>("sharing.firstClose", () => firstClose(false));
  reg<Record<string, never>>("sharing.firstAccept", async () => {
    if (setupPending || state().dialog !== "first") return;
    if (store.state.ui.share.listing?.localReview) { firstClose(true); return; }
    const preview = state().setupPreview, setup = access?.setup;
    if (!setup || !preview) { await commands.run("sharing.firstOpen", { resume: state().resume }); return; }
    const generation = ++setupGeneration, project = projectKey();
    const current = () => generation === setupGeneration && project === projectKey();
    setupPending = true;
    set({ busy: true, problem: "", setupStep: "check" });
    const unsubscribe = setup.onStep?.(step => { if (current()) set({ setupStep: step }); });
    try {
      await tracker.run("sharing.setup.enable", "share.item.preparing", async () => {
        const result = await setup.enable(preview.name);
        if (!current()) return;
        if (result.phase !== "ready" || result.site !== preview.site) throw new Error("sharing:unacknowledged");
        const listing = await access.load();
        if (!current()) return;
        if (!listing.available || !listing.configured || listing.site !== result.site) throw new Error("sharing:unacknowledged");
        store.update(s => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, listing } } }));
        firstClose(true);
      }, undefined, "fn:sharing.setup.enable", "success");
    } catch (error) {
      console.error("Sharing setup failed", opErrorCode(error));
      if (current()) set({ problem: catalog.format("sharing.setup.unavailable") });
    } finally {
      unsubscribe?.();
      setupPending = false;
      if (current()) set({ busy: false });
    }
  });
  const work = async (action: () => Promise<void>, status: string) => {
    if (state().busy) return;
    set({ busy: true, problem: "", status: "" });
    try {
      await tracker.run("sharing.change", "share.item.preparing", action);
      set({ status, dialog: "" });
      settingsOpen(true);
    } catch {
      set({ problem: catalog.format("share.item.failed") });
    } finally { set({ busy: false }); }
  };
  reg<{ id: string; action: string }>("sharing.copy", async ({ id, action }) => {
    const grant = store.state.ui.share.listing?.grants.find(g => g.id === id && g.item);
    if (!access || !grant || audienceState(grant) !== "active") throw new Error(catalog.format("share.item.notReady"));
    const what = action === "link" ? "link" : action === "accessCode" ? "accessCode" : "information";
    await work(async () => {
      if (access.ready) await access.ready(id);
      const template = ["title", "link", "code", "until", "forward", "copies"].map(key =>
        catalog.format(`share.item.information.${key}`, { title: "{title}", link: "{link}", site: "{site}", accessCode: "{accessCode}", expires: "{expires}" })).join("\n");
      await access.copy(id, what, { template });
    }, "copied");
  });
  const expiries: ExpiryChoice[] = ["7d", "30d", "90d", "never"];
  reg<{ id: string; action: string }>("sharing.extend", async ({ id, action }) => {
    const expiry = expiries.find(value => value === action);
    if (!access || !expiry) throw new Error(catalog.format("share.item.expiryInvalid"));
    await work(async () => {
      const { id: _, ...listing } = await access.apply({ op: "update", id, expiresAt: expiryFrom(expiry) });
      store.update(s => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, listing } } }));
    }, "extended");
  });
  reg<Record<string, never>>("sharing.confirm", async () => {
    const { dialog, id } = state();
    if (dialog === "turnOff") {
      if (!store.state.ui.share.listing?.localReview) throw new Error(catalog.format("share.item.unavailable"));
      set({ off: true, dialog: "", status: "" });
      settingsOpen(true);
      return;
    }
    if (!access || (dialog !== "withdraw" && dialog !== "delete")) throw new Error(catalog.format("share.item.unavailable"));
    await work(async () => {
      const { id: _, ...listing } = await access.apply({ op: dialog, id });
      store.update(s => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, listing } } }));
    }, dialog === "withdraw" ? "withdrawn" : "deleted");
  });
  const str = { type: "string" as const }, bool = { type: "boolean" as const };
  const menuSchema = { type: "array" as const, items: { type: "object" as const, properties: {
    id: str, items: { type: "array" as const, items: { type: "object" as const, properties: { id: str, label: str } } },
  } } };
  viewModels.register({
    id: "vm.sharingSettings",
    schema: { type: "object", properties: {
      project: str, site: str, on: bool, off: bool, offDetail: str, localReview: bool, busy: bool, status: str, problem: str, copyLabel: str, extendLabel: str,
      empty: bool, waiting: bool, failed: bool, retrying: bool, emptyTitle: str, emptyDetail: str, emptyAction: str, loadProblem: str,
      filter: str, query: str, dialog: str, confirmOpen: bool, confirmTitle: str, confirmText: str, confirmLabel: str,
      firstOpen: bool, more: bool, repo: str, canSetup: bool, setupSite: str, setupProblem: bool, setupStatus: str, firstAcceptLabel: str,
      filters: { type: "array", items: { type: "object", properties: { id: str, label: str } } },
      rows: { type: "array", items: { type: "object", properties: {
        id: str, item: str, detail: str, badge: str, icon: str, live: bool, copyMenu: menuSchema, extendMenu: menuSchema,
      } } },
    } },
    setters: { filter: "sharing.filter", query: "sharing.query" },
    reads: "*",
    select: s => {
      const m = s.ui.share.settings, listing = s.ui.share.listing;
      const filtered = Boolean(m.query.trim()) || m.filter !== "all";
      const root = s.workspace.tree.roots.find(r => r.id === "private");
      const filters = ["all", "active", "soon", "expired", "withdrawn"];
      const menu = (ids: string[], prefix: string) => [{ id: "actions", items: ids.map(id => ({ id, label: catalog.format(`${prefix}.${id}`) })) }];
      const rows = (listing?.grants ?? []).filter(g => g.item).map(g => {
        const item = g.item!;
        const node = root ? findNode(s.workspace.tree, joinPath(root.path, item.path))?.node : undefined;
        const active = audienceState(g) === "active";
        const soon = active && Boolean(g.expiresAt && Date.parse(g.expiresAt) - Date.now() < 7 * 86400000);
        const stateId = active ? soon ? "soon" : "active" : audienceState(g);
        const title = node?.kind === "note" ? node.title || item.label : node?.name ?? item.label;
        const date = g.expiresAt ? new Intl.DateTimeFormat(catalog.locale, { day: "numeric", month: "short" }).format(new Date(g.expiresAt)) : "";
        return {
          id: g.id, item: title, stateId,
          detail: catalog.format("sharing.row.detail", { ways: catalog.format(`share.manage.ways.${g.link && g.passcode ? "both" : g.link ? "link" : "passcode"}`), expiry: date ? catalog.format("sharing.expires", { date }) : catalog.format("share.manage.expiry.never") }),
          badge: catalog.format(!node ? "sharing.state.deleted" : `sharing.state.${stateId}`),
          icon: item.folder ? "folder" : "document", live: active,
          copyMenu: menu([...(g.link ? ["link"] : []), ...(g.passcode ? ["accessCode"] : []), "information"], "sharing.copy"),
          extendMenu: menu(expiries, "share.manage.expiry"),
        };
      }).filter(r => (m.filter === "all" || r.stateId === m.filter) && r.item.toLocaleLowerCase().includes(m.query.trim().toLocaleLowerCase()));
      const kind = m.dialog === "turnOff" ? "off" : m.dialog === "delete" ? "delete" : "withdraw";
      const projectName = viewModels.select("vm.project", s).name;
      return {
        project: s.workspace.repo?.split("/").at(-1) ?? s.workspace.folder?.split(/[\\/]/).at(-1) ?? "",
        site: listing?.site ?? s.workspace.site ?? "", on: sharingAvailable(s), off: !sharingAvailable(s),
        offDetail: catalog.format(listing?.localReview || listing?.site && (listing.configured || listing.vault) ? "share.settings.offDetail" : "sharing.setup.unavailable"),
        localReview: Boolean(listing?.localReview), busy: m.busy, status: m.status ? catalog.format("share.settings.status", { status: m.status }) : "",
        copyLabel: catalog.format("share.settings.copyAgain"), extendLabel: catalog.format("share.settings.extend"),
        problem: m.problem, filter: m.filter, query: m.query, dialog: m.dialog, confirmOpen: ["withdraw", "delete", "turnOff"].includes(m.dialog),
        empty: Boolean(listing) && !s.ui.share.loading && !s.ui.share.failed && !rows.length,
        waiting: s.ui.share.loading && !s.ui.share.failed && !listing && s.tasks.findLast(t => t.target === "sharing.list")?.phase === "on",
        failed: s.ui.share.failed, retrying: s.ui.share.loading && s.ui.share.failed,
        emptyTitle: catalog.format(filtered ? "uiStates.empty.matches" : "uiStates.empty.shares"),
        emptyDetail: catalog.format(filtered ? "uiStates.empty.sharesFilteredDetail" : "uiStates.empty.sharesDetail"),
        emptyAction: catalog.format(filtered ? "uiStates.empty.clearFilters" : "uiStates.empty.openFiles"),
        loadProblem: catalog.format("sharing.listFailed"),
        firstOpen: m.dialog === "first", more: m.more,
        repo: m.setupPreview ? `${m.setupPreview.owner}/${m.setupPreview.name}` : listing?.localReview ? s.workspace.repo ?? listing.site ?? "" : "",
        canSetup: Boolean(listing?.localReview || access?.setup && listing?.available && listing.setupAvailable),
        setupSite: m.setupPreview?.site ?? (listing?.localReview ? listing.site ?? "" : ""),
        setupProblem: Boolean(m.problem),
        firstAcceptLabel: catalog.format(m.problem ? "sharing.invite.retry" : "share.first.turnOn"),
        setupStatus: m.busy ? catalog.format(m.setupStep === "push" ? "setup.step.push" : m.setupStep === "pages" ? "setup.step.pages" : "share.item.preparing") : "",
        confirmTitle: kind === "off" ? catalog.format("sharing.off.title", { project: typeof projectName === "string" ? projectName : "" }) : catalog.format(`share.${kind}.title`), confirmText: catalog.format(kind === "off" ? "share.off.history" : `share.${kind}.text`),
        confirmLabel: catalog.format(`share.${kind}.confirm`),
        filters: filters.map(id => ({ id, label: catalog.format(`sharing.filter.${id}`) })), rows,
      };
    },
  });
}
