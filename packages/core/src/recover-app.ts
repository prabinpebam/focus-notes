/**
 * The recovery view (IA-VIEW-RECOVER, FRE-11, FRE-12, WP-5.14, D-212): the notes folder named in the
 * workspace record is missing at start, so the window opens on what's missing and the ways back
 * instead of the canvas. Nothing downloads, and no folder is made, until the person chooses. The
 * shell does the work through `bridge.recover`; the app keeps which way back is under way and turns it
 * into `vm.recover`. Signing in and choosing other notes are the first run's own steps, shown alone.
 */
import type { PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import type { Clock, TaskTracker, TaskView } from "./tasks.ts";
import { notOnGitHub, recoverOptions, type RecoverAccount, type RecoverProblem, type RecoverResult, type RecoverStatus } from "./recover.ts";

export * from "./recover.ts";

/** What the view is waiting for (PRF-13, D-149): each has its words (`recover.wait.<op>`), "" when none. */
export type RecoverWait = "" | "download" | "found" | "find" | "open" | "place" | "create";

export interface RecoverState {
  open: boolean;
  status?: RecoverStatus;
  /** Undefined until the account check ends: Download's line says it's checking. */
  account?: RecoverAccount;
  checking: boolean;
  wait: RecoverWait;
  progress: { part: string; percent: number };
  /** The folder came back by itself: the title says so for a moment, then writing opens. */
  back: boolean;
  /** Find the folder… chose different notes: their name, to ask before opening them. */
  different: string;
  /** What went wrong with the last way back: a message key, or "". */
  error: string;
  empty: {
    open: boolean;
    name: string;
    /** The name the shell suggested, so Change… only replaces a name the person didn't type. */
    suggested: string;
    place: string;
    short: string;
    error: string;
    focus: number;
  };
}

export const RECOVER_CLOSED: RecoverState = {
  open: false, checking: false, wait: "", progress: { part: "", percent: -1 }, back: false, different: "", error: "",
  empty: { open: false, name: "", suggested: "", place: "", short: "", error: "", focus: 0 },
};

/** The commands that still work while the view owns the window; every other one is held (D-212). */
export const RECOVER_COMMANDS = /^(recover\.|firstRun\.|setup\.|window\.|toast\.|keys\.|ui\.scale|appearance\.(system|light|dark)$|command\.run$|app\.ready$)/;

/** Each wait's tracker target: fixed IDs, measured as `focus-notes:<target>` and allow-listed for the report (QLT-04). */
export const RECOVER_WAITS = { account: "recover.account", download: "recover.download", open: "recover.open", find: "recover.find", place: "recover.place", create: "recover.create" } as const;

/** While offline, the account is asked again this often, so Download becomes primary once the network is back. */
const OFFLINE_RETRY_MS = 15_000;
const DAY = 86_400_000;

interface S { recover: RecoverState; firstRun: { active: boolean }; tasks: TaskView[] }

interface Ctx<St extends S> {
  store: Store<St>;
  bridge: PlatformBridge;
  catalog: MessageCatalog;
  commands: CommandRegistry<St>;
  viewModels: ViewModelRegistry<St>;
  tracker?: TaskTracker;
  clock: Clock;
  /** Shows a first-run step alone: Connect to sign in again, or Your notes to choose other notes. */
  again: (scope: "account" | "workspace") => Promise<boolean>;
  /** Now, for "Backed up yesterday at 2:41 PM". */
  now?: () => number;
}

export function registerRecover<St extends S>({ store, bridge, catalog, commands, viewModels, tracker, clock, again, now = Date.now }: Ctx<St>) {
  const rb = bridge.recover;
  const state = () => store.state.recover;
  const set = (patch: Partial<RecoverState>) => store.update((s) => ({ ...s, recover: { ...s.recover, ...patch } }));
  const setEmpty = (patch: Partial<RecoverState["empty"]>) => store.update((s) => ({ ...s, recover: { ...s.recover, empty: { ...s.recover.empty, ...patch } } }));
  const track = <T,>(op: keyof typeof RECOVER_WAITS, fn: () => Promise<T>) => (tracker ? tracker.run(RECOVER_WAITS[op], `recover.wait.${op}`, fn) : fn());

  // ---- the account, checked in the background with 10 s at most (the shell's limit) ----
  let turn = 0;
  let retry: unknown;
  let checked: Promise<void> = Promise.resolve();
  const check = () => {
    if (!rb) return checked;
    const mine = ++turn;
    if (retry !== undefined) clock.clearTimeout(retry);
    retry = undefined;
    set({ checking: true, account: undefined });
    checked = track("account", () => rb.account())
      .catch((): RecoverAccount => ({ state: "offline" }))
      .then((account) => {
        if (mine !== turn || !state().open) return;
        set({ account, checking: false });
        if (account.state === "offline") retry = clock.setTimeout(() => void check(), OFFLINE_RETRY_MS);
      });
    return checked;
  };

  /** Runs a way back as a named wait. A result that worked leaves the wait on: the window opens writing next. */
  const run = async (op: Exclude<RecoverWait, "" | "found" | "place">, fn: () => Promise<RecoverResult | undefined>): Promise<RecoverResult | undefined> => {
    if (!rb || state().wait) return undefined;
    set({ wait: op, error: "", different: "", ...(op === "download" ? { progress: { part: "", percent: -1 } } : {}) });
    let r: RecoverResult | undefined;
    try {
      r = await track(op, fn);
    } catch {
      r = { ok: false, problem: "failed" };
    }
    if (!r?.ok) set({ wait: "" });
    if (r && !r.ok) failed(r.problem, r.repository);
    return r;
  };
  const failed = (problem: RecoverProblem, repository?: string) => {
    if (problem === "different") return set({ different: repository ?? "" });
    if (problem === "name" || problem === "taken") return setEmpty({ error: `recover.empty.error.${problem}`, focus: state().empty.focus + 1 });
    set({ error: `recover.error.${problem}` });
    // The account may have changed since it was checked: the cards follow what's true now.
    if (problem === "offline" || problem === "signedOut" || problem === "noAccess") void check();
  };

  const reg = <A extends Record<string, unknown> = Record<string, never>>(id: string, run: (a: A) => unknown) => commands.register<A>({ id, title: `command.${id}`, run: async (a) => { await run(a); } });
  reg("recover.download", async () => {
    if (state().checking) await checked;
    const o = state().status && recoverOptions(state().status!, state().account);
    if (o?.download !== "ready") return;
    await run("download", () => rb!.download());
  });
  reg("recover.useFound", () => run("open", () => rb!.useFound()));
  reg("recover.find", () => run("find", () => rb!.find()));
  reg("recover.useChosen", () => run("open", () => rb!.useChosen()));
  reg("recover.notChosen", () => set({ different: "" }));
  reg("recover.tryAgain", () => check());
  reg("recover.choose", () => again("workspace"));
  reg("recover.signIn", () => again("account"));
  reg("recover.empty", async () => {
    if (!rb || state().wait) return;
    if (state().empty.open) return setEmpty({ focus: state().empty.focus + 1 });
    set({ error: "", different: "" });
    const p = await rb.emptyPlace().catch(() => undefined);
    if (!p) return set({ error: "recover.error.failed" });
    setEmpty({ open: true, name: p.name, suggested: p.name, place: p.place, short: p.short, error: "", focus: state().empty.focus + 1 });
  });
  reg<{ value: string }>("recover.setName", ({ value }) => setEmpty({ name: String(value ?? ""), error: "" }));
  reg("recover.changePlace", async () => {
    if (!rb || state().wait) return;
    set({ wait: "place" });
    const p = await track("place", () => rb.choosePlace()).catch(() => undefined);
    set({ wait: "" });
    if (!p) return;
    const e = state().empty;
    // A name the person typed stays; the suggestion follows the new place.
    setEmpty({ place: p.place, short: p.short, error: "", ...(e.name === e.suggested ? { name: p.name, suggested: p.name } : { suggested: p.name }) });
  });
  reg("recover.create", async () => {
    const name = state().empty.name.trim();
    if (!name) return setEmpty({ error: "recover.empty.error.name", focus: state().empty.focus + 1 });
    await run("create", () => rb!.createEmpty(name));
  });
  reg("recover.cancelEmpty", () => setEmpty({ open: false, error: "" }));

  // Every other command waits until there's a folder again: no note, no Files, no backup (D-212).
  commands.addHold((id, s) => (s.recover.open && !RECOVER_COMMANDS.test(id) ? "command.recover.held" : undefined));

  // ---- the view model ----
  const dayWords = (iso: string | undefined): string => {
    const at = iso ? Date.parse(iso) : Number.NaN;
    if (!Number.isFinite(at)) return "";
    const today = new Date(now());
    const d = new Date(at);
    const days = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / DAY);
    return catalog.format(days <= 0 ? "recover.when.today" : days === 1 ? "recover.when.yesterday" : "recover.when.day", { at });
  };
  viewModels.register({
    id: "vm.recover",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, title: { type: "string" }, body: { type: "string" }, markTone: { type: "string", enum: ["warning", "success"] }, markIcon: { type: "string" }, markBusy: { type: "boolean" },
        folderTitle: { type: "string" }, folderDetail: { type: "string" }, folderLabel: { type: "string" }, folderMark: { type: "boolean" },
        showFound: { type: "boolean" }, foundLine: { type: "string" }, foundFocus: { type: "boolean" }, foundBusy: { type: "boolean" },
        showDownload: { type: "boolean" }, downloadLine: { type: "string" }, downloadFocus: { type: "boolean" }, downloadBusy: { type: "boolean" }, downloadUnavailable: { type: "boolean" },
        showTryAgain: { type: "boolean" }, showLink: { type: "boolean" }, linkLabel: { type: "string" },
        showChoose: { type: "boolean" }, chooseFocus: { type: "boolean" },
        showSignIn: { type: "boolean" }, signInFocus: { type: "boolean" },
        findFocus: { type: "boolean" }, findBusy: { type: "boolean" },
        emptyOpen: { type: "boolean" }, emptyName: { type: "string" }, emptyInvalid: { type: "boolean" }, emptyError: { type: "string" }, emptyFocus: { type: "number" },
        emptyPlace: { type: "string" }, emptyPlaceFull: { type: "string" }, createBusy: { type: "boolean" }, placeBusy: { type: "boolean" },
        hasDifferent: { type: "boolean" }, differentText: { type: "string" }, openBusy: { type: "boolean" },
        hasError: { type: "boolean" }, errorText: { type: "string" },
        hasWait: { type: "boolean" }, waitText: { type: "string" }, hasPercent: { type: "boolean" }, percent: { type: "number" }, percentLabel: { type: "string" },
        holding: { type: "boolean" },
      },
    },
    setters: { emptyName: "recover.setName" },
    reads: ["recover", "tasks"],
    select: (s) => {
      const r = s.recover;
      const st = r.status;
      if (!r.open || !st) return { open: false };
      const o = recoverOptions(st, r.account);
      const busy = Boolean(r.wait) || r.back;
      const when = dayWords(r.account?.pushedAt ?? st.lastBackup);
      const repo = o.repository ?? st.repository;
      const name = repo?.split("/")[1] ?? "";
      const login = r.account?.login ?? st.account ?? repo?.split("/")[0] ?? "";
      const local = notOnGitHub(st);
      const folderDetail = st.kind === "synced" && st.service ? catalog.format("recover.folder.synced", { service: st.service })
        : local ? catalog.format("recover.folder.local")
        : [name, login ? `@${login}` : "", when ? catalog.format("recover.folder.backedUp", { when }) : ""].filter(Boolean).join(" · ");
      const downloadLine = o.download === "checking" ? catalog.format("recover.wait.account")
        : o.download === "ready" ? catalog.format(when ? "recover.download.line" : "recover.download.lineNoTime", { when, folder: st.downloadTo })
        : o.download === "noAccess" ? catalog.format("recover.download.noAccess", { login: login || "?" })
        : o.download === "hidden" ? "" : catalog.format(`recover.download.${o.download}`);
      // The wait under way, in words, with the elapsed time past wait.elapsedDelay (PRF-13).
      const op = r.back ? "found" : r.wait;
      const task = op ? s.tasks.findLast((t) => t.message === `recover.wait.${op}`) : undefined;
      const said = op === "download" || op === "create" || op === "open" || op === "found";
      const words = !op ? "" : op === "download" && r.progress.part ? (r.progress.part === "download" && r.progress.percent >= 0 ? catalog.format("recover.wait.downloadPercent", { percent: r.progress.percent }) : catalog.format(`recover.wait.part.${r.progress.part}`)) : catalog.format(`recover.wait.${op}`);
      const hasWait = said && (op === "found" || task?.phase === "on");
      const percent = op === "download" && r.progress.part === "download" ? r.progress.percent : -1;
      const title = r.back ? "recover.title.found" : st.missing === "drive" ? "recover.title.drive" : "recover.title";
      const body = r.back ? catalog.format("recover.body.found")
        : st.missing === "drive" ? catalog.format("recover.body.drive", { drive: st.drive ?? "" })
        : st.kind === "synced" && st.service ? catalog.format("recover.body.synced", { service: st.service })
        : catalog.format("recover.body");
      return {
        open: true, title: catalog.format(title), body, markTone: r.back ? "success" : "warning", markIcon: "folder", markBusy: busy,
        folderTitle: st.short, folderDetail, folderLabel: catalog.format("recover.folder.label", { folder: st.folder }), folderMark: !local,
        showFound: o.found, foundLine: st.found ? catalog.format("recover.found.line", { folder: st.found.short }) : "", foundFocus: o.primary === "found", foundBusy: r.wait === "open" && o.found,
        showDownload: o.download !== "hidden", downloadLine, downloadFocus: o.primary === "download", downloadBusy: r.wait === "download", downloadUnavailable: o.download !== "ready" && o.download !== "checking",
        showTryAgain: o.download === "offline", showLink: Boolean(o.link), linkLabel: o.link ? catalog.format(`recover.link.${o.link}`) : "",
        showChoose: o.choose, chooseFocus: o.primary === "choose",
        showSignIn: o.signIn, signInFocus: o.primary === "signIn",
        findFocus: o.primary === "find", findBusy: r.wait === "find",
        emptyOpen: r.empty.open, emptyName: r.empty.name, emptyInvalid: Boolean(r.empty.error), emptyError: r.empty.error ? catalog.format(r.empty.error) : "", emptyFocus: r.empty.focus,
        emptyPlace: r.empty.short, emptyPlaceFull: r.empty.place, createBusy: r.wait === "create", placeBusy: r.wait === "place",
        hasDifferent: Boolean(r.different), differentText: r.different ? catalog.format("recover.different", { notes: r.different }) : "", openBusy: r.wait === "open",
        hasError: Boolean(r.error), errorText: r.error ? catalog.format(r.error) : "",
        hasWait, waitText: hasWait ? (task?.elapsed ? catalog.format("task.elapsed", { words, seconds: task.elapsed }) : words) : "",
        hasPercent: hasWait && percent >= 0, percent: Math.max(0, percent), percentLabel: catalog.format("recover.wait.download"),
        holding: busy,
      };
    },
  });

  return {
    /** Asks the shell whether the folder is missing; if so, the view opens and the account is checked. Resolves to whether it's showing. */
    async begin(): Promise<boolean> {
      if (!rb) return false;
      const status = await rb.status().catch(() => undefined);
      if (!status) return false;
      set({ ...RECOVER_CLOSED, open: true, status });
      rb.onFound(() => set({ back: true, error: "", different: "" }));
      rb.onProgress((p) => set({ progress: { part: p.part ?? "", percent: typeof p.percent === "number" ? p.percent : -1 } }));
      // Back from signing in or choosing other notes: what the account reaches now decides the cards.
      let active = store.state.firstRun.active;
      store.subscribe(() => {
        const now = store.state.firstRun.active;
        if (active && !now && state().open) void check();
        active = now;
      });
      void check();
      return true;
    },
    get open() {
      return state().open;
    },
  };
}
