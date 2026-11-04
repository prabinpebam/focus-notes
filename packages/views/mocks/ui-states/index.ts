import data from "./data.json" with { type: "json" };
import hub from "./hub.view.json" with { type: "json" };
import d1 from "./d1.view.json" with { type: "json" };
import d2 from "./d2.view.json" with { type: "json" };
import d3 from "./d3.view.json" with { type: "json" };
import d4 from "./d4.view.json" with { type: "json" };
import d5 from "./d5.view.json" with { type: "json" };
import d6 from "./d6.view.json" with { type: "json" };
import d7 from "./d7.view.json" with { type: "json" };
import d8 from "./d8.view.json" with { type: "json" };

/** Before/after review surfaces over fake data; no app setting or service is connected. */
export const uiStatesMocks = {
  id: "uistates",
  label: "Mocks: UI states",
  models: { mockUiStates: data },
  views: { hub, d1, d2, d3, d4, d5, d6, d7, d8 },
  entries: [
    { id: "uistates.hub", label: "UI states review hub", view: "hub" },
    ...Array.from({ length: 8 }, (_, i) => ({ id: `uistates.d${i + 1}`, label: `UI states: slice ${i + 1}`, view: `d${i + 1}` })),
  ],
};
