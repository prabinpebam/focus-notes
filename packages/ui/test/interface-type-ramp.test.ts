import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..", "tokens", "src");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const structure = read("semantic/structure.json");
const reference = read("reference/base.json").ref;
const heading = read("component/heading.json").cmp.heading;
const text = read("component/text.json").cmp.text;
const size = (alias: string): number => {
  const key = /^\{font\.(\w+)\}$/.exec(alias)?.[1];
  if (!key) throw new Error(`Not a font alias: ${alias}`);
  const ref = /^\{ref\.size\.(\w+)\}$/.exec(structure.font[key].$value)?.[1];
  if (!ref) throw new Error(`Not a reference size: ${key}`);
  const dimension: string = reference.size[ref].$value;
  if (!dimension.endsWith("px")) throw new Error(`Not a pixel reference size: ${dimension}`);
  return Number.parseFloat(dimension);
};
const weight = (alias: string): number => {
  const key = /^\{font\.(\w+)\}$/.exec(alias)?.[1];
  if (!key) throw new Error(`Not a weight alias: ${alias}`);
  return structure.font[key].$value;
};

describe("Interface type ramp (D-258)", () => {
  it("gives Settings headings, labels, body and hints distinct size steps", () => {
    expect(["1", "2", "3"].map((level) => size(heading.size[level].$value))).toEqual([28, 24, 20]);
    expect(["label", "body", "secondary", "caption"].map((role) => size(text.size[role].$value))).toEqual([16, 14, 13, 12]);
  });
  it("makes headings bold, labels semibold and body text regular", () => {
    expect([weight(heading.weight.$value), weight(text.weight.strong.$value), weight(text.weight.regular.$value)]).toEqual([700, 600, 400]);
    expect(readFileSync(join(import.meta.dirname, "..", "src", "primitives", "Text", "Text.css.ts"), "utf8")).toContain("fontWeight: t.weight.regular");
  });
});
