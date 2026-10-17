import { defineContract } from "../../contract.ts";

export const SAVE_STATES = ["savedLocal", "pending", "syncing", "synced", "offline", "error"] as const;

export const contract = defineContract({
  type: "SaveState",
  tier: "primitive",
  description: "An always-outlined circular save indicator, with a spinning border while backing up. It can trigger the backup-details card (EDT-11, UI-12, D-132).",
  props: {
    state: { kind: "enum", values: [...SAVE_STATES], required: true },
    label: { kind: "message", required: true },
    text: { kind: "text", description: "Shown beside the icon for a moment after the person asked (Backing up…, Backed up)." },
    interactive: { kind: "boolean", description: "A pressable trigger, such as the backup-details card. When off it is a plain status image." },
  },
  events: { press: {} },
  slots: {},
  states: ["rest", "hover", "pressed", "focusVisible", "savedLocal", "pending", "syncing", "synced", "offline", "error"],
  tokens: "cmp.saveState.*",
  a11y: { pattern: "button", name: "label" },
  fixtures: [
    { name: "saved here", props: { state: "savedLocal", label: { t: "save.state.savedLocal" } } },
    { name: "not backed up yet", props: { state: "pending", label: { t: "save.state.pending" } } },
    { name: "backing up, asked", props: { state: "syncing", label: { t: "save.state.syncing" }, text: { get: "vm.gallery.query" } } },
    { name: "backed up", props: { state: "synced", label: { t: "save.state.syncedNow" } } },
    { name: "offline", props: { state: "offline", label: { t: "save.state.offline" } } },
    { name: "problem", props: { state: "error", label: { t: "save.state.error" } } },
  ],
});