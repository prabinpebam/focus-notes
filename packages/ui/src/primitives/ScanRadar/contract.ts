import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "ScanRadar",
  tier: "primitive",
  description: "The scan for AI models on this computer (IA-CMP-AIDISCOVER, DD-RWR-12): a radar that sweeps while the app asks, a blip for each place that answers, one row per place asked with what it answered, and a live count. Rows settle the moment their answer arrives. Reduced motion: no sweep or pulse.",
  props: {
    label: { kind: "message", required: true },
    phase: { kind: "enum", values: ["scanning", "found", "none", "error"], default: "scanning" },
    targets: { kind: "list", of: "scanTargets", required: true },
    count: { kind: "message", required: true, description: "Beside the radar and announced at the end: \"Found 2 so far\", \"Found 3 apps\", \"Nothing running\"." },
    checkingLabel: { kind: "message", required: true, description: "A row that's still waiting for its answer: \"Checking\"." },
    announceResult: { kind: "boolean", default: true, description: "Disable when the host announces the complete result and recovery reason." },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.scanRadar.*",
  a11y: { pattern: "group with a status: the count is announced when the scan ends", name: "label" },
  fixtures: ["scanning", "found", "none", "error"].map((phase) => ({
    name: `phase ${phase}`,
    props: { label: { t: "gallery.sample" }, phase, targets: { get: "vm.gallery.scanTargets" }, count: { t: "gallery.sample" }, checkingLabel: { t: "gallery.sample" } },
  })),
});
