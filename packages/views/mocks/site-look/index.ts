/**
 * Website look (owner, 26 November; D-430): one theme and font for the project's website, used by both its
 * published pages (n/) and its shared notes' reader page (s/). Proposed in Settings → Sharing, below the real
 * site card (taken from settings.view.json), with a live sample in the chosen look. A change rebuilds the site
 * with D-427's steps; a failure keeps the choice and offers Retry. Strict design: fake data, nothing wired.
 */
import settings from "../../views/settings.view.json" with { type: "json" };
import look from "./look.view.json" with { type: "json" };
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

const siteCard = find(compose(settings), (n) => n.type === "ItemCard" && isNode(n.props) && n.props.icon === "globe" && isNode(n.when) && n.when.get === "vm.sharingSettings.on");
if (!siteCard) throw new Error("site-look mock: no site card in Settings → Sharing");
const withCard = (v: unknown): unknown => Array.isArray(v) ? v.map(withCard)
  : !isNode(v) ? v : v.mock === "siteCard" ? siteCard : Object.fromEntries(Object.entries(v).map(([k, c]) => [k, withCard(c)]));
const page = (state: string) => remap(withCard(compose(look)), state) as Node;

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
  sharingPreview: { busy: Boolean(o.busy) },
  siteLook: {
    themes: data.themes, fonts: data.fonts, theme: o.theme, font: o.font, busy: Boolean(o.busy),
    sampleBlocks: data.sampleBlocks, failed: Boolean(o.failed), problem: o.failed ? data.problem : "",
  },
  shareProgress: {
    show: o.at !== undefined, steps: steps(o.at ?? 0, o.failed),
    line: o.busy ? data.line : "", still: "",
  },
});

export const siteLookMocks = {
  id: "sitelook",
  label: "Mocks: website look (D-430)",
  models: { siteLookMock: {
    current: model({ theme: "paper", font: "serif" }),
    changing: model({ theme: "dusk", font: "sans", busy: true, at: 2 }),
    failed: model({ theme: "dusk", font: "sans", at: 2, failed: true }),
  } },
  views: { current: page("current"), changing: page("changing"), failed: page("failed") },
  entries: [
    { id: "sitelook.current", label: "1. Settings → Sharing → Website look: the current look", view: "current" },
    { id: "sitelook.changing", label: "2. Changed to Dusk and Sans: the website is updating", view: "changing" },
    { id: "sitelook.failed", label: "3. Stopped at a step: the choice is kept, Retry carries on", view: "failed" },
  ],
};
