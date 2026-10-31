/**
 * AI Rewrite and Settings → AI (the owner-approved Rewrite modal). Select text in a note, then
 * Ctrl+Shift+R (or Rewrite… in the text menu): the dialog shows the selection, a prompt and presets,
 * and Generate asks the Writer service, through the main process, for three alternatives. Accept
 * replaces the selection through the editor as one undo step; closing the dialog discards them.
 * The API key never enters this state: it crosses once from its field to the shell.
 */
import type { AiSettingsView, PlatformBridge } from "./bridge.ts";
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
const EMPTY_SETTINGS: AiSettingsView = { url: "", model: "", writer: false, hasKey: false };

export function registerAi<St extends S>({ store, bridge, catalog, commands, viewModels, editorAction, announce }: Ctx<St>) {
  const ai = bridge.ai;
  const changed = () => store.update((s) => ({ ...s }));
  const t = (key: string) => catalog.format(key);

  // ---- Settings → AI ----
  let saved: AiSettingsView = EMPTY_SETTINGS;
  let draft = { url: "", model: "", writer: true };
  let settingsStatus = "";
  let saving = false;
  const configured = () => Boolean(saved.url && saved.model && saved.writer);
  const load = async () => {
    if (!ai) return;
    saved = await ai.settings().catch(() => EMPTY_SETTINGS);
    draft = { url: saved.url, model: saved.model, writer: saved.url ? saved.writer : true };
    changed();
  };
  viewModels.register({
    id: "vm.ai",
    schema: { type: "object", properties: {
      url: { type: "string" }, model: { type: "string" }, writer: { type: "boolean" },
      keyState: { type: "string" }, status: { type: "string" }, cannotSave: { type: "boolean" },
    } },
    select: () => ({
      url: draft.url, model: draft.model, writer: draft.writer,
      keyState: t(saved.hasKey ? "ai.keySaved" : "ai.keyNone"),
      status: settingsStatus,
      cannotSave: saving || !draft.url.trim() || !draft.model.trim(),
    }),
  });
  const reg = (id: string, run: (a: Record<string, unknown>) => unknown, extra: Partial<Parameters<CommandRegistry<St>["register"]>[0]> = {}) =>
    commands.register({ id, title: `command.${id}`, ...extra, run: async (a: Record<string, unknown>) => { await run(a ?? {}); } });
  reg("ai.load", load);
  reg("ai.edit", (a) => {
    const field = String(a.field);
    if (field === "url" || field === "model") draft = { ...draft, [field]: String(a.value ?? "") };
    if (field === "writer") draft = { ...draft, writer: !draft.writer };
    settingsStatus = "";
    changed();
  });
  reg("ai.save", async (a) => {
    if (!ai || saving || !draft.url.trim() || !draft.model.trim()) return;
    const key = typeof a.key === "string" ? a.key : "";
    delete a.key;
    saving = true;
    settingsStatus = t("ai.saving");
    changed();
    try {
      saved = await ai.save({ url: draft.url.trim(), model: draft.model.trim(), writer: draft.writer, ...(key ? { key } : {}) });
      draft = { url: saved.url, model: saved.model, writer: saved.writer };
      settingsStatus = t("ai.saved");
    } catch (e) {
      settingsStatus = t(String((e as Error)?.message ?? "").includes("invalid-url") ? "ai.badUrl" : "ai.saveFailed");
    } finally {
      saving = false;
      changed();
    }
  });
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
      ...Object.fromEntries(["selection", "prompt", "tab", "result", "generateLabel", "errorText", "actions"].map((k) => [k, { type: "string" as const }])),
      ...Object.fromEntries(["open", "generating", "results", "error", "canGenerate", "empty", "needsSetup", "concise", "warmer", "grammar"].map((k) => [k, { type: "boolean" as const }])),
      options: { type: "array", items: itemSchema },
    } },
    select: () => ({
      open, selection, prompt, tab, errorText,
      result: options[Number(tab)] ?? "",
      generating: phase === "generating", results: phase === "results", error: phase === "error",
      needsSetup: !configured(),
      actions: !configured() ? "setup" : phase === "results" ? "results" : phase === "generating" ? "busy" : "compose",
      canGenerate: configured() && (phase === "empty" || phase === "error"),
      empty: !prompt.trim(),
      concise: prompt === presetText("concise"), warmer: prompt === presetText("warmer"), grammar: prompt === presetText("grammar"),
      generateLabel: t(phase === "error" ? "rewrite.retry" : "rewrite.generate"),
      options: options.map((_, i) => ({ id: String(i), label: catalog.format("rewrite.option", { n: i + 1 }) })),
    }),
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
      errorText = errorMessage(String((e as Error)?.message ?? ""));
    }
    changed();
  });
  const errorMessage = (raw: string) => {
    const code = ["not-configured", "secure-storage-unavailable", "unauthorized", "timeout", "network", "provider"].find((c) => raw.includes(c));
    return t(`rewrite.error.${code ?? "provider"}`);
  };
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
