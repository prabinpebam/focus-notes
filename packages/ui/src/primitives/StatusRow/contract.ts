import { defineContract } from "../../contract.ts";

const tones = ["danger", "warning", "info", "success"] as const;

export const contract = defineContract({
  type: "StatusRow",
  tier: "primitive",
  description: "One status, shown not told (D-142): an icon and one short sentence on a tinted row, near the top of what it's about. Every setup problem uses it; the field at fault also says why on itself. Announced politely when it appears.",
  props: {
    message: { kind: "message", required: true },
    tone: { kind: "enum", values: tones, default: "danger" },
    icon: { kind: "icon", description: "What happened (cloudOff for offline, history for a code that ran out). By default the tone's own icon." },
    actionLabel: { kind: "message" },
    detailsLabel: { kind: "message", description: "The native disclosure's label, when details are available." },
    details: { kind: "message", description: "The optional technical cause, hidden until requested." },
  },
  events: { action: {} },
  slots: {},
  states: ["rest"],
  tokens: "cmp.statusRow.*",
  a11y: { pattern: "status", name: "message" },
  fixtures: [
    { name: "recovery and details", props: { message: { t: "gallery.sample" }, actionLabel: { t: "commit.retry" }, detailsLabel: { t: "gallery.sample" }, details: { t: "gallery.long" } } },
    ...tones.map((tone) => ({ name: `tone ${tone}`, props: { message: { t: "gallery.sample" }, tone } })),
    { name: "icon", props: { message: { t: "gallery.sample" }, icon: "cloudOff" } },
  ],
});
