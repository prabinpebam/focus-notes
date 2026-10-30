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
  enabled = false;
  noteKey = "";
  feedback = "";
  address = "";
  model = "";
  key = "";
  connected = false;
  useConnection = false;
  connectionStatus = "";
  provider: RewriteProvider | undefined;
  token: string | undefined;
  history: { source: string; original?: string }[] = [];
  historyIndex = 0;
  historyOpen = false;
  showOriginal = false;
  historyLoading = false;
  historyStatus = "";
  historyRequest = 0;
  get savedPreview(): string { return this.showOriginal ? this.history[this.historyIndex]?.original ?? this.source : this.history[this.historyIndex]?.source ?? ""; }
  navigate(step: number): void {
    if (this.historyLoading) return;
    this.historyIndex = Math.max(0, Math.min(this.history.length - 1, this.historyIndex + step));
    this.showOriginal = false; this.changed();
  }
  authority: { prepare(source: string, target: RewriteTarget): Promise<string>; complete(token: string, replacement: string): Promise<string>; accept(token: string): Promise<void>; cancel(): void; history?(source: string): Promise<{ source: string; original?: string }[]>; restore?(source: string, index: number, original: boolean): Promise<{ token: string; source: string }> } | undefined;
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
    this.historyRequest++; this.history = []; this.historyOpen = false; this.showOriginal = false; this.historyLoading = false;
    this.session?.stop();
    this.authority?.cancel();
    this.token = undefined;
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
    const selectedProvider = this.useConnection ? this.provider ?? (async function* () { throw new Error("connection-unavailable"); }) : provider;
    const changed = this.changed;
    this.session = new RewriteSession({
      sessionId: "disposable-demo", source: this.source, target: this.target,
      provider: async function* (request) {
        for await (const event of selectedProvider(request)) {
          yield event;
          // The session has consumed the event before asking for the next one.
          changed();
        }
      },
      // Only the standalone in-memory demo uses acknowledgements without storage.
      checkpoints: { original: async () => {
        if (!this.authority) return "demo-original";
        const token = await this.authority.prepare(this.source, this.target!);
        this.token = token;
        return token;
      }, variation: async ({ checkpointId, replacement }) => this.authority
        ? this.authority.complete(checkpointId, replacement) : "demo-variation" },
    });
    const active = this.session;
    const began = performance.now();
    try { const work = this.session.send(crypto.randomUUID(), this.instruction); this.changed(); await work; }
    finally { if (this.session === active && active.state !== "review") this.authority?.cancel(); performance.measure("rewrite-demo:generation", { start: began }); this.changed(); }
  }
  accept(): void {
    if (this.session?.state !== "review" || this.historyOpen || this.showOriginal) return;
    this.previous = this.source;
    this.source = this.session.accept();
    this.revision++;
    this.openPanel = false;
    this.changed();
  }
  discard(): void { this.historyRequest++; this.history = []; this.historyOpen = false; this.showOriginal = false; this.historyLoading = false; this.historyStatus = ""; this.session?.stop(); this.authority?.cancel(); this.token = undefined; this.session = undefined; this.key = ""; this.openPanel = false; this.menu = false; this.changed(); }
  undo(): void {
    if (this.previous === undefined) return;
    this.discard(); this.source = this.previous; this.previous = undefined; this.revision++; this.changed();
  }
}

