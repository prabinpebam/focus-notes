/**
 * Features of shells that keep notes themselves, chiefly the web app on the user's own Pages site
 * (PKG-05, PKG-07, PKG-08, FRE-09): Open… as an in-app dialog, the web first run with Connect
 * GitHub, the sync status, and reloading a note when a pull changes it.
 */
import type { AppState } from "./app.ts";
import type { AppStateFile, NoteSummary, PlatformBridge } from "./bridge.ts";
import { ConnectError } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { TaskTracker } from "./tasks.ts";
import type { ViewModelRegistry } from "./view-models.ts";

export interface PickerState {
  open: boolean;
  query: string;
  activeId: string;
  notes: NoteSummary[];
  focus: number;
}
export const PICKER_CLOSED: PickerState = { open: false, query: "", activeId: "", notes: [], focus: 0 };

export type ConnectStep = "welcome" | "repo" | "token" | "check" | "done";
export interface ConnectState {
  open: boolean;
  step: ConnectStep;
  repo: string;
  token: string;
  busy: boolean;
  /** A message key for what went wrong, if anything. */
  error: string;
  login: string;
  connectedRepo: string;
  focus: number;
}
export const CONNECT_CLOSED: ConnectState = { open: false, step: "welcome", repo: "notes", token: "", busy: false, error: "", login: "", connectedRepo: "", focus: 0 };

/** GitHub's own pages, pre-filled (D-81). Nothing else is opened, and nothing is sent anywhere. */
export const newRepoUrl = (name: string) =>
  `https://github.com/new?${new URLSearchParams({ name: name || "notes", visibility: "private", description: "Notes written with Focus Notes" })}`;
export const newTokenUrl = (owner?: string) =>
  `https://github.com/settings/personal-access-tokens/new?${new URLSearchParams({
    name: "Focus Notes",
    description: "Lets Focus Notes in your browser read and write your notes repository. Choose Only select repositories, then your notes repository.",
    ...(owner ? { target_name: owner } : {}),
    expires_in: "366",
    contents: "write",
  })}`;

/** "notes", "you/notes", or a github.com URL → { owner?, name }. */
export function parseRepo(input: string): { owner?: string; name: string } | undefined {
  const s = input.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "");
  const parts = s.split("/").filter(Boolean);
  const ok = (x: string | undefined) => Boolean(x && /^[A-Za-z0-9_.-]{1,100}$/.test(x));
  if (parts.length === 1 && ok(parts[0])) return { name: parts[0]! };
  if (parts.length === 2 && ok(parts[0]) && ok(parts[1])) return { owner: parts[0]!, name: parts[1]! };
  return undefined;
}

const titleOf = (path: string) => path.split("/").at(-1)!.replace(/\.(md|markdown)$/i, "");

export interface BrowserContext {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  load(path: string): Promise<void>;
  toast(message: string, opts?: { tone?: "info" | "error"; action?: { command: string; label: string } }): number;
  tracker: TaskTracker;
  menu: { id: string; label: string; items: (string | { submenu: string; label: string; items: string[] })[] }[];
  appState(): AppStateFile;
  persistAppState(patch: Partial<AppStateFile>): Promise<void>;
}

