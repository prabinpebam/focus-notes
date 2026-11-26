/**
 * Deleting a shared or published note (owner, 25 November; D-428): the app's own Files panel and confirmation
 * dialog over fake data. The row stays, marked Deleting… with its own border as the pending arc, and its card
 * (shown on hover or focus) lists the steps; a stopped step offers Retry and Delete anyway. Spec:
 * documentations/design/views/files.html.
 */
import canvas from "../../views/canvas.view.json" with { type: "json" };
import panel from "../opened-files/data.json" with { type: "json" };
import { compose } from "../../src/compose.ts";

type Entry = { id: string; label: string; view: string; local?: Record<string, string | number | boolean> };
type Node = Record<string, unknown>;

const find = (node: unknown, test: (n: Node) => boolean): Node | undefined => {
  if (!node || typeof node !== "object") return undefined;
  const n = node as Node;
  if (test(n)) return n;
  for (const v of Object.values(n)) { const found = find(v, test); if (found) return found; }
  return undefined;
};

const MODELS = /^vm\.(files|project|deleted|recovered|deleting|confirm|syncAlert)\b/;
const mockOf = (node: unknown, model: string): unknown => {
  if (Array.isArray(node)) return node.map((n) => mockOf(n, model));
  if (!node || typeof node !== "object") return typeof node === "string" ? node.replace(MODELS, `vm.${model}.$1`) : node;
  return Object.fromEntries(Object.entries(node).filter(([k]) => k !== "on").map(([k, v]) => [k === "bind" ? "get" : k, mockOf(v, model)]));
};

const doc = compose(canvas);
const sheet = find(doc, (n) => n.type === "Sheet" && n.id === "files")!;
const tree = (sheet.children as Node[]).find((c) => c.id === "filesTree")!;
const { sectionEnd: _sectionEnd, ...treeSlots } = tree.slots as Node;
const { when: _when, ...sheetNode } = sheet;
const filesPanel: Node = { ...sheetNode, slots: { band: (sheet.slots as Node).band, header: (sheet.slots as Node).header }, children: [{ ...tree, slots: treeSlots }] };
const confirm = find(doc, (n) => n.type === "Dialog" && n.id === "confirm")!;

const view = (model: string, id: string) => ({ id: `gallery.mock.${id}`, focus: "files", root: mockOf(filesPanel, model) as Node });
const dialog = (model: string, id: string) => ({ id: `gallery.mock.${id}`, focus: "confirm", root: { type: "Stack", id: "deleteShared", children: [mockOf(confirm, model)] } });

const STATE: Record<string, string> = { done: "Done", running: "Working on this now", waiting: "Not started yet", failed: "Stopped here" };
const ICON: Record<string, string> = { link: "link", page: "globe", site: "sync", note: "delete" };
const LABEL: Record<string, string> = { link: "Turn off the link", page: "Take the page down", site: "Update your website", note: "Delete the note" };
const steps = (ids: string[], at: number, failed = false) => ids.map((id, i) => {
  const state = i < at ? "done" : i === at ? failed ? "failed" : "running" : "waiting";
  return { id, label: LABEL[id]!, state, stateLabel: STATE[state]!,
    icon: state === "done" ? "check" : state === "failed" ? "error" : ICON[id]!,
    tone: state === "done" ? "success" : state === "failed" ? "danger" : state === "running" ? "accent" : "neutral", busy: state === "running" };
});

const rows = (deleting?: "pending" | "failed") => panel.files.items.map((i) => i.id === "journal/weekly-review.md" && deleting
  ? { ...i, description: deleting === "failed" ? "Stopped" : "Deleting…", deleting } : i);
