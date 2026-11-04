import data from "./data.json" with { type: "json" };
import customize from "./customize.view.json" with { type: "json" };
import scan from "./scan.view.json" with { type: "json" };

const full = structuredClone(customize);
full.root.children[0]!.children[1]!.props.items = { get: "vm.toolbarMock.pinned" };

const targets = (stage: string) => data.targets.map((target, i) => ({
  ...target,
  status: stage === "checking" || stage === "partial" && i > 1 ? "checking"
    : stage === "error" && i === 0 ? "error"
    : stage === "none" || stage === "error" || stage === "partial" && i === 1 ? "none"
    : [0, 1, 7].includes(i) ? "found" : "none",
  result: stage === "error" && i === 0 ? "Connection interrupted"
    : stage === "none" || stage === "error" || stage === "partial" && i === 1 ? "Not running" : target.result,
}));

/** Design-only toolbar and AI discovery screens, with local sample data and no app commands. */
export const toolbarMocks = {
  id: "toolbar",
  label: "Mocks: Toolbar and AI scan (5 November)",
  models: { toolbarMock: {
    ...data,
    room: data.pinned.slice(0, 4),
    checking: targets("checking"), partial: targets("partial"), found: targets("found"),
    none: targets("none"), error: targets("error"),
  } },
  views: { customize, full, scan },
  entries: [
    { id: "toolbar.customize", label: "Customize toolbar", view: "customize", local: { full: false, entry: "mock.toolbar.customize" } },
    { id: "toolbar.customize-full", label: "Customize a full toolbar", view: "full", local: { full: true, entry: "mock.toolbar.customize-full" } },
    { id: "toolbar.scan", label: "Find AI apps: scan stages", view: "scan" },
  ],
};
