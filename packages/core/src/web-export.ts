/**
 * One-time browser draft export before browser writing is removed (WEB-01, D-292, D-412).
 * Pure state machine with no DOM or IndexedDB dependency so it can be tested directly.
 * Never deletes or mutates browser drafts: failed or cancelled export leaves every draft intact.
 */
import { bundleFileName, makeBundle } from "./notes.ts";
import type { JsonSchema } from "./view-models.ts";

export type WebExportPhase = "checking" | "ready" | "exporting" | "done" | "failed" | "empty";

export interface BrowserDraft {
  path: string;
  text: string;
  updated: number;
}

export interface WebExportState extends Record<string, unknown> {
  phase: WebExportPhase;
  count: number;
  exportingLabel: string;
}

/** The commands `webExport.view.json` runs. */
export const WEB_EXPORT_COMMANDS = ["webExport.export", "webExport.download"] as const;

/** The view model `webExport.view.json` binds against (`vm.webExport`). */
export const WEB_EXPORT_VIEW_MODEL: { id: string; schema: JsonSchema & { type: "object"; properties: Record<string, JsonSchema> } } = {
  id: "vm.webExport",
  schema: {
    type: "object",
    properties: {
      phase: { type: "string", enum: ["checking", "ready", "exporting", "done", "failed", "empty"] },
      count: { type: "integer" },
      exportingLabel: { type: "string" },
    },
    required: ["phase", "count", "exportingLabel"],
  },
};

export interface WebExportOptions {
  /** Reads all non-deleted drafts currently kept in this browser. Must not delete anything. */
  readDrafts: () => Promise<BrowserDraft[]>;
  /** Saves the serialized JSON export bundle locally. */
  saveBundle: (fileName: string, content: string) => void | Promise<void>;
  /** Opens the website's download section or releases page. */
  onDownload: () => void;
  /** Called when no browser drafts exist (so /app/ can redirect without showing the export step). */
  onEmpty?: () => void | Promise<void>;
  /** Localized busy label shown while exporting. */
  exportingLabel?: string;
  /** Clock override for deterministic tests. */
  now?: () => Date;
}

export interface WebExportController {
  readonly state: WebExportState;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  exportDrafts(): Promise<void>;
  download(): void;
}

export function createWebExportController(options: WebExportOptions): WebExportController {
  const now = options.now ?? (() => new Date());
  const exportingLabel = options.exportingLabel ?? "Exporting drafts…";
  let state: WebExportState = { phase: "checking", count: 0, exportingLabel };
  const listeners = new Set<() => void>();
  const set = (next: { phase: WebExportPhase; count: number }) => {
    state = { ...next, exportingLabel };
    for (const l of listeners) l();
  };

  return {
    get state() { return state; },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async start() {
      try {
        const drafts = await options.readDrafts();
        if (drafts.length === 0) {
          set({ phase: "empty", count: 0 });
          await options.onEmpty?.();
          return;
        }
        set({ phase: "ready", count: drafts.length });
      } catch {
        set({ phase: "failed", count: state.count });
      }
    },
    async exportDrafts() {
      if (state.phase === "exporting") return;
      set({ phase: "exporting", count: state.count });
      try {
        const drafts = await options.readDrafts();
        if (drafts.length === 0) {
          set({ phase: "empty", count: 0 });
          await options.onEmpty?.();
          return;
        }
        const at = now();
        const bundle = makeBundle(drafts, at);
        await options.saveBundle(bundleFileName(at), JSON.stringify(bundle, null, 2));
        set({ phase: "done", count: drafts.length });
      } catch {
        set({ phase: "failed", count: state.count });
      }
    },
    download() {
      options.onDownload();
    },
  };
}
