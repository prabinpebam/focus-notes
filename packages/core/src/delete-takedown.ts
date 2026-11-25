/**
 * D-428, the owner (25 Nov): deleting a shared or published note takes it down first. Its link is turned off and
 * its page taken down, the website updated, and only then is the note deleted on this computer, so a failed
 * takedown never leaves a note gone here but still readable there. Until it's done the Files row stays, marked
 * Deleting…, with a card of these steps; a failed step offers Retry (carrying on from that step) or Delete anyway.
 */
import type { MessageCatalog } from "./messages.ts";

export type DeleteStep = "link" | "page" | "site" | "note";

const ICONS: Record<DeleteStep, string> = { link: "link", page: "globe", site: "sync", note: "delete" };

export interface DeleteJob {
  /** The row it's for: the first path deleted. */
  id: string;
  paths: string[];
  /** The quoted name, or "3 items". */
  name: string;
  /** The active shares of the deleted notes, turned off first. */
  grants: string[];
  /** The deleted notes' pages on the website (relative to the private notes), taken down next. */
  published: string[];
  steps: DeleteStep[];
  /** The running (or failed) step; `steps.length` once done. */
  at: number;
  failed: boolean;
  /** The runtime said the current step is past its usual time. */
  slow: boolean;
  /** A step is running (Retry and Delete anyway wait). */
  busy: boolean;
  stepStarted: number;
  /** Why it stopped, as a message key. */
  problem: string;
  /** Shares already turned off: a Retry doesn't turn them off again. */
  withdrawn: string[];
  /** The page is down. */
  unpublished: boolean;
  /** A share was turned off but the website update after it failed: Retry only updates the website. */
  siteDirty: boolean;
}

/** The steps a delete runs, in order: the takedown first, the note last. */
export function deleteSteps(t: { grants: readonly string[]; published: readonly string[] }): DeleteStep[] {
  const steps: DeleteStep[] = [];
  if (t.grants.length) steps.push("link");
  if (t.published.length) steps.push("page");
  if (t.grants.length || t.published.length) steps.push("site");
  steps.push("note");
  return steps;
}

export function newDeleteJob(paths: string[], name: string, grants: string[], published: string[], now: number): DeleteJob {
  return {
    id: paths[0]!, paths, name, grants, published, steps: deleteSteps({ grants, published }),
    at: 0, failed: false, slow: false, busy: false, stepStarted: now, problem: "", withdrawn: [], unpublished: false, siteDirty: false,
  };
}

/** What the takedown needs from the shell. Each rejects, or reports false, when it couldn't. */
export interface TakedownDeps {
  /** Turns one share's link off; `deployed: false` when the website update after it failed. */
  withdraw(id: string): Promise<{ deployed?: boolean }>;
  /** Updates the website with the saved shares again; true once it's live. */
  redeploy(): Promise<boolean>;
  /** Takes the pages down; resolves once the website no longer has them. */
  unpublish(rels: readonly string[]): Promise<void>;
  /** Deletes the notes on this computer; false when it couldn't. */
  deleteLocal(): Promise<boolean>;
}

export class TakedownStop extends Error {
  readonly problem: string;
  constructor(problem: string) { super(problem); this.problem = problem; }
}

/**
 * Runs (or resumes) a delete, in order. The note is deleted only after every takedown step succeeded; a failed step
 * stops here with the job failed at that step, and nothing after it runs.
 */
export async function runDelete(get: () => DeleteJob, update: (patch: Partial<DeleteJob>) => void, deps: TakedownDeps, now: () => number = Date.now): Promise<boolean> {
  const go = (step: DeleteStep) => {
    const at = get().steps.indexOf(step);
    if (at >= 0 && at !== get().at) update({ at, slow: false, stepStarted: now() });
  };
  update({ busy: true, failed: false, problem: "", slow: false, stepStarted: now() });
  try {
    if (get().siteDirty) {
      go("site");
      if (!(await deps.redeploy().catch(() => false))) throw new TakedownStop("files.deleting.problem.site");
      update({ siteDirty: false });
    }
    for (const id of get().grants) {
      if (get().withdrawn.includes(id)) continue;
      go("link");
      let result: { deployed?: boolean };
      try { result = await deps.withdraw(id); }
      catch (error) { throw new TakedownStop(/sharing:pages/.test(error instanceof Error ? error.message : "") ? "files.deleting.problem.site" : "files.deleting.problem.link"); }
      update({ withdrawn: [...get().withdrawn, id] });
      if (result.deployed === false) {
        update({ siteDirty: true });
        go("site");
        throw new TakedownStop("files.deleting.problem.site");
      }
    }
    if (get().published.length && !get().unpublished) {
      go("page");
      try { await deps.unpublish(get().published); }
      catch { throw new TakedownStop("files.deleting.problem.page"); }
      update({ unpublished: true });
    }
    go("note");
    if (!(await deps.deleteLocal())) throw new TakedownStop("files.deleting.problem.note");
    update({ at: get().steps.length, busy: false });
    return true;
  } catch (error) {
    update({ failed: true, busy: false, slow: false, problem: error instanceof TakedownStop ? error.problem : "files.deleting.problem.note" });
    return false;
  }
}

