import { spliceRewriteTarget, RewriteTargetError, type RewriteTarget } from "@focus-notes/markdown";

export type RewriteState = "composing" | "sending" | "streaming" | "review" | "error" | "cancelled";
export type RewriteFailure = "checkpoint-failed" | "provider-error" | "invalid-output" | "too-large" | "timeout" | "stale-target";
export type RewriteEvent = { seq: number; type: "delta"; text: string } | { seq: number; type: "complete" };
export interface RewriteRequest {
  readonly sessionId: string;
  readonly requestId: string;
  readonly instruction: string;
  readonly target: string;
  readonly signal: AbortSignal;
}
export type RewriteProvider = (request: RewriteRequest) => AsyncIterable<RewriteEvent>;

/** Storage must acknowledge durability. No in-memory implementation is supplied to the app. */
export interface RewriteCheckpoints {
  original(record: { sessionId: string; source: string; target: RewriteTarget }): Promise<string>;
  variation(record: { sessionId: string; checkpointId: string; source: string; replacement: string }): Promise<string>;
}

export const REWRITE_LIMITS = Object.freeze({
  instructionPoints: 4000, instructionBytes: 16 * 1024, deltaBytes: 4 * 1024,
  outputBytes: 32 * 1024, firstTextMs: 60_000, idleTextMs: 20_000, totalMs: 180_000,
});
const bytes = (s: string) => new TextEncoder().encode(s).length;
const interrupted = Symbol("rewrite-interrupted");
const timeout = Symbol("rewrite-timeout");
/** Reuse the strict output validator; no raw-block permission or source reserialization. */
function validateRewriteNewFileResult(output: string): string {
  spliceRewriteTarget(output, { from: 0, to: output.length, startByte: 0, endByte: bytes(output), original: output, expanded: false }, output);
  return output;
}
export interface RewriteSessionOptions {
  sessionId: string;
  source: string;
  target: RewriteTarget;
  /** Explicit Files → New file review; never permission to replace a source range. */
  resultMode?: "new-file";
  checkpoints: RewriteCheckpoints;
  provider: RewriteProvider;
}

/**
 * Unwired engine slice: canonical text is never a stream. The host still owes a save hold,
 * identity/lease checks, transaction mapping, durable private history and guarded Accept.
 */
export class RewriteSession {
  #state: RewriteState = "composing";
  #error: RewriteFailure | undefined;
  #canonical: string;
  #target: RewriteTarget;
  #replacement = "";
  #reviewId: string | undefined;
  #controller: AbortController | undefined;
  #attempts = new Set<string>();
  readonly #options: Readonly<RewriteSessionOptions>;

  constructor(options: RewriteSessionOptions) {
    this.#options = Object.freeze({ ...options, target: Object.freeze({ ...options.target }) });
    this.#canonical = options.source;
    this.#target = this.#options.target;
    if (options.source.slice(options.target.from, options.target.to) !== options.target.original) throw new Error("stale-target");
    if (options.resultMode === "new-file" && (options.target.from !== 0 || options.target.to !== options.source.length
      || options.target.startByte !== 0 || options.target.endByte !== bytes(options.source))) throw new Error("whole-file-required");
  }

