import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "AppRoot",
  tier: "layout",
  description: "The root of every app view. Applies the theme and the token modes to the document.",
  props: {
    scheme: { kind: "enum", values: ["light", "dark"], required: true },
    platform: { kind: "enum", values: ["macos", "windows", "linux", "web"], required: true },
    contentSize: { kind: "number", min: 14, max: 32 },
    focusMode: { kind: "boolean", default: false },
  },
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "cmp.appRoot.*",
  a11y: { pattern: "application root" },
  fixtures: [
    { name: "scheme light", props: { scheme: "light", platform: "windows" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] },
    { name: "scheme dark", props: { scheme: "dark", platform: "macos" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] },
    { name: "platform linux", props: { scheme: "light", platform: "linux" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] },
    { name: "platform web", props: { scheme: "light", platform: "web" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] },
  ],
});
