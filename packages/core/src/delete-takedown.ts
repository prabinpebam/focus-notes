/**
 * D-428, the owner (25 Nov): deleting a shared or published note takes it down first. Its link is turned off and
 * its page taken down, the website updated, and only then is the note deleted on this computer, so a failed
 * takedown never leaves a note gone here but still readable there. Until it's done the Files row stays, marked
 * Deleting…, with a card of these steps; a failed step offers Retry (carrying on from that step) or Delete anyway.
 */
import type { MessageCatalog } from "./messages.ts";
import { siteProblemKey } from "./site-problem.ts";

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
  /**
   * Public notes of a Private + Public project (D-429): their pages are built from the files themselves, so the note is
   * deleted first (to the trash and history, so Undo and Recently deleted still bring it back) and the site rebuilt after.
   */
  publicPages: number;
  /** The notes are deleted on this computer. */
  deleted: boolean;
  /** Their titles, for the rows that stay while the page comes down after the note is gone. */
  titles: string[];
}

/**
 * The steps a delete runs, in order. A share's link and a New project's published page come down before the note is
 * deleted; a Private + Public public note's page comes down after (its page is built from the file).
 */
export function deleteSteps(t: { grants: readonly string[]; published: readonly string[]; publicPages?: number }): DeleteStep[] {
  const steps: DeleteStep[] = [];
  if (t.grants.length) steps.push("link");
  if (t.published.length) steps.push("page");
  if (t.publicPages) return [...steps.filter((x) => x !== "page"), "note", "page", "site"];
  if (t.grants.length || t.published.length) steps.push("site");
  steps.push("note");
  return steps;
}

