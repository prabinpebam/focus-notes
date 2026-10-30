import { describe, expect, it, vi } from "vitest";
import { RewriteDemo } from "../src/rewrite-demo.ts";

describe("disposable rewrite journey", () => {
  it("notifies streaming changes from provider events without polling", async () => {
    const interval = vi.spyOn(globalThis, "setInterval");
    const projections: string[] = [];
    const demo = new RewriteDemo(() => {
      if (demo.session?.state === "streaming") projections.push(demo.session.projection);
    });
    const source = demo.source;
    demo.open({ source, target: { from: 0, to: source.length, original: source } });
    try {
      await demo.send();
      expect(projections.length).toBeGreaterThan(1);
      expect(projections[0]).toMatch(/^Plan/);
      expect(demo.session?.state).toBe("review");
      expect(interval).not.toHaveBeenCalled();
    } finally { interval.mockRestore(); }
  });
  it("navigates saved previews without wrapping or accepting, and shows original", () => {
    const demo = new RewriteDemo();
    const source = demo.source;
    demo.open({ source, target: { from: 0, to: source.length, original: source } });
    demo.history = [{ source: "first complete" }, { source: "second complete" }];
    demo.historyIndex = 0;
    demo.navigate(-1); expect(demo.historyIndex).toBe(0);
    demo.navigate(1); expect(demo.historyIndex).toBe(1);
    demo.navigate(1); expect(demo.historyIndex).toBe(1);
    demo.accept(); expect(demo.source).toBe(source);
    demo.showOriginal = true;
    expect(demo.savedPreview).toBe(source);
    demo.showOriginal = false;
    expect(demo.savedPreview).toBe("second complete");
    demo.discard(); expect(demo.history).toEqual([]);
  });
  it("streams only into review, accepts explicitly and undoes", async () => {
    const demo = new RewriteDemo();
    const original = demo.source;
    demo.open({ source: original, target: { from: 0, to: original.length, original } });
    const pending = demo.send();
    expect(demo.source).toBe(original);
    await pending;
    expect(demo.session?.state).toBe("review");
    demo.accept();
    expect(demo.source).not.toBe(original);
    demo.undo();
    expect(demo.source).toBe(original);
  });
  it("discards, cancels and retries without losing the source", async () => {
    const demo = new RewriteDemo();
    const source = demo.source;
    const open = () => demo.open({ source, target: { from: 0, to: source.length, original: source } });
    open(); demo.fail = true; await demo.send();
    expect(demo.session?.state).toBe("error");
    demo.fail = false; await demo.send();
    expect(demo.session?.state).toBe("review");
    demo.discard(); expect(demo.source).toBe(source);
    open(); const sending = demo.send(); demo.discard(); await sending;
    expect(demo.source).toBe(source);
  });
});
