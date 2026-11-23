import type { ConfirmedSelection } from "./public-selection.ts";

/** Saving to GitHub → Publishing → Published, or Removing from your site (G3.5). */
export type PublicTaskStep = "saving" | "publishing" | "removing";
export interface PublicTaskResult { commit: string; published: readonly string[]; changed: readonly string[] }

/**
 * Publish and Unpublish as one leavable task per project (G3.1, G3.4, G3.5). The published set is
 * recorded only after the deployment of that exact commit succeeded, so a failed, offline or refused
 * deploy leaves the previous state and a plain Retry; it never reports Published early. Unpublish only
 * leaves the note out of the next site: the private note is never touched, and Git history and copies
 * readers already have stay (the caller states that). Closing a dialog doesn't stop a running task.
 */
export function publicPublishing(deps: {
  /** Notes on the current site, by notes-root-relative path. */
  current(): Promise<readonly string[]>;
  /** Records the deployed set; called only after `deploy` resolved. */
  record(paths: readonly string[]): Promise<void>;
  /** Stages, seals with the leak gate and publishes exactly `paths`, resolving with the deployed commit. */
  deploy(paths: readonly string[], selection: ConfirmedSelection, step: (step: PublicTaskStep) => void): Promise<string>;
  step?(step: PublicTaskStep): void;
}) {
  let running: Promise<PublicTaskResult> | undefined;
  const run = (work: () => Promise<PublicTaskResult>) => {
    if (running) throw new Error("sharing:busy");
    const task = running = work().finally(() => { if (running === task) running = undefined; });
    return task;
  };
  const deployAndRecord = async (next: string[], selection: ConfirmedSelection, changed: string[], first: PublicTaskStep) => {
    deps.step?.(first);
    const commit = await deps.deploy(next, selection, step => deps.step?.(step));
    await deps.record(next);
    return { commit, published: next, changed };
  };
  return {
    /** The running task, so a reopened dialog shows its status instead of starting another. */
    pending: () => running,
    publish: (selection: ConfirmedSelection) => run(async () => {
      const current = await deps.current();
      const next = [...new Set([...current, ...selection.notes])].sort();
      return deployAndRecord(next, selection, selection.notes.filter(p => !current.includes(p)), "saving");
    }),
    unpublish: (paths: readonly string[]) => run(async () => {
      const current = await deps.current();
      const changed = current.filter(p => paths.includes(p));
      if (!changed.length) throw new Error("sharing:scope");
      const next = current.filter(p => !paths.includes(p));
      return deployAndRecord(next, { notes: next }, changed, "removing");
    }),
  };
}