  get state(): RewriteState { return this.#state; }
  get error(): RewriteFailure | undefined { return this.#error; }
  get canonical(): string { return this.#canonical; }
  /** Inert projection only: never hand this string to ordinary drafts, autosave or Git. */
  get projection(): string {
    if (this.#state !== "review" && this.#state !== "streaming") return this.#canonical;
    return this.#canonical.slice(0, this.#target.from) + this.#replacement + this.#canonical.slice(this.#target.to);
  }

  /** The editor host supplies the freshly source-resolved range after authorized StepMap edits. */
  updateCanonical(source: string, target: RewriteTarget): void {
    this.#canonical = source;
    if (target.original !== this.#target.original || source.slice(target.from, target.to) !== target.original) {
      this.#controller?.abort();
      this.#replacement = "";
      this.#reviewId = undefined;
      this.#error = "stale-target";
      this.#state = "error";
      return;
    }
    this.#target = Object.freeze({ ...target });
  }

  async send(requestId: string, instruction: string): Promise<void> {
    if (this.#state !== "composing") throw new Error("not-composing");
    if (!requestId || requestId.length > 128 || this.#attempts.has(requestId)) throw new Error("invalid-attempt");
    if (!instruction.trim() || Array.from(instruction).length > REWRITE_LIMITS.instructionPoints || bytes(instruction) > REWRITE_LIMITS.instructionBytes
      || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(instruction)) throw new Error("invalid-instruction");
    this.#attempts.add(requestId);
    this.#state = "sending";
    this.#error = undefined;
    this.#replacement = "";
    this.#reviewId = undefined;
    const controller = new AbortController();
    this.#controller = controller;
    let phase: "checkpoint" | "generation" | "variation" = "checkpoint";
    try {
      const { sessionId, source, target, checkpoints, provider } = this.#options;
      const checkpointId = await this.#wait(checkpoints.original({ sessionId, source, target }), controller.signal);
      if (controller.signal.aborted) throw interrupted;
      if (!checkpointId) throw new Error("missing-checkpoint");
      phase = "generation";
      const request: RewriteRequest = Object.freeze({ sessionId, requestId, instruction, target: target.original, signal: controller.signal });
      const iterator = provider(request)[Symbol.asyncIterator]();
      const started = Date.now();
      let sequence = 0, complete = false, outputBytes = 0;
      for (;;) {
        const remaining = REWRITE_LIMITS.totalMs - (Date.now() - started);
        if (remaining <= 0) throw timeout;
        const next = await this.#wait(iterator.next(), controller.signal, Math.min(remaining, this.#replacement ? REWRITE_LIMITS.idleTextMs : REWRITE_LIMITS.firstTextMs));
        if (next.done) break;
        const event = next.value;
        if (!Number.isSafeInteger(event.seq) || event.seq <= sequence || event.seq > 1_000_000) throw new Error("invalid-sequence");
        sequence = event.seq;
        if (event.type === "complete") { complete = true; break; }
        if (event.type !== "delta" || typeof event.text !== "string" || !event.text || bytes(event.text) > REWRITE_LIMITS.deltaBytes) throw new Error("invalid-delta");
        outputBytes += bytes(event.text);
        if (outputBytes > REWRITE_LIMITS.outputBytes) throw new RewriteTargetError("too-large");
        this.#replacement += event.text;
        this.#state = "streaming";
      }
      if (!complete) throw new Error("missing-completion");
      // A new document is not a selection replacement. Validate its own supported
      // Markdown without treating source metadata as an editable raw block.
      const historical = this.#options.resultMode === "new-file"
        ? validateRewriteNewFileResult(this.#replacement) : spliceRewriteTarget(source, target, this.#replacement);
      const current = this.#options.resultMode === "new-file"
        ? historical : spliceRewriteTarget(this.#canonical, this.#target, this.#replacement);
      this.#replacement = current.slice(this.#target.from, current.length - (this.#canonical.length - this.#target.to));
      phase = "variation";
      const variationId = await this.#wait(checkpoints.variation({ sessionId, checkpointId, source: historical, replacement: this.#replacement }), controller.signal);
      if (controller.signal.aborted) throw interrupted;
      if (!variationId) throw new Error("missing-variation");
      this.#reviewId = variationId;
      this.#state = "review";
    } catch (error) {
      if (error === interrupted) return;
      controller.abort();
      this.#state = "error";
      this.#replacement = "";
      this.#reviewId = undefined;
      this.#error = error === timeout ? "timeout" : phase !== "generation" ? "checkpoint-failed"
        : error instanceof RewriteTargetError ? error.code === "unsupported-target" ? "invalid-output" : error.code : "provider-error";
    } finally {
      controller.abort();
    }
  }

  stop(): void {
    this.#controller?.abort();
    this.#replacement = "";
    this.#reviewId = undefined;
    this.#state = "cancelled";
  }

  /** Returns a validated canonical handover; does not write or claim a saved/undoable note. */
  accept(): string {
    if (this.#options.resultMode === "new-file") throw new Error("new-file-only");
    if (this.#state !== "review" || !this.#reviewId) throw new Error("not-reviewing");
    const accepted = spliceRewriteTarget(this.#canonical, this.#target, this.#replacement);
    this.stop();
    this.#canonical = accepted;
    return accepted;
  }

  async #wait<T>(work: Promise<T>, signal: AbortSignal, ms?: number): Promise<T> {
    if (signal.aborted) throw interrupted;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(interrupted);
      signal.addEventListener("abort", abort, { once: true });
      if (ms !== undefined) timer = setTimeout(() => reject(timeout), Math.max(0, ms));
    });
    try { return await Promise.race([work, cancelled]); }
    finally {
      signal.removeEventListener("abort", abort);
      if (timer !== undefined) clearTimeout(timer);
    }
  }

}
