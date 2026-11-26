/**
 * Site appearance (owner, 26 November; D-430, D-431): the real Settings → Sharing pane from settings.view.json over
 * fake data: Share settings (the site card) and Site appearance (theme, font, a live sample). A change rebuilds the
 * site with D-427's steps; a failure keeps the choice and offers Retry.
 */
import settings from "../../views/settings.view.json" with { type: "json" };
import data from "./data.json" with { type: "json" };
import { compose } from "../../src/compose.ts";

type Node = Record<string, unknown>;
const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && !Array.isArray(v);

function find(v: unknown, test: (n: Node) => boolean): Node | undefined {
  if (Array.isArray(v)) { for (const c of v) { const f = find(c, test); if (f) return f; } return undefined; }
  if (!isNode(v)) return undefined;
  if (test(v)) return v;
  for (const c of Object.values(v)) { const f = find(c, test); if (f) return f; }
  return undefined;
}

// Every view-model read points at one state's fake data: vm.x.y → vm.siteLookMock.<state>.x.y.
function remap(v: unknown, state: string): unknown {
  if (Array.isArray(v)) return v.map((c) => remap(c, state));
  if (!isNode(v)) return v;
  const out: Node = {};
  for (const [k, c] of Object.entries(v)) {
    out[k] = (k === "get" || k === "bind") && typeof c === "string" && c.startsWith("vm.") ? `vm.siteLookMock.${state}.${c.slice(3)}` : remap(c, state);
  }
  if (isNode(out.value) && typeof out.value.bind === "string") out.value = { get: out.value.bind };
  return out;
}

const pane = find(compose(settings), (n) => Array.isArray(n.children) && n.children.some((c) => isNode(c) && c.id === "siteAppearance"));
if (!pane) throw new Error("site-look mock: no Site appearance in Settings → Sharing");
const page = (state: string) => ({
  focus: "siteAppearanceTheme",
  root: { type: "Surface", props: { variant: "canvas", scroll: true }, children: [
    { type: "Center", props: { maxWidth: "wideContent" }, children: [
      { type: "Stack", props: { gap: "stackSection", padding: "insetLg" }, children: [
        { type: "Heading", props: { level: "2", value: { t: "settings.section.sharing" } } },
        remap(pane, state),
      ] },
    ] },
  ] },
});

const STATE = { done: "Done", running: "Working on this now", waiting: "Not started yet", failed: "Stopped here" } as const;
const steps = (at: number, failed = false) => data.steps.labels.map((label, i) => {
  const state = i < at ? "done" : i === at ? failed ? "failed" : "running" : "waiting";
  return {
    id: String(i), label, state, busy: state === "running", stateLabel: STATE[state],
    icon: state === "done" ? "check" : state === "failed" ? "error" : data.steps.icons[i]!,
    tone: state === "done" ? "success" : state === "failed" ? "danger" : state === "running" ? "accent" : "neutral",
  };
});
const model = (o: { theme: string; font: string; busy?: boolean; at?: number; failed?: boolean }) => ({
  project: data.project,
  sharingSettings: data.sharingSettings,
  sharingPreview: { busy: false, showProgress: false, stepped: false, parts: [{ id: "0", label: "", icon: "document", tone: "neutral", busy: false }], progress: 0, progressLabel: "", elapsed: "",
    failed: false, problem: "", stillPublishing: false, cancelled: false, cancelLabel: "", canCancel: false, cancelReason: "" },
  siteAppearance: {
    show: true, themes: data.themes, fonts: data.fonts, theme: o.theme, font: o.font, busy: Boolean(o.busy),
    sampleBlocks: data.sampleBlocks, failed: Boolean(o.failed), problem: o.failed ? data.problem : "", progress: o.at !== undefined,
  },
  shareProgress: { show: o.at !== undefined, op: o.at === undefined ? "" : "look", steps: steps(o.at ?? 0, o.failed), line: o.busy ? data.line : "", still: "", failedStep: "" },
});

export const siteLookMocks = {
  id: "sitelook",
  label: "Mocks: site appearance (D-430)",
  models: { siteLookMock: {
    current: model({ theme: "paper", font: "serif" }),
    changing: model({ theme: "dusk", font: "sans", busy: true, at: 2 }),
    failed: model({ theme: "dusk", font: "sans", at: 2, failed: true }),
  } },
  views: { current: page("current"), changing: page("changing"), failed: page("failed") },
  entries: [
    { id: "sitelook.current", label: "1. Settings → Sharing: Share settings and Site appearance", view: "current" },
    { id: "sitelook.changing", label: "2. Changed to Dusk and Sans: the website is updating", view: "changing" },
    { id: "sitelook.failed", label: "3. Stopped at a step: the choice is kept, Retry carries on", view: "failed" },
  ],
};
