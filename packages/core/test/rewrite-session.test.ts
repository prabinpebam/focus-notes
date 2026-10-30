import { describe, expect, it, vi } from "vitest";
import { parseMarkdown, resolveRewriteTarget } from "@focus-notes/markdown";
import { RewriteSession, type RewriteCheckpoints, type RewriteProvider } from "../src/rewrite.ts";

const source = "Original words\n\nOutside";
const target = resolveRewriteTarget(source, parseMarkdown(source).doc, 1, 15);
const instruction = "Make this shorter.";
function fixture(store?: RewriteCheckpoints, provider?: RewriteProvider) {
  const checkpoints: RewriteCheckpoints = store ?? {
    original: vi.fn(async () => "checkpoint"),
    variation: vi.fn(async () => "variation"),
  };
  const generate = vi.fn<RewriteProvider>(provider ?? (async function* () {
    yield { seq: 1, type: "delta", text: "New " };
    yield { seq: 2, type: "delta", text: "words" };
    yield { seq: 3, type: "complete" };
  }));
  const session = new RewriteSession({ sessionId: "session", source, target, checkpoints, provider: generate });
  return { session, generate, checkpoints };
}

describe("RWR-23/RWR-25: fixture checkpoint and canonical/projection boundary", () => {
  it("awaits the original before generation and complete variation before review", async () => {
    let acknowledge!: (id: string) => void;
    const original = new Promise<string>((resolve) => { acknowledge = resolve; });
    const { session, generate } = fixture({ original: () => original, variation: async () => "variation" });
    const running = session.send("attempt", instruction);
    expect(session.state).toBe("sending");
    expect(generate).not.toHaveBeenCalled();
    expect(session.canonical).toBe(source);
    acknowledge("durable-original");
    await running;
    expect(session.state).toBe("review");
    expect(session.canonical).toBe(source);
    expect(session.projection).toBe("New words\n\nOutside");
    expect(session.accept()).toBe("New words\n\nOutside");
  });

  it("never sends after a failed original checkpoint", async () => {
    const { session, generate } = fixture({ original: async () => { throw new Error("storage"); }, variation: async () => "never" });
    await session.send("attempt", instruction);
    expect(generate).not.toHaveBeenCalled();
    expect(session.state).toBe("error");
    expect(session.error).toBe("checkpoint-failed");
    expect(session.canonical).toBe(source);
  });

  it("does not offer review when the complete variation was not acknowledged", async () => {
    const { session } = fixture({ original: async () => "original", variation: async () => { throw new Error("storage"); } });
    await session.send("attempt", instruction);
    expect(session.state).toBe("error");
    expect(session.projection).toBe(source);
    expect(() => session.accept()).toThrow("not-reviewing");
  });

  it("Stop before checkpoint acknowledgement never dispatches, including a late resolution", async () => {
    let acknowledge!: (id: string) => void;
    const { session, generate } = fixture({ original: () => new Promise((resolve) => { acknowledge = resolve; }), variation: async () => "unused" });
    const running = session.send("attempt", instruction);
    session.stop();
    expect(session.state).toBe("cancelled");
    acknowledge("late");
    await running;
    expect(generate).not.toHaveBeenCalled();
    expect(session.projection).toBe(source);
  });

  it("Stop while recording a complete variation cannot be undone by its late acknowledgement", async () => {
    let acknowledge!: (id: string) => void;
    let entered!: () => void;
    const recording = new Promise<void>((resolve) => { entered = resolve; });
    const { session } = fixture({
      original: async () => "original",
      variation: () => { entered(); return new Promise((resolve) => { acknowledge = resolve; }); },
    });
    const running = session.send("attempt", instruction);
    await recording;
    session.stop();
    acknowledge("late");
    await running;
    expect(session.state).toBe("cancelled");
    expect(session.projection).toBe(source);
  });

  it("keeps independently mapped outside edits in review, accept and discard", async () => {
    const { session } = fixture();
    await session.send("attempt", instruction);
    const current = "Original words\n\nMy newer outside text";
    session.updateCanonical(current, resolveRewriteTarget(current, parseMarkdown(current).doc, 1, 15));
    expect(session.projection).toBe("New words\n\nMy newer outside text");
    expect(session.accept()).toBe("New words\n\nMy newer outside text");
    const other = fixture().session;
    await other.send("another", instruction);
    other.updateCanonical(current, resolveRewriteTarget(current, parseMarkdown(current).doc, 1, 15));
    other.stop();
    expect(other.canonical).toBe(current);
    expect(other.projection).toBe(current);
  });

  it("invalidates overlapping target edits instead of fuzzy applying", async () => {
    const { session } = fixture();
    await session.send("attempt", instruction);
    const current = "Changed words\n\nOutside";
    session.updateCanonical(current, resolveRewriteTarget(current, parseMarkdown(current).doc, 1, 14));
    expect(session.state).toBe("error");
    expect(session.error).toBe("stale-target");
    expect(session.projection).toBe(current);
  });

  it("requires strictly increasing event sequence and a successful terminal event", async () => {
    const { session } = fixture(undefined, async function* () {
      yield { seq: 1, type: "delta", text: "New words" };
      yield { seq: 1, type: "complete" };
    });
    await session.send("attempt", instruction);
    expect(session.state).toBe("error");
    expect(session.error).toBe("provider-error");
    expect(session.projection).toBe(source);
  });

  it("rejects truncation, invalid Markdown and oversized event payloads", async () => {
    for (const text of ["safe but incomplete", "<script>unsafe()</script>", "x".repeat(4097)]) {
      const { session } = fixture(undefined, async function* () {
        yield { seq: 1, type: "delta", text };
        if (text !== "safe but incomplete") yield { seq: 2, type: "complete" };
      });

      await session.send("attempt", instruction);
      expect(session.state).toBe("error");
      expect(session.projection).toBe(source);
    }
  });

  it("bounds aggregate replacement bytes independently of each event", async () => {
    const { session } = fixture(undefined, async function* () {
      for (let seq = 1; seq <= 9; seq++) yield { seq, type: "delta", text: "x".repeat(4096) };
      yield { seq: 10, type: "complete" };
    });
    await session.send("attempt", instruction);
    expect(session.error).toBe("too-large");
    expect(session.canonical).toBe(source);
    expect(session.projection).toBe(source);
  });

  it("freezes instruction-only plus exact target provider input and denies replay", async () => {
    const { session, generate } = fixture();
    await session.send("attempt", instruction);
    const [request] = generate.mock.calls[0]!;
    expect(request).toMatchObject({ instruction, target: "Original words" });
    expect(Object.keys(request).sort()).toEqual(["instruction", "requestId", "sessionId", "signal", "target"]);
    await expect(session.send("attempt", instruction)).rejects.toThrow("not-composing");
  });

  it("enforces 4,000 Unicode codepoints without counting UTF-16 halves as characters", async () => {
    const { session, generate } = fixture();
    await expect(session.send("attempt", "😀".repeat(4001))).rejects.toThrow("invalid-instruction");
    expect(generate).not.toHaveBeenCalled();
    await session.send("attempt", "😀".repeat(4000));
    expect(session.state).toBe("review");
  });

  it("times out an unresponsive provider and ignores its eventual completion", async () => {
    vi.useFakeTimers();
    try {
      let release!: () => void;
      const blocked = new Promise<void>((resolve) => { release = resolve; });
      const { session } = fixture(undefined, async function* () {
        await blocked;
        yield { seq: 1, type: "delta", text: "late" };
        yield { seq: 2, type: "complete" };
      });
      const running = session.send("attempt", instruction);
      await vi.advanceTimersByTimeAsync(60_001);
      await running;
      expect(session.error).toBe("timeout");
      expect(session.projection).toBe(source);
      release();
      await vi.advanceTimersByTimeAsync(1);
      expect(session.state).toBe("error");
    } finally { vi.useRealTimers(); }
  });
});
