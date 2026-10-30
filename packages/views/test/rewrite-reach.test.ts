import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

type Node = { type: string; props?: Record<string, unknown>; on?: Record<string, { run: string }>; children?: Node[]; slots?: Record<string, Node[]> };
const view = JSON.parse(readFileSync(new URL("../views/rewriteEditor.view.json", import.meta.url), "utf8")) as { root: Node };
const sheet = view.root.children![0]!;
const commands = (nodes: Node[]): string[] => nodes.flatMap(n => [
  ...Object.values(n.on ?? {}).map(event => event.run), ...commands(n.children ?? []),
]);

it("keeps review/error actions in the existing fixed Sheet footer, outside the scrolling content", () => {
  expect(sheet.type).toBe("Sheet");
  expect(commands(sheet.slots?.footer ?? [])).toEqual(expect.arrayContaining(["demo.send", "demo.accept", "demo.discard"]));
  expect(commands(sheet.children ?? [])).not.toContain("demo.send");
  expect(commands(sheet.children ?? [])).not.toContain("demo.discard");
});

it("keeps the New file name and creation action together in the fixed footer", () => {
  const footer = JSON.stringify(sheet.slots?.footer ?? []);
  expect(footer).toContain("vm.rewriteDemo.filename");
  expect(commands(sheet.slots?.footer ?? [])).toContain("demo.newFile");
  expect(commands(sheet.children ?? [])).not.toContain("demo.newFile");
});
