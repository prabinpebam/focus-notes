/**
 * Set up my instance in the app (FRE-08): the shell's reports become `vm.setup`, a checklist that
 * says how each step stands and why one failed, re-selected only when setup changes (PRF-11), and
 * Retry asks the shell to run one step again.
 */
import { describe, expect, it } from "vitest";
import { createApp, SETUP_STEPS, type PlatformBridge, type SetupReport, type SetupStepId } from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const report = (over: Partial<Record<SetupStepId, Partial<SetupReport["steps"][number]>>> = {}, more: Partial<SetupReport> = {}): SetupReport => ({
  running: false,
  steps: SETUP_STEPS.map((id) => ({ id, state: "pending" as const, ...over[id] })),
  ...more,
});

function setup(withSetup = true) {
  let listener: ((r: SetupReport) => void) | undefined;
  const retried: SetupStepId[] = [];
  const started: unknown[] = [];
  let retryReport: SetupReport | undefined;
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async () => "# A\n",
    writeNote: async () => {},
    chooseNote: async () => undefined,
    newNotePath: async () => "/n/new.md",
    defaultNotePath: async () => "/n/a.md",
    loadAppState: async () => ({ version: 1 }),
    saveAppState: async () => {},
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    ...(withSetup ? {
      setup: {
        status: async () => report({ account: { state: "done" } }, { login: "ada" }),
        start: async (options) => {
          started.push(options);
          return report(Object.fromEntries(SETUP_STEPS.map((id) => [id, { state: "done" }])), { options });
        },
        retry: async (id: SetupStepId) => {
          retried.push(id);
          return retryReport ?? report({ account: { state: "done" }, instance: { state: "done" } });
        },
        reset: async () => report(),
        passphraseStrength: async () => ({ ok: true, bits: 80 }),
        onReport: (l: (r: SetupReport) => void) => {
          listener = l;
          return () => {};
        },
      },
    } : {}),
  };
  const app = createApp(bridge, en);
  const vm = () => app.viewModels.select("vm.setup", app.store.state) as {
    available: boolean; running: boolean; finished: boolean; login: string; site: string; hasSite: boolean;
    steps: { id: string; label: string; state: string; problem: string; failed: boolean; done: boolean }[];
  };
  return { app, vm, retried, started, retryWith: (r: SetupReport) => (retryReport = r), push: (r: SetupReport) => listener!(r) };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("FRE-08: setup in the app", () => {
  it("shows every step, in order, from the shell's report, with a reason for a failure", async () => {
    const t = setup();
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ available: true, running: false, finished: false, login: "ada" });
    expect(t.vm().steps.map((s) => s.label)).toEqual([
      "Sign in to GitHub", "Copy the template", "Create private repository", "Set up the deploy key", "Download to this computer",
      "Link them", "Save the vault's key", "Turn on GitHub Pages", "Save to GitHub",
    ]);
    t.push(report({ account: { state: "done" }, instance: { state: "failed", problem: "notInstance" } }, { running: false }));
    const instance = t.vm().steps[1]!;
    expect(instance).toMatchObject({ state: "failed", failed: true, done: false });
    expect(instance.problem).toMatch(/isn't a Focus Notes workspace/);
    expect(t.vm().steps[0]!.problem).toBe("");
  });

  it("says the starter notes are missing for a missing template, names the workflow scope, and keeps the permissions text for a real 403", async () => {
    const t = setup();
    await t.app.start();
    await settle();
    t.push(report({ account: { state: "done" }, instance: { state: "failed", problem: "templateMissing" } }, { running: false }));
    expect(t.vm().steps[1]!.problem).toBe("This copy of Focus Notes is missing its starter notes. Reinstall Focus Notes, then try again.");
    // D-201: the first push adds workflows, which needs the sign-in's workflow scope.
    t.push(report({ account: { state: "done" }, instance: { state: "failed", problem: "workflowScope" } }, { running: false }));
    expect(t.vm().steps[1]!.problem).toBe("Your GitHub sign-in can't add workflows. Sign in again and allow them.");
    t.push(report({ account: { state: "done" }, instance: { state: "failed", problem: "notFound" } }, { running: false }));
    expect(t.vm().steps[1]!.problem).toMatch(/couldn't find/);
    expect(t.vm().steps[1]!.problem).not.toMatch(/permission/i);
    t.push(report({ account: { state: "done" }, instance: { state: "failed", problem: "permission" } }, { running: false }));
    expect(t.vm().steps[1]!.problem).toMatch(/Administration, Contents, Pages, Secrets, and Workflows permissions/);
  });

  it("is finished when every step is done or skipped, and shows the site's address", async () => {
    const t = setup();
    await t.app.start();
    const all = Object.fromEntries(SETUP_STEPS.map((id) => [id, { state: id === "vault" ? "skipped" : "done" }])) as Parameters<typeof report>[0];
    t.push(report(all, { site: "https://ada.github.io/notes/" }));
    expect(t.vm()).toMatchObject({ finished: true, hasSite: true, site: "https://ada.github.io/notes/" });
  });

  it("Retry runs one step in the shell, and only while nothing runs", async () => {
    const t = setup();
    await t.app.start();
    await settle();
    await t.app.commands.run("setup.retry", { id: "instance" });
    expect(t.retried).toEqual(["instance"]);
    expect(t.vm().steps[1]!.state).toBe("done");
    t.push(report({}, { running: true }));
    expect(t.app.commands.describe("setup.retry").enabled).toBe(false);
  });

  it("D-135: Try again resumes the whole sequence from the step that failed, to the end", async () => {
    const t = setup();
    await t.app.start();
    await settle();
    const options = { instance: "notes", private: "notes-private", folder: "/home/ada/Focus Notes", publish: true };
    t.push(report({ account: { state: "done" }, instance: { state: "failed", problem: "templateMissing" } }, { options }));
    // The step that failed now passes; the rest haven't started, so the shell runs them all.
    t.retryWith(report({ account: { state: "done" }, instance: { state: "done" } }, { options }));
    await t.app.commands.run("setup.retry", { id: "instance" });
    expect(t.retried).toEqual(["instance"]);
    expect(t.started).toEqual([options]);
    expect(t.vm()).toMatchObject({ finished: true });
    // Failing again stops there: nothing else runs.
    t.retryWith(report({ account: { state: "done" }, instance: { state: "failed", problem: "templateMissing" } }, { options }));
    await t.app.commands.run("setup.retry", { id: "instance" });
    expect(t.started).toHaveLength(1);
  });

  it("PRF-11: reads only setup, so other changes keep the same value", async () => {
    const t = setup();
    await t.app.start();
    await settle();
    const before = t.vm();
    t.app.store.update((s) => ({ ...s, focusMode: !s.focusMode }));
    expect(t.vm()).toBe(before);
    t.push(report({ account: { state: "running" } }));
    expect(t.vm()).not.toBe(before);
  });

  it("isn't available where the shell can't set up (the browser)", async () => {
    const t = setup(false);
    await t.app.start();
    expect(t.vm()).toMatchObject({ available: false, finished: false });
    expect(t.vm().steps.every((s) => s.state === "pending")).toBe(true);
  });
});
