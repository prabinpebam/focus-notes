/**
 * New shares open by link or access code (SHR-23), so every current sharing string says "access code".
 * "Passcode" stays only on the older name-and-passcode path: the reader's legacy form, and the
 * share manager for named audiences (share.manage.*), which Share details uses only for those.
 */
import { expect, it } from "vitest";
import en from "../../views/messages/en.json" with { type: "json" };

const CURRENT = /^(share\.(dialog|item|details|badge|template|settings|reader)\.|sharing\.)/;
const LEGACY = new Set([
  "share.reader.legacy", "share.reader.passcode", "share.reader.gate.introLegacy", "share.reader.error.emptyLegacy",
  // Rejects the old {passcode} placeholder by name.
  "share.template.problem.passcode",
]);

it("SHR-23: no current share string says passcode; only the legacy name-and-passcode path may", () => {
  const said = Object.entries(en as Record<string, string>)
    .filter(([key, text]) => CURRENT.test(key) && !LEGACY.has(key) && /passcode/i.test(text))
    .map(([key]) => key);
  expect(said).toEqual([]);
  expect((en as Record<string, string>)["share.details.ways.both"]).toBe("Link and access code");
});
