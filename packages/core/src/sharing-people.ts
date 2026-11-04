import type { App } from "./app.ts";
import type { AppStateFile } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";
import type { TaskTracker } from "./tasks.ts";
import { initials } from "./share-manage.ts";

export interface SharingDraft {
  owner: "org" | "personal";
  people: { login: string; role: string }[];
  theme?: string;
  font?: string;
  size?: number;
  published?: string[];
}

export function registerSharingPeople(ctx: {
  store: App["store"]; commands: App["commands"]; viewModels: App["viewModels"]; catalog: MessageCatalog; tracker: TaskTracker;
  appState: () => AppStateFile; persistAppState: (patch: Partial<AppStateFile>) => Promise<void>;
}) {
  const { store, commands, viewModels, catalog, tracker } = ctx;
  const state = { open: false, user: "", role: "read", busy: false, problem: "" };
  const folder = () => store.state.workspace.folder ?? "";
  const draft = (): SharingDraft => ctx.appState().sharingDrafts?.[folder()] ?? { owner: "personal", people: [] };
  const changed = () => store.update(s => ({ ...s }));
  const set = (patch: Partial<typeof state>) => { Object.assign(state, patch); changed(); };
  const settings = (open: boolean) => store.update(s => ({ ...s, ui: { ...s.ui, settings: { ...s.ui.settings, open, section: "project" } } }));
  const local = () => {
    if (!store.state.ui.share.listing?.localReview && !ctx.appState().sharingDrafts?.[folder()]) throw new Error(catalog.format("share.item.unavailable"));
  };
  const reg = <A extends Record<string, unknown>>(id: string, run: (args: A) => void | Promise<void>) =>
    commands.register<A>({ id, title: "share.invite.people", run });
  reg<Record<string, never>>("sharing.inviteOpen", () => {
    local(); set({ open: true, user: "", role: "read", problem: "" }); settings(false);
  });
  reg<Record<string, never>>("sharing.inviteClose", () => { if (!state.busy) { set({ open: false }); settings(true); } });
  reg<{ value: string }>("sharing.inviteUser", ({ value }) => set({ user: value, problem: "" }));
  const roles = ["read", "triage", "write", "maintain", "admin"];
  reg<{ value: string }>("sharing.inviteRole", ({ value }) => {
    if (!roles.includes(value)) throw new Error("Invalid invitation role");
    set({ role: value });
  });
  const save = async (people: SharingDraft["people"]) => {
    local();
    if (state.busy) return;
    set({ busy: true, problem: "" });
    try {
      await tracker.run("sharing.invite", "sharing.invite.saving", () => ctx.persistAppState({
        sharingDrafts: { ...ctx.appState().sharingDrafts, [folder()]: { ...draft(), people } },
      }));
      set({ open: false }); settings(true);
    } catch {
      set({ problem: catalog.format("share.item.failed") });
    } finally { set({ busy: false }); }
  };
  reg<Record<string, never>>("sharing.inviteSend", async () => {
    const login = state.user.trim();
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(login)) {
      set({ problem: catalog.format("sharing.invite.invalid") }); return;
    }
    await save([...draft().people.filter(p => p.login.toLowerCase() !== login.toLowerCase()), { login, role: draft().owner === "personal" ? "write" : state.role }]);
  });
  reg<{ id: string }>("sharing.inviteCancel", ({ id }) => save(draft().people.filter(p => p.login !== id)));
  reg<Record<string, never>>("sharing.inviteManage", () => {
    local(); set({ problem: catalog.format("sharing.invite.localOnly") });
  });
  const str = { type: "string" as const }, bool = { type: "boolean" as const };
  viewModels.register({
    id: "vm.sharingPeople", reads: "*",
    setters: { user: "sharing.inviteUser", role: "sharing.inviteRole" },
    schema: { type: "object", properties: {
      available: bool, open: bool, user: str, role: str, owner: str, org: bool, personal: bool, busy: bool, problem: str, canSend: bool,
      roles: { type: "array", items: { type: "object", properties: { id: str, label: str } } },
      people: { type: "array", items: { type: "object", properties: { id: str, login: str, initials: str, detail: str, badge: str } } },
    } },
    select: () => ({
      ...state, available: Boolean(store.state.ui.share.listing?.localReview || ctx.appState().sharingDrafts?.[folder()]), owner: draft().owner,
      org: draft().owner === "org", personal: draft().owner === "personal", canSend: Boolean(state.user.trim()) && !state.busy,
      roles: roles.map(id => ({ id, label: catalog.format(`sharing.role.${id}`) })),
      people: draft().people.map(p => ({
        id: p.login, login: p.login, initials: initials(p.login),
        detail: catalog.format("share.invite.pendingDetail", { owner: draft().owner, role: p.role }), badge: catalog.format("share.invite.pending"),
      })),
    }),
  });
}
