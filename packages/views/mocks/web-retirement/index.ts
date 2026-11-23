import data from "./data.json" with { type: "json" };
import exportView from "./export.view.json" with { type: "json" };

type Entry = { id: string; label: string; view: string; local?: Record<string, string | number | boolean> };

/** WEB-01 (D-292): the one-time draft export shown before browser writing is removed. Mock only, nothing wired. */
export const webRetirementMocks = {
  id: "webRetirement",
  label: "Mocks: Browser writing retirement",
  models: { mockWebRetirement: data },
  views: { export: exportView },
  entries: [
    { id: "webRetirement.ready", label: "1. Drafts found · Export drafts", view: "export" },
    { id: "webRetirement.exporting", label: "2. Exporting", view: "export", local: { state: "exporting" } },
    { id: "webRetirement.done", label: "3. Exported · then the website", view: "export", local: { state: "done" } },
    { id: "webRetirement.failed", label: "4. Export failed · drafts kept, try again", view: "export", local: { state: "failed" } }
  ] satisfies Entry[] as Entry[]
};
