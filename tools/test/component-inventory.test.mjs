/**
 * The component catalog page agrees with the registered contracts (design-system audit DS-A07, D-200).
 * The real page must pass; each kind of drift the audit found must fail.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOG, CONTRACTS, DOC, END, START, lintCatalogDoc, renderInventory, withInventory } from "../component-inventory.mjs";

const root = join(import.meta.dirname, "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");
const catalog = JSON.parse(read(CATALOG));
const contracts = JSON.parse(read(CONTRACTS));
const page = read(DOC);
const lint = (doc) => lintCatalogDoc(doc, catalog, contracts);

describe("component catalog page (DS-A07)", () => {
  it("agrees with the registered contracts", () => {
    expect(lint(page)).toEqual([]);
  });

  it("lists every registered contract once in the generated inventory", () => {
    const block = renderInventory(catalog, contracts);
    for (const c of catalog.components) expect(block).toContain(`| ${c.type} | `);
    expect(block.split("\n").filter((l) => /^\| [A-Z]/.test(l) && !l.startsWith("| Component")).length).toBe(catalog.components.length);
  });

  it("fails when the generated block is edited by hand or missing", () => {
    expect(lint(page.replace("| Text | primitive |", "| Text | layout |")).join("\n")).toMatch(/out of date/);
    expect(lint(page.replace(START, "")).join("\n")).toMatch(/markers are missing/);
  });

  it("fails when the TL;DR's counts disagree", () => {
    const primitives = catalog.components.filter((c) => c.tier === "primitive").length;
    expect(lint(page.replace(`**${primitives} primitives**`, "**40 primitives**")).join("\n")).toMatch(new RegExp(`${primitives} primitives`));
    expect(lint(page.replace("**3 compound components**", "**38 compound components**")).join("\n")).toMatch(/3 compound components/);
  });

  it("fails when a planned entry is marked Implemented", () => {
    const doc = page.replace("| **Checkbox** | Planned |", "| **Checkbox** | Implemented |");
    expect(lint(doc).join("\n")).toMatch(/Checkbox is marked Implemented but has no registered contract/);
  });

  it("fails when a registered component is marked Planned, or has no Implemented row", () => {
    const planned = page.replace("| **Slider** | Implemented |", "| **Slider** | Planned |");
    const errs = lint(planned).join("\n");
    expect(errs).toMatch(/Slider is registered as a primitive; mark it Implemented/);
    expect(errs).toMatch(/Slider is registered \(primitive\) but no guidance row marks it Implemented/);
  });

  it("fails when a component is documented in the wrong tier", () => {
    const doc = page.replace("| **FileTree** | Implemented as a primitive |", "| **FileTree** | Implemented |");
    expect(lint(doc).join("\n")).toMatch(/FileTree is registered as a primitive, not a compound/);
  });

  it("rejects a status that isn't Implemented, Composed, or Planned", () => {
    const doc = page.replace("| **Switch** | Planned |", "| **Switch** | Coming soon |");
    expect(lint(doc).join("\n")).toMatch(/must start with Implemented, Composed, or Planned/);
  });

  it("rewrites only the block between the markers", () => {
    const stale = page.replace(/(<!-- generated:component-inventory[^\n]*-->)[\s\S]*?(<!-- \/generated)/, "$1\nold\n$2");
    expect(withInventory(stale, catalog, contracts)).toBe(page);
    expect(page.indexOf(END)).toBeGreaterThan(page.indexOf(START));
  });
});
