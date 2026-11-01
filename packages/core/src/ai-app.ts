/**
 * AI Rewrite and Settings → AI. Settings keeps a list of AI connections (the ai-integration kit's
 * providers: local servers found on this computer, cloud APIs and gateways, any compatible
 * service), each with only its own fields, a key sealed by the shell, a Test, and one chosen as the
 * Writer. Rewrite: select text, then Ctrl+Shift+R (or Rewrite… in the text menu); the dialog
 * discloses the integration and model, remembers a picked Writer, and streams its rewrite into
 * the selection as one undo step. No key ever enters this state.
 */
import { AI_PROVIDERS, AZURE_API_VERSION, aiProvider, aiRunsInCloud, type AiConnectionView, type AiFound, type AiGroup } from "./ai-providers.ts";
import { aiConnectionIcon } from "../../ui/src/ai-icons.ts";
import type { AiConnectionInput, PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import type { TaskTracker, TaskView } from "./tasks.ts";
import type { WorkspaceTree } from "./workspace.ts";

interface S {
  note: { status: string; key: string; path?: string };
  ui: { toolbarOpen: boolean };
  workspace: { tree: WorkspaceTree };
  tasks: TaskView[];
}

interface Ctx<St extends S> {
  store: Store<St>;
  bridge: PlatformBridge;
  catalog: MessageCatalog;
  commands: CommandRegistry<St>;
  viewModels: ViewModelRegistry<St>;
  tracker: Pick<TaskTracker, "run">;
  editorAction: (id: string, args?: Record<string, unknown>) => void;
  announce: (text: string) => void;
  toast: (message: string, opts?: { tone?: "info" | "error"; action?: { command: string; label: string } }) => unknown;
}

const PRESETS = ["concise", "warmer", "grammar"] as const;
const GROUPS: readonly AiGroup[] = ["local", "cloud", "gateway"];
/** The shell's reason codes that have their own words; any other is "couldn't answer". */
const ERRORS = new Set([
  "not-configured", "consent-required", "secure-storage-unavailable", "unauthorized", "key-required", "key-new-address",
  "timeout", "network", "refused", "dns", "tls", "redirected", "model-missing", "not-found", "rate-limited", "server-error",
  "bad-request", "too-long", "provider-format", "provider-error", "provider-empty", "connection-unavailable",
  "invalid-url", "invalid-model", "invalid-deployment", "invalid-account", "invalid-key", "too-many",
  "cli-missing", "cli-unsupported", "cli-not-signed-in",
]);
/** A reason from the shell: the code at the end of an IPC error's text, and Retry-After's seconds. */
export function reasonCode(raw: string): { code: string; retryAfter?: number } {
  const m = /([a-z][a-z-]*)(?: retry-after=(\d+))?\s*$/.exec(raw);
  const code = m && ERRORS.has(m[1]!) ? m[1]! : "";
  return m?.[2] ? { code, retryAfter: Number(m[2]) } : { code };
}
const DRAFT_FIELDS = ["name", "endpoint", "model", "deployment", "apiVersion", "account"] as const;
type Draft = { id?: string; provider: string; name: string; endpoint: string; model: string; deployment: string; apiVersion: string; account: string };
const blankDraft = (provider = "ollama"): Draft => {
  const p = aiProvider(provider)!;
  return { provider, name: p.label, endpoint: p.endpointEditable ? p.endpoint : "", model: p.shape === "copilot-cli" ? "auto" : "", deployment: "", apiVersion: p.shape === "azure" ? AZURE_API_VERSION : "", account: "" };
};

export function registerAi<St extends S>({ store, bridge, catalog, commands, viewModels, tracker, editorAction, announce, toast }: Ctx<St>) {
  const ai = bridge.ai;
  const changed = () => store.update((s) => ({ ...s }));
  const t = (key: string, args?: Record<string, unknown>) => catalog.format(key, args);
  /** A reason code from the shell (inside an IPC error's text) as words. */
  const reason = (e: unknown, fallback: string, retryAfter?: number) => {
    const r = reasonCode(String((e as Error)?.message ?? ""));
    const wait = retryAfter ?? r.retryAfter;
    if (r.code === "rate-limited" && wait) return t("ai.error.rate-limited.wait", { s: wait });
    return t(r.code ? `ai.error.${r.code}` : fallback);
  };

  // ---- Settings → AI ----
  let writer = "";
  let connections: AiConnectionView[] = [];
  let formOpen = false;
  let draft: Draft = blankDraft();
  let draftHasKey = false;
  /** The saved connection the form changes: where its key and model locality belong. */
  let draftSaved: AiConnectionView | undefined;
  let models: { id: string; cloud: boolean }[] = [];
  let modelsStatus = "";
  let found: AiFound[] = [];
  let discovering = false, discoverStatus = "";
  let status = "";
  let busy = false;
  let choosingWriter = false;
  const testing = new Set<string>();
  const testErrors = new Map<string, string>();

  const where = (provider: string, endpoint: string, model = "", modelCloud = false) =>
    t(aiRunsInCloud(provider, endpoint, model, modelCloud) ? "ai.where.cloud" : "ai.where.local");
  const destination = (provider: string, endpoint: string, account = "") => {
    const p = aiProvider(provider);
    if (!p) return "";
    const base = p.endpointEditable ? endpoint || p.endpoint : p.endpoint.replace("{account}", account || "…");
    try {
      return new URL(base).host;
    } catch {
      return base;
    }
  };
  const describe = (c: AiConnectionView) => {
    const p = aiProvider(c.provider)!;
    return [p.label, c.model || c.deployment, where(c.provider, c.endpoint, c.model, c.modelCloud)].filter(Boolean).join(" · ");
  };
  const testText = (c: AiConnectionView) => {
    if (testing.has(c.id)) return t("ai.test.running");
    const err = testErrors.get(c.id);
    if (err) return err;
    if (!c.lastTest) return t("ai.test.never");
    const at = new Date(c.lastTest.at).toLocaleString();
    return t(c.lastTest.ok ? "ai.test.passed" : "ai.test.failed", { at });
  };
  const apply = (v: { writer: string; connections: AiConnectionView[] }) => { writer = v.writer; connections = v.connections; };
  const load = async () => {
    if (!ai) return;
    try {
      apply(await ai.settings());
    } catch (e) {
      status = reason(e, "ai.error.save");
      toast(status, { tone: "error" });
    }
    changed();
  };
  const writerConnection = () => connections.find((c) => c.id === writer);
  const trimBase = (v: string) => v.trim().replace(/\/+$/, "");
  /** The form moved a saved connection to another address: its saved key won't go there (D-259). */
  const draftMoved = () => Boolean(draftSaved) && (trimBase(draft.endpoint) !== trimBase(draftSaved!.endpoint) || draft.account.trim() !== draftSaved!.account);
  /** A model list can identify cloud routing that isn't in the model's name. */
  const draftCloud = () => {
    const listed = models.find((m) => m.id === draft.model);
    if (listed) return listed.cloud;
    if (draftSaved && !draftMoved() && draft.model === draftSaved.model) return Boolean(draftSaved.modelCloud);
    return false;
  };

  viewModels.register({
    id: "vm.ai",
    // Its values live in this module, not in state: selected again on every change (`changed()`).
    reads: "*",
    schema: { type: "object", properties: {
      ...Object.fromEntries([
        "writerName", "status", "formTitle", "providerName", "keyLabel", "keyState", "destination", "testInfo", "modelsStatus", "discoverStatus",
        "name", "endpoint", "model", "deployment", "apiVersion", "account", "providerNote", "writerSaveText", "choiceGroup",
      ].map((k) => [k, { type: "string" as const }])),
      ...Object.fromEntries([
        "formOpen", "cannotSave", "discovering", "showEndpoint", "showModel", "showDeployment", "showApiVersion", "showAccount", "showKey", "hasModels", "hasWriter", "addVisible", "noKeyField", "choosingWriter",
      ].map((k) => [k, { type: "boolean" as const }])),
      writerMenu: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, checked: { type: "boolean" } } } } } } },
      providerMenu: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, checked: { type: "boolean" } } } } } } },
      modelMenu: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, checked: { type: "boolean" } } } } } } },
      connections: { type: "array", items: { type: "object", properties: {
        id: { type: "string" }, name: { type: "string" }, choiceLabel: { type: "string" }, icon: { type: "string" }, detail: { type: "string" }, badge: { type: "string" }, keyText: { type: "string" },
        testText: { type: "string" }, testing: { type: "boolean" }, writer: { type: "boolean" }, notWriter: { type: "boolean" },
      } } },
      found: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, detail: { type: "string" } } } },
    } },
    select: () => {
      const p = aiProvider(draft.provider)!;
      const azure = p.shape === "azure";
      return {
        writerName: writerConnection()?.name ?? t("ai.writer.none"),
        hasWriter: Boolean(writerConnection()),
        choiceGroup: "ai-default", choosingWriter, writerSaveText: choosingWriter ? t("rewrite.integration.saving") : "",
        writerMenu: [{ id: "writer", items: connections.map((c) => ({ id: c.id, label: c.name, checked: c.id === writer })) }],
        connections: connections.map((c) => ({
          id: c.id, name: c.name, choiceLabel: t("ai.default.choice", { name: c.name }), icon: aiConnectionIcon(c.provider), detail: describe(c), writer: c.id === writer, notWriter: c.id !== writer,
          badge: t(c.id === writer ? "ai.badge.writer" : "ai.badge.saved"),
          keyText: t(c.hasKey ? "ai.key.saved" : aiProvider(c.provider)!.key === "none" ? "ai.key.notNeeded" : "ai.key.none"),
          testText: testText(c), testing: testing.has(c.id),
        })),
        found: found.flatMap((f, i) => {
          if (f.provider === "copilot-cli") return [];
          const fp = aiProvider(f.provider)!;
          const n = f.models.length;
          return [{ id: String(i), name: fp.label, detail: n ? t("ai.found.models", { n, endpoint: f.endpoint }) : t("ai.found.noModels", { endpoint: f.endpoint }) }];
        }),
        discovering, discoverStatus,
        formOpen, addVisible: !formOpen, noKeyField: p.key === "none",
        formTitle: draft.id ? t("ai.form.change", { name: draft.name }) : t("ai.form.add"),
        providerName: p.label,
        providerNote: t(p.shape === "copilot-cli" ? "ai.note.copilot" : `ai.note.${p.group}`),
        providerMenu: GROUPS.map((g) => ({ id: g, label: t(`ai.group.${g}`), items: AI_PROVIDERS.filter((x) => x.group === g).map((x) => ({ id: x.id, label: x.label, checked: x.id === draft.provider })) })),
        name: draft.name, endpoint: draft.endpoint, model: draft.model, deployment: draft.deployment, apiVersion: draft.apiVersion, account: draft.account,
        showEndpoint: p.endpointEditable, showModel: !azure, showDeployment: azure, showApiVersion: azure, showAccount: p.fields.includes("account"),
        showKey: p.key !== "none",
        keyLabel: t(p.key === "required" ? "ai.key.label" : "ai.key.labelOptional"),
        keyState: draft.id && draftHasKey ? t(draftMoved() ? "ai.key.reenter" : "ai.key.keep") : p.key === "required" ? t("ai.key.needed") : t("ai.key.optional"),
        hasModels: models.length > 0,
        modelMenu: [{ id: "models", items: models.map((m) => ({ id: m.id, label: m.cloud && p.group === "local" ? t("ai.model.cloud", { id: m.id }) : m.id, checked: m.id === draft.model })) }],
        modelsStatus,
        destination: t("ai.destination", { host: destination(draft.provider, draft.endpoint, draft.account), where: where(p.id, draft.endpoint || p.endpoint, draft.model, draftCloud()) }),
        testInfo: t("ai.test.info"),
        status,
        cannotSave: busy || choosingWriter || (azure ? !draft.deployment.trim() : !draft.model.trim()) || (p.endpointEditable && !draft.endpoint.trim()) || (p.fields.includes("account") && !draft.account.trim()),
      };
    },
  });

  const reg = (id: string, run: (a: Record<string, unknown>) => unknown, extra: Partial<Parameters<CommandRegistry<St>["register"]>[0]> = {}) =>
    commands.register({ id, title: `command.${id}`, ...extra, run: async (a: Record<string, unknown>) => { await run(a ?? {}); } });
  const input = (): AiConnectionInput => ({ ...(draft.id ? { id: draft.id } : {}), provider: draft.provider, name: draft.name, endpoint: draft.endpoint, model: draft.model, deployment: draft.deployment, apiVersion: draft.apiVersion, account: draft.account });
  const openForm = (d: Draft, hasKey = false, saved?: AiConnectionView) => { draft = d; draftHasKey = hasKey; draftSaved = saved; models = []; modelsStatus = ""; formOpen = true; status = ""; changed(); };

  reg("ai.load", load);
  reg("ai.add", () => openForm(blankDraft()));
  reg("ai.cancel", () => { formOpen = false; status = ""; changed(); });
  reg("ai.provider", (a) => {
    const p = aiProvider(a.value);
    if (!p || p.id === draft.provider) return;
    // Another provider's form starts afresh: its own fields, never the last one's key or endpoint.
    openForm({ ...blankDraft(p.id), ...(draft.id ? { id: draft.id } : {}) });
  });
  reg("ai.edit", (a) => {
    const field = DRAFT_FIELDS.find((f) => f === a.field);
    if (field) draft = { ...draft, [field]: String(a.value ?? "") };
    changed();
  });
  reg("ai.change", (a) => {
    const c = connections.find((x) => x.id === a.value);
    if (c) openForm({ id: c.id, provider: c.provider, name: c.name, endpoint: c.endpoint, model: c.model, deployment: c.deployment, apiVersion: c.apiVersion, account: c.account }, c.hasKey, c);
  });
  reg("ai.save", async (a) => {
    if (!ai || busy) return;
    const key = typeof a.key === "string" ? a.key : "";
    delete a.key;
    busy = true;
    status = t("ai.saving");
    changed();
    try {
      apply(await ai.save({ ...input(), ...(key ? { key } : {}) }));
      formOpen = false;
      status = t("ai.saved");
    } catch (e) {
      status = reason(e, "ai.error.save");
    } finally {
      busy = false;
      changed();
    }
  });
  reg("ai.remove", async (a) => {
    if (!ai || choosingWriter || typeof a.value !== "string") return;
    try {
      apply(await ai.remove(a.value));
      status = t("ai.removed");
    } catch (e) {
      status = reason(e, "ai.error.save");
    }
    changed();
  });
  const chooseWriter = async (value: unknown, target: string) => {
    if (!ai || choosingWriter || typeof value !== "string" || value === writer) return;
    choosingWriter = true;
    status = "";
    changed();
    const started = performance.now();
    try {
      apply(await tracker.run(target, "rewrite.integration.saving", () => ai.writer(value), "rewrite.integration.saved"));
      announce(t("ai.writer.set", { name: writerConnection()?.name ?? "" }));
    } catch (e) {
      status = reason(e, "ai.error.save");
      toast(status, { tone: "error" });
    } finally {
      choosingWriter = false;
      performance.measure("fn:ai.chooseWriter", { start: started, duration: performance.now() - started });
      changed();
    }
  };
  reg("ai.writer", (a) => chooseWriter(a.value, "settings.writer"));
  reg("ai.test", async (a) => {
    const id = typeof a.value === "string" ? a.value : "";
    if (!ai || !id || testing.has(id)) return;
    testing.add(id);
    testErrors.delete(id);
    changed();
    try {
      apply(await ai.test(id));
    } catch (e) {
      testErrors.set(id, t("ai.test.error", { reason: reason(e, "ai.error.provider") }));
      await load();
    } finally {
      testing.delete(id);
      changed();
    }
  });
  reg("ai.discover", async () => {
    if (!ai || discovering) return;
    discovering = true;
    discoverStatus = t("ai.found.looking");
    changed();
    try {
      found = await ai.discover();
      apply(await ai.settings());
      const cli = found.find((f) => f.provider === "copilot-cli");
      if (cli?.status === "signed-in") discoverStatus = found.some((f) => f.provider !== "copilot-cli") ? t("ai.found.some", { n: found.filter((f) => f.provider !== "copilot-cli").length }) : "";
      else if (cli) discoverStatus = reason(new Error(cli.error ?? "provider-error"), "ai.error.provider");
      else discoverStatus = t(found.length ? "ai.found.some" : "ai.found.none", { n: found.length });
    } catch (e) {
      discoverStatus = reason(e, "ai.error.provider");
    } finally {
      discovering = false;
      changed();
      announce(discoverStatus || (found.some((f) => f.provider === "copilot-cli" && f.status === "signed-in") ? t("ai.found.copilot") : ""));
    }
  });
  reg("ai.useFound", (a) => {
    const f = found[Number(a.value)];
    if (!f) return;
    if (f.provider === "copilot-cli") {
      status = f.status === "signed-in" ? "" : reason(new Error(f.error ?? "provider-error"), "ai.error.provider");
      changed();
      return;
    }
    const p = aiProvider(f.provider)!;
    const local = f.models.find((m) => !m.cloud);
    openForm({ ...blankDraft(p.id), endpoint: f.endpoint, model: local?.id ?? "" });
    models = f.models;
    modelsStatus = f.models.length ? "" : t("ai.models.none");
    changed();
  });
  reg("ai.models", async () => {
    if (!ai) return;
    modelsStatus = t("ai.models.looking");
    changed();
    try {
      models = await ai.models(input());
      modelsStatus = models.length ? t("ai.models.count", { n: models.length }) : t("ai.models.none");
    } catch (e) {
      modelsStatus = reason(e, "ai.error.provider");
    }
    changed();
  });
  reg("ai.model", (a) => { if (typeof a.value === "string") { draft = { ...draft, model: a.value }; changed(); } });
  reg("ai.openSettings", async () => {
    closeModal();
    // The section first: Settings' open waits on the account check, which can take seconds (offline, slow GitHub).
    await commands.run("settings.setSection", { value: "ai" });
    await commands.run("settings.open");
  });

  // ---- Rewrite: the inline popover takes the prompt; the answer streams into the note ----
  let open = false, selection = "", prompt = "", instruction = "";
  let confirmingDiscard = false, focusRequest = 0;
  /** The note the selection came from: a switch stops the rewrite. */
  let fromKey = "", fromPath = "";
  /** The rewrite streaming into the note: its id, whether any text came, and the toast that says so. */
  let running: { id: string; got: boolean; off: () => void; toast: unknown } | undefined;
  const presetText = (p: (typeof PRESETS)[number]) => t(`rewrite.preset.${p}.prompt`);
  const closeModal = () => {
    open = false; confirmingDiscard = false; prompt = "";
    editorAction("rewrite.release");
    changed();
  };
  const actions = () => writerConnection() ? "compose" : "setup";
  viewModels.register({
    id: "vm.rewrite",
    reads: "*",
    schema: { type: "object", properties: {
      ...Object.fromEntries(["selection", "prompt", "actions", "writerLabel", "writerName", "writerService", "writerModel", "writerWhere", "writerKind", "writerIcon", "writerSaveText"].map((k) => [k, { type: "string" as const }])),
      ...Object.fromEntries(["open", "empty", "needsSetup", "hasWriter", "confirmingDiscard", "canChooseWriter", "choosingWriter", "writerSaving", "concise", "warmer", "grammar"].map((k) => [k, { type: "boolean" as const }])),
      focusRequest: { type: "number" },
      writerMenu: { type: "array", items: { type: "object", properties: { id: { type: "string" }, items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, checked: { type: "boolean" } } } } } } },
    } },
    select: () => {
      const w = writerConnection();
      const a = actions();
      return {
        open, selection, prompt, confirmingDiscard, focusRequest,
        writerLabel: w ? t("rewrite.writer", { name: w.name, detail: describe(w) }) : "",
        writerName: w?.name ?? "", writerService: w ? aiProvider(w.provider)!.label : "",
        writerModel: w ? w.model || w.deployment : "",
        writerWhere: w ? where(w.provider, w.endpoint, w.model, w.modelCloud) : "",
        writerKind: w?.provider ?? "", writerIcon: aiConnectionIcon(w?.provider ?? ""),
        canChooseWriter: connections.length > 1, choosingWriter,
        writerSaving: store.state.tasks.some((task) => task.target === "rewrite.writer" && task.phase === "on"),
        writerSaveText: t(choosingWriter ? "rewrite.integration.saving" : "rewrite.integration.saved"),
        writerMenu: [{ id: "writer", items: connections.map((c) => ({ id: c.id, label: `${c.name} · ${describe(c)}`, checked: c.id === writer })) }],
        needsSetup: !w, hasWriter: Boolean(w),
        actions: a,
        empty: !prompt.trim() || choosingWriter,
        concise: prompt === presetText("concise"), warmer: prompt === presetText("warmer"), grammar: prompt === presetText("grammar"),
      };
    },
  });

  const end = () => {
    const r = running;
    running = undefined;
    if (!r) return;
    r.off();
    if (typeof r.toast === "number") void commands.run("toast.dismiss", { id: r.toast }).catch(() => {});
  };
  /** A failure or a stop: the editor puts the original back and unlocks the note. */
  const fail = (code: string, retryAfter?: number) => {
    editorAction("rewrite.abort");
    end();
    if (code === "cancelled") announce(t("rewrite.stopped"));
    else toast(reason(new Error(code), "ai.error.provider", retryAfter), { tone: "error" });
  };
  const onEvent = (raw: unknown) => {
    const e = raw as { id?: unknown; type?: unknown; text?: unknown; code?: unknown; retryAfter?: unknown } | null;
    if (!running || !e || e.id !== running.id) return;
    if (e.type === "delta" && typeof e.text === "string") {
      running.got ||= e.text.trim().length > 0;
      editorAction("rewrite.chunk", { text: e.text });
    } else if (e.type === "done") {
      if (!running.got) return fail("provider-empty");
      editorAction("rewrite.finish");
      end();
      announce(t("rewrite.replaced"));
    } else if (e.type === "error") fail(typeof e.code === "string" ? e.code : "provider", typeof e.retryAfter === "number" ? e.retryAfter : undefined);
  };
  /** Stops the request in the shell, without touching the editor (it has already let the note go). */
  const drop = () => {
    if (!running || !ai) return;
    void ai.rewriteCancel(running.id).catch(() => {});
    end();
    announce(t("rewrite.stopped"));
  };
  // Another note opened, or this one closed: the old note's rewrite stops in the shell too.
  store.subscribe(() => {
    if (running && store.state.note.key !== fromKey) drop();
    if (open && store.state.note.key !== fromKey) closeModal();
  });
  // The window going away (reload, close): nothing keeps running in the shell for it.
  (globalThis as { addEventListener?: (type: string, fn: () => void) => void }).addEventListener?.("pagehide", drop);

  reg("rewrite.open", () => {
    if (running) return;
    // The editor answers with the selection (rewrite.captured).
    if (open) {
      if (!confirmingDiscard) { focusRequest++; changed(); }
      return;
    }
    editorAction("rewrite.capture");
  }, { icon: "rename", shortcut: { default: "Mod+Shift+R" }, layer: "writer", group: "editing", enabled: (s) => Boolean(ai) && s.note.status === "ready" });
  reg("rewrite.captured", async (a) => {
    const text = typeof a.text === "string" ? a.text : "";
    if (!text.trim()) {
      announce(t("rewrite.selectFirst"));
      return;
    }
    open = true; selection = text; prompt = ""; confirmingDiscard = false; focusRequest++;
    fromKey = store.state.note.key;
    fromPath = store.state.note.path ?? "";
    store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false } }));
    await load();
  });
  reg("rewrite.dismiss", (a) => { if (a.open !== true) closeModal(); });
  reg("rewrite.deselected", (a) => {
    if (!open || confirmingDiscard) return;
    const started = typeof a.started === "number" ? a.started : performance.now();
    if (prompt.length === 0) closeModal();
    else { confirmingDiscard = true; changed(); }
    performance.measure("fn:rewrite.deselect", { start: started, duration: performance.now() - started });
  });
  reg("rewrite.keepPrompt", () => {
    if (!confirmingDiscard) return;
    confirmingDiscard = false;
    editorAction("rewrite.restore");
    focusRequest++;
    changed();
  });
  reg("rewrite.discardPrompt", () => { if (confirmingDiscard) closeModal(); });
  reg("rewrite.prompt", (a) => { prompt = String(a.value ?? ""); changed(); });
  reg("rewrite.writer", async (a) => {
    if (open) await chooseWriter(a.value, "rewrite.writer");
  });
  reg("rewrite.preset", (a) => {
    const p = PRESETS.find((x) => x === a.value);
    if (p) { prompt = presetText(p); changed(); }
  });
  // Generate closes the popover directly; the captured note locks and shimmers (rewrite.began).
  reg("rewrite.generate", () => {
    const w = writerConnection();
    if (!ai || !open || confirmingDiscard || !prompt.trim() || running || choosingWriter || !w) return;
    instruction = prompt.trim();
    open = false; prompt = ""; changed();
    editorAction("rewrite.begin");
  });
  reg("rewrite.began", (a) => {
    if (!ai) return;
    if (a.ok !== true) {
      toast(t("rewrite.error.stale"), { tone: "error" });
      return;
    }
    const id = `rw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const off = ai.onRewriteEvent(onEvent);
    const name = writerConnection()?.name ?? "";
    running = { id, got: false, off, toast: toast(t("rewrite.running", { name }), { action: { command: "rewrite.cancel", label: t("rewrite.stop") } }) };
    announce(t("rewrite.started"));
    ai.rewriteStart(id, { text: selection, instruction, path: fromPath }).catch((e: unknown) => { if (running?.id === id) fail(String((e as Error)?.message ?? "provider")); });
  });
  // Esc or Stop while it streams: the request is stopped and the original comes back at once.
  reg("rewrite.cancel", () => {
    if (!running || !ai) return;
    void ai.rewriteCancel(running.id).catch(() => {});
    fail("cancelled");
  });
}