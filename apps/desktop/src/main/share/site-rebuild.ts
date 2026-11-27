/**
 * D-436: the one website rebuild per project. Every trigger (a backup that moved notes in or out of the public
 * notes, an access change, a retry) only says "the site may be out of date"; one run at a time saves, builds the
 * whole site from the complete source as it is then, uploads it and waits for its Pages deploy. A trigger during a
 * run is never lost: it runs again after. The source signature is read before the build reads it, and remembered
 * only once that deploy succeeded; if the source changed while the build ran (a move committed after the build
 * read the notes, 27 November), it builds again. A failure keeps the rebuild owed and tries again with backoff,
 * and the owed flag is persisted so a restart picks it up. `dispose` stops everything (project closed).
 */
export interface SiteRebuildEvent { status: "built" | "failed"; problem?: string; attempt?: number }

export interface SiteRebuilder {
  /** The site may be out of date. `force`: build even if the source looks unchanged (an access change). */
  request(force?: boolean): void;
  /** Resolves once nothing is running or owed now (a scheduled retry counts as idle). For tests and shutdown. */
  idle(): Promise<void>;
  /** Whether a rebuild is owed (running, queued or waiting to retry). */
  owed(): boolean;
  dispose(): void;
}

export const REBUILD_RETRY_MS = [30_000, 60_000, 120_000, 300_000, 600_000] as const;

export function siteRebuilder(deps: {
  /** The complete source of the site now: what a build would read. */
  signature(): Promise<string>;
  /**
   * Saves, builds the whole site, uploads it and waits until Pages deployed it; throws on any failure. Unforced runs
   * come from a backup that just finished: nothing is left to save, and a site already serving this source stays.
   */
  deploy(forced: boolean): Promise<void>;
  /** Persists whether a rebuild is owed, so it survives a restart. */
  persist?(owed: boolean): void | Promise<void>;
  /** Owed from an earlier run of the app: build once at start. */
  owedAtStart?: boolean;
  report?(event: SiteRebuildEvent): void;
  retryMs?: readonly number[];
}): SiteRebuilder {
  let seen: string | undefined;
  let dirty = false, force = false, disposed = false, failures = 0, owedNow = false;
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waits = deps.retryMs ?? REBUILD_RETRY_MS;
  const setOwed = (value: boolean) => {
    if (owedNow === value) return;
    owedNow = value;
    void Promise.resolve(deps.persist?.(value)).catch(() => {});
  };
  const loop = async () => {
    while (dirty && !disposed) {
      dirty = false;
      const forced = force;
      force = false;
      let before: string;
      try { before = await deps.signature(); } catch { before = `unreadable:${Date.now()}`; }
      if (!forced && before === seen) continue;
      try { await deps.deploy(forced); }
      catch (error) {
        if (disposed) return;
        const problem = error instanceof Error ? error.message : "sharing:failed";
        const wait = waits[Math.min(failures, waits.length - 1)]!;
        failures++;
        deps.report?.({ status: "failed", problem, attempt: failures });
        // Owed until it lands: the next trigger, or the retry, builds again.
        timer = setTimeout(() => { timer = undefined; schedule(forced); }, wait);
        timer.unref?.();
        return;
      }
      if (disposed) return;
      seen = before;
      failures = 0;
      deps.report?.({ status: "built" });
      // A change that landed while the build ran (after it read the source) is built too.
      let after: string | undefined;
      try { after = await deps.signature(); } catch { after = undefined; }
      if (after !== before) dirty = true;
    }
    if (!disposed && !timer) setOwed(false);
  };
  const schedule = (withForce = false) => {
    if (disposed) return;
    dirty = true;
    force ||= withForce;
    setOwed(true);
    if (timer) { clearTimeout(timer); timer = undefined; }
    if (running) return;
    const run = running = loop().finally(() => { if (running === run) running = undefined; if (dirty && !disposed && !timer) schedule(); });
  };
  if (deps.owedAtStart) schedule(true);
  return {
    request: (withForce = false) => schedule(withForce),
    async idle() { while (running) await running; },
    owed: () => owedNow,
    dispose() { disposed = true; if (timer) clearTimeout(timer); timer = undefined; },
  };
}
