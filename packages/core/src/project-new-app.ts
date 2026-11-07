import type { App } from "./app.ts";
import { opErrorCode, type PlatformBridge, type ProjectCreateStep } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";
import type { TaskTracker } from "./tasks.ts";
import { isRepoName } from "./setup.ts";

/** A repository-friendly form of a free-text project name (the owner, 7 November): lowercase, hyphens, GitHub's characters only. */
export function repoSlug(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100).replace(/[-.]+$/, "").replace(/\.git$/, "");
}

export function registerProjectNew(ctx: {
  store: App["store"]; commands: App["commands"]; viewModels: App["viewModels"]; bridge: PlatformBridge; catalog: MessageCatalog; tracker: TaskTracker;
}) {
  const { store, commands, viewModels, bridge, catalog, tracker } = ctx;
  const state = { open: false, step: 1, name: "", parent: "", folder: "", accent: "teal", logo: "book", error: "", problem: "", pending: false, retrying: false, created: "", operation: false, cancelRequested: false, cancelled: false };
  // Where the project is kept (the owner, 7 November): on GitHub (a private repository) or on this computer only.
  type Where = "github" | "local";
  type GitHubState = "checking" | "signedIn" | "signedOut" | "offline";
  const where = { choice: "local" as Where, chosen: false, github: "checking" as GitHubState, login: "", signingIn: false, sawSignIn: false };
  // The repository's own name (the owner, 7 November): derived from the display name until the person edits it.
  type RepoProblem = "" | "empty" | "chars" | "length" | "reserved" | "taken" | "checking";
  const repo = { name: "", edited: false, problem: "empty" as RepoProblem };
  let repoRevision = 0;
  // Confirm's Change… edits the repository name in place, so nothing sends the person back a step.
  let repoEditing = false;
  type Step = { id: ProjectCreateStep | "create" | "open"; status: "waiting" | "running" | "done" | "failed" };
  let steps: Step[] = [];
  let request: string | undefined;
  let recovery: "open" | "folder" | "github" | undefined;
  let incomplete = false;
  let revision = 0;
  let accountCheck = 0;
  const changed = () => store.update((s) => ({ ...s }));
  async function checkAccount() {
    const at = ++accountCheck;
    where.github = "checking"; changed();
    const status = await bridge.firstRun?.account().catch(() => undefined);
    if (at !== accountCheck) return;
    where.login = status?.account && !status.signedOut ? status.account.login : "";
    where.github = where.login ? "signedIn" : status?.problem === "offline" ? "offline" : "signedOut";
    // Signed in, GitHub is the suggested place; the person's own pick always stands.
    if (!where.chosen) where.choice = where.github === "signedIn" ? "github" : "local";
    changed();
    void validateRepo();
  }
  const blockedByGitHub = () => where.choice === "github" && (where.github !== "signedIn" || !incomplete && Boolean(repo.problem));
  const repoRule = (name: string): RepoProblem => !name ? "empty" : name.length > 100 ? "length"
    : !/^[A-Za-z0-9._-]+$/.test(name) ? "chars" : !isRepoName(name) ? "reserved" : "";
  async function validateRepo() {
    const at = ++repoRevision;
    repo.problem = repoRule(repo.name);
    if (repo.problem || where.choice !== "github" || where.github !== "signedIn" || !bridge.projects?.repoTaken) { changed(); return; }
    repo.problem = "checking"; changed();
    // An answer GitHub couldn't give isn't a refusal: Create still checks before it makes anything.
    const taken = await bridge.projects.repoTaken(repo.name).catch(() => undefined);
    if (at !== repoRevision) return;
    repo.problem = taken ? "taken" : ""; changed();
  }
  const deriveRepo = () => { if (!repo.edited) repo.name = repoSlug(state.name); return validateRepo(); };
  // Signing in uses the existing account card; the wizard steps aside and comes back with its choices kept.
  store.subscribe(() => {
    if (!where.signingIn) return;
    if (store.state.firstRun.active) { where.sawSignIn = true; return; }
    if (!where.sawSignIn) return;
    where.signingIn = false; where.sawSignIn = false; state.open = true;
    changed();
    void checkAccount();
  });
  bridge.projects?.onCreateProgress?.(progress => {
    if (!request || progress.request !== request || !state.pending) return;
    steps = [...progress.steps.map(id => ({
      id, status: id === progress.step ? progress.done ? "done" as const : "running" as const : steps.find(step => step.id === id)?.status ?? "waiting" as const,
    })), { id: "open", status: "waiting" }];
    changed();
  });
  async function validate() {
    const at = ++revision;
    state.pending = true;
    if (!state.retrying) { state.error = ""; recovery = undefined; }
    changed();
    try {
      const result = await bridge.projects!.check(state.parent, state.name);
      if (at !== revision) return;
      state.folder = result.folder; state.problem = result.problem;
      state.error = result.problem && state.name ? catalog.format(`project.new.problem.${result.problem}`, { folder: state.folder }) : "";
      if (!state.error) recovery = undefined;
    } catch {
      if (at !== revision) return;
      state.problem = "access"; state.error = catalog.format("project.new.problem.access", { folder: state.parent });
    } finally { if (at === revision) { state.pending = false; changed(); } }
  }
  commands.register({
    id: "projects.new", title: "project.new", icon: "add", layer: "basic", group: "app", enabled: () => Boolean(bridge.projects) && !state.pending,
    run: async () => {
      await commands.run("projects.close");
      if (incomplete && state.created) { state.open = true; changed(); return; }
      const unfinished = await bridge.projects?.pendingCreate?.();
      if (unfinished) {
        Object.assign(state, { ...unfinished, created: unfinished.folder, open: true, step: 4, pending: false, operation: true, problem: "", error: catalog.format("project.new.githubPartial") });
        Object.assign(where, { choice: "github", chosen: true });
        Object.assign(repo, { name: unfinished.repo, edited: true, problem: "" });
        incomplete = true; recovery = "github"; changed(); void checkAccount(); return;
      }
      recovery = undefined;
      steps = []; request = undefined;
      Object.assign(state, { open: true, step: 1, name: "", accent: "teal", logo: "book", error: "", problem: "", created: "", pending: true, operation: false, cancelRequested: false, cancelled: false });
      Object.assign(where, { choice: "local", chosen: false, signingIn: false, sawSignIn: false });
      Object.assign(repo, { name: "", edited: false, problem: "empty" }); repoEditing = false;
      repoRevision++;
      changed();
      void checkAccount();
      try { state.parent = await bridge.projects!.parent(); }
      catch { state.error = catalog.format("project.new.problem.access", { folder: "" }); }
      finally { state.pending = false; changed(); }
    },
  });
  commands.register({ id: "projects.newClose", title: "project.cancel", enabled: () => !state.pending, run: async () => {
    state.open = false; revision++; changed();
    if (!store.state.note.path) await commands.run("projects.open");
  } });
  commands.register({ id: "projects.newBack", title: "project.back", enabled: () => !state.pending && !incomplete && state.step > 1, run: () => { state.step--; repoEditing = false; state.operation = false; steps = []; changed(); } });
  commands.register({
    id: "projects.newNext", title: "project.next", enabled: () => !state.pending && Boolean(state.name.trim()) && !state.problem && !(state.step === 2 && blockedByGitHub()),
    run: async () => { await validate(); if (!state.problem && state.step < 4 && !(state.step === 2 && blockedByGitHub())) { state.step++; changed(); } },
  });
  commands.register<{value: string}>({
    id: "projects.newWhere", title: "project.new.whereTitle", run: ({value}) => {
      if (incomplete || state.pending && state.operation) return;
      if (value !== "github" && value !== "local") return;
      if (value === "github" && where.github === "offline") return;
      where.choice = value; where.chosen = true; state.created = ""; changed();
      void validateRepo();
    },
  });
  commands.register<{value: string}>({
    id: "projects.newrepo", title: "project.new.repoLabel", run: async ({value}) => {
      if (incomplete || state.pending && state.operation) return;
      // Kept exactly as typed, even when refused: the step says what's wrong and nothing is lost.
      repo.name = value; repo.edited = value !== repoSlug(state.name); state.created = "";
      await validateRepo();
    },
  });
  commands.register({
    id: "projects.newChangeRepo", title: "project.new.change", enabled: () => state.open && !state.pending && where.choice === "github",
    run: () => { repoEditing = true; changed(); },
  });
  commands.register({
    id: "projects.newSignIn", title: "project.new.signIn", enabled: () => state.open && !state.pending && where.github === "signedOut",
    run: async () => {
      where.signingIn = true; where.sawSignIn = false; state.open = false; changed();
      await commands.run("account.signIn");
      // The account card didn't show: come straight back.
      if (where.signingIn && !store.state.firstRun.active) { where.signingIn = false; state.open = true; changed(); void checkAccount(); }
    },
  });
  for (const field of ["name", "accent", "logo"] as const) commands.register<{value: string}>({
    id: `projects.new${field}`, title: "project.new", run: async ({value}) => {
      if (incomplete || state.pending && (state.operation || field !== "name")) return;
      state[field] = value; changed();
      if (field === "name") { state.created = ""; void deriveRepo(); await validate(); }
    },
  });
  commands.register({
    id: "projects.newFolder", title: "project.new.change", enabled: () => !state.pending && !incomplete,
    run: async () => {
      try {
        const parent = await bridge.projects!.chooseParent(state.parent);
        if (!parent) return;
        state.parent = parent; state.created = ""; state.operation = false; steps = []; await validate();
      } catch { state.error = catalog.format("project.new.problem.access", { folder: state.parent }); changed(); }
    },
  });
  commands.register({
    id: "projects.newCancel", title: "project.cancel",
    enabled: () => state.pending && state.operation && Boolean(request) && !state.cancelRequested && Boolean(bridge.projects?.cancelCreate),
    run: async () => {
      state.cancelRequested = true; changed();
      try { await bridge.projects!.cancelCreate!(request!); }
      catch (error) { state.cancelRequested = false; changed(); throw error; }
    },
  });
  commands.register({
    id: "projects.newDismiss", title: "project.cancel",
    run: () => commands.run(state.pending && state.operation ? "projects.newCancel" : "projects.newClose"),
  });
  commands.register({
    id: "projects.newCreate", title: "project.new.create", enabled: () => state.step === 4 && !state.pending && !state.problem && !blockedByGitHub(),
    run: async () => {
      state.pending = true; state.operation = true; state.cancelRequested = false; state.cancelled = false;
      steps = state.created ? steps.filter(step => step.id !== "open").map(step => ({ ...step, status: "done" })) : [{ id: "create", status: "running" }];
      steps.push({ id: "open", status: "waiting" });
      request = state.created && !incomplete ? undefined : crypto.randomUUID();
      const previousError = state.retrying ? state.error : "";
      if (!state.retrying) { state.error = ""; recovery = undefined; }
      changed();
      try {
        await tracker.run("project.create", "project.new.creating", async () => {
          try {
            const result = incomplete
              ? await bridge.projects!.continueCreate!(state.created, request)
              : state.created || await bridge.projects!.create({parent: state.parent, name: state.name, accent: state.accent, logo: state.logo, request, github: where.choice === "github", ...(where.choice === "github" ? { repo: repo.name } : {})});
            state.created = typeof result === "string" ? result : result.folder;
            incomplete = typeof result !== "string";
          } catch (error) {
            if (state.cancelRequested && !incomplete) throw new DOMException("Project setup stopped", "AbortError");
            throw error;
          }
          steps = steps.map(step => step.id === "open" ? step : { ...step, status: incomplete && step.status !== "done" ? "failed" : "done" });
          request = undefined;
          if (state.cancelRequested) throw new DOMException("Project setup stopped", "AbortError");
          steps = steps.map(step => step.id === "open" ? { ...step, status: "running" } : step);
          changed();
          await bridge.projects!.open(state.created);
          steps = steps.map(step => step.id === "open" ? { ...step, status: "done" } : step);
          if (incomplete) throw new Error("github-partial");
        }, undefined, "fn:project.create", "success");
        if (incomplete) {
          state.open = true; state.error = catalog.format("project.new.githubPartial"); recovery = "github";
        } else { state.open = false; state.error = ""; recovery = undefined; }
      } catch (error) {
        recovery = incomplete ? "github" : state.created ? "open" : "folder";
        if (state.cancelRequested) {
          state.cancelled = true;
          state.problem = state.created ? "" : "stopped";
          state.error = catalog.format(state.created ? "project.new.cancelledReady" : "project.new.cancelledPartial");
          steps = steps.map(step => step.status === "running" ? { ...step, status: "waiting" } : step);
        } else {
          if (!state.created) state.problem = "incomplete";
          steps = steps.map(step => step.status === "running" ? { ...step, status: "failed" } : step);
          state.error = catalog.format(incomplete ? "project.new.githubPartial" : state.created ? "project.new.openFailed" : "project.new.failed");
          console.error("New project failed", recovery, opErrorCode(error));
          if (error instanceof Error && error.message.includes("repository-taken")) {
            state.problem = ""; state.error = ""; repo.problem = "taken"; state.step = 2; recovery = undefined;
          }
        }
        if (state.error === previousError) tracker.announceOutcome(state.error);
      }
      finally { request = undefined; state.pending = false; changed(); }
    },
  });
  commands.register({
    id: "projects.newRecover", title: "commit.retry", enabled: () => state.open && Boolean(recovery) && !state.pending,
    run: async () => {
      state.retrying = true; changed();
      try {
        if (recovery === "open" || recovery === "github") await commands.run("projects.newCreate");
        else if (recovery === "folder") await commands.run("projects.newFolder");
        else throw new Error("No New project action to recover");
      } finally { state.retrying = false; changed(); }
    },
  });
  commands.register({ id: "projects.newContinue", title: "project.next", run: () => commands.run(state.step === 4 ? "projects.newCreate" : "projects.newNext") });
  const text = { type: "string" as const };
  viewModels.register({
    id: "vm.projectNew", reads: "*", setters: { name: "projects.newname", accent: "projects.newaccent", logo: "projects.newlogo", repoName: "projects.newrepo" },
    schema: { type: "object", properties: {
      open: { type: "boolean" }, pending: { type: "boolean" }, retrying: { type: "boolean" }, cannotNext: { type: "boolean" }, cannotBack: { type: "boolean" }, confirm: { type: "boolean" },
      operation: { type: "boolean" }, cannotCancel: { type: "boolean" }, cancelled: { type: "boolean" }, progress: { type: "number" }, progressLabel: text, elapsed: text, cancelLabel: text, cancelReason: text, nextReason: text,
      parts: { type: "array", items: { type: "object", properties: { id: text, label: text, icon: text, tone: text, busy: { type: "boolean" } } } },
      step: { type: "number" }, stepName: text, stepLabel: text, nextLabel: text, name: text, parent: text, folder: text, accent: text, logo: text, error: text, recoveryAction: text,
      where: text, whereGroup: text, githubValue: text, localValue: text, onGitHub: { type: "boolean" }, githubDetail: text, githubDisabled: { type: "boolean" }, githubBusy: { type: "boolean" }, canSignIn: { type: "boolean" }, repo: text,
      repoName: text, repoPrefix: text, repoInvalid: { type: "boolean" }, repoError: text, repoChecking: { type: "boolean" }, repoEditing: { type: "boolean" },
    } },
    select: () => ({
      ...state, cannotNext: state.pending || !state.name.trim() || Boolean(state.problem) || (state.step === 2 && blockedByGitHub()), cannotBack: state.pending || incomplete || state.step <= 1, confirm: state.step === 4,
      cannotCancel: state.operation && state.pending && (!request || state.cancelRequested || !bridge.projects?.cancelCreate),
      cancelLabel: catalog.format(state.cancelRequested && state.pending ? "project.new.stopping" : "project.cancel"),
      cancelReason: catalog.format(state.cancelRequested ? "project.new.stopping" : request ? "project.new.finishingStep" : "project.new.finishingOpen"),
      nextReason: catalog.format(state.pending ? state.operation ? "project.new.creating" : "project.new.checking"
        : (state.step === 2 || state.step === 4) && blockedByGitHub()
          ? where.github === "checking" ? "project.new.where.github.checking" : where.github !== "signedIn" ? "project.new.signInFirst" : `project.new.repo.${repo.problem}` : "project.new.fixName", { name: repo.name }),
      where: where.choice, whereGroup: "projectNewWhere", githubValue: "github", localValue: "local", onGitHub: where.choice === "github",
      githubDetail: catalog.format(where.github === "signedIn" ? "project.new.where.githubAs" : `project.new.where.github.${where.github}`, { login: where.login }),
      githubDisabled: where.github === "offline", githubBusy: where.github === "checking",
      canSignIn: where.choice === "github" && where.github === "signedOut",
      repo: catalog.format("project.new.repoName", { owner: where.login, name: repo.name }),
      repoName: repo.name, repoEditing: repoEditing && state.step === 4, repoPrefix: where.login ? `${where.login}/` : "",
      repoInvalid: Boolean(repo.problem) && repo.problem !== "checking" && (repo.edited || repo.problem === "taken" || Boolean(state.name.trim())),
      repoError: repo.problem && repo.problem !== "checking" ? catalog.format(`project.new.repo.${repo.problem}`, { name: repo.name }) : "",
      repoChecking: repo.problem === "checking",
      progress: steps.length ? steps.filter(step => step.status === "done").length / steps.length * 100 : 0,
      progressLabel: catalog.format("project.new.progress", { done: steps.filter(step => step.status === "done").length, total: steps.length }),
      elapsed: state.pending && tracker.snapshot().findLast(task => task.target === "project.create")?.elapsed
        ? catalog.format("task.elapsed", { words: catalog.format("project.new.creating"), seconds: tracker.snapshot().findLast(task => task.target === "project.create")!.elapsed }) : "",
      parts: steps.map(step => ({ id: step.id, label: catalog.format(`project.new.part.${step.id}`), icon: step.status === "done" ? "check" : step.status === "failed" ? "error" : "folder", tone: step.status === "done" ? "success" : step.status === "failed" ? "danger" : "neutral", busy: step.status === "running" && state.pending })),
      recoveryAction: recovery ? catalog.format(recovery === "github" ? "project.new.continueSetup" : recovery === "open" ? "commit.retry" : "project.new.change") : "",
      stepName: ["name", "where", "look", "confirm"][state.step - 1],
      stepLabel: catalog.format("project.new.stepOf", { n: state.step }),
      nextLabel: catalog.format(state.step === 4 ? "project.new.create" : "project.next"),
    }),
  });
}
