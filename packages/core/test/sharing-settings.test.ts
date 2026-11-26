import { expect, it, vi } from "vitest";
import { createApp, type AccessListing, type PlatformBridge } from "../src/index.ts";
import type { SharingSetupStep } from "../src/share-manage.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const SITE = "https://ada.github.io/notes-site/";
const settle = () => new Promise(r => setTimeout(r, 0));

function shell(listing: () => AccessListing, disable: () => Promise<{ site: string; phase: "off" | "ready" }>) {
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async () => "# A\n",
    writeNote: async () => {},
    chooseNote: async () => undefined,
    newNotePath: async () => "/w/notes/Untitled.md",
    defaultNotePath: async () => "/w/notes/a.md",
    loadAppState: async () => ({ version: 1, firstRun: "done", lastNotePath: "/w/notes/a.md" }),
    saveAppState: async () => {},
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    workspace: {
      info: async () => ({ folder: "/w", repo: "ada/book" }),
      scan: async () => ({ folder: "/w", roots: [{ id: "private", path: "/w/notes", readOnly: false }], entries: [{ path: "/w/notes/a.md", kind: "note" }] }),
      writeFormat: async () => {},
      renameNote: async () => {},
    },
    access: {
      load: async () => listing(),
      apply: async () => { throw new Error("unexpected"); },
      reveal: async () => ({}),
      copy: async () => {},
      setTemplate: async () => listing(),
      setup: {
        describe: async () => ({ project: "ada/book", owner: "ada", name: "notes-site", site: SITE, phase: "ready" }),
        enable: async () => ({ phase: "ready", site: SITE }),
        disable: vi.fn(disable),
      },
    },
  };
  const app = createApp(bridge, en);
  return { app, bridge, vm: (id: string) => app.viewModels.select(id, app.store.state) as Record<string, any>, run: (id: string, args?: Record<string, unknown>) => app.commands.run(id, args) };
}

it("UC-SHARE-12: Turn off in a real project runs the desktop removal and shows sharing off only once it's acknowledged", async () => {
  let on = true;
  const t = shell(() => ({ available: true, configured: on, setupAvailable: true, ...(on ? { site: SITE } : {}), vault: false, grants: [] }),
    async () => { on = false; return { phase: "off", site: SITE }; });
  await t.app.start();
  await settle();
  await t.run("share.manage.load");
  expect(t.vm("vm.sharingSettings")).toMatchObject({ on: true });
  const before = t.app.store.state.note.markdown;
  await t.run("sharing.confirmOpen", { kind: "turnOff" });
  await t.run("sharing.confirm");
  expect(t.bridge.access!.setup!.disable).toHaveBeenCalledTimes(1);
  expect(t.vm("vm.sharingSettings")).toMatchObject({ on: false, off: true, busy: false, confirmOpen: false, problem: "", status: en["share.settings.offDone"] });
  expect(t.app.store.state.note.markdown).toBe(before);
});

it("a failed Turn off keeps sharing on with the dialog and an error, never a false off", async () => {
  const t = shell(() => ({ available: true, configured: true, setupAvailable: true, site: SITE, vault: false, grants: [] }),
    async () => { throw new Error("sharing:preservation"); });
  await t.app.start();
  await settle();
  await t.run("share.manage.load");
  await t.run("sharing.confirmOpen", { kind: "turnOff" });
  await t.run("sharing.confirm");
  expect(t.vm("vm.sharingSettings")).toMatchObject({ on: true, confirmOpen: true, busy: false, problem: `Stopped at “Keep your notes safe”. ${en["share.item.failed"]}`, status: "" });
});

it("D-430: Site appearance saves the look and rebuilds the site with its steps; a failure keeps the choice and Retry carries on", async () => {
  const t = shell(() => ({ available: true, configured: true, setupAvailable: true, site: SITE, vault: false, grants: [] }), async () => ({ phase: "ready", site: SITE }));
  const steps: ((step: SharingSetupStep) => void)[] = [];
  t.bridge.access!.setup!.onStep = listener => { steps.push(listener); return () => { steps.splice(steps.indexOf(listener), 1); }; };
  t.bridge.access!.siteAppearance = vi.fn(async () => ({ theme: "sepia", font: "sans" }));
  let fail = true;
  t.bridge.access!.setSiteAppearance = vi.fn(async () => {
    for (const s of steps) { s("seal"); s("push"); s("deploy"); }
    if (fail) throw new Error("sharing:pages");
    return { commit: "c1" };
  });
  await t.app.start();
  await settle();
  await t.run("share.manage.load");
  await settle();
  expect(t.vm("vm.siteAppearance")).toMatchObject({ show: true, theme: "sepia", font: "sans", busy: false, progress: false });
  await t.run("sharing.appearance.theme", { value: "dusk" });
  expect(t.bridge.access!.setSiteAppearance).toHaveBeenLastCalledWith({ theme: "dusk", font: "sans" });
  expect(t.vm("vm.siteAppearance")).toMatchObject({ theme: "dusk", font: "sans", failed: true, progress: true, busy: false });
  expect(t.vm("vm.siteAppearance").problem).toBe(`Stopped at “GitHub updates your website”. The steps before it are done and kept. ${en["site.appearance.failed"]}`);
  expect(t.vm("vm.shareProgress").steps.map((s: { stateLabel: string }) => s.stateLabel)).toEqual(["Done", "Done", "Stopped here", "Not started yet"]);
  fail = false;
  await t.run("sharing.appearanceRetry");
  expect(t.bridge.access!.setSiteAppearance).toHaveBeenLastCalledWith({ theme: "dusk", font: "sans" });
  expect(t.vm("vm.siteAppearance")).toMatchObject({ theme: "dusk", font: "sans", failed: false, progress: false, problem: "" });
  await expect(t.run("sharing.appearance.font", { value: "comic" })).rejects.toThrow();
});

it("D-432: a Site appearance change that stops says why and what helps, and keeps the choice", async () => {
  const t = shell(() => ({ available: true, configured: true, setupAvailable: true, site: SITE, vault: false, grants: [] }), async () => ({ phase: "ready", site: SITE }));
  const steps: ((step: SharingSetupStep) => void)[] = [];
  t.bridge.access!.setup!.onStep = listener => { steps.push(listener); return () => { steps.splice(steps.indexOf(listener), 1); }; };
  let error = "Error invoking remote method 'sharing:appearanceSet': Error: sharing:moved";
  t.bridge.access!.setSiteAppearance = vi.fn(async () => { for (const s of steps) { s("seal"); s("push"); } throw new Error(error); });
  await t.app.start();
  await settle();
  await t.run("share.manage.load");
  await settle();
  const upload = "Stopped at “Upload your notes site”. The steps before it are done and kept.";
  for (const [code, key] of [["moved", "site.problem.moved"], ["signedout", "site.problem.signedout"], ["offline", "site.problem.offline"], ["refused", "site.problem.refused"], ["ratelimited", "site.problem.ratelimited"]] as const) {
    error = `Error invoking remote method 'sharing:appearanceSet': Error: sharing:${code}`;
    await t.run("sharing.appearance.font", { value: "sans" });
    expect(t.vm("vm.siteAppearance")).toMatchObject({ font: "sans", failed: true });
    expect(t.vm("vm.siteAppearance").problem).toBe(`${upload} ${en[key]} ${en["site.appearance.kept"]}`);
  }
  // An unknown cause still keeps the choice and offers Retry, without promising a minute will help.
  error = "sharing:failed";
  await t.run("sharing.appearanceRetry");
  expect(t.vm("vm.siteAppearance").problem).toBe(`${upload} ${en["site.appearance.problem"]}`);
});
