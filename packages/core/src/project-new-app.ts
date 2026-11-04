import type { App } from "./app.ts";
import type { PlatformBridge } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";

export function registerProjectNew(ctx: {
  store: App["store"]; commands: App["commands"]; viewModels: App["viewModels"]; bridge: PlatformBridge; catalog: MessageCatalog;
}) {
  const { store, commands, viewModels, bridge, catalog } = ctx;
  const state = { open: false, step: 1, name: "", parent: "", folder: "", accent: "teal", logo: "book", error: "", problem: "", pending: false, created: "" };
  let revision = 0;
  const changed = () => store.update((s) => ({ ...s }));
  async function validate() {
    const at = ++revision;
    state.pending = true; state.error = ""; changed();
    try {
      const result = await bridge.projects!.check(state.parent, state.name);
      if (at !== revision) return;
      state.folder = result.folder; state.problem = result.problem;
      state.error = result.problem && state.name ? catalog.format(`project.new.problem.${result.problem}`, { folder: state.folder }) : "";
    } catch {
      if (at !== revision) return;
      state.problem = "access"; state.error = catalog.format("project.new.problem.access", { folder: state.parent });
    } finally { if (at === revision) { state.pending = false; changed(); } }
  }
  commands.register({
    id: "projects.new", title: "project.new", icon: "add", layer: "basic", group: "app", enabled: () => Boolean(bridge.projects),
    run: async () => {
      await commands.run("projects.close");
      Object.assign(state, { open: true, step: 1, name: "", accent: "teal", logo: "book", error: "", problem: "", created: "", pending: true });
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
  commands.register({ id: "projects.newBack", title: "project.back", enabled: () => !state.pending && state.step > 1, run: () => { state.step--; changed(); } });
  commands.register({
    id: "projects.newNext", title: "project.next", enabled: () => !state.pending && Boolean(state.name.trim()) && !state.problem,
    run: async () => { await validate(); if (!state.problem && state.step < 4) { state.step++; changed(); } },
  });
  for (const field of ["name", "accent", "logo"] as const) commands.register<{value: string}>({
    id: `projects.new${field}`, title: "project.new", run: async ({value}) => {
      if (state.pending && field !== "name") return;
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
        state.parent = parent; state.created = ""; await validate();
      } catch { state.error = catalog.format("project.new.problem.access", { folder: state.parent }); changed(); }
    },
  });
  commands.register({
    id: "projects.newCreate", title: "project.new.create", enabled: () => state.step === 4 && !state.pending && !state.problem,
    run: async () => {
      state.pending = true; state.error = ""; changed();
      try {
        if (!state.created) state.created = await bridge.projects!.create({parent: state.parent, name: state.name, accent: state.accent, logo: state.logo});
        await bridge.projects!.open(state.created);
        state.open = false;
      } catch { state.error = catalog.format("project.new.failed"); }
      finally { state.pending = false; changed(); }
    },
  });
  commands.register({ id: "projects.newContinue", title: "project.next", run: () => commands.run(state.step === 4 ? "projects.newCreate" : "projects.newNext") });
  const text = { type: "string" as const };
  viewModels.register({
    id: "vm.projectNew", reads: "*", setters: { name: "projects.newname", accent: "projects.newaccent", logo: "projects.newlogo" },
    schema: { type: "object", properties: {
      open: { type: "boolean" }, pending: { type: "boolean" }, cannotNext: { type: "boolean" }, cannotBack: { type: "boolean" }, confirm: { type: "boolean" },
      step: { type: "number" }, stepName: text, stepLabel: text, nextLabel: text, name: text, parent: text, folder: text, accent: text, logo: text, error: text,
    } },
    select: () => ({
      ...state, cannotNext: state.pending || !state.name.trim() || Boolean(state.problem), cannotBack: state.pending || state.step <= 1, confirm: state.step === 4,
      stepName: ["name", "private", "look", "confirm"][state.step - 1],
      stepLabel: catalog.format("project.new.stepOf", { n: state.step }),
      nextLabel: catalog.format(state.step === 4 ? "project.new.create" : "project.next"),
    }),
  });
}
