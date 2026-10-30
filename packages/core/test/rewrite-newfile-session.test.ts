import { expect, it, vi } from "vitest";
import { RewriteSession } from "../src/rewrite.ts";

const source = "---\r\nid: original-id\r\ncustom: retained\r\n---\r\n# Original\r\n\r\nOriginal café.\r\n";
const target = { from: 0, to: source.length, startByte: 0, endByte: new TextEncoder().encode(source).length, original: source, expanded: false };
function fixture(resultMode?: "new-file", text = "# Result\n\nCompleted café.\n", captured = target) {
  const checkpoints = { original: vi.fn(async () => "original"), variation: vi.fn(async () => "variation") };
  const session = new RewriteSession({ sessionId: "newfile", source, target: captured, resultMode, checkpoints,
    provider: async function* () { yield { seq: 1, type: "delta", text }; yield { seq: 2, type: "complete" }; } });
  return { session, checkpoints };
}
it("reviews explicit whole-file New file output without splicing raw source metadata", async () => {
  const { session, checkpoints } = fixture("new-file");
  await session.send("one", "Rewrite");
  expect(session.state).toBe("review");
  expect(session.canonical).toBe(source);
  expect(session.projection).toBe("# Result\n\nCompleted café.\n");
  expect(checkpoints.original).toHaveBeenCalledWith(expect.objectContaining({ source, target }));
  expect(checkpoints.variation).toHaveBeenCalledWith(expect.objectContaining({ source: session.projection }));
  expect(() => session.accept()).toThrow("new-file-only");
});
it("does not grant whole-file permission to selection splices or partial targets", async () => {
  const selected = fixture();
  await selected.session.send("one", "Rewrite");
  expect(selected.session.state).toBe("error");
  expect(selected.session.canonical).toBe(source);
  expect(() => fixture("new-file", "Result", { ...target, from: 1, startByte: 1, original: source.slice(1) })).toThrow("whole-file-required");
});
it.each(["<script>unsafe()</script>", "---\nid: provider-id\n---\nResult", "\0bad"])("still refuses raw or invalid New file output: %s", async (text) => {
  const { session, checkpoints } = fixture("new-file", text);
  await session.send("one", "Rewrite");
  expect(session.state).toBe("error");
  expect(checkpoints.variation).not.toHaveBeenCalled();
  expect(session.canonical).toBe(source);
});
