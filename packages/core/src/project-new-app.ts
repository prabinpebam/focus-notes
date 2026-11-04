import type { App } from "./app.ts";
import { opErrorCode, type PlatformBridge, type ProjectCreateStep } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";
import type { TaskTracker } from "./tasks.ts";

export function registerProjectNew(ctx: {
  store: App["store"]; commands: App["commands"]; viewModels: App["viewModels"]; bridge: PlatformBridge; catalog: MessageCatalog; tracker: TaskTracker;
}) {
  const { store, commands, viewModels, bridge, catalog, tracker } = ctx;
  const state = { open: false, step: 1, name: "", parent: "", folder: "", accent: "teal", logo: "book", error: "", problem: "", pending: false, retrying: false, created: "", operation: false, cancelRequested: false, cancelled: false };
  type Step = { id: ProjectCreateStep | "create" | "open"; status: "waiting" | "running" | "done" | "failed" };
  let steps: Step[] = [];
  let request: string | undefined;
  let recovery: "open" | "folder" | undefined;
  let revision = 0;
  const changed = () => store.update((s) => ({ ...s }));
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
      recovery = undefined;
      steps = []; request = undefined;
      Object.assign(state, { open: true, step: 1, name: "", accent: "teal", logo: "book", error: "", problem: "", created: "", pending: true, operation: false, cancelRequested: false, cancelled: false });
      changed();
      try { state.parent = await bridge.projects!.parent(); }
      catch { state.error = catalog.format("project.new.problem.access", { folder: "" }); }
      finally { state.pending = false; changed(); }
    },
  });
  commands.register({ id: "projects.newClose", title: "project.cancel", enabled: () => !state.pending, run: async () => {
    state.open = false; revision++; changed();
    if (!store.state.note.path) await commands.run("projects.open");
  } });
  commands.register({ id: "projects.newBack", title: "project.back", enabled: () => !state.pending && state.step > 1, run: () => { state.step--; state.operation = false; steps = []; changed(); } });
  commands.register({
    id: "projects.newNext", title: "project.next", enabled: () => !state.pending && Boolean(state.name.trim()) && !state.problem,
    run: async () => { await validate(); if (!state.problem && state.step < 4) { state.step++; changed(); } },
  });
  for (const field of ["name", "accent", "logo"] as const) commands.register<{value: string}>({
    id: `projects.new${field}`, title: "project.new", run: async ({value}) => {
      if (state.pending && (state.operation || field !== "name")) return;
      state[field] = value; changed();
      if (field === "name") { state.created = ""; await validate(); }
    },
  });
  commands.register({
    id: "projects.newFolder", title: "project.new.change", enabled: () => !state.pending,
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
    id: "projects.newCreate", title: "project.new.create", enabled: () => state.step === 4 && !state.pending && !state.problem,
    run: async () => {
      state.pending = true; state.operation = true; state.cancelRequested = false; state.cancelled = false;
      steps = state.created ? steps.filter(step => step.id !== "open").map(step => ({ ...step, status: "done" })) : [{ id: "create", status: "running" }];
      steps.push({ id: "open", status: "waiting" });
      request = state.created ? undefined : crypto.randomUUID();
      if (!state.retrying) { state.error = ""; recovery = undefined; }
      changed();
      try {
        await tracker.run("project.create", "project.new.creating", async () => {
          try {
            if (!state.created) state.created = await bridge.projects!.create({parent: state.parent, name: state.name, accent: state.accent, logo: state.logo, request});
          } catch (error) {
            if (state.cancelRequested) throw new DOMException("Project setup stopped", "AbortError");
            throw error;
          }
          steps = steps.map(step => step.id === "open" ? step : { ...step, status: "done" });
          request = undefined;
          if (state.cancelRequested) throw new DOMException("Project setup stopped", "AbortError");
          steps = steps.map(step => step.id === "open" ? { ...step, status: "running" } : step);
          changed();
          await bridge.projects!.open(state.created);
          steps = steps.map(step => ({ ...step, status: "done" }));
        }, undefined, "fn:project.create", "success");
        state.open = false; state.error = ""; recovery = undefined;
      } catch (error) {
        recovery = state.created ? "open" : "folder";
        if (state.cancelRequested) {
          state.cancelled = true;
          state.problem = state.created ? "" : "stopped";
          state.error = catalog.format(state.created ? "project.new.cancelledReady" : "project.new.cancelledPartial");
          steps = steps.map(step => step.status === "running" ? { ...step, status: "waiting" } : step);
        } else {
          if (!state.created) state.problem = "incomplete";
          steps = steps.map(step => step.status === "running" ? { ...step, status: "failed" } : step);
          state.error = catalog.format(state.created ? "project.new.openFailed" : "project.new.failed");
          console.error("New project failed", recovery, opErrorCode(error));
        }
      }
      finally { request = undefined; state.pending = false; changed(); }
    },
  });
  commands.register({
    id: "projects.newRecover", title: "commit.retry", enabled: () => state.open && Boolean(recovery) && !state.pending,
    run: async () => {
      state.retrying = true; changed();
      try {
        if (recovery === "open") await commands.run("projects.newCreate");
        else if (recovery === "folder") await commands.run("projects.newFolder");
        else throw new Error("No New project action to recover");
      } finally { state.retrying = false; changed(); }
    },
  });
  commands.register({ id: "projects.newContinue", title: "project.next", run: () => commands.run(state.step === 4 ? "projects.newCreate" : "projects.newNext") });
  const text = { type: "string" as const };
  viewModels.register({
    id: "vm.projectNew", reads: "*", setters: { name: "projects.newname", accent: "projects.newaccent", logo: "projects.newlogo" },
    schema: { type: "object", properties: {
      open: { type: "boolean" }, pending: { type: "boolean" }, retrying: { type: "boolean" }, cannotNext: { type: "boolean" }, cannotBack: { type: "boolean" }, confirm: { type: "boolean" },
      operation: { type: "boolean" }, cannotCancel: { type: "boolean" }, cancelled: { type: "boolean" }, progress: { type: "number" }, progressLabel: text, elapsed: text, cancelLabel: text, cancelReason: text, nextReason: text,
      parts: { type: "array", items: { type: "object", properties: { id: text, label: text, icon: text, tone: text, busy: { type: "boolean" } } } },
      step: { type: "number" }, stepName: text, stepLabel: text, nextLabel: text, name: text, parent: text, folder: text, accent: text, logo: text, error: text, recoveryAction: text,
    } },
    select: () => ({
      ...state, cannotNext: state.pending || !state.name.trim() || Boolean(state.problem), cannotBack: state.pending || state.step <= 1, confirm: state.step === 4,
      cannotCancel: state.operation && state.pending && (!request || state.cancelRequested || !bridge.projects?.cancelCreate),
      cancelLabel: catalog.format(state.cancelRequested && state.pending ? "project.new.stopping" : "project.cancel"),
      cancelReason: catalog.format(state.cancelRequested ? "project.new.stopping" : request ? "project.new.finishingStep" : "project.new.finishingOpen"),
      nextReason: catalog.format(state.pending ? state.operation ? "project.new.creating" : "project.new.checking" : "project.new.fixName"),
      progress: steps.length ? steps.filter(step => step.status === "done").length / steps.length * 100 : 0,
      progressLabel: catalog.format("project.new.progress", { done: steps.filter(step => step.status === "done").length, total: steps.length }),
      elapsed: state.pending && tracker.snapshot().findLast(task => task.target === "project.create")?.elapsed
        ? catalog.format("task.elapsed", { words: catalog.format("project.new.creating"), seconds: tracker.snapshot().findLast(task => task.target === "project.create")!.elapsed }) : "",
      parts: steps.map(step => ({ id: step.id, label: catalog.format(`project.new.part.${step.id}`), icon: step.status === "done" ? "check" : step.status === "failed" ? "error" : "folder", tone: step.status === "done" ? "success" : step.status === "failed" ? "danger" : "neutral", busy: step.status === "running" && state.pending })),
      recoveryAction: recovery ? catalog.format(recovery === "open" ? "commit.retry" : "project.new.change") : "",
      stepName: ["name", "private", "look", "confirm"][state.step - 1],
      stepLabel: catalog.format("project.new.stepOf", { n: state.step }),
      nextLabel: catalog.format(state.step === 4 ? "project.new.create" : "project.next"),
    }),
  });
}
