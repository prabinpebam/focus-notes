import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "VersionCompare",
  tier: "primitive",
  description: "A version found against the version needed (D-142): two small pills with an arrow between, the found one toned as a problem, instead of a sentence. Each pill says what it is.",
  props: {
    found: { kind: "message", required: true, description: "The version found: data, read from a view model." },
    needed: { kind: "message", required: true },
    foundLabel: { kind: "message", required: true, description: "Found." },
    neededLabel: { kind: "message", required: true, description: "Needs." },
    label: { kind: "message", description: "The whole comparison in words, for screen readers: Git 2.20.1 is too old: 2.31 or newer is needed." },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.versionCompare.*",
  a11y: { pattern: "group", name: "label" },
  fixtures: [
    { name: "too old", props: { found: { t: "gallery.sample" }, needed: { t: "gallery.sample" }, foundLabel: { t: "gallery.sample" }, neededLabel: { t: "gallery.sample" } } },
  ],
});
