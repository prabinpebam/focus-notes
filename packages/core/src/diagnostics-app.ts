/**
 * Settings → About's diagnostics (QLT-04, D-55, D-140): a preview of what the diagnostic report
 * holds, as one card per part, and Copy diagnostic report and Save diagnostic report…, which are in
 * Spotlight too. The shell builds the report, redacts it, and copies or saves it
 * (`bridge.diagnostics`); the window only sends its timings summary (names and numbers, which the
 * shell checks again). Nothing is ever sent anywhere.
 */
import type { PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import { summarizeTimings, type DiagnosticsPreview, type TimingSummary } from "./diagnostics.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";

export interface DiagnosticsState {
  preview?: DiagnosticsPreview;
  loading: boolean;
  busy: boolean;
}
export const DIAGNOSTICS_IDLE: DiagnosticsState = { loading: false, busy: false };

interface S {
  ui: { settings: { diagnostics: DiagnosticsState } };
}

interface Ctx<St extends S> {
  store: Store<St>;
  bridge: PlatformBridge;
  catalog: MessageCatalog;
  commands: CommandRegistry<St>;
  viewModels: ViewModelRegistry<St>;
  toast: (message: string, opts?: { tone?: "info" | "error" }) => unknown;
}

/** The window's own measures, summarized: each name's count, p50, and p95 (Performance and quality → Measuring). */
export function windowTimings(): TimingSummary[] {
  const perf = (globalThis as { performance?: { getEntriesByType?: (t: string) => { name: string; duration: number }[] } }).performance;
  return summarizeTimings(perf?.getEntriesByType?.("measure") ?? []);
}

/** The preview's cards, in order: an icon, a title, and a detail. */
export const DIAGNOSTIC_PARTS = ["app", "git", "workspace", "journal", "compositing", "problems"] as const;

export function registerDiagnostics<St extends S>({ store, bridge, catalog, commands, viewModels, toast }: Ctx<St>) {
  const d = bridge.diagnostics;
  const state = () => store.state.ui.settings.diagnostics;
  const set = (patch: Partial<DiagnosticsState>) => store.update((s) => ({ ...s, ui: { ...s.ui, settings: { ...s.ui.settings, diagnostics: { ...s.ui.settings.diagnostics, ...patch } } } }));
  const available = () => Boolean(d);

  commands.register({
    id: "diagnostics.load", title: "command.diagnostics.load", enabled: available,
    run: async () => {
      if (!d) return;
      set({ loading: true });
      const preview = await d.preview().catch(() => undefined);
      set({ loading: false, ...(preview ? { preview } : {}) });
    },
  });
  commands.register({
    id: "diagnostics.copy", title: "command.diagnostics.copy", icon: "copy", group: "app", enabled: available,
    disabledReason: "command.diagnostics.reason",
    run: async () => {
      if (!d || state().busy) return;
      set({ busy: true });
      const ok = await d.copy(windowTimings()).then(() => true, () => false);
      set({ busy: false });
      toast(catalog.format(ok ? "diagnostics.copied" : "diagnostics.failed"), ok ? {} : { tone: "error" });
    },
  });
  commands.register({
    id: "diagnostics.save", title: "command.diagnostics.save", icon: "save", group: "app", enabled: available,
    disabledReason: "command.diagnostics.reason",
    run: async () => {
      if (!d || state().busy) return;
      set({ busy: true });
      const saved = await d.save(windowTimings()).catch(() => null);
      set({ busy: false });
      if (saved === null) toast(catalog.format("diagnostics.failed"), { tone: "error" });
      else if (saved) toast(catalog.format("diagnostics.saved"));
    },
  });

  const CARD = { type: "object" as const, properties: { title: { type: "string" as const }, detail: { type: "string" as const } } };
  viewModels.register({
    id: "vm.diagnostics",
    schema: {
      type: "object",
      properties: {
        ready: { type: "boolean" }, loading: { type: "boolean" }, busy: { type: "boolean" },
        ...Object.fromEntries(DIAGNOSTIC_PARTS.map((p) => [p, CARD])),
      },
    },
    reads: ["ui.settings.diagnostics"],
    select: (s) => {
      const st = s.ui.settings.diagnostics;
      const p = st.preview;
      const f = (key: string, values?: Record<string, string | number>) => (p ? catalog.format(`diagnostics.${key}`, values) : "");
      return {
        ready: Boolean(p), loading: st.loading && !p, busy: st.busy,
        app: { title: f("app.title", { version: p?.version ?? "" }), detail: f("app.detail", { os: p?.os ?? "", electron: p?.electron ?? "" }) },
        git: { title: p?.git ? f("git.title", { version: p.git }) : f("git.missing"), detail: f(`git.helper.${p?.helper ?? "other"}`) },
        workspace: { title: f("workspace.title", { count: p?.repositories ?? 0 }), detail: f("workspace.detail", { ahead: p?.ahead ?? 0, behind: p?.behind ?? 0, conflicts: p?.conflicts ?? 0 }) },
        journal: { title: f("journal.title"), detail: f("journal.detail", { count: p?.journal ?? 0 }) },
        compositing: { title: f("compositing.title"), detail: f(`compositing.${p?.compositing ?? "gpu"}`) },
        problems: { title: f("problems.title"), detail: f("problems.detail", { count: p?.problems ?? 0 }) },
      };
    },
  });
}