const closed = { open: false, title: "", message: "", confirmLabel: "", danger: true, icon: "delete", tone: "danger", shared: false, sharedText: "", published: false, publishedText: "" };
const idle = { title: "", cardLabel: "", summary: "", icon: "delete", tone: "neutral", steps: steps(["note"], 0), line: "", still: "", failed: false, busy: false, problem: "", canAnyway: false, anywayWarning: "" };
const model = (deleting: "pending" | "failed" | undefined, card: Node, confirmModel: Node = closed) => ({
  ...panel, files: { ...panel.files, focusId: "journal/weekly-review.md", items: rows(deleting) }, deleting: card, confirm: confirmModel,
  syncAlert: {
    active: false, headerAlert: false, cause: "", icon: "warning", tone: "warning", busy: false,
    title: "", line: "", progress: 0, progressLabel: "", hasProgress: false,
    facts: [{ id: "a", text: "" }], primary: "", hasPrimary: false, secondary: "", hasSecondary: false,
    notNow: "", hasNotNow: false, alertLabel: "", cornerState: "error", cornerText: "", cornerOpen: false, headerOpen: false,
  },
});

const running = {
  title: "Deleting “Weekly review”", cardLabel: "Deleting “Weekly review”: steps", summary: "The note is deleted once its link is off and its web page is down.",
  icon: "delete", tone: "neutral", steps: steps(["link", "page", "site", "note"], 2),
  line: "GitHub is updating your website. This usually takes 1–2 minutes. 1:48",
  still: "Still working… GitHub is taking longer than usual. Nothing is lost: you can keep working.",
  failed: false, busy: true, problem: "", canAnyway: false, anywayWarning: "",
};
const stopped = {
  ...running, summary: "The note isn't deleted yet. Nothing is lost.", icon: "error", tone: "danger", steps: steps(["link", "page", "site", "note"], 2, true), line: "", still: "",
  failed: true, busy: false, canAnyway: true,
  problem: "Stopped at “Update your website”. The steps before it are done and kept. GitHub’s build of your website failed. Retry.",
  anywayWarning: "Delete anyway deletes the note now, but its link keeps working and its web page stays up.",
};
const ask = (shared: boolean, published: boolean) => ({
  open: true, title: "Delete “Weekly review”?", message: "This deletes 1 note.", danger: true, icon: "delete", tone: "danger",
  confirmLabel: published ? "Delete and unpublish" : "Delete 1 note",
  shared, sharedText: shared ? "This note is shared. Deleting it also turns off its link, so people with the link can't open it." : "",
  published, publishedText: published ? "This note is published. Deleting it also takes its web page down." : "",
});

export const deleteSharedMocks = {
  id: "deleteShared",
  label: "Mocks: deleting a shared or published note (25 November, D-428)",
  models: {
    dsAskPlain: model(undefined, idle, ask(false, false)),
    dsAskShared: model(undefined, idle, ask(true, false)),
    dsAskBoth: model(undefined, idle, ask(true, true)),
    dsRunning: model("pending", running),
    dsStopped: model("failed", stopped),
  },
  views: {
    askPlain: dialog("dsAskPlain", "deleteShared.askPlainDoc"),
    askShared: dialog("dsAskShared", "deleteShared.askSharedDoc"),
    askBoth: dialog("dsAskBoth", "deleteShared.askBothDoc"),
    running: view("dsRunning", "deleteShared.runningDoc"),
    stopped: view("dsStopped", "deleteShared.stoppedDoc"),
  },
  entries: [
    { id: "deleteShared.askPlain", label: "1. Every delete asks: a private note that isn't shared", view: "askPlain" },
    { id: "deleteShared.askShared", label: "2. A shared note: its link goes too", view: "askShared" },
    { id: "deleteShared.askBoth", label: "3. Shared and published: its link and its web page go too", view: "askBoth" },
    { id: "deleteShared.running", label: "4. The row stays, Deleting…, the border is the arc; hover or focus it for the steps", view: "running" },
    { id: "deleteShared.stopped", label: "5. Stopped at Update your website: Retry, or Delete anyway", view: "stopped" },
  ] as Entry[],
};
