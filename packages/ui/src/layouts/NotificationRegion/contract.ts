import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "NotificationRegion", tier: "layout",
  description: "The named region for up to 3 notification pills. The host owns queue order, coalescing and visible-only timers; this layout only places them.",
  props: { label: { kind: "message", required: true }, overflowLabel: { kind: "message", description: "Queued count, only when more outcomes are waiting." } },
  events: {}, slots: { default: { accepts: ["Toast", "Stack"], max: 3 } }, states: ["rest"], tokens: "cmp.notificationRegion.*",
  a11y: { pattern: "region", name: "label" },
  fixtures: [{ name: "queued", props: { label: { t: "gallery.sample" }, overflowLabel: { t: "gallery.sample" } }, children: [{ type: "Toast", props: { message: { get: "vm.gallery.query" }, dismissLabel: { t: "toast.dismiss" }, tone: "error", sticky: true } }] }],
});
