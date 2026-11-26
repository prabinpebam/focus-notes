import { expect, it } from "vitest";
import { pushGate } from "../src/main/git/push-gate.ts";

const later = () => { let open!: () => void; const p = new Promise<void>(r => { open = r; }); return { p, open }; };

it("D-432: pushes to one repository run one at a time in arrival order; other repositories don't wait; a failure frees the turn", async () => {
  const gate = pushGate(), order: string[] = [];
  const first = later();
  const a = gate("C:/notes", async () => { order.push("a start"); await first.p; order.push("a end"); });
  const b = gate(process.platform === "win32" ? "c:\\NOTES" : "C:/notes", async () => { order.push("b"); throw new Error("push failed"); });
  const c = gate("C:/notes", async () => { order.push("c"); return 3; });
  await gate("C:/other", async () => { order.push("other"); });
  expect(order).toEqual(["a start", "other"]);
  first.open();
  await a;
  await expect(b).rejects.toThrow("push failed");
  await expect(c).resolves.toBe(3);
  expect(order).toEqual(["a start", "other", "a end", "b", "c"]);
});
