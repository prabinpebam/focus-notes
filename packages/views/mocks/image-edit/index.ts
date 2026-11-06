import data from "./data.json" with { type: "json" };
import flow from "./flow.view.json" with { type: "json" };

type Entry = { id: string; label: string; view: string; local?: Record<string, string | number | boolean> };

export const imageEditMocks = {
  id: "imageEdit",
  label: "Mocks: Image editing",
  models: { mockImageEdit: data },
  views: { flow },
  entries: [
    { id: "imageEdit.selected", label: "1. Selected image → Edit image", view: "flow" },
    { id: "imageEdit.enter", label: "2. Edit image · drag the handles", view: "flow", local: { open: true } },
    { id: "imageEdit.handles", label: "3. Crop tightened around the boats", view: "flow", local: { open: true, x: 15, y: 20, width: 70, height: 65 } },
    { id: "imageEdit.dimensions", label: "Exact pixels · width, height and ratio lock", view: "flow", local: { open: true, x: 15, y: 20, width: 50, height: 57.14285714285714 } },
    { id: "imageEdit.aspect", label: "4. Aspect preset · 1:1", view: "flow", local: { open: true, ratio: "square", x: 0, y: 0, width: 56.25, height: 100 } },
    { id: "imageEdit.transform", label: "5. Rotate and flip", view: "flow", local: { open: true, rotation: "90", flipHorizontal: true, ratio: "square", width: 56.25 } },
    { id: "imageEdit.done", label: "6. Done · creates a copy", view: "flow", local: { open: true, x: 15, y: 20, width: 70, height: 65 } },
    { id: "imageEdit.result", label: "7. Result in the note", view: "flow", local: { applied: true, x: 15, y: 20, width: 70, height: 65 } },
    { id: "imageEdit.undo", label: "8. Ctrl+Z · original reference restored", view: "flow", local: { restored: true } },
    { id: "imageEdit.restore", label: "9. Restore original · an undoable note edit", view: "flow", local: { applied: true, x: 15, y: 20, width: 70, height: 65 } },
    { id: "imageEdit.error", label: "10. Save failed · keep the draft and retry", view: "flow", local: { open: true, failed: true } },
    { id: "imageEdit.missing", label: "11. Missing original", view: "flow", local: { scenario: "missing" } },
    { id: "imageEdit.readOnly", label: "12. Read-only note", view: "flow", local: { scenario: "readOnly" } }
  ] satisfies Entry[] as Entry[]
};
