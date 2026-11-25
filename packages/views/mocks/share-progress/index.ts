/**
 * D-427 review board: the real Turn on sharing dialog, composed with its stepper (`share.steps`), shown open over
 * fake data in each state the owner asked for: working, past the usual time, and stopped at a failed step.
 */
import settings from "../../views/settings.view.json" with { type: "json" };
import { compose } from "../../src/compose.ts";

type Node = Record<string, unknown>;
const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && !Array.isArray(v);

function find(v: unknown, id: string): Node | undefined {
  if (Array.isArray(v)) { for (const c of v) { const f = find(c, id); if (f) return f; } return undefined; }
  if (!isNode(v)) return undefined;
  if (v.id === id) return v;
  for (const c of Object.values(v)) { const f = find(c, id); if (f) return f; }
  return undefined;
}

// Every view-model read points at one state's fake data: vm.x.y → vm.shareProgressMock.<state>.x.y.
function remap(v: unknown, state: string): unknown {
  if (Array.isArray(v)) return v.map(c => remap(c, state));
  if (!isNode(v)) return v;
  const out: Node = {};
  for (const [k, c] of Object.entries(v)) {
    out[k] = (k === "get" || k === "bind") && typeof c === "string" && c.startsWith("vm.") ? `vm.shareProgressMock.${state}.${c.slice(3)}` : remap(c, state);
  }
  if (isNode(out.value) && typeof out.value.bind === "string") out.value = { get: out.value.bind };
  return out;
}

const dialog = (state: string): Node => {
  const n = find(compose(settings), "sharingFirst");
  if (!n) throw new Error("share-progress mock: no #sharingFirst");
  const { when: _when, ...rest } = remap(n, state) as Node;
  return { ...rest, id: `sharingFirst-${state}` };
};
const page = (child: Node) => ({
  focus: String(child.id),
  root: { type: "Surface", props: { variant: "canvas" }, children: [
    { type: "Stack", props: { gap: "stackSection", padding: "insetLg", align: "start" }, children: [child] },
  ] },
});

const labels = ["Make your notes site", "Upload your notes site", "GitHub puts your website up", "Your website is live"];
const icons = ["globe", "cloudUp", "sync", "globe"];
const steps = (at: number, failed = false) => labels.map((label, i) => {
  const state = i < at ? "done" : i === at ? failed ? "failed" : "running" : "waiting";
  return {
    id: String(i), label, state, busy: state === "running",
    icon: state === "done" ? "check" : state === "failed" ? "error" : icons[i]!,
    tone: state === "done" ? "success" : state === "failed" ? "danger" : state === "running" ? "accent" : "neutral",
    stateLabel: { done: "Done", running: "Working on this now", waiting: "Not started yet", failed: "Stopped here" }[state],
  };
});
const model = (o: { busy: boolean; at: number; failed?: boolean; line?: string; still?: string; problem?: string }) => ({
  sharingSettings: {
    firstOpen: true, repo: "prabin/notes-site", targetLabel: "What's created", repoTitle: "Public copy on GitHub", setupSite: "https://prabin.github.io/notes-site/", more: false, moreIcon: "chevronRight", busy: o.busy,
    setupStatus: o.busy ? "Turning on sharing…" : "", setupProblem: Boolean(o.problem), problem: o.problem ?? "",
    firstAcceptLabel: o.problem ? "Retry" : "Turn on sharing",
  },
  shareProgress: { show: true, op: "turnOn", steps: steps(o.at, o.failed), line: o.line ?? "", still: o.still ?? "", failedStep: "" },
  project: { name: "Field notes" },
});

export const shareProgressMocks = {
  id: "shareprogress",
  label: "Mocks: share and publish progress steps (D-427)",
  models: { shareProgressMock: {
    working: model({ busy: true, at: 2, line: "GitHub is putting your website up. This usually takes 1–2 minutes. 0:42" }),
    still: model({ busy: true, at: 2, line: "GitHub is putting your website up. This usually takes 1–2 minutes. 2:37",
      still: "Still working… GitHub is taking longer than usual. Nothing is lost: you can keep waiting, or close this and you’ll be told when it’s done." }),
    failed: model({ busy: false, at: 2, failed: true,
      problem: "Stopped at “GitHub puts your website up”. The steps before it are done and kept. GitHub couldn’t put your website up, even after trying twice. Your notes stay private. Retry in a minute." }),
  } },
  views: { working: page(dialog("working")), still: page(dialog("still")), failed: page(dialog("failed")) },
  entries: [
    { id: "shareprogress.working", label: "1. Turn on sharing: GitHub puts your website up", view: "working" },
    { id: "shareprogress.still", label: "2. Turn on sharing: still working past the usual time", view: "still" },
    { id: "shareprogress.failed", label: "3. Turn on sharing: stopped at a step, Retry carries on", view: "failed" },
  ],
};