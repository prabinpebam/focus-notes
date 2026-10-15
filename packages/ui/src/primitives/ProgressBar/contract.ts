import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "ProgressBar",
  tier: "primitive",
  description: "How far long work has got, when the work reports it (PRF-13, D-149): a thin determinate bar, its value read out as a percentage. The words beside it say what the work is; the bar never stands alone.",
  props: {
    value: { kind: "number", min: 0, max: 100, default: 0, description: "Percent done, from the work's own report (Git's download percentage)." },
    label: { kind: "message", required: true, description: "What's progressing: Downloading your notes." },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.progressBar.*",
  a11y: { pattern: "progressbar", name: "label" },
  fixtures: [0, 45, 100].map((value) => ({ name: `value ${value}`, props: { value, label: { t: "gallery.sample" } } })),
});
