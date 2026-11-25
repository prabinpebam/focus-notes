/**
 * D-408 review board for Area A (canvas) and B (settings): the real dialog and card nodes, lifted by id from
 * canvas.view.json and settings.view.json and shown open over fake data, so the board always matches the views.
 * Strict design: nothing is wired; the mock only renders.
 */
import canvas from "../../views/canvas.view.json" with { type: "json" };
import settings from "../../views/settings.view.json" with { type: "json" };
import shared from "../data.json" with { type: "json" };
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

// Every view-model read points at the board's fake data instead: vm.x.y → vm.dialogsA.x.y.
function remap(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(remap);
  if (!isNode(v)) return v;
  const out: Node = {};
  for (const [k, c] of Object.entries(v)) {
    out[k] = (k === "get" || k === "bind") && typeof c === "string" && c.startsWith("vm.") ? `vm.dialogsA.${c.slice(3)}` : remap(c);
  }
  // The board has no setters: a bound field shows its fake value read-only.
  if (isNode(out.value) && typeof out.value.bind === "string") out.value = { get: out.value.bind };
  return out;
}

const lift = (doc: unknown, id: string): Node => {
  const n = find(doc, id);
  if (!n) throw new Error(`dialogs-a mock: no node #${id}`);
  const { when: _when, ...rest } = remap(n) as Node;
  return rest;
};
// A popover card shown open beside its trigger, as the person sees it after pressing the trigger.
const openCard = (id: string) => {
  const n = lift(canvas, id);
  return { ...n, props: { ...(n.props as Node), placement: "bottom", open: true } };
};

const page = (child: Node) => ({
  focus: String(child.id),
  root: { type: "Surface", props: { variant: "canvas" }, children: [
    { type: "Stack", props: { gap: "stackSection", padding: "insetLg", align: "start" }, children: [child] },
  ] },
});

const repo = (name: string, repository: string, backingUp: boolean) => ({
  visible: true, state: backingUp ? "syncing" : "pending", label: `${name} backup`, icon: backingUp ? "cloudUp" : "cloud",
  tone: backingUp ? "accent" : "warning", backingUp, name, stateText: backingUp ? "Backing up…" : "Not backed up yet",
  repositoryLink: true, hasRepository: true, repository, backupTime: "Last backed up today at 9:12",
  waitingText: "3 notes waiting for backup", canBackUp: !backingUp, backupReason: "Already backing up",
});

export const dialogsAMocks = {
  id: "dialogsa",
  label: "Mocks: two-column dialogs and cards, canvas and settings (D-408)",
  models: { dialogsA: {
    saveState: {
      backupVisible: true, state: "pending", label: "Saved on this computer", text: "", cardLabel: "Backup", interactive: true, icon: "cloud", tone: "warning",
      backingUp: false, backupTime: "Last backed up yesterday at 18:40", waitingText: "2 notes waiting for backup",
      canBackUp: true, backupReason: "Already backing up",
    },
    syncAlert: {
      active: false, headerAlert: false, cause: "", icon: "warning", tone: "warning", busy: false,
      title: "", line: "", progress: 0, progressLabel: "", hasProgress: false,
      facts: [{ id: "a", text: "" }], primary: "", hasPrimary: false, secondary: "", hasSecondary: false,
      notNow: "", hasNotNow: false, alertLabel: "", cornerState: "error", cornerText: "", cornerOpen: false, headerOpen: false,
    },
    repoBackup: { private: repo("Private notes", "prabin/notes-private", false), public: repo("Public notes", "prabin/notes", true) },
    imageCaption: {
      open: true, writing: false, generateDisabled: false, hasResult: true, applying: false, useDisabled: false, loading: false,
      preview: shared.harbourSrc, connectionName: "Ollama", connectionModel: "llava:13b", connectionWhere: "On this computer",
      chosen: "Ollama", choices: [{ id: "c0", items: [{ id: "ollama", label: "Ollama" }] }],
      result: "Boats moored in a calm harbour at dawn, hills behind.", noVision: false,
      instruction: "Describe the image in one sentence.", disclosure: "The image goes to Ollama on this computer.", error: "",
    },
    sharingSettings: {
      firstOpen: true, repo: "prabin/notes-shared", setupSite: "prabin.github.io/notes", more: false, moreIcon: "chevronRight", busy: false,
      setupStatus: "", setupProblem: false, problem: "", firstAcceptLabel: "Turn on sharing",
    },
    shareProgress: { show: false, op: "", steps: [{ id: "site", label: "Make your notes site", state: "waiting", icon: "globe", tone: "neutral", busy: false, stateLabel: "Not started yet" }], line: "", still: "", failedStep: "" },
    project: { name: "Field notes" },
  } },
  views: {
    backup: page(openCard("backupDetails")),
    repoPrivate: page(openCard("repoBackup-private")),
    repoPublic: page(openCard("repoBackup-public")),
    caption: page(lift(canvas, "imageCaption")),
    sharingFirst: page(lift(compose(settings), "sharingFirst")),
  },
  entries: [
    { id: "dialogsa.backup", label: "1. Backup details card (writing window corner)", view: "backup" },
    { id: "dialogsa.repoPrivate", label: "2. Private notes backup card (Files)", view: "repoPrivate" },
    { id: "dialogsa.repoPublic", label: "3. Public notes backup card, backing up (Files)", view: "repoPublic" },
    { id: "dialogsa.caption", label: "4. Auto caption with AI", view: "caption" },
    { id: "dialogsa.sharingFirst", label: "5. Turn on sharing", view: "sharingFirst" },
  ],
};
