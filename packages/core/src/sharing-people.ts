import type { App } from "./app.ts";
import type { MessageCatalog } from "./messages.ts";
import type { TaskTracker } from "./tasks.ts";
import { initials, type AccessBridge, type ProjectPeople } from "./share-manage.ts";

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
  access?: AccessBridge;
}) {
  const { store, commands, viewModels, catalog, tracker } = ctx;
  // unlinked: the project can't have people (no private GitHub repository): a reason, never an error with Retry.
  const state = { open: false, user: "", role: "read", busy: false, loading: false, problem: "", status: "", step: "", unlinked: "",
    /** The pressed row control while busy (D-356): `cancel:<id>`, `again:<login>` or `dismiss:<login>`. */
    pending: "" };
  let project: ProjectPeople | undefined;
  // The row action that last failed, run again by Retry in Settings.
  let retry: (() => Promise<void>) | undefined;
  const people = ctx.access?.people;
  const changed = () => store.update(s => ({ ...s }));
  const set = (patch: Partial<typeof state>) => { Object.assign(state, patch); changed(); };
  const settings = (open: boolean) => store.update(s => ({ ...s, ui: { ...s.ui, settings: { ...s.ui.settings, open, section: "project" } } }));
  const problem = (error: unknown) => {
    const code = error instanceof Error ? /invite:([a-z]+)/.exec(error.message)?.[1] : undefined;
    console.warn("sharing.invite", code ?? "failed");
    return catalog.format(`sharing.invite.${code && catalog.has(`sharing.invite.${code}`) ? code : "failed"}`);
  };
  const reg = <A extends Record<string, unknown>>(id: string, run: (args: A) => void | Promise<void>) =>
    commands.register<A>({ id, title: "share.invite.people", run });
  reg<Record<string, never>>("sharing.peopleLoad", async () => {
    if (!people || state.loading || state.busy) return;
    retry = undefined;
    set({ loading: true, problem: "", unlinked: "" });
    try {
      project = await tracker.section("sharing.people", "sharing.invite.checking", () => people.load(), "fn:sharing.people", "success");
      if (project.owner === "personal") state.role = "write";
    } catch (error) {
      project = undefined;
      if (error instanceof Error && /invite:unlinked\b/.test(error.message)) set({ unlinked: catalog.format("sharing.invite.unlinked") });
      else set({ problem: problem(error) });
    }
    finally { set({ loading: false }); }
  });
  reg<Record<string, never>>("sharing.inviteOpen", () => {
    if (!project || state.busy || state.loading) return;
    set({ open: true, status: "" }); settings(false);
  });
  reg<Record<string, never>>("sharing.inviteClose", () => { set({ open: false }); settings(true); });
  reg<{ value: string }>("sharing.inviteUser", ({ value }) => { if (!state.busy) set({ user: value, problem: "" }); });
  const roles = ["read", "triage", "write", "maintain", "admin"];
  reg<{ value: string }>("sharing.inviteRole", ({ value }) => {
    if (state.busy) return;
    if (!project?.roles.some(role => role === value)) { set({ problem: catalog.format("sharing.invite.role") }); return; }
    set({ role: value });
  });
  const work = async (action: () => Promise<ProjectPeople>, message: string, done = "sharing.invite.accepted", pending = "") => {
    if (!people || !project || state.busy) return;
    set({ busy: true, pending, problem: "", status: "", step: "check" });
    retry = undefined;
    try {
      project = await tracker.run("sharing.invite", message, action, done, "fn:sharing.invite", "success");
      const restoreSettings = state.open;
      set({ status: catalog.format(done), open: false, step: "accepted", user: "" });
      if (restoreSettings) settings(true);
    } catch (error) {
      retry = () => work(action, message, done, pending);
      set({ problem: problem(error) });
    } finally { set({ busy: false, pending: "" }); }
  };
  reg<Record<string, never>>("sharing.peopleRetry", async () => {
    if (state.busy || state.loading) return;
    if (project && retry) await retry(); else await commands.run("sharing.peopleLoad");
  });
  people?.onStep?.(step => { if (state.busy && ["check", "send", "accepted"].includes(step)) set({ step }); });
  reg<Record<string, never>>("sharing.inviteSend", async () => {
    if (state.busy || !project || !people) return;
    const login = state.user.trim(), role = project.owner === "personal" ? "write" : state.role, repository = project.repository;
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(login)) {
      set({ problem: catalog.format("sharing.invite.invalid") }); return;
    }
    await work(() => people.invite(repository, login, role), "sharing.invite.saving");
  });
  reg<{ id: string }>("sharing.inviteCancel", async ({ id }) => {
    if (!project || !people) return;
    const repository = project.repository;
    await work(() => people.cancel(repository, Number(id)), "sharing.invite.cancelling", "sharing.invite.cancelled", `cancel:${id}`);
  });
  reg<{ login: string; role: string }>("sharing.inviteAgain", async ({ login, role }) => {
    if (!project || !people || typeof login !== "string") return;
    const repository = project.repository, as = project.owner === "personal" ? "write" : role;
    await work(() => people.invite(repository, login, as), "sharing.invite.saving", undefined, `again:${login}`);
  });
  reg<{ login: string }>("sharing.inviteDismiss", async ({ login }) => {
    if (!project || !people?.dismiss || typeof login !== "string") return;
    const repository = project.repository, dismiss = people.dismiss;
    await work(() => dismiss(repository, login), "sharing.invite.dismissing", "sharing.invite.dismissed", `dismiss:${login}`);
  });
  reg<Record<string, never>>("sharing.inviteManage", async () => {
    if (!project || !people) return;
    try { await people.manage(project.repository); } catch (error) { set({ problem: problem(error) }); }
  });
  const str = { type: "string" as const }, bool = { type: "boolean" as const };
  viewModels.register({
    id: "vm.sharingPeople", reads: "*",
    setters: { user: "sharing.inviteUser", role: "sharing.inviteRole" },
    schema: { type: "object", properties: {
      available: bool, ready: bool, open: bool, user: str, role: str, owner: str, org: bool, personal: bool, busy: bool, problem: str, unlinked: str, canSend: bool, canOpen: bool, canRetry: bool, detail: str, status: str, stepLabel: str, repository: str, feedback: str, feedbackTone: str, sendLabel: str, target: str,
      roles: { type: "array", items: { type: "object", properties: { id: str, label: str } } },
      people: { type: "array", items: { type: "object", properties: { id: str, key: str, login: str, role: str, initials: str, detail: str, badge: str, pending: bool, again: bool, revoked: bool, cancelBusy: bool, againBusy: bool, dismissBusy: bool } } },
    } },
    select: () => ({
      ...state, pending: undefined, available: Boolean(people), ready: Boolean(project), owner: project?.owner ?? "personal",
      repository: project?.repository ?? "", org: project?.owner === "org", personal: project?.owner !== "org",
      canSend: Boolean(project && state.user.trim()) && !state.busy, canOpen: Boolean(project) && !state.loading && !state.busy,
      canRetry: (!project || Boolean(retry)) && Boolean(state.problem) && !state.open && !state.loading && !state.busy,
      detail: state.loading ? catalog.format("sharing.invite.checking") : state.problem && !state.open ? state.problem : state.busy ? catalog.format(`sharing.invite.step.${state.step}`) : state.status || state.unlinked || catalog.format("share.invite.notShare"),
      stepLabel: state.busy ? catalog.format(`sharing.invite.step.${state.step}`) : "",
      feedback: state.problem || (state.busy ? catalog.format(`sharing.invite.step.${state.step}`) : ""),
      feedbackTone: state.problem ? "danger" : "muted",
      sendLabel: catalog.format(state.problem ? "sharing.invite.retry" : "share.invite.send"),
      target: catalog.format("sharing.invite.target", { repository: project?.repository ?? "", role: catalog.format(project?.owner === "org" ? `sharing.role.${state.role}` : "share.invite.collaborator") }),
      roles: (project?.roles ?? roles).map(id => ({ id, label: catalog.format(`sharing.role.${id}`) })),
      people: (project?.people ?? []).map(p => {
        const s = p.state ?? "pending";
        return {
          id: String(p.id), key: `${s}:${p.id}`, login: p.login, role: p.role, initials: initials(p.login),
          detail: catalog.format(`share.invite.${s}Detail`, { owner: project?.owner ?? "personal", role: p.role }), badge: catalog.format(`share.invite.${s}`),
          pending: s === "pending", again: s === "expired" || s === "revoked", revoked: s === "revoked",
          cancelBusy: state.busy && state.pending === `cancel:${p.id}`, againBusy: state.busy && state.pending === `again:${p.login}`, dismissBusy: state.busy && state.pending === `dismiss:${p.login}`,
        };
      }),
    }),
  });
}
