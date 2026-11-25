import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";

interface WithProgress { ui: { share: { progress?: ShareProgress } }; tasks: readonly unknown[] }

/**
 * D-427: every long share or publish operation shows its real steps in plain words, the current one active,
 * done ones ticked and a failed one named; Retry carries on from the failed step. Each step lists the runtime
 * phases (`sharing:setupStep`, `sharing:publishStep`) that belong to it; the index never moves backwards, so a
 * resumed or repeated earlier phase never unticks a done step.
 */
export type ShareOperation = "turnOn" | "share" | "publish" | "unpublish" | "withdraw" | "turnOff";

export const SHARE_STEPS: Readonly<Record<ShareOperation, readonly { id: string; icon: string; from: readonly string[]; end?: true }[]>> = {
  turnOn: [
    { id: "site", icon: "globe", from: ["check", "create"] },
    { id: "upload", icon: "cloudUp", from: ["prepare", "pages", "push"] },
    { id: "build", icon: "sync", from: ["deploy"] },
    { id: "live", icon: "globe", from: ["ready"], end: true },
  ],
  share: [
    { id: "encrypt", icon: "lock", from: ["seal"] },
    { id: "upload", icon: "cloudUp", from: ["push"] },
    { id: "update", icon: "sync", from: ["deploy"] },
    { id: "link", icon: "link", from: ["verify"], end: true },
  ],
  publish: [
    { id: "prepare", icon: "document", from: ["saving", "seal"] },
    { id: "upload", icon: "cloudUp", from: ["push", "publishing"] },
    { id: "update", icon: "sync", from: ["deploy"] },
  ],
  unpublish: [
    { id: "prepare", icon: "document", from: ["removing", "seal"] },
    { id: "upload", icon: "cloudUp", from: ["push", "publishing"] },
    { id: "update", icon: "sync", from: ["deploy"] },
  ],
  withdraw: [
    { id: "save", icon: "save", from: ["save"] },
    { id: "upload", icon: "cloudUp", from: ["seal", "push"] },
    { id: "update", icon: "sync", from: ["deploy"] },
  ],
  turnOff: [
    { id: "keep", icon: "lock", from: ["check", "preserve"] },
    { id: "empty", icon: "delete", from: ["remove", "seal", "push"] },
    { id: "update", icon: "sync", from: ["deploy"] },
    { id: "off", icon: "cloudOff", from: ["off"], end: true },
  ],
};

export interface ShareProgress {
  op: ShareOperation | "";
  /** The running (or failed) step's index; `steps.length` once every step is done. */
  at: number;
  failed: boolean;
  /** The runtime said the current step is past its usual time. */
  slow: boolean;
  /** When the current step started, for its own elapsed time. */
  stepStarted: number;
}

export const SHARE_PROGRESS_IDLE: ShareProgress = { op: "", at: 0, failed: false, slow: false, stepStarted: 0 };

/** A fresh run, or a Retry that carries on from the failed step (its earlier steps stay ticked). */
export function shareProgressStart(op: ShareOperation, previous: ShareProgress, now: number): ShareProgress {
  const resume = previous.op === op && previous.failed ? previous.at : 0;
  return { op, at: resume, failed: false, slow: false, stepStarted: now };
}

/** A runtime phase: moves to its step (never backwards); `slow` marks the current step as taking longer. */
export function shareProgressStep(p: ShareProgress, phase: string, now: number): ShareProgress {
  if (!p.op || p.failed) return p;
  if (phase === "slow") return { ...p, slow: true };
  const steps = SHARE_STEPS[p.op];
  const index = steps.findIndex(step => step.from.includes(phase));
  // An end step's phase means the operation is finished: it shows done, not running.
  const target = steps[index]?.end ? steps.length : index;
  return index < 0 || target <= p.at ? p : { ...p, at: target, slow: false, stepStarted: now };
}

