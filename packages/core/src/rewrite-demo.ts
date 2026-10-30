import { RewriteSession, type RewriteProvider } from "./rewrite.ts";
import type { RewriteTarget } from "@focus-notes/markdown";
import type { App } from "./app.ts";

/** Disposable, in-memory fixture only. Never installs against a workspace note. */
export class RewriteDemo {
  source = "We are planning a small community garden. There are several things that we need to think about before we can begin.";
  instruction = "Make it concise";
  session: RewriteSession | undefined;
  target: RewriteTarget | undefined;
  original = "";
  previous: string | undefined;
  revision = 0;
  openPanel = false;
  menu = false;
  settings = false;
  fail = false;
  readonly changed: () => void;
  constructor(changed = () => {}) { this.changed = changed; }
  open(input: { source: string; target: Pick<RewriteTarget, "from" | "to" | "original"> }): void {
    this.discard();
    this.source = input.source;
    this.original = input.target.original;
    const bytes = (s: string) => new TextEncoder().encode(s).length;
    this.target = { ...input.target, startByte: bytes(input.source.slice(0, input.target.from)), endByte: bytes(input.source.slice(0, input.target.to)), expanded: false };
    this.openPanel = true;
    this.changed();
  }
  async send(): Promise<void> {
    if (!this.target || !this.instruction.trim()) return;
    this.session?.stop();
    const fail = this.fail;
    // Same typed provider seam as the real adapter; this adapter has no network capability.
    const provider: RewriteProvider = async function* (request) {
      if (fail) throw new Error("simulated-provider-unavailable");
      const text = request.instruction.toLowerCase().includes("concise")
        ? "Plan a community garden and agree on the next steps."
        : `${request.target.trim()} Let’s agree on a clear next step.`;
      let seq = 0;
      for (const word of text.match(/\S+\s*/g) ?? []) {
        await new Promise((resolve) => setTimeout(resolve, 70));
        if (request.signal.aborted) return;
        yield { seq: ++seq, type: "delta", text: word };
      }
      yield { seq: ++seq, type: "complete" };
    };
    this.session = new RewriteSession({
      sessionId: "disposable-demo", source: this.source, target: this.target, provider,
      // Honest demo-only acknowledgements, NOT durable real-note checkpoints.
      checkpoints: { original: async () => "demo-original", variation: async () => "demo-variation" },
    });
    const began = performance.now();
    const timer = setInterval(this.changed, 40);
    try { const work = this.session.send(crypto.randomUUID(), this.instruction); this.changed(); await work; }
    finally { clearInterval(timer); performance.measure("rewrite-demo:generation", { start: began }); this.changed(); }
  }
  accept(): void {
    if (this.session?.state !== "review") return;
    this.previous = this.source;
    this.source = this.session.accept();
    this.revision++;
    this.openPanel = false;
    this.changed();
  }
  discard(): void { this.session?.stop(); this.session = undefined; this.openPanel = false; this.menu = false; this.changed(); }
  undo(): void {
    if (this.previous === undefined) return;
    this.discard(); this.source = this.previous; this.previous = undefined; this.revision++; this.changed();
  }
}

export function registerRewriteDemo(app: Pick<App, "store" | "commands" | "viewModels" | "messages">): void {
  const text = (key: string) => app.messages.format(`rewrite.${key}`);
  const demo = new RewriteDemo(() => app.store.update((s) => ({ ...s })));
  const command = (id: string, run: (args: Record<string, unknown>) => void | Promise<void>) =>
    app.commands.register({ id: `demo.${id}`, title: "rewrite.demoTitle", run });
  command("target", (a) => {
    demo.open({ source: String(a.source), target: { from: Number(a.from), to: Number(a.to), original: String(a.original) } });
    demo.menu = Boolean(a.menu); demo.changed();
  });
  command("open", () => { demo.menu = false; demo.changed(); });
  command("change", (a) => { demo.source = String(a.value); });
  command("instruction", (a) => { demo.instruction = String(a.value); demo.changed(); });
  command("preset", (a) => { demo.instruction = String(a.value); demo.changed(); });
  command("send", () => demo.send());
  command("accept", () => demo.accept());
  command("discard", () => demo.discard());
  command("undo", () => demo.undo());
  command("settings", () => { demo.settings = !demo.settings; demo.changed(); });
  command("failure", () => { demo.fail = !demo.fail; demo.changed(); });
  app.viewModels.register({
    id: "vm.rewriteDemo",
    schema: { type: "object", properties: Object.fromEntries([
      ...["source", "documentKey", "instruction", "original", "result", "status", "failureStatus", "generateLabel", "discardLabel"].map((k) => [k, { type: "string" as const }]),
      ...["open", "menu", "settings", "fail", "busy", "review", "undo"].map((k) => [k, { type: "boolean" as const }]),
    ]) },
    setters: { instruction: "demo.instruction" },
    select: () => {
      const state = demo.session?.state;
      return {
        source: demo.source, documentKey: `demo-${demo.revision}`, instruction: demo.instruction,
        original: demo.original, result: demo.session?.projection ?? demo.source,
        open: demo.openPanel && !demo.menu, menu: demo.menu, settings: demo.settings, fail: demo.fail,
        failureStatus: text(demo.fail ? "failureOn" : "failureOff"),
        generateLabel: text(state === "review" || state === "error" ? "generate" : "start"),
        discardLabel: text(state === "sending" || state === "streaming" ? "cancel" : "discard"),
        busy: state === "sending" || state === "streaming", review: state === "review", undo: demo.previous !== undefined,
        status: text(state === "error" ? "error" : state === "streaming" || state === "sending" ? "streaming" : state === "review" ? "ready" : "compose"),
      };
    },
  });
}
