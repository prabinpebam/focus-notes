import type { SiteRebuilder } from "./site-rebuild.ts";

/** What a backup reported: `problem` names an offline or failed one. */
export interface BackupResult { state: string; problem?: string }

/**
 * D-428 takedown after a delete (D-436, 27 November): the deleted notes are already off this computer, so the site
 * build doesn't need their backup first. The backup and the site run side by side, and the takedown finishes when
 * both have. In the Private + Public layout the site part joins the project's site rebuild: one owed or running for
 * this change already builds the site without the notes (it builds again if the source changed while it ran), and
 * `takeDown` then finds the site serving that source and deploys nothing more. It deploys itself only otherwise
 * (no rebuild, or one that failed). D-432's push gate still keeps the backup's push and the site's upload apart.
 */
export async function takeDownAfterDelete<T>(deps: {
  backup?: () => Promise<BackupResult>;
  rebuild?: Pick<SiteRebuilder, "request" | "idle">;
  takeDown: () => Promise<T>;
}): Promise<T> {
  const backup = (async () => {
    const report = await deps.backup?.();
    if (report?.state === "problem") throw new Error(`sharing:${report.problem === "offline" ? "offline" : "failed"}`);
  })();
  const site = (async () => {
    if (deps.rebuild) {
      deps.rebuild.request();
      await deps.rebuild.idle();
    }
    return deps.takeDown();
  })();
  const [backedUp, deployed] = await Promise.allSettled([backup, site]);
  if (backedUp.status === "rejected") throw backedUp.reason;
  if (deployed.status === "rejected") throw deployed.reason;
  return deployed.value;
}