export function registerRewriteDemo(app: Pick<App, "store" | "commands" | "viewModels" | "messages">, editorAction: (id: string, args?: Record<string, unknown>) => void, connection?: import("./bridge.ts").PlatformBridge["rewriteConnection"], authority?: RewriteDemo["authority"]): void {
  const text = (key: string) => app.messages.format(`rewrite.${key}`);
  const demo = new RewriteDemo(() => app.store.update((s) => ({ ...s })));
  demo.authority = authority;
  if (connection) demo.provider = async function* (request) {
    let id: string | undefined;
    const cancel = () => { if (id) void connection("cancel", { id }).catch(() => {}); };
    request.signal.addEventListener("abort", cancel, { once: true });
    try {
      id = await connection("start", { target: request.target, instruction: request.instruction, token: demo.token });
      while (!request.signal.aborted) {
        const next = await connection("next", { id });
        if (request.signal.aborted || next.done) return;
        yield next.value;
        if (next.value.type === "complete") return;
      }
    } finally { request.signal.removeEventListener("abort", cancel); cancel(); }
  };
  const command = (id: string, run: (args: Record<string, unknown>) => void | Promise<void>) =>
    app.commands.register({ id: `demo.${id}`, title: "rewrite.demoTitle", run });
  command("enableEditor", () => { demo.enabled = true; demo.changed(); });
  app.commands.register({
    id: "rewrite.open", title: "rewrite.title",
    shortcut: { default: "Mod+Shift+R" }, layer: "writer", group: "editing",
    enabled: () => demo.enabled,
    disabledReason: "rewrite.candidateOnly",
    run: () => editorAction("rewrite.open"),
  });
  app.commands.register({
    id: "rewrite.context", title: "rewrite.title",
    enabled: () => demo.enabled && demo.menu,
    run: () => { demo.menu = false; editorAction("rewrite.open"); },
  });
  command("unsupported", () => { demo.feedback = text("unsupported"); demo.changed(); });
  app.store.subscribe(() => {
    if (demo.enabled && demo.openPanel && (demo.noteKey !== app.store.state.note.key || demo.source !== app.store.state.note.markdown)) demo.discard();
  });
  command("target", (a) => {
    if (demo.enabled && a.menu) { demo.menu = Number(a.from) >= 0; return; }
    if (demo.enabled) demo.noteKey = app.store.state.note.key;
    demo.feedback = "";
    demo.open({ source: String(a.source), target: { from: Number(a.from), to: Number(a.to), original: String(a.original) } });
    demo.menu = Boolean(a.menu); demo.changed();
  });
  command("open", () => { demo.menu = false; demo.changed(); });
  command("change", (a) => { demo.source = String(a.value); });
  command("instruction", (a) => { demo.instruction = String(a.value); demo.changed(); });
  command("preset", (a) => { demo.instruction = String(a.value); demo.changed(); });
  command("send", () => demo.send());
  command("history", async () => {
    if (!demo.enabled || demo.historyLoading) return;
    demo.session?.stop(); authority?.cancel(); demo.session = undefined; demo.token = undefined;
    const request = ++demo.historyRequest;
    const began = performance.now();
    demo.historyOpen = true; demo.historyLoading = true; demo.historyStatus = text("historyLoading"); demo.changed();
    try {
      const results = await authority?.history?.(demo.source);
      if (request !== demo.historyRequest) return;
      if (!results) throw new Error();
      demo.history = results; demo.historyIndex = 0; demo.showOriginal = false;
      demo.historyStatus = text(results.length ? "historyPreviewOnly" : "historyEmpty");
    } catch { if (request === demo.historyRequest) demo.historyStatus = text("historyReadError"); }
    finally { performance.measure("rewrite-demo:history", { start: began }); if (request === demo.historyRequest) { demo.historyLoading = false; demo.changed(); } }
  });
  command("previous", () => demo.navigate(-1));
  command("next", () => demo.navigate(1));
  command("original", () => { demo.showOriginal = !demo.showOriginal; demo.changed(); });
  command("restore", async () => {
    if (!demo.enabled || !demo.historyOpen || demo.historyLoading || !authority?.restore) return;
    const request = ++demo.historyRequest;
    const source = demo.source, key = demo.noteKey;
    const began = performance.now();
    demo.historyLoading = true; demo.historyStatus = text("restoring"); demo.changed();
    try {
      const expected = demo.savedPreview;
      const restored = await authority.restore(source, demo.historyIndex, demo.showOriginal);
      if (restored.source !== expected) throw new Error("saved-preview-changed");
      if (request !== demo.historyRequest || key !== app.store.state.note.key || source !== app.store.state.note.markdown) { authority.cancel(); return; }
      await authority.accept(restored.token);
      if (request !== demo.historyRequest || key !== app.store.state.note.key || source !== app.store.state.note.markdown) return;
      editorAction("rewrite.restore", { key, source, replacement: restored.source });
      demo.discard();
    } catch { authority.cancel(); if (request === demo.historyRequest) demo.historyStatus = text("restoreRefused"); }
    finally { performance.measure("rewrite-demo:restore", { start: began }); if (request === demo.historyRequest) { demo.historyLoading = false; demo.changed(); } }
  });
  command("accept", async () => {
    if (!demo.enabled) { demo.accept(); return; }
    if (demo.historyOpen || demo.showOriginal) return;
    if (demo.session?.state !== "review" || demo.noteKey !== app.store.state.note.key || demo.source !== app.store.state.note.markdown) { demo.discard(); return; }
    if (authority) {
      try { if (!demo.token) throw new Error(); await authority.accept(demo.token); }
      catch { demo.discard(); return; }
      if (demo.noteKey !== app.store.state.note.key || demo.source !== app.store.state.note.markdown) { demo.discard(); return; }
    }
    const replacement = demo.session.projection.slice(demo.target!.from, demo.session.projection.length - (demo.source.length - demo.target!.to));
    editorAction("rewrite.accept", { key: demo.noteKey, source: demo.source, replacement });
    demo.discard();
  });
  command("discard", () => { demo.feedback = ""; demo.discard(); });
  command("undo", () => demo.undo());
  command("settings", async () => {
    demo.settings = !demo.settings; demo.changed();
    if (!demo.settings) { demo.key = ""; demo.changed(); return; }
    if (!connection) return;
    try {
      const saved = await connection("settings");
      if (saved.configured) { demo.address = saved.address; demo.model = saved.model; demo.connected = true; }
    } catch { demo.connectionStatus = text("connectionError"); }
    demo.changed();
  });
  for (const field of ["address", "model", "key"] as const) command(field, (a) => { demo[field] = String(a.value); });
  command("provider", () => { demo.session?.stop(); authority?.cancel(); demo.token = undefined; demo.session = undefined; demo.useConnection = !demo.useConnection; demo.changed(); });
  command("saveConnection", async () => {
    demo.session?.stop(); authority?.cancel(); demo.token = undefined; demo.session = undefined; demo.connectionStatus = text("connectionSaving"); demo.changed();
    try {
      if (!connection) throw new Error();
      const saved = await connection("configure", { address: demo.address, model: demo.model, key: demo.key });
      demo.connected = saved.configured; demo.useConnection = true; demo.connectionStatus = text("connectionSaved");
    } catch { demo.connected = false; demo.connectionStatus = text("connectionError"); }
    finally { demo.key = ""; demo.changed(); }
  });
  command("removeConnection", async () => {
    demo.session?.stop(); authority?.cancel(); demo.token = undefined; demo.session = undefined;
    try { await connection?.("remove"); demo.connected = false; demo.useConnection = false; demo.key = ""; demo.connectionStatus = text("connectionRemoved"); }
    catch { demo.connectionStatus = text("connectionError"); }
    demo.changed();
  });
  command("failure", () => { demo.fail = !demo.fail; demo.changed(); });
  app.viewModels.register({
    id: "vm.rewriteDemo",
    // Mutable panel/session state lives outside AppState and invalidates via changed().
    // Re-select on store notifications, retaining structurally equal projections.
    reads: "*",
    schema: { type: "object", properties: Object.fromEntries([
      ...["restoreLabel", "historyStatus", "savedPreview", "historyCounter", "originalLabel", "address", "model", "key", "providerLabel", "connectionStatus", "source", "documentKey", "instruction", "original", "result", "preview", "status", "feedback", "failureStatus", "generateLabel", "discardLabel"].map((k) => [k, { type: "string" as const }]),
      ...["restoreDisabled", "historyOpen", "historyLoading", "previousDisabled", "nextDisabled", "isFake", "enabled", "hasFeedback", "open", "menu", "settings", "fail", "busy", "review", "undo"].map((k) => [k, { type: "boolean" as const }]),
    ]) },
    setters: { instruction: "demo.instruction", address: "demo.address", model: "demo.model", key: "demo.key" },
    select: () => {
      const state = demo.session?.state;
      return {
        historyOpen: demo.historyOpen, historyLoading: demo.historyLoading, historyStatus: demo.historyStatus,
        restoreLabel: text(demo.showOriginal ? "restoreOriginal" : "restoreVariation"),
        restoreDisabled: demo.historyLoading || !demo.history.length || demo.savedPreview === demo.source,
        savedPreview: demo.savedPreview, historyCounter: demo.history.length ? app.messages.format("rewrite.historyCounter", { current: demo.historyIndex + 1, total: demo.history.length }) : "",
        previousDisabled: demo.historyIndex <= 0, nextDisabled: demo.historyIndex >= demo.history.length - 1,
        originalLabel: text(demo.showOriginal ? "showVariation" : "showOriginal"),
        address: demo.address, model: demo.model, key: demo.key, connectionStatus: demo.connectionStatus,
        providerLabel: text(demo.useConnection ? "providerCompatible" : "providerFake"), isFake: !demo.useConnection,
        enabled: demo.enabled, feedback: demo.feedback, hasFeedback: Boolean(demo.feedback),
        preview: !demo.showOriginal && !demo.historyOpen && demo.openPanel && (state === "streaming" || state === "review") && demo.target
          ? demo.session!.projection.slice(demo.target.from, demo.session!.projection.length - (demo.source.length - demo.target.to)) : "",
        source: demo.source, documentKey: `demo-${demo.revision}`, instruction: demo.instruction,
        original: demo.original, result: demo.session?.projection ?? demo.source,
        open: demo.openPanel && !demo.menu, menu: demo.menu, settings: demo.settings, fail: demo.fail,
        failureStatus: text(demo.fail ? "failureOn" : "failureOff"),
        generateLabel: text(state === "review" || state === "error" ? "generate" : "start"),
        discardLabel: text(state === "sending" || state === "streaming" ? "cancel" : "discard"),
        busy: demo.historyLoading || state === "sending" || state === "streaming", review: state === "review" && !demo.showOriginal && !demo.historyOpen, undo: demo.previous !== undefined,
        status: text(state === "error" ? (demo.session?.error === "checkpoint-failed" ? "historyError" : demo.useConnection ? "connectionGenerationError" : demo.enabled ? "editorError" : "error") : state === "streaming" || state === "sending" ? (demo.useConnection ? "connectionStreaming" : "streaming") : state === "review" ? "ready" : "compose"),
      };
    },
  });
}
