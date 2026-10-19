/**
 * Send feedback (IA-VIEW-FEEDBACK, QLT-07, D-203): a problem or an idea, from Settings' foot, ⋯,
 * Spotlight, and the macOS Help menu. Signed in on the desktop, Send posts it as an issue through
 * the shell (`bridge.feedback.send`, which holds the token and the fixed repository); otherwise
 * Continue on GitHub opens the new-issue form filled in. The draft stays in memory only, never on
 * disk, and is cleared after a send.
 */
import { initials } from "./share-manage.ts";
import type { PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import { windowTimings } from "./diagnostics-app.ts";
import {
  continueUrl, DETAILS_MAX, FEEDBACK_COOLDOWN_MS, issueUrlOk, TITLE_MAX, validateFeedback,
  type FeedbackCopied, type FeedbackInput, type FeedbackKind, type FeedbackProblem, type FeedbackResult,
} from "./feedback.ts";
import type { AccountStatus } from "./first-run.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import { busyProps, type Clock, type TaskTracker, type TaskView } from "./tasks.ts";
import type { ViewModelRegistry } from "./view-models.ts";

export interface FeedbackState {
  open: boolean;
  kind: FeedbackKind;
  title: string;
  details: string;
  /** Attach diagnostic report: on for a problem and off for an idea, until the person chooses (`attachChosen`). */
  attach: boolean;
  attachChosen: boolean;
  preview: boolean;
  phase: "editing" | "sending" | "sent";
  problem?: FeedbackProblem;
  /** The issue just sent: its number, and its address when it's one of the project's issues. */
  issue?: { number: number; url?: string };
  /** For 30 s after a success, another send waits (against double posts). */
  cooling: boolean;
  /** Who'd post it: the desktop's signed-in account; absent, it continues on GitHub. */
  who?: { login: string; avatar?: string };
  /** Settings was open when it opened, so closing goes back there. */
  fromSettings: boolean;
}
export const FEEDBACK_CLOSED: FeedbackState = {
  open: false, kind: "problem", title: "", details: "", attach: true, attachChosen: false, preview: false,
  phase: "editing", cooling: false, fromSettings: false,
};
/** What a cleared draft goes back to; the dialog's place and the cooldown stay. */
const EMPTY_DRAFT = { kind: "problem", title: "", details: "", attach: true, attachChosen: false, preview: false } as const;

interface S {
  ui: { feedback: FeedbackState; settings: { open: boolean; diagnostics: { preview?: unknown; loading: boolean } }; toolbarOpen: boolean };
  account: { login?: string };
  tasks: TaskView[];
}

interface Ctx<St extends S> {
  store: Store<St>;
  bridge: PlatformBridge;
  catalog: MessageCatalog;
  commands: CommandRegistry<St>;
  viewModels: ViewModelRegistry<St>;
  toast: (message: string, opts?: { tone?: "info" | "error"; action?: { command: string; label: string; args?: Record<string, unknown> } }) => unknown;
  announce: (text: string) => void;
  tracker: TaskTracker;
  clock: Clock;
}

/** The tracker's target for a send: its measure is `focus-notes:feedback.send`. */
export const FEEDBACK_SEND = "feedback.send";

export function registerFeedback<St extends S>({ store, bridge, catalog, commands, viewModels, toast, announce, tracker, clock }: Ctx<St>) {
  const fb = bridge.feedback;
  const state = () => store.state.ui.feedback;
  const set = (patch: Partial<FeedbackState>) => store.update((s) => ({ ...s, ui: { ...s.ui, feedback: { ...s.ui.feedback, ...patch } } }));
  const sending = () => state().phase === "sending";
  const value = (a: { value?: unknown }) => (typeof a.value === "string" ? a.value : "");
  /** Only the desktop attaches a report: the browser has none (D-140). */
  const canAttach = () => Boolean(bridge.diagnostics && fb);
  const input = (): FeedbackInput => {
    const f = state();
    return { kind: f.kind, title: f.title.trim(), details: f.details, attachReport: f.attach && canAttach() };
  };
  const loadPreview = () => {
    const d = store.state.ui.settings.diagnostics;
    if (canAttach() && state().attach && !d.preview && !d.loading) void commands.run("diagnostics.load");
  };
  /** Who'd post it, as the shell's helper says (Settings' account check); signed out or in the browser, nobody. */
  const checkWho = async () => {
    if (!fb?.send || !bridge.firstRun) return set({ who: undefined });
    const a: AccountStatus | undefined = await bridge.firstRun.account().catch(() => undefined);
    const acc = a?.account && !a.signedOut ? a.account : undefined;
    set({ who: acc ? { login: acc.login, ...(acc.avatar ? { avatar: acc.avatar } : {}) } : undefined });
  };

  commands.register({
    id: "feedback.open", title: "command.feedback.open", icon: "feedback", group: "app",
    run: async (a) => {
      const f = state();
      const kind = a.kind === "problem" || a.kind === "idea" ? a.kind : undefined;
      const fromSettings = store.state.ui.settings.open || (f.open && f.fromSettings);
      // A sent dialog opened again starts a new draft; a draft being sent shows its send.
      const base = f.phase === "sent" ? { phase: "editing" as const, issue: undefined } : {};
      const kindPatch = kind && !sending() ? { kind, ...(state().attachChosen ? {} : { attach: kind === "problem" }) } : {};
      store.update((s) => ({
        ...s,
        ui: { ...s.ui, toolbarOpen: false, settings: { ...s.ui.settings, open: false }, feedback: { ...s.ui.feedback, ...base, ...kindPatch, open: true, fromSettings } },
      }));
      if (kind === "problem" && !sending() && !state().attachChosen) set({ attach: true });
      loadPreview();
      await checkWho();
    },
  });
  /** Closing keeps the draft; while sending, the send goes on and its result comes as a toast. */
  const close = async (back = true) => {
    const f = state();
    if (!f.open) return;
    set({ open: false, preview: false, ...(f.phase === "sent" ? { phase: "editing" as const, issue: undefined } : {}) });
    if (!back) return set({ fromSettings: false });
    if (f.fromSettings) {
      set({ fromSettings: false });
      await commands.run("settings.open");
    }
  };
  commands.register({ id: "feedback.setOpen", title: "command.feedback.setOpen", run: async (a) => { if (a.open === false) await close(); } });
  commands.register({ id: "feedback.done", title: "command.feedback.done", run: () => close() });
  // Spotlight opening over it: it closes without going back to Settings.
  commands.register({ id: "feedback.close", title: "command.feedback.close", run: () => close(false) });
  commands.register({
    id: "feedback.setKind", title: "command.feedback.setKind",
    run: (a) => {
      const v = value(a);
      if (sending() || (v !== "problem" && v !== "idea")) return;
      set({ kind: v, ...(state().attachChosen ? {} : { attach: v === "problem" }) });
      loadPreview();
    },
  });
  commands.register({ id: "feedback.setTitle", title: "command.feedback.setTitle", run: (a) => { if (!sending()) set({ title: value(a) }); } });
  commands.register({ id: "feedback.setDetails", title: "command.feedback.setDetails", run: (a) => { if (!sending()) set({ details: value(a) }); } });
  commands.register({
    id: "feedback.toggleAttach", title: "command.feedback.toggleAttach",
    run: () => {
      if (sending() || !canAttach()) return;
      set({ attach: !state().attach, attachChosen: true });
      loadPreview();
    },
  });
  commands.register({ id: "feedback.togglePreview", title: "command.feedback.togglePreview", run: () => { set({ preview: !state().preview }); loadPreview(); } });

  /** The title has text and nothing's past its limit. */
  const ready = (f: FeedbackState) => Boolean(validateFeedback({ kind: f.kind, title: f.title, details: f.details, attachReport: false }));
  /**
   * What the primary does: Send (or Try again) when signed in on the desktop; Continue on GitHub
   * when signed out, in the browser, or once GitHub has refused this sign-in or it has expired.
   */
  const route = (f: FeedbackState): "send" | "continue" => (fb?.send && f.who && f.problem !== "expired" && f.problem !== "refused" ? "send" : "continue");

  const send = async () => {
    const f = state();
    if (route(f) === "continue") return void (await commands.run("feedback.continue"));
    if (f.phase !== "editing" || f.cooling || !ready(f) || !fb?.send) return;
    const draft = input();
    set({ phase: "sending", problem: undefined });
    const result: FeedbackResult = await tracker.run("feedback.send", "feedback.sending", () => fb.send!(draft, windowTimings()))
      .catch((): FeedbackResult => ({ problem: "network" }));
    const open = state().open;
    if ("number" in result) {
      const issue = { number: result.number, ...(issueUrlOk(result.url) ? { url: result.url } : {}) };
      // The draft is cleared; the dialog shows the issue, or, closed, a toast does.
      set({ ...EMPTY_DRAFT, phase: open ? "sent" : "editing", issue: open ? issue : undefined, problem: undefined, cooling: true });
      clock.setTimeout(() => set({ cooling: false }), FEEDBACK_COOLDOWN_MS);
      const words = catalog.format("feedback.sentAs", { number: result.number });
      if (open) announce(words);
      else toast(words, issue.url ? { action: { command: "feedback.openIssue", label: catalog.format("feedback.open"), args: { url: issue.url } } } : {});
      return;
    }
    // Signed out meanwhile: it continues on GitHub instead.
    if (result.problem === "signedOut") set({ phase: "editing", who: undefined, problem: undefined });
    else set({ phase: "editing", problem: result.problem });
    if (open) announce(catalog.format(`feedback.problem.${result.problem}`));
    else toast(catalog.format("feedback.notSent"), { tone: "error", action: { command: "feedback.open", label: catalog.format("feedback.open") } });
  };
  commands.register({ id: "feedback.send", title: "command.feedback.send", run: send });
  commands.register({ id: "feedback.retry", title: "command.feedback.retry", run: send });
  // The primary button, and Enter in Title.
  commands.register({ id: "feedback.submit", title: "command.feedback.submit", run: () => (route(state()) === "send" ? send() : commands.run("feedback.continue")) });

  /** Continue on GitHub: the shell builds and opens the address (and copies the report); the browser does it here. */
  commands.register({
    id: "feedback.continue", title: "command.feedback.continue",
    run: async () => {
      const f = state();
      if (sending() || !ready(f)) return;
      const draft = input();
      let copied: FeedbackCopied = "none";
      if (fb?.continue) copied = await fb.continue(draft, windowTimings()).catch((): FeedbackCopied => "none");
      else {
        const { url, cut } = continueUrl({ ...draft, system: { version: "web", platform: "web" } });
        if (cut && bridge.copyText) copied = await bridge.copyText(draft.details).then((): FeedbackCopied => "details", (): FeedbackCopied => "none");
        bridge.openExternal?.(url);
      }
      set({ problem: undefined });
      await close();
      if (copied !== "none") toast(catalog.format(`feedback.copied.${copied}`));
    },
  });
  commands.register({
    id: "feedback.openIssue", title: "command.feedback.openIssue",
    run: (a) => {
      const url = typeof a.url === "string" ? a.url : state().issue?.url;
      // The desktop opens web links through `openLink` (https only, in the browser); the web app through `openExternal`.
      if (issueUrlOk(url)) (bridge.openLink ?? bridge.openExternal)?.(url);
    },
  });
  /** Sign in again (401): the draft stays, and the account card shows. */
  commands.register({
    id: "feedback.signIn", title: "command.feedback.signIn",
    run: async () => {
      set({ open: false, fromSettings: false, problem: undefined });
      await commands.run("account.signIn");
    },
  });

  const OPTION = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const } } };
  viewModels.register({
    id: "vm.sendFeedback",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, kind: { type: "string", enum: ["problem", "idea"] }, kindOptions: { type: "array", items: OPTION },
        title: { type: "string" }, details: { type: "string" }, titlePlaceholder: { type: "string" }, detailsPlaceholder: { type: "string" },
        titleInvalid: { type: "boolean" }, titleError: { type: "string" }, detailsInvalid: { type: "boolean" }, detailsError: { type: "string" },
        canAttach: { type: "boolean" }, attach: { type: "boolean" }, preview: { type: "boolean" }, showPreview: { type: "boolean" },
        canPost: { type: "boolean" }, continues: { type: "boolean" }, login: { type: "string" }, avatar: { type: "string" }, initials: { type: "string" }, whoTitle: { type: "string" }, whoDetail: { type: "string" },
        stage: { type: "string", enum: ["editing", "sent"] }, editing: { type: "boolean" }, sending: { type: "boolean" }, sent: { type: "boolean" }, issueTitle: { type: "string" }, canOpenIssue: { type: "boolean" },
        problem: { type: "string" }, hasProblem: { type: "boolean" }, offerContinue: { type: "boolean" }, canSignIn: { type: "boolean" },
        primaryLabel: { type: "string" }, primaryIcon: { type: "string" }, primaryDisabled: { type: "boolean" }, primaryReason: { type: "string" },
        busy: { type: "boolean" }, busyLabel: { type: "string" },
      },
    },
    setters: { kind: "feedback.setKind", title: "feedback.setTitle", details: "feedback.setDetails" },
    reads: ["ui.feedback", "tasks"],
    select: (s) => {
      const f = s.ui.feedback;
      const titleLong = [...f.title.trim()].length > TITLE_MAX;
      const detailsLong = [...f.details].length > DETAILS_MAX;
      const canPost = Boolean(fb?.send && f.who);
      const sends = route(f) === "send";
      const reason = f.cooling && sends ? "feedback.cooling" : !f.title.trim() ? "feedback.needTitle" : titleLong || detailsLong ? "feedback.tooLong" : "";
      const p = f.problem;
      const busy = busyProps(s.tasks, FEEDBACK_SEND, (k, v) => catalog.format(k, v));
      return {
        open: f.open, kind: f.kind,
        kindOptions: (["problem", "idea"] as const).map((id) => ({ id, label: catalog.format(`feedback.kind.${id}`) })),
        title: f.title, details: f.details,
        titlePlaceholder: catalog.format(`feedback.title.${f.kind}`), detailsPlaceholder: catalog.format(`feedback.details.${f.kind}`),
        titleInvalid: titleLong, titleError: titleLong ? catalog.format("feedback.titleLong", { max: TITLE_MAX }) : "",
        detailsInvalid: detailsLong, detailsError: detailsLong ? catalog.format("feedback.detailsLong", { max: DETAILS_MAX }) : "",
        canAttach: canAttach(), attach: f.attach && canAttach(), preview: f.preview, showPreview: f.preview && canAttach(),
        canPost, continues: !canPost, login: f.who ? `@${f.who.login}` : "", avatar: f.who?.avatar ?? "", initials: f.who ? initials(f.who.login) : "",
        whoTitle: canPost ? `@${f.who!.login}` : catalog.format("feedback.who.continueTitle"),
        whoDetail: catalog.format(canPost ? "feedback.who.post" : "feedback.who.continueDetail"),
        stage: f.phase === "sent" ? "sent" : "editing", editing: f.phase !== "sent", sending: f.phase === "sending", sent: f.phase === "sent",
        issueTitle: f.issue ? catalog.format("feedback.issue", { number: f.issue.number }) : "", canOpenIssue: Boolean(f.issue?.url),
        problem: p && f.phase === "editing" ? catalog.format(`feedback.problem.${p}`) : "", hasProblem: Boolean(p && f.phase === "editing"),
        offerContinue: sends && Boolean(p), canSignIn: p === "expired" && Boolean(bridge.firstRun),
        primaryLabel: catalog.format(!sends ? "command.feedback.continue" : p ? "command.feedback.retry" : "command.feedback.send"),
        primaryIcon: sends ? "feedback" : "github",
        primaryDisabled: Boolean(reason) && f.phase === "editing", primaryReason: reason ? catalog.format(reason) : "",
        busy: f.phase === "sending" || Boolean(busy.busy), // Words only while sending: a busy label at rest would rename the button (D-199).
        busyLabel: busy.busyLabel ?? (f.phase === "sending" ? catalog.format("feedback.sending") : ""),
      };
    },
  });

  return { state };
}