/** A runtime phase while a takedown step runs: the website update is its own step; `slow` marks a long wait. */
export function deletePhase(job: DeleteJob, phase: string, now: number): Partial<DeleteJob> | undefined {
  if (job.failed || !job.busy) return undefined;
  if (phase === "slow") return { slow: true };
  const current = job.steps[job.at];
  // The website update that follows the last takedown step shows as Update your website.
  const last = job.steps[job.steps.indexOf("site") - 1];
  if (phase === "deploy" && current === last) return { at: job.steps.indexOf("site"), slow: false, stepStarted: now };
  return undefined;
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** What the deleting row's card shows. */
export function deleteCardView(job: DeleteJob | undefined, catalog: MessageCatalog, now: number) {
  if (!job) return { title: "", cardLabel: "", summary: "", icon: "delete", tone: "neutral", steps: [], line: "", still: "", failed: false, busy: false, problem: "", anywayWarning: "" };
  const what = job.grants.length && job.published.length ? "both" : job.grants.length ? "link" : "page";
  const running = !job.failed && job.at < job.steps.length;
  const current = job.steps[Math.min(job.at, job.steps.length - 1)]!;
  const label = (step: DeleteStep) => catalog.format(`files.deleting.step.${step}.label`);
  const failedStep = job.at === 0 ? catalog.format("share.progress.failedAtFirst", { step: label(current) }) : catalog.format("share.progress.failedAt", { step: label(current) });
  return {
    title: catalog.format("files.deleting.title", { what: job.name }),
    cardLabel: catalog.format("files.deleting.cardLabel", { what: job.name }),
    summary: catalog.format(job.failed ? "files.deleting.summary.failed" : `files.deleting.summary.${what}`),
    icon: job.failed ? "error" : "delete", tone: job.failed ? "danger" : "neutral",
    steps: job.steps.map((step, i) => {
      const state = i < job.at ? "done" : i === job.at ? job.failed ? "failed" : "running" : "waiting";
      return {
        id: step, label: label(step), state,
        icon: state === "done" ? "check" : state === "failed" ? "error" : ICONS[step],
        tone: state === "done" ? "success" : state === "failed" ? "danger" : state === "running" ? "accent" : "neutral",
        busy: state === "running", stateLabel: catalog.format(`share.progress.state.${state}`),
      };
    }),
    line: running ? `${catalog.format(`files.deleting.step.${current}.line`)} ${clock(Math.max(0, Math.floor((now - job.stepStarted) / 1000)))}` : "",
    still: running && job.slow ? catalog.format("files.deleting.still") : "",
    failed: job.failed, busy: job.busy,
    problem: job.failed ? `${failedStep} ${catalog.format(job.problem || "files.deleting.problem.note")}` : "",
    anywayWarning: job.failed && current !== "note" ? catalog.format(`files.deleting.anywayWarning.${stillUp(job)}`) : "",
  };
}

/** What stays up if the note is deleted now: its link, its page, or both. */
function stillUp(job: DeleteJob): "link" | "page" | "both" {
  const link = job.grants.length > 0 && (job.withdrawn.length < job.grants.length || job.siteDirty);
  const page = job.published.length > 0 && !job.unpublished;
  return link && page ? "both" : link ? "link" : "page";
}

/** The notification once it's done: which takedown happened, or, after Delete anyway, what stays up. */
export function deleteDoneKey(job: DeleteJob, anyway: boolean): string {
  if (anyway) return `files.deleting.doneAnyway.${stillUp(job)}`;
  const link = job.grants.length > 0, page = job.published.length > 0;
  return `files.deleting.done.${link && page ? "both" : link ? "link" : "page"}`;
}

/** Every message key a delete reads, for the copy check. */
export function deleteMessageKeys(): string[] {
  const keys = ["files.deleting.title", "files.deleting.cardLabel", "files.deleting.mark", "files.deleting.stopped", "files.deleting.still", "files.deleting.anyway",
    "files.deleting.summary.failed", "files.confirm.shared", "files.confirm.sharedMany", "files.confirm.published", "files.confirm.publishedMany"];
  for (const w of ["link", "page", "both"]) keys.push(`files.deleting.summary.${w}`, `files.deleting.done.${w}`, `files.deleting.doneAnyway.${w}`, `files.deleting.anywayWarning.${w}`);
  for (const s of ["link", "page", "site", "note"] as const) keys.push(`files.deleting.step.${s}.label`, `files.deleting.step.${s}.line`, `files.deleting.problem.${s}`);
  return keys;
}