export function newDeleteJob(paths: string[], name: string, grants: string[], published: string[], now: number, publicPages = 0, titles: string[] = []): DeleteJob {
  return {
    id: paths[0]!, paths, name, grants, published, steps: deleteSteps({ grants, published, publicPages }),
    at: 0, failed: false, slow: false, busy: false, stepStarted: now, problem: "", withdrawn: [], unpublished: false, siteDirty: false,
    publicPages, deleted: false, titles,
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
  /** Rebuilds the site without what was removed (D-429's `takeDown`); resolves once the website serves it. */
  takeDown(): Promise<void>;
  /** Deletes the notes on this computer; false when it couldn't. */
  deleteLocal(): Promise<boolean>;
}

export class TakedownStop extends Error {
  readonly problem: string;
  constructor(problem: string) { super(problem); this.problem = problem; }
}

const siteProblem = (error: unknown, otherwise: string) => siteProblemKey(error)
  ?? (/sharing:pages|sharing:notlive/.test(error instanceof Error ? error.message : "") ? "files.deleting.problem.site" : otherwise);

/**
 * Runs (or resumes) a delete, step by step from where it stopped. Every takedown step before "Delete the note"
 * succeeds before the note is deleted; a failed step stops here, failed at that step, and nothing after it runs.
 */
export async function runDelete(get: () => DeleteJob, update: (patch: Partial<DeleteJob>) => void, deps: TakedownDeps, now: () => number = Date.now): Promise<boolean> {
  const go = (i: number) => { if (i > get().at) update({ at: i, slow: false, stepStarted: now() }); };
  update({ busy: true, failed: false, problem: "", slow: false, stepStarted: now() });
  try {
    const steps = get().steps;
    // A share was turned off but the website wasn't updated: that comes first on Retry.
    if (get().siteDirty) {
      if (!(await deps.redeploy().catch(() => false))) throw new TakedownStop("files.deleting.problem.site");
      update({ siteDirty: false });
    }
    for (let i = get().at; i < steps.length; i++) {
      go(i);
      const step = steps[i]!;
      if (step === "link") {
        for (const id of get().grants) {
          if (get().withdrawn.includes(id)) continue;
          let result: { deployed?: boolean };
          try { result = await deps.withdraw(id); }
          catch (error) { throw new TakedownStop(siteProblem(error, "files.deleting.problem.link")); }
          update({ withdrawn: [...get().withdrawn, id] });
          if (result.deployed === false) {
            update({ siteDirty: true });
            // The website update is its own step when it comes next; otherwise the link step names it.
            if (steps[i + 1] === "site") go(i + 1);
            throw new TakedownStop("files.deleting.problem.site");
          }
        }
      } else if (step === "page") {
        if (get().unpublished) continue;
        try {
          if (get().deleted && get().publicPages) await deps.takeDown();
          else await deps.unpublish(get().published);
        } catch (error) { throw new TakedownStop(siteProblem(error, "files.deleting.problem.page")); }
        update({ unpublished: true });
      } else if (step === "note") {
        if (get().deleted) continue;
        if (!(await deps.deleteLocal())) throw new TakedownStop("files.deleting.problem.note");
        update({ deleted: true });
      }
      // "site": the website update finished inside the step before it (its phases move the card here).
    }
    update({ at: steps.length, busy: false });
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
  if (!job) return { title: "", cardLabel: "", summary: "", icon: "delete", tone: "neutral", steps: [], line: "", still: "", failed: false, busy: false, problem: "", canAnyway: false, anywayWarning: "" };
  const what = takedownKind(job);
  const running = !job.failed && job.at < job.steps.length;
  const current = job.steps[Math.min(job.at, job.steps.length - 1)]!;
  const label = (step: DeleteStep) => catalog.format(`files.deleting.step.${step}.label`);
  const failedStep = job.at === 0 ? catalog.format("share.progress.failedAtFirst", { step: label(current) }) : catalog.format("share.progress.failedAt", { step: label(current) });
  return {
    title: catalog.format("files.deleting.title", { what: job.name }),
    cardLabel: catalog.format("files.deleting.cardLabel", { what: job.name }),
    summary: catalog.format(job.failed ? job.deleted ? "files.deleting.summary.failedAfter" : "files.deleting.summary.failed" : `files.deleting.summary.${job.publicPages ? "pageAfter" : what}`),
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
    // Delete anyway only while the note is still here; once it's gone, only Retry is left.
    canAnyway: job.failed && !job.deleted,
    anywayWarning: job.failed && !job.deleted ? catalog.format(`files.deleting.anywayWarning.${stillUp(job)}`) : "",
  };
}

/** What stays up if the note is deleted now: its link, its page, or both. */
function stillUp(job: DeleteJob): "link" | "page" | "both" {
  const link = job.grants.length > 0 && (job.withdrawn.length < job.grants.length || job.siteDirty);
  const page = (job.published.length > 0 || job.publicPages > 0) && !job.unpublished;
  return link && page ? "both" : link ? "link" : "page";
}
/** What a delete takes down: a link, a page, or both. */
function takedownKind(job: DeleteJob): "link" | "page" | "both" {
  const link = job.grants.length > 0, page = job.published.length > 0 || job.publicPages > 0;
  return link && page ? "both" : link ? "link" : "page";
}

/** The notification once it's done: which takedown happened, or, after Delete anyway, what stays up. */
export function deleteDoneKey(job: DeleteJob, anyway: boolean): string {
  if (anyway) return `files.deleting.doneAnyway.${stillUp(job)}`;
  return `files.deleting.done.${takedownKind(job)}`;
}

/** Every message key a delete reads, for the copy check. */
export function deleteMessageKeys(): string[] {
  const keys = ["files.deleting.title", "files.deleting.cardLabel", "files.deleting.mark", "files.deleting.stopped", "files.deleting.still", "files.deleting.anyway",
    "files.deleting.summary.failed", "files.deleting.summary.failedAfter", "files.deleting.summary.pageAfter", "files.confirm.shared", "files.confirm.sharedMany", "files.confirm.published", "files.confirm.publishedMany"];
  for (const w of ["link", "page", "both"]) keys.push(`files.deleting.summary.${w}`, `files.deleting.done.${w}`, `files.deleting.doneAnyway.${w}`, `files.deleting.anywayWarning.${w}`);
  for (const s of ["link", "page", "site", "note"] as const) keys.push(`files.deleting.step.${s}.label`, `files.deleting.step.${s}.line`, `files.deleting.problem.${s}`);
  return keys;
}