export const shareProgressDone = (p: ShareProgress): ShareProgress => p.op ? { ...p, at: SHARE_STEPS[p.op].length, failed: false, slow: false } : p;
export const shareProgressFail = (p: ShareProgress): ShareProgress => p.op ? { ...p, failed: true, slow: false } : p;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** What the stepper shows: the steps, the plain line with the step's elapsed time, and Still working past its usual time. */
export function shareProgressView(p: ShareProgress, catalog: MessageCatalog, now: number) {
  if (!p.op) return { show: false, steps: [], line: "", still: "", failedStep: "" };
  const steps = SHARE_STEPS[p.op];
  const running = !p.failed && p.at < steps.length;
  const current = steps[Math.min(p.at, steps.length - 1)]!;
  const seconds = Math.max(0, Math.floor((now - p.stepStarted) / 1000));
  const key = (id: string, part: string) => `share.progress.${p.op}.${id}.${part}`;
  return {
    show: true,
    steps: steps.map((step, i) => {
      const state = i < p.at ? "done" : i === p.at ? p.failed ? "failed" : "running" : "waiting";
      return {
        id: step.id, label: catalog.format(key(step.id, "label")), state,
        icon: state === "done" ? "check" : state === "failed" ? "error" : step.icon,
        tone: state === "done" ? "success" : state === "failed" ? "danger" : state === "running" ? "accent" : "neutral",
        busy: state === "running", stateLabel: catalog.format(`share.progress.state.${state}`),
      };
    }),
    line: running ? `${catalog.format(key(current.id, "line"))} ${clock(seconds)}` : "",
    still: running && p.slow ? catalog.format("share.progress.still") : "",
    failedStep: p.failed ? catalog.format(p.at === 0 ? "share.progress.failedAtFirst" : "share.progress.failedAt", { step: catalog.format(key(current.id, "label")) }) : "",
  };
}

/** Every message key a stepper reads, for the copy check. */
export function shareProgressKeys(): string[] {
  const keys = ["share.progress.still", "share.progress.failedAt", "share.progress.failedAtFirst", ...["done", "running", "waiting", "failed"].map(s => `share.progress.state.${s}`)];
  for (const [op, steps] of Object.entries(SHARE_STEPS)) for (const step of steps) for (const part of ["label", "line"]) keys.push(`share.progress.${op}.${step.id}.${part}`);
  return keys;
}

/** The one progress record in the store, moved by whichever command runs the operation. */
export function shareProgress<S extends WithProgress>(store: Store<S>, now: () => number = Date.now) {
  const get = () => store.state.ui.share.progress ?? SHARE_PROGRESS_IDLE;
  const put = (progress: ShareProgress) => store.update(s => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, progress } } }));
  return {
    get,
    start: (op: ShareOperation) => put(shareProgressStart(op, get(), now())),
    step: (phase: string) => put(shareProgressStep(get(), phase, now())),
    done: () => put(shareProgressDone(get())),
    fail: () => put(shareProgressFail(get())),
    /** The operation's own longer-wait message has taken over (Still publishing, O4). */
    quiet: () => put({ ...get(), slow: false }),
    clear: () => put(SHARE_PROGRESS_IDLE),
  };
}

/** `vm.shareProgress`: the stepper every share and publish dialog shows (`{ "use": "share.steps" }`). */
export function registerShareProgressView<S extends WithProgress>(viewModels: ViewModelRegistry<S>, catalog: MessageCatalog, now: () => number = Date.now) {
  const str = { type: "string" as const }, bool = { type: "boolean" as const };
  viewModels.register({
    id: "vm.shareProgress",
    schema: { type: "object", properties: {
      show: bool, line: str, still: str, failedStep: str, op: str,
      steps: { type: "array", items: { type: "object", properties: { id: str, label: str, icon: str, tone: str, busy: bool, state: str, stateLabel: str } } },
    } },
    // The tracker's tasks tick every second while an operation runs, which moves the elapsed clock.
    reads: ["ui.share.progress", "tasks"],
    select: s => {
      const p = s.ui.share.progress ?? SHARE_PROGRESS_IDLE;
      return { ...shareProgressView(p, catalog, now()), op: p.op };
    },
  });
}
