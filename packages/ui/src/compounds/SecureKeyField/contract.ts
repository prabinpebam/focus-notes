import { defineContract } from "../../contract.ts";
export const contract = defineContract({
  type: "SecureKeyField", tier: "compound", description: "One-shot secure credential entry. Never bind secrets to app state.",
  props: {
    label: { kind: "message", required: true }, saveLabel: { kind: "message", required: true },
    pendingLabel: { kind: "message", required: true }, savedLabel: { kind: "message", required: true },
    entryScope: { kind: "text", description: "Non-secret connection/destination identity; changing it clears the local key." },
    commit: { kind: "enum", values: ["rest", "pending", "confirmed", "failed"] },
    error: { kind: "message" }, retryLabel: { kind: "message" }, revertLabel: { kind: "message" },
    disabled: { kind: "boolean" }, disabledReason: { kind: "message" },
  },
  events: { save: { payload: { key: "text" } }, revert: { payload: {} } }, slots: {},
  states: ["empty", "pending", "confirmed", "failed"], tokens: "space.*", a11y: { pattern: "form", name: "label" },
  fixtures: [
    { name: "empty", covers: ["empty"], props: { label: { t: "gallery.sample" }, saveLabel: { t: "gallery.action" }, pendingLabel: { t: "ai.key.checking" }, savedLabel: { t: "ai.key.confirmed" }, commit: "rest" } },
    { name: "pending", covers: ["pending"], props: { label: { t: "gallery.sample" }, saveLabel: { t: "gallery.action" }, pendingLabel: { t: "ai.key.checking" }, savedLabel: { t: "ai.key.confirmed" }, commit: "pending" } },
    { name: "confirmed", covers: ["confirmed"], props: { label: { t: "gallery.sample" }, saveLabel: { t: "gallery.action" }, pendingLabel: { t: "ai.key.checking" }, savedLabel: { t: "ai.key.confirmed" }, commit: "confirmed" } },
    { name: "failed", covers: ["failed"], props: { label: { t: "gallery.sample" }, saveLabel: { t: "gallery.action" }, pendingLabel: { t: "ai.key.checking" }, savedLabel: { t: "ai.key.confirmed" }, commit: "failed", error: { t: "ai.key.kept" }, retryLabel: { t: "commit.retry" }, revertLabel: { t: "commit.revert" } } },
  ],
});