export function registerBrowserFeatures(ctx: BrowserContext): { start(): void } {
  const { store, commands, viewModels, catalog, bridge } = ctx;
  const github = bridge.github;
  const setPicker = (patch: Partial<PickerState>) => store.update((s) => ({ ...s, ui: { ...s.ui, picker: { ...s.ui.picker, ...patch } } }));
  const setConnect = (patch: Partial<ConnectState>) => store.update((s) => ({ ...s, ui: { ...s.ui, connect: { ...s.ui.connect, ...patch } } }));

  // ---- Open… (notes kept by the shell) ----
  const matches = (s: PickerState) => {
    const q = s.query.trim().toLowerCase();
    return s.notes.filter((n) => !q || n.path.toLowerCase().includes(q)).slice(0, 200);
  };
  commands.register({
    id: "picker.open", title: "command.note.open",
    run: async () => {
      const notes = ((await bridge.listNotes?.()) ?? []).sort((a, b) => b.updated - a.updated);
      store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false, picker: { open: true, query: "", activeId: notes[0]?.path ?? "", notes, focus: s.ui.picker.focus + 1 } } }));
    },
  });
  commands.register<{ open: boolean }>({ id: "picker.setOpen", title: "command.note.open", run: ({ open }) => { if (!open) setPicker({ open: false }); } });
  commands.register<{ value: string }>({
    id: "picker.setQuery", title: "command.picker.setQuery",
    run: ({ value }) => {
      const query = typeof value === "string" ? value : "";
      const next = { ...store.state.ui.picker, query };
      setPicker({ query, activeId: matches(next)[0]?.path ?? "" });
    },
  });
  const move = (dir: 1 | -1) => () => {
    const list = matches(store.state.ui.picker);
    if (!list.length) return;
    const i = list.findIndex((n) => n.path === store.state.ui.picker.activeId);
    setPicker({ activeId: list[Math.min(list.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))]!.path });
  };
  commands.register({ id: "picker.next", title: "command.picker.next", shortcut: { default: "Down", handledBy: "pickerField" }, layer: "basic", group: "files", run: move(1) });
  commands.register({ id: "picker.prev", title: "command.picker.prev", shortcut: { default: "Up", handledBy: "pickerField" }, layer: "basic", group: "files", run: move(-1) });
  commands.register<{ id: string }>({
    id: "picker.choose", title: "command.picker.choose",
    run: async ({ id }) => {
      const path = typeof id === "string" && id ? id : store.state.ui.picker.activeId;
      if (!path || !store.state.ui.picker.notes.some((n) => n.path === path)) return;
      setPicker({ open: false });
      await ctx.load(path);
    },
  });
  commands.register({ id: "picker.chooseActive", title: "command.picker.choose", shortcut: { default: "Enter", handledBy: "pickerField" }, layer: "basic", group: "files", run: (_a, c) => c.run("picker.choose", { id: "" }) });
  commands.register<{ id: string }>({ id: "picker.setActive", title: "command.picker.next", run: ({ id }) => { if (typeof id === "string") setPicker({ activeId: id }); } });

  viewModels.register({
    id: "vm.picker",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, query: { type: "string" }, activeId: { type: "string" }, focus: { type: "number" },
        items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, description: { type: "string" }, icon: { type: "string" } } } },
        summary: { type: "string" },
      },
    },
    setters: { query: "picker.setQuery" },
    select: (s) => {
      const p = s.ui.picker;
      if (!p.open) return { open: false, query: "", activeId: "", focus: p.focus, items: [], summary: "" };
      const list = matches(p);
      return {
        open: true, query: p.query, activeId: p.activeId, focus: p.focus,
        items: list.map((n) => ({ id: n.path, label: titleOf(n.path), description: n.path.includes("/") ? n.path : "", icon: "document" })),
        summary: list.length ? catalog.format("picker.count", { count: list.length }) : catalog.format("picker.none"),
      };
    },
  });

  // ---- GitHub: the web first run, connecting, and sync (FRE-09, PKG-08) ----
  // Registered in every shell so views stay the same; they're only available with a GitHub bridge.
  if (github) {
    ctx.menu.push({ id: "github", label: "menu.github", items: ["github.connect", "github.syncNow", "github.signOut"] });
    store.update((s) => ({ ...s, sync: github.status() }));
    github.onStatus((sync) => store.update((s) => ({ ...s, sync })));
    github.onNotesChanged(async (paths) => {
      const open = store.state.note.path;
      // An open note changed on GitHub reloads, but only if everything here is saved; otherwise the
      // sync engine already kept both versions.
      if (open && paths.includes(open) && store.state.note.saveState === "saved") await ctx.load(open);
    });
    github.onConflict((original, copy) => {
      ctx.toast(catalog.format("sync.conflict", { note: titleOf(original), copy: titleOf(copy) }));
    });
  }
  {

    const openConnect = (step: ConnectStep) =>
      store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false, connect: { ...s.ui.connect, open: true, step, error: "", busy: false, focus: s.ui.connect.focus + 1 } } }));
    const go = (step: ConnectStep) => setConnect({ step, error: "", focus: store.state.ui.connect.focus + 1 });
    commands.register({
      id: "github.connect", title: "command.github.connect", icon: "sync",
      enabled: (s) => Boolean(github) && (s.sync.state === "local" || s.sync.state === "signedOut"),
      run: () => openConnect("repo"),
    });
    commands.register<{ open: boolean }>({
      id: "connect.setOpen", title: "command.github.connect",
      run: async ({ open }) => {
        if (open) return;
        setConnect({ open: false, token: "" });
        await ctx.persistAppState({ webWelcomed: true });
      },
    });
    commands.register({ id: "connect.startWriting", title: "command.connect.startWriting", run: async (_a, c) => c.run("connect.setOpen", { open: false }) });
    commands.register({ id: "connect.begin", title: "command.github.connect", run: () => go("repo") });
    commands.register({ id: "connect.back", title: "command.connect.back", run: () => {
      const order: ConnectStep[] = ["welcome", "repo", "token", "check"];
      const i = order.indexOf(store.state.ui.connect.step);
      go(order[Math.max(0, i - 1)]!);
    } });
    commands.register<{ value: string }>({ id: "connect.setRepo", title: "command.connect.setRepo", run: ({ value }) => setConnect({ repo: typeof value === "string" ? value : "", error: "" }) });
    commands.register<{ value: string }>({ id: "connect.setToken", title: "command.connect.setToken", run: ({ value }) => setConnect({ token: typeof value === "string" ? value.trim() : "", error: "" }) });
    commands.register({ id: "connect.openRepoPage", title: "command.connect.openRepoPage", run: () => bridge.openExternal?.(newRepoUrl(parseRepo(store.state.ui.connect.repo)?.name ?? "notes")) });
    commands.register({ id: "connect.openTokenPage", title: "command.connect.openTokenPage", run: () => bridge.openExternal?.(newTokenUrl(parseRepo(store.state.ui.connect.repo)?.owner)) });
    commands.register({
      id: "connect.toToken", title: "command.connect.next",
      run: () => {
        if (!parseRepo(store.state.ui.connect.repo)) return setConnect({ error: "connect.error.repoName" });
        go("token");
      },
    });
    commands.register({
      id: "connect.verify", title: "command.connect.verify",
      run: async () => {
        const c = store.state.ui.connect;
        if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(c.token)) return setConnect({ error: "connect.error.tokenShape" });
        setConnect({ busy: true, error: "", step: "check" });
        try {
          if (!github) throw new ConnectError("other");
          const gh = github;
          const r = await ctx.tracker.run("connect.verify", "task.connecting", () => gh.connect(c.repo, c.token), "task.connected");
          setConnect({ busy: false, step: "done", token: "", login: r.login, connectedRepo: r.repo, focus: store.state.ui.connect.focus + 1 });
          await ctx.persistAppState({ webWelcomed: true });
        } catch (e) {
          const code = e instanceof ConnectError ? e.code : "other";
          setConnect({ busy: false, step: code === "badToken" || code === "noAccess" || code === "readOnly" ? "token" : code === "notFound" ? "repo" : "token", error: `connect.error.${code}`, focus: store.state.ui.connect.focus + 1 });
        }
      },
    });
    commands.register({
      id: "github.syncNow", title: "command.github.syncNow", icon: "sync",
      enabled: (s) => Boolean(github) && s.sync.state !== "local" && s.sync.state !== "signedOut",
      run: () => ctx.tracker.run("github.syncNow", "task.syncing", () => github!.syncNow(), "task.synced").catch(() => {}),
    });
    commands.register({
      id: "github.signOut", title: "command.github.signOut",
      enabled: (s) => Boolean(github) && s.sync.state !== "local",
      run: async () => {
        await github?.disconnect();
        ctx.toast(catalog.format("sync.signedOut"));
      },
    });
    viewModels.register({
      id: "vm.connect",
      schema: {
        type: "object",
        properties: {
          open: { type: "boolean" }, step: { type: "string", enum: ["welcome", "repo", "token", "check", "done"] },
          repo: { type: "string" }, token: { type: "string" }, busy: { type: "boolean" }, error: { type: "string" }, hasError: { type: "boolean" },
          doneText: { type: "string" }, tokenHelp: { type: "string" }, focus: { type: "number" }, title: { type: "string" },
        },
      },
      setters: { repo: "connect.setRepo", token: "connect.setToken" },
      select: (s) => {
        const c = s.ui.connect;
        const parsed = parseRepo(c.repo);
        return {
          open: c.open, step: c.step, repo: c.repo, token: c.token, busy: c.busy, focus: c.focus,
          error: c.error && catalog.has(c.error) ? catalog.format(c.error) : c.error ? catalog.format("connect.error.other") : "",
          hasError: Boolean(c.error),
          doneText: c.step === "done" ? catalog.format("connect.done", { login: c.login, repo: c.connectedRepo }) : "",
          tokenHelp: catalog.format("connect.tokenHelp", { repo: parsed ? parsed.name : "notes" }),
          title: catalog.format(c.step === "welcome" ? "connect.welcomeTitle" : "connect.title"),
        };
      },
    });
  }

  viewModels.register({
    id: "vm.sync",
    schema: { type: "object", properties: { state: { type: "string" }, label: { type: "string" }, problem: { type: "boolean" } } },
    select: (s) => {
      const st = s.sync;
      const label = st.state === "local" ? "" : catalog.format(`sync.state.${st.state}`, { pending: st.pending, repo: st.repo ?? "", message: st.message ?? "" });
      return { state: st.state, label, problem: st.state === "error" || st.state === "signedOut" };
    },
  });

  return {
    start() {
      // The web first run, once (FRE-09).
      if (github && !ctx.appState().webWelcomed && github.status().state === "local") {
        store.update((s) => ({ ...s, ui: { ...s.ui, connect: { ...s.ui.connect, open: true, step: "welcome", focus: s.ui.connect.focus + 1 } } }));
      }
    },
  };
}
