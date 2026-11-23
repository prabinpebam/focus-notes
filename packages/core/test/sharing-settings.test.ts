import { expect, it, vi } from "vitest";
import { createApp, type AccessListing, type PlatformBridge } from "../src/index.ts";
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
  expect(t.vm("vm.sharingSettings")).toMatchObject({ on: true, confirmOpen: true, busy: false, problem: en["share.item.failed"], status: "" });
});
