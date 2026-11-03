import { setTimeout as delay } from "node:timers/promises";
import { displayShareCode, SealError, SiteReader, type Grant, type SiteFetch } from "@focus-notes/seal";

export async function waitForPublishedShare(o: {
  grant: Grant; publish: () => Promise<void>; get: SiteFetch; signal: AbortSignal;
  timeoutMs?: number; delayMs?: number;
}): Promise<void> {
  const checkCancelled = () => { if (o.signal.aborted) throw new Error("access:cancelled"); };
  checkCancelled();
  const until = Date.now() + (o.timeoutMs ?? 600_000);
  await o.publish();
  while (Date.now() < until) {
    checkCancelled();
    let fetchFailure: unknown;
    const reader = new SiteReader(async (p) => {
      try { return await o.get(p); }
      catch (error) { fetchFailure = error; throw error; }
    });
    try {
      const opened = [];
      if (o.grant.link) opened.push(await reader.openLinkSession(o.grant.id, o.grant.link.secret));
      if (o.grant.passcode && o.grant.shareCode) opened.push(await reader.openAccessCode(`${displayShareCode(o.grant.shareCode)} ${o.grant.passcode.value}`));
      if (opened.length && opened.every(({ share }) =>
        (share.expiresAt ?? null) === (o.grant.expiresAt ?? null) &&
        (!(o.grant.scope.ids ?? o.grant.scope.notes)?.length || share.notes.length === (o.grant.scope.ids ?? o.grant.scope.notes)!.length))) {
        for (const { share } of opened) if (share.notes[0]) await share.read(share.notes[0].path);
        checkCancelled();
        return;
      }
    } catch (error) {
      checkCancelled();
      if (fetchFailure !== undefined) throw fetchFailure;
      if (!(error instanceof SealError)) throw error;
      // A push is not deployment: retry the encrypted reader against a fresh manifest.
    }
    try { await delay(Math.min(o.delayMs ?? 5000, Math.max(1, until - Date.now())), undefined, { signal: o.signal }); }
    catch (error) { checkCancelled(); throw error; }
  }
  throw new Error("access:notReady");
}
