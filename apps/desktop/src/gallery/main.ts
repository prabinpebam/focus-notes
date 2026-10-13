/** The gallery entry (DSY-09): every component fixture, rendered through the app's own runtime. */
import { createApp, type PlatformBridge } from "@focus-notes/core";
import { mountApp } from "@focus-notes/ui-runtime";
import { galleryViews, registerGallery } from "@focus-notes/ui-runtime/gallery";
import { contracts } from "@focus-notes/ui/contracts";
import { messages } from "@focus-notes/views";

const params = new URLSearchParams(location.search);
const scheme = params.get("scheme") === "dark" ? "dark" : "light";
const bridge: PlatformBridge = {
  platform: "windows",
  readNote: async () => "",
  writeNote: async () => {},
  chooseNote: async () => undefined, newNotePath: async () => "/notes/Untitled.md",
  defaultNotePath: async () => "",
  loadAppState: async () => ({ version: 1 }),
  saveAppState: async () => {},
  systemScheme: () => scheme,
  onSystemSchemeChange: () => () => {},
};
const app = createApp(bridge, messages.en!);
registerGallery(app, contracts, (id) => {
  location.search = `?f=${encodeURIComponent(id)}&scheme=${scheme}`;
});
const fixture = params.get("f");
const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
mountApp(root, { app, views: galleryViews(contracts, scheme), view: fixture ? `gallery.${fixture}` : "gallery.index" });
