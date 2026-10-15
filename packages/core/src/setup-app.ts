/**
 * Set up my instance in the app (FRE-08): the shell runs the steps (the desktop's setup engine);
 * the app keeps the latest report and turns it into `vm.setup`, a checklist where each step says
 * what it does, how it stands, and why it failed, and offers Retry. The first run's screens
 * compose it (WP-3.2).
 */
import type { PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { SETUP_STEPS, type SetupReport, type SetupStepId } from "./setup.ts";

export * from "./setup.ts";

export interface SetupState {
  /** Whether this shell can set up an instance (the desktop). */
  available: boolean;
  report?: SetupReport;
}
export const NO_SETUP: SetupState = { available: false };

interface Ctx<S extends { setup: SetupState }> {
  store: Store<S>;
  bridge: PlatformBridge;
  catalog: MessageCatalog;
  commands: CommandRegistry<S>;
  viewModels: ViewModelRegistry<S>;
}

export function registerSetup<S extends { setup: SetupState }>({ store, bridge, catalog, commands, viewModels }: Ctx<S>) {
  const apply = (report: SetupReport) => store.update((s) => ({ ...s, setup: { available: true, report } }));

  commands.register<{ id: SetupStepId }>({
    id: "setup.retry", title: "command.setup.retry",
    enabled: (s) => Boolean(s.setup.report && !s.setup.report.running),
    run: async ({ id }) => {
      if (!bridge.setup || !SETUP_STEPS.includes(id)) return;
      const r = await bridge.setup.retry(id);
      apply(r);
      // Try again resumes the whole sequence from the step that failed (D-135): the engine's steps
      // are idempotent, so start() runs every step not done yet, in order, to the end.
      const step = r.steps.find((x) => x.id === id);
      const rest = r.steps.some((x) => x.state === "pending" || x.state === "failed");
      if (r.options && !r.running && (step?.state === "done" || step?.state === "skipped") && rest) apply(await bridge.setup.start(r.options));
    },
  });

  const STEP = {
    type: "object" as const,
    properties: {
      id: { type: "string" as const }, label: { type: "string" as const }, state: { type: "string" as const, enum: ["pending", "running", "done", "failed", "skipped"] },
      problem: { type: "string" as const }, failed: { type: "boolean" as const }, done: { type: "boolean" as const },
    },
  };
  viewModels.register({
    id: "vm.setup",
    reads: ["setup"],
    schema: {
      type: "object",
      properties: {
        available: { type: "boolean" }, running: { type: "boolean" }, finished: { type: "boolean" },
        login: { type: "string" }, site: { type: "string" }, hasSite: { type: "boolean" },
        steps: { type: "array", items: STEP },
      },
    },
    select: (s) => {
      const r = s.setup.report;
      const steps = (r?.steps ?? SETUP_STEPS.map((id) => ({ id, state: "pending" as const }))).map((step) => ({
        id: step.id,
        label: catalog.format(`setup.step.${step.id}`),
        state: step.state,
        problem: step.state === "failed" ? catalog.format(`setup.problem.${step.problem ?? "failed"}`) : "",
        failed: step.state === "failed",
        done: step.state === "done" || step.state === "skipped",
      }));
      return {
        available: s.setup.available, running: Boolean(r?.running), finished: steps.every((x) => x.done),
        login: r?.login ?? "", site: r?.site ?? "", hasSite: Boolean(r?.site), steps,
      };
    },
  });

  return {
    start() {
      if (!bridge.setup) return;
      bridge.setup.onReport(apply);
      void bridge.setup.status().then(apply, () => {});
    },
  };
}
