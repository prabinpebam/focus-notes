/**
 * AI Rewrite and Settings → AI. Settings keeps a list of AI connections (the ai-integration kit's
 * providers: local servers found on this computer, cloud APIs and gateways, any compatible
 * service), each with only its own fields, a key sealed by the shell, a Test, and one chosen as the
 * Writer. Rewrite: select text, then Ctrl+Shift+R (or Rewrite… in the text menu); the approved
 * dialog asks the Writer, through the shell, for three alternatives, and Accept replaces the
 * selection through the editor as one undo step. No key ever enters this state.
 */
import { AI_PROVIDERS, AZURE_API_VERSION, aiProvider, type AiConnectionView, type AiFound, type AiGroup } from "./ai-providers.ts";
import type { AiConnectionInput, PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";

interface S {
  note: { status: string };
  ui: { toolbarOpen: boolean };
}

interface Ctx<St extends S> {
  store: Store<St>;
  bridge: PlatformBridge;
  catalog: MessageCatalog;
  commands: CommandRegistry<St>;
  viewModels: ViewModelRegistry<St>;
  editorAction: (id: string, args?: Record<string, unknown>) => void;
  announce: (text: string) => void;
}

const PRESETS = ["concise", "warmer", "grammar"] as const;
type Phase = "empty" | "generating" | "results" | "error";
const GROUPS: readonly AiGroup[] = ["local", "cloud", "gateway"];
const ERRORS = ["not-configured", "secure-storage-unavailable", "unauthorized", "key-required", "timeout", "network", "model-missing", "not-found", "rate-limited", "invalid-url", "invalid-model", "invalid-deployment", "invalid-account", "invalid-key", "too-many"] as const;
const DRAFT_FIELDS = ["name", "endpoint", "model", "deployment", "apiVersion", "account"] as const;
type Draft = { id?: string; provider: string; name: string; endpoint: string; model: string; deployment: string; apiVersion: string; account: string };
const blankDraft = (provider = "ollama"): Draft => {
  const p = aiProvider(provider)!;
  return { provider, name: p.label, endpoint: p.endpointEditable ? p.endpoint : "", model: "", deployment: "", apiVersion: p.shape === "azure" ? AZURE_API_VERSION : "", account: "" };
};

export function registerAi<St extends S>({ store, bridge, catalog, commands, viewModels, editorAction, announce }: Ctx<St>) {
  const ai = bridge.ai;
  const changed = () => store.update((s) => ({ ...s }));
  const t = (key: string, args?: Record<string, unknown>) => catalog.format(key, args);
  /** A reason code from the shell (inside an IPC error's text) as words. */
  const reason = (e: unknown, fallback: string) => {
    const raw = String((e as Error)?.message ?? "");
    const code = ERRORS.find((c) => raw.includes(c));
    return t(code ? `ai.error.${code}` : fallback);
  };

  // ---- Settings → AI ----
  let writer = "";
  let connections: AiConnectionView[] = [];
  let formOpen = false;
  let draft: Draft = blankDraft();
  let draftHasKey = false;
  let models: { id: string; cloud: boolean }[] = [];
  let modelsStatus = "";
  let found: AiFound[] = [];
  let discovering = false, discoverStatus = "";
  let status = "";
  let busy = false;
  const testing = new Set<string>();
  const testErrors = new Map<string, string>();

  const where = (group: AiGroup, endpoint: string) => {
    const local = group === "local" && /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(endpoint);
    return t(local ? "ai.where.local" : "ai.where.cloud");
  };
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
    return [p.label, c.model || c.deployment, where(p.group, c.endpoint)].filter(Boolean).join(" · ");
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
    apply(await ai.settings().catch(() => ({ writer: "", connections: [] })));
    changed();
  };
  const writerConnection = () => connections.find((c) => c.id === writer);

  viewModels.register({
    id: "vm.ai",
    schema: { type: "object", properties: {
      ...Object.fromEntries([
        "writerName", "status", "formTitle", "providerName", "keyLabel", "keyState", "destination", "testInfo", "modelsStatus", "discoverStatus",
        "name", "endpoint", "model", "deployment", "apiVersion", "account", "providerNote",
      ].map((k) => [k, { type: "string" as const }])),
      ...Object.fromEntries([
        "formOpen", "cannotSave", "discovering", "showEndpoint", "showModel", "showDeployment", "showApiVersion", "showAccount", "showKey", "hasModels", "hasWriter", "addVisible", "noKeyField",
      ].map((k) => [k, { type: "boolean" as const }])),
      writerMenu: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, checked: { type: "boolean" } } } } } } },
      providerMenu: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, checked: { type: "boolean" } } } } } } },
      modelMenu: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, checked: { type: "boolean" } } } } } } },
      connections: { type: "array", items: { type: "object", properties: {
        id: { type: "string" }, name: { type: "string" }, detail: { type: "string" }, badge: { type: "string" }, keyText: { type: "string" },
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
        writerMenu: [{ id: "writer", items: connections.map((c) => ({ id: c.id, label: c.name, checked: c.id === writer })) }],
        connections: connections.map((c) => ({
          id: c.id, name: c.name, detail: describe(c), writer: c.id === writer, notWriter: c.id !== writer,
          badge: t(c.id === writer ? "ai.badge.writer" : "ai.badge.saved"),
          keyText: t(c.hasKey ? "ai.key.saved" : aiProvider(c.provider)!.key === "none" ? "ai.key.notNeeded" : "ai.key.none"),
          testText: testText(c), testing: testing.has(c.id),
        })),
        found: found.map((f, i) => {
          const fp = aiProvider(f.provider)!;
          const n = f.models.length;
          return { id: String(i), name: fp.label, detail: n ? t("ai.found.models", { n, endpoint: f.endpoint }) : t("ai.found.noModels", { endpoint: f.endpoint }) };
        }),
        discovering, discoverStatus,
        formOpen, addVisible: !formOpen, noKeyField: p.key === "none",
        formTitle: draft.id ? t("ai.form.change", { name: draft.name }) : t("ai.form.add"),
        providerName: p.label,
        providerNote: t(`ai.note.${p.group}`),
        providerMenu: GROUPS.map((g) => ({ id: g, label: t(`ai.group.${g}`), items: AI_PROVIDERS.filter((x) => x.group === g).map((x) => ({ id: x.id, label: x.label, checked: x.id === draft.provider })) })),
        name: draft.name, endpoint: draft.endpoint, model: draft.model, deployment: draft.deployment, apiVersion: draft.apiVersion, account: draft.account,
        showEndpoint: p.endpointEditable, showModel: !azure, showDeployment: azure, showApiVersion: azure, showAccount: p.fields.includes("account"),
        showKey: p.key !== "none",
        keyLabel: t(p.key === "required" ? "ai.key.label" : "ai.key.labelOptional"),
        keyState: draft.id && draftHasKey ? t("ai.key.keep") : p.key === "required" ? t("ai.key.needed") : t("ai.key.optional"),
        hasModels: models.length > 0,
        modelMenu: [{ id: "models", items: models.map((m) => ({ id: m.id, label: m.cloud && p.group === "local" ? t("ai.model.cloud", { id: m.id }) : m.id, checked: m.id === draft.model })) }],
        modelsStatus,
        destination: t("ai.destination", { host: destination(draft.provider, draft.endpoint, draft.account), where: where(p.group, draft.endpoint || p.endpoint) }),
        testInfo: t("ai.test.info"),
        status,
        cannotSave: busy || (azure ? !draft.deployment.trim() : !draft.model.trim()) || (p.endpointEditable && !draft.endpoint.trim()) || (p.fields.includes("account") && !draft.account.trim()),
      };
    },
  });

  const reg = (id: string, run: (a: Record<string, unknown>) => unknown, extra: Partial<Parameters<CommandRegistry<St>["register"]>[0]> = {}) =>
    commands.register({ id, title: `command.${id}`, ...extra, run: async (a: Record<string, unknown>) => { await run(a ?? {}); } });
  const input = (): AiConnectionInput => ({ ...(draft.id ? { id: draft.id } : {}), provider: draft.provider, name: draft.name, endpoint: draft.endpoint, model: draft.model, deployment: draft.deployment, apiVersion: draft.apiVersion, account: draft.account });
  const openForm = (d: Draft, hasKey = false) => { draft = d; draftHasKey = hasKey; models = []; modelsStatus = ""; formOpen = true; status = ""; changed(); };

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
    if (c) openForm({ id: c.id, provider: c.provider, name: c.name, endpoint: c.endpoint, model: c.model, deployment: c.deployment, apiVersion: c.apiVersion, account: c.account }, c.hasKey);
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
    if (!ai || typeof a.value !== "string") return;
    try {
      apply(await ai.remove(a.value));
      status = t("ai.removed");
    } catch (e) {
      status = reason(e, "ai.error.save");
    }
    changed();
  });
  reg("ai.writer", async (a) => {
    if (!ai || typeof a.value !== "string") return;
    try {
      apply(await ai.writer(a.value));
      status = t("ai.writer.set", { name: writerConnection()?.name ?? "" });
    } catch (e) {
      status = reason(e, "ai.error.save");
    }
    changed();
  });
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
      discoverStatus = t(found.length ? "ai.found.some" : "ai.found.none", { n: found.length });
    } catch {
      discoverStatus = t("ai.found.none", { n: 0 });
    } finally {
      discovering = false;
      changed();
      announce(discoverStatus);
    }
  });
  reg("ai.useFound", (a) => {
    const f = found[Number(a.value)];
    if (!f) return;
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
    await commands.run("settings.open");
    await commands.run("settings.setSection", { value: "ai" });
  });

  // ---- the Rewrite modal ----
  let open = false, selection = "", prompt = "", tab = "0", phase: Phase = "empty", errorText = "";
  let options: string[] = [];
  let request = 0;
  const presetText = (p: (typeof PRESETS)[number]) => t(`rewrite.preset.${p}.prompt`);
  const closeModal = () => { request++; open = false; options = []; phase = "empty"; changed(); };
  const itemSchema = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const } } };
  viewModels.register({
    id: "vm.rewrite",
    schema: { type: "object", properties: {
      ...Object.fromEntries(["selection", "prompt", "tab", "result", "generateLabel", "errorText", "actions", "writerLabel"].map((k) => [k, { type: "string" as const }])),
      ...Object.fromEntries(["open", "generating", "results", "error", "empty", "needsSetup", "hasWriter", "concise", "warmer", "grammar"].map((k) => [k, { type: "boolean" as const }])),
      options: { type: "array", items: itemSchema },
    } },
    select: () => {
      const w = writerConnection();
      return {
        open, selection, prompt, tab, errorText,
        writerLabel: w ? t("rewrite.writer", { name: w.name, detail: describe(w) }) : "",
        result: options[Number(tab)] ?? "",
        generating: phase === "generating", results: phase === "results", error: phase === "error",
        needsSetup: !w, hasWriter: Boolean(w),
        actions: !w ? "setup" : phase === "results" ? "results" : phase === "generating" ? "busy" : "compose",
        empty: !prompt.trim(),
        concise: prompt === presetText("concise"), warmer: prompt === presetText("warmer"), grammar: prompt === presetText("grammar"),
        generateLabel: t(phase === "error" ? "rewrite.retry" : "rewrite.generate"),
        options: options.map((_, i) => ({ id: String(i), label: t("rewrite.option", { n: i + 1 }) })),
      };
    },
  });

  reg("rewrite.open", () => {
    if (open) return;
    // The editor answers with the selection (rewrite.captured).
    editorAction("rewrite.capture");
  }, { icon: "rename", shortcut: { default: "Mod+Shift+R" }, layer: "writer", group: "editing", enabled: (s) => Boolean(ai) && s.note.status === "ready" });
  reg("rewrite.captured", async (a) => {
    const text = typeof a.text === "string" ? a.text : "";
    if (!text.trim()) {
      announce(t("rewrite.selectFirst"));
      return;
    }
    request++;
    open = true; selection = text; prompt = ""; tab = "0"; phase = "empty"; options = []; errorText = "";
    store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false } }));
    await load();
  });
  reg("rewrite.dismiss", (a) => { if (a.open !== true) closeModal(); });
  reg("rewrite.prompt", (a) => { prompt = String(a.value ?? ""); changed(); });
  reg("rewrite.preset", (a) => {
    const p = PRESETS.find((x) => x === a.value);
    if (p) { prompt = presetText(p); changed(); }
  });
  reg("rewrite.tab", (a) => { tab = String(a.value ?? "0"); changed(); });
  reg("rewrite.generate", async () => {
    if (!ai || !prompt.trim() || phase === "generating") return;
    const current = ++request;
    phase = "generating";
    changed();
    try {
      const result = await ai.rewrite({ text: selection, instruction: prompt.trim() });
      if (current !== request) return;
      options = result.options.filter((o) => typeof o === "string" && o.trim()).slice(0, 3);
      if (!options.length) throw new Error("empty");
      phase = "results"; tab = "0";
      announce(t("rewrite.ready"));
    } catch (e) {
      if (current !== request) return;
      phase = "error";
      errorText = reason(e, "ai.error.provider");
    }
    changed();
  });
  reg("rewrite.accept", () => {
    const text = options[Number(tab)];
    if (!text) return;
    editorAction("rewrite.apply", { text });
  });
  reg("rewrite.applied", (a) => {
    if (a.ok === true) {
      closeModal();
      announce(t("rewrite.replaced"));
      return;
    }
    phase = "error";
    errorText = t("rewrite.error.stale");
    changed();
  });
}
