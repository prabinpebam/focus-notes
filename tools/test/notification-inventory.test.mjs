import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { collectNotifications, DOC, END, lintInventory, renderInventory, scanNotifications, START } from "../notification-inventory.mjs";

describe("notification inventory (D-357)", () => {
  const root = resolve(import.meta.dirname, "..", "..");
  const collected = collectNotifications(root);
  const doc = readFileSync(resolve(root, DOC), "utf8").replace(/\r\n/g, "\n");
  it("covers every production call, including dynamic messages and delegated calls", () => {
    expect(collected.problems).toEqual([]);
    expect(lintInventory(doc, collected.rows)).toEqual([]);
    const result = scanNotifications('toast(t(key)); ctx.toast(words, options); toast(catalog.format(`prefix.${kind}`));', "fixture.ts");
    expect(result.rows).toHaveLength(3);
    expect(result.rows.map((row) => row.message)).toEqual(["t(key)", "words", "catalog.format(`prefix.${kind}`)"]);
  });
  it("fails for a missing notification or missing dismissal type or reason", () => {
    const inventory = renderInventory(collected.rows);
    for (const broken of [
      inventory.replace(/^\| [a-f0-9]{12}-\d+ .*$/m, ""),
      inventory.replace("auto-dismiss", ""),
      inventory.replace("Nonessential outcome; input and recovery remain in their originating surface.", ""),
      inventory.replace("data-at-risk:", "unreviewed:"),
    ]) expect(lintInventory(broken, collected.rows)).not.toEqual([]);
    expect(lintInventory(`${START}\n${END}`, collected.rows)).not.toEqual([]);
  });
  it("fails for missing or invalid must-read source reasons, even in conditional options", () => {
    for (const options of [
      '{ sticky: true }',
      '{ sticky: true, mustReadReason: "because-error" }',
      'needed ? { sticky: true } : {}',
      '{ sticky: true, mustReadReason: variable }',
    ]) expect(scanNotifications(`toast(words, ${options})`, "fixture.ts").problems).toHaveLength(1);
    expect(scanNotifications('toast(words, { sticky: true, mustReadReason: "data-at-risk" })', "fixture.ts").problems).toEqual([]);
  });
  it("detects callsite additions and option changes without depending on line numbers", () => {
    const before = scanNotifications('toast(t("deleted"));', "fixture.ts").rows;
    const moved = scanNotifications('\n\n toast(t("deleted"));', "fixture.ts").rows;
    expect(moved[0].id).toBe(before[0].id);
    const after = scanNotifications('toast(t("deleted"), { sticky: true, mustReadReason: "data-at-risk" });', "fixture.ts").rows;
    expect(lintInventory(renderInventory(before), after)).not.toEqual([]);
  });
});
