/**
 * Sharing and publishing mocks (strict design, not wired): view documents over fake data, reachable
 * from the gallery under "Mocks: Sharing and publishing". Each entry opens a view with its own
 * starting local state, so each step of a flow has a direct link. Spec: design/views/sharing.md.
 */
import data from "./data.json" with { type: "json" };
import flow from "./flow.view.json" with { type: "json" };
import shares from "./shares.view.json" with { type: "json" };
import invite from "./invite.view.json" with { type: "json" };
import publish from "./publish.view.json" with { type: "json" };
import delivery from "./delivery.view.json" with { type: "json" };
import siteEmpty from "./site-empty.view.json" with { type: "json" };
import deliveryData from "./delivery-data.json" with { type: "json" };
import pipeline from "./pipeline.view.json" with { type: "json" };
import versions from "./versions.view.json" with { type: "json" };
import pipelineData from "./pipeline-data.json" with { type: "json" };

type Entry = { id: string; label: string; view: string; local?: Record<string, string | number | boolean> };

export const shareMocks = {
  id: "share",
  label: "Mocks: Sharing and publishing",
  models: { mockShare: data, mockPublishing: deliveryData, mockPipeline: pipelineData },
  views: { flow, shares, invite, publish, delivery, siteEmpty, pipeline, versions },
  entries: [
    { id: "share.entry", label: "1. Share… from a Files row or the ⋯ menu", view: "flow" },
    { id: "share.folder", label: "2. Share dialog: a folder", view: "flow", local: { open: "share", target: "book" } },
    { id: "share.note", label: "3. Share dialog: a note with a passcode", view: "flow", local: { open: "share", target: "focus", passcode: true } },
    { id: "share.review", label: "4. Review contents over the share dialog", view: "flow", local: { open: "share", target: "book", review: true } },
    { id: "share.first", label: "5. First share: turn on sharing for the project", view: "flow", local: { open: "share", target: "book", sharingOn: false } },
    { id: "share.offline", label: "6. Share dialog: offline", view: "flow", local: { open: "share", target: "book", scenario: "offline" } },
    { id: "share.signedOut", label: "7. Share dialog: signed out", view: "flow", local: { open: "share", target: "book", scenario: "signedOut" } },
    { id: "share.large", label: "8. Share dialog: a large folder", view: "flow", local: { open: "share", target: "book", scenario: "large" } },
    { id: "share.deleted", label: "9. Share dialog: the item was deleted", view: "flow", local: { open: "share", target: "book", scenario: "deleted" } },
    { id: "share.mac", label: "10. Share dialog on macOS (Share… opens the share sheet)", view: "flow", local: { open: "share", target: "book", system: "macos" } },
    { id: "share.publish", label: "11. Publish… a note", view: "flow", local: { open: "publish", target: "focus" } },
    { id: "share.list", label: "12. Settings → Sharing: all shares, Withdraw, Extend, Copy again, Turn off sharing", view: "shares" },
    { id: "share.invite", label: "13. Invite people: an organization project", view: "invite" },
    { id: "share.invitePersonal", label: "14. Invite people: a personal-account project", view: "invite", local: { owner: "personal" } },
    { id: "share.preview", label: "15. Preview site", view: "publish" },
    { id: "publish.entry", label: "16. Publishing: Files and ⋯ → Note", view: "delivery" },
    { id: "publish.confirm", label: "17. Publish: first-time confirmation", view: "delivery", local: { open: "publish" } },
    { id: "publish.saving", label: "18. Publish: saving to GitHub", view: "delivery", local: { state: "saving" } },
    { id: "publish.publishing", label: "19. Publish: publishing", view: "delivery", local: { state: "publishing" } },
    { id: "publish.live", label: "20. Publish: published; Open Share for Live", view: "delivery", local: { state: "live" } },
    { id: "publish.slow", label: "21. Publish: taking longer", view: "delivery", local: { state: "slow" } },
    { id: "publish.failed", label: "22. Publish: not live yet, Retry", view: "delivery", local: { state: "failed" } },
    { id: "publish.copied", label: "23. Publish: copy link before live", view: "delivery", local: { state: "copied" } },
    { id: "publish.unpublish", label: "24. Unpublish: confirmation", view: "delivery", local: { state: "live", open: "unpublish" } },
    { id: "publish.removing", label: "25. Unpublish: removing from site", view: "delivery", local: { state: "removing" } },
    { id: "publish.removed", label: "26. Unpublish: removed from site", view: "delivery", local: { state: "removed" } },
    { id: "publish.images", label: "27. Publish: note with images", view: "delivery", local: { open: "publish", images: true } },
    { id: "publish.empty", label: "28. Website: empty home", view: "siteEmpty" },
    { id: "publish.missing", label: "29. Website: missing page", view: "siteEmpty", local: { missing: true } },
    { id: "publishP.choices", label: "P00 · Publishing recommendations P1–P3 (not approved)", view: "versions", local: { choices: true } },
    { id: "publishP.private", label: "P01 · Private: existing cloud backup", view: "pipeline", local: { state: "private" } },
    { id: "publishP.public", label: "P02 · Public: publish → local disk", view: "pipeline" },
    { id: "publishP.live", label: "P03 · Live: globe → publish → disk; URL tooltip", view: "pipeline", local: { state: "live", live: true } },
    { id: "publishP.pending", label: "P04 · Publishing: inspectable progress icon", view: "pipeline", local: { state: "progress", live: true, step: 3, status: "syncing" } },
    { id: "publishP.error", label: "P05 · Failure: recovery icon; previous page stays live", view: "pipeline", local: { state: "failed", live: true, step: 3, status: "error" } },
    { id: "publishP.ahead", label: "P06 · Local draft ahead: inspect the publish icon", view: "pipeline", local: { state: "ahead", live: true, status: "pending" } },
    { id: "publishP.ready", label: "P07 · Card: ready for first publish", view: "pipeline", local: { open: true } },
    { id: "publishP.update", label: "P08 · Card: ready to update published", view: "pipeline", local: { state: "update", live: true, open: true } },
    { id: "publishP.save", label: "P09 · Step 1: save locally", view: "pipeline", local: { state: "progress", open: true, live: true, step: 0, status: "syncing" } },
    { id: "publishP.commit", label: "P10 · Step 2: commit", view: "pipeline", local: { state: "progress", open: true, live: true, step: 1, status: "syncing" } },
    { id: "publishP.push", label: "P11 · Step 3: push", view: "pipeline", local: { state: "progress", open: true, live: true, step: 2, status: "syncing" } },
    { id: "publishP.build", label: "P12 · Step 4: GitHub Actions build", view: "pipeline", local: { state: "progress", open: true, live: true, step: 3, status: "syncing" } },
    { id: "publishP.deploy", label: "P13 · Step 5: deploy", view: "pipeline", local: { state: "progress", open: true, live: true, step: 4, status: "syncing" } },
    { id: "publishP.check", label: "P14 · Step 6: verify live revision", view: "pipeline", local: { state: "progress", open: true, live: true, step: 5, status: "syncing" } },
    { id: "publishP.slow", label: "P15 · Card: slow Actions run, keep writing", view: "pipeline", local: { state: "slow", open: true, live: true, step: 3, status: "syncing" } },
    { id: "publishP.failed", label: "P16 · Card: build failure, troubleshoot, retry, revert", view: "pipeline", local: { state: "failed", open: true, live: true, step: 3, status: "error" } },
    { id: "publishP.success", label: "P17 · Verified success: bottom pill, newer draft retained", view: "pipeline", local: { state: "success", live: true, step: 6 } },
    { id: "publishP.draft", label: "P18 · Version review: local draft", view: "versions", local: { version: "draft" } },
    { id: "publishP.published", label: "P19 · Version review: published, read-only", view: "versions", local: { version: "published" } },
    { id: "publishP.compare", label: "P20 · Compare: pinned published and draft text", view: "versions" },
    { id: "publishP.revert", label: "P21 · Card: confirm revert; local draft stays safe", view: "pipeline", local: { state: "failed", open: true, live: true, step: 3, status: "error", revert: true } },
    { id: "publishP.complete", label: "P22 · Card: verified live, all six steps complete", view: "pipeline", local: { state: "success", open: true, live: true, step: 6, pill: false } },
    { id: "publishP.deployFailed", label: "P23 · Card: Actions deployment failure", view: "pipeline", local: { state: "failed", open: true, live: true, step: 4, status: "error", failure: "deploy" } },
    { id: "publishP.checkFailed", label: "P24 · Card: live check failure, no duplicate deployment", view: "pipeline", local: { state: "failed", open: true, live: true, step: 5, status: "error", failure: "check" } },
    { id: "publishP.firstFailed", label: "P25 · Card: first publish failed, no globe or revert", view: "pipeline", local: { state: "failed", open: true, step: 3, status: "error" } },
  ] as Entry[],
};
