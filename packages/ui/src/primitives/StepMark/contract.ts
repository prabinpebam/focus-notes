import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "StepMark",
  tier: "primitive",
  description: "A setup step's hero: one icon in a large tile, the step's visual anchor (D-127, D-135). Toned for a problem or success; while the step waits, a ring turns around it (still with reduced motion). Decorative unless it has a label.",
  props: {
    icon: { kind: "icon", required: true },
    tone: { kind: "enum", values: ["neutral", "accent", "danger", "success"], default: "neutral" },
    size: { kind: "enum", values: ["hero", "compact"], default: "hero", description: "The setup hero, or a 36px status tile for details cards." },
    busy: { kind: "boolean", default: false, description: "The step is waiting: a ring turns around the tile." },
    label: { kind: "message" },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.stepMark.*",
  a11y: { pattern: "img", name: "label" },
  fixtures: [
    ...["hero", "compact"].map((size) => ({ name: `size ${size}`, props: { icon: "cloudCheck", size } })),
    ...["neutral", "accent", "danger", "success"].map((tone) => ({ name: `tone ${tone}`, props: { icon: tone === "danger" ? "warning" : tone === "success" ? "cloudCheck" : "github", tone } })),
    { name: "busy", props: { icon: "github", busy: true } },
    { name: "labelled", props: { icon: "cloudUp", tone: "accent", busy: true, label: { t: "gallery.sample" } } },
  ],
});
