/**
 * One-time browser draft export and browser-writing retirement entry (WEB-01, D-292, D-412).
 * When this browser holds drafts from the retired web app or demo, offers one-click local export
 * without deleting or mutating any IndexedDB store. When no drafts exist, sends visitors straight
 * to the clean website's downloads (at /app/) or published notes (at /), never to an editor.
 */
import type { AppState } from "@focus-notes/core";
import { MessageCatalog } from "@focus-notes/core/messages";
import { SITE_RELEASES } from "@focus-notes/core/site";
import { createWebExportController, WEB_EXPORT_COMMANDS, WEB_EXPORT_VIEW_MODEL } from "@focus-notes/core/web-export";
import { saveTextFile } from "@focus-notes/ui/files";
import { webExportContracts, webExportRegistry } from "@focus-notes/ui/web-export";
import { mountPage, type RuntimeApp } from "@focus-notes/ui-runtime/page";
import { messages, pages } from "@focus-notes/views/pages";
import { readBrowserDrafts } from "./export-drafts.ts";

if (window.top !== window.self) {
  document.documentElement.textContent = "";
  throw new Error("framed");
}

const SITE_ROOT: string = import.meta.env.FOCUS_NOTES_SITE_ROOT ?? "./";
const isProductAppPath = SITE_ROOT === "../";

const catalog = new MessageCatalog("en", messages.en!);
const controller = createWebExportController({
  readDrafts: () => readBrowserDrafts(),
  saveBundle: (fileName, content) => saveTextFile(fileName, content),
  exportingLabel: catalog.format("webExport.exporting"),
  onDownload: () => {
    const target = isProductAppPath ? new URL("../#download", document.baseURI).href : SITE_RELEASES;
    location.assign(target);
  },
  onEmpty: async () => {
    if (isProductAppPath) {
      location.replace(new URL("../#download", document.baseURI).href);
      return;
    }
    try {
      const res = await fetch(new URL("./n/index.html", document.baseURI), { method: "HEAD", cache: "no-cache", credentials: "omit", redirect: "error" });
      if (res.ok) location.replace(new URL("./n/", document.baseURI).href);
    } catch {
      // No published notes at ./n/; stay on the retired message with the Download button.
    }
  },
});

let seen = controller.state;
let state = { appearance: { mode: "system", system: "light" }, webExport: seen } as unknown as AppState;
const app: RuntimeApp = {
  store: {
    get state() {
      if (controller.state !== seen) {
        seen = controller.state;
        state = { ...state, webExport: seen } as AppState;
      }
      return state;
    },
    subscribe: (l) => controller.subscribe(l),
  },
  viewModels: {
    select: (id) => {
      if (id !== WEB_EXPORT_VIEW_MODEL.id) throw new Error(`Unknown view model ${id}`);
      return controller.state;
    },
    get: () => undefined,
  },
  messages: catalog,
  commands: {
    has: (id) => (WEB_EXPORT_COMMANDS as readonly string[]).includes(id),
    describe: (id) => { throw new Error(`The draft export page's commands have no description (${id})`); },
    run: async (id) => {
      if (id === "webExport.export") await controller.exportDrafts();
      else if (id === "webExport.download") controller.download();
    },
  },
  bridge: { platform: "web" },
};

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root in the entry document");
mountPage(root, "webExport", { app, registry: webExportRegistry, contracts: webExportContracts, views: pages });
void controller.start();
