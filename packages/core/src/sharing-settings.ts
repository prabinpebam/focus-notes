import { audienceState, expiryFrom, type ExpiryChoice } from "@focus-notes/seal/access";
import type { AppState } from "./app.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { TaskTracker } from "./tasks.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import type { AccessBridge, ShareManageState } from "./share-manage.ts";
import { joinPath, findNode } from "./workspace.ts";

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
  const settingsOpen = (open: boolean) => store.update(s => ({ ...s, ui: { ...s.ui, settings: { ...s.ui.settings, open, section: "sharing" } } }));
  reg<{ id?: string; kind: string }>("sharing.confirmOpen", ({ id = "", kind }) => { set({ dialog: kind, id, problem: "" }); settingsOpen(false); });
  reg<Record<string, never>>("sharing.confirmClose", () => { if (!state().busy) { set({ dialog: "" }); settingsOpen(true); } });
  reg<{ resume?: boolean }>("sharing.firstOpen", ({ resume = false }) => {
    if (!store.state.ui.share.listing?.localReview) throw new Error(catalog.format("share.item.unavailable"));
    set({ dialog: "first", more: false, resume, problem: "" });
    settingsOpen(false);
    if (resume) store.update(s => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, item: { ...s.ui.share.item, open: false } } } }));
  });
  reg<Record<string, never>>("sharing.firstMore", () => set({ more: !state().more }));
  const firstClose = (accepted: boolean) => {
    const resume = state().resume;
    set({ dialog: "", ...(accepted ? { off: false } : {}) });
    if (resume) store.update(s => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, item: { ...s.ui.share.item, open: accepted } } } }));
    else settingsOpen(true);
  };
  reg<Record<string, never>>("sharing.firstClose", () => firstClose(false));
  reg<Record<string, never>>("sharing.firstAccept", () => {
    if (!store.state.ui.share.listing?.localReview) throw new Error(catalog.format("share.item.unavailable"));
    firstClose(true);
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
      project: str, site: str, on: bool, off: bool, localReview: bool, busy: bool, status: str, problem: str, copyLabel: str, extendLabel: str,
      filter: str, query: str, dialog: str, confirmOpen: bool, confirmTitle: str, confirmText: str, confirmLabel: str,
      firstOpen: bool, more: bool, repo: str,
      filters: { type: "array", items: { type: "object", properties: { id: str, label: str } } },
      rows: { type: "array", items: { type: "object", properties: {
        id: str, item: str, detail: str, badge: str, icon: str, live: bool, copyMenu: menuSchema, extendMenu: menuSchema,
      } } },
    } },
    setters: { filter: "sharing.filter", query: "sharing.query" },
    reads: "*",
    select: s => {
      const m = s.ui.share.settings, listing = s.ui.share.listing;
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
        site: listing?.site ?? s.workspace.site ?? "", on: Boolean(listing?.site && !m.off), off: m.off || !listing?.site,
        localReview: Boolean(listing?.localReview), busy: m.busy, status: m.status ? catalog.format("share.settings.status", { status: m.status }) : "",
        copyLabel: catalog.format("share.settings.copyAgain"), extendLabel: catalog.format("share.settings.extend"),
        problem: m.problem, filter: m.filter, query: m.query, dialog: m.dialog, confirmOpen: ["withdraw", "delete", "turnOff"].includes(m.dialog),
        firstOpen: m.dialog === "first", more: m.more, repo: s.workspace.repo ?? listing?.site ?? "",
        confirmTitle: kind === "off" ? catalog.format("sharing.off.title", { project: typeof projectName === "string" ? projectName : "" }) : catalog.format(`share.${kind}.title`), confirmText: catalog.format(kind === "off" ? "share.off.history" : `share.${kind}.text`),
        confirmLabel: catalog.format(`share.${kind}.confirm`),
        filters: filters.map(id => ({ id, label: catalog.format(`sharing.filter.${id}`) })), rows,
      };
    },
  });
}
