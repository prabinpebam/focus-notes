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

type Entry = { id: string; label: string; view: string; local?: Record<string, string | number | boolean> };

export const shareMocks = {
  id: "share",
  label: "Mocks: Sharing and publishing",
  models: { mockShare: data, mockPublishing: deliveryData },
  views: { flow, shares, invite, publish, delivery, siteEmpty },
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
  ] as Entry[],
};
