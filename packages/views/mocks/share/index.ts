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

type Entry = { id: string; label: string; view: string; local?: Record<string, string | number | boolean> };

export const shareMocks = {
  id: "share",
  label: "Mocks: Sharing and publishing",
  models: { mockShare: data },
  views: { flow, shares, invite, publish },
  entries: [
    { id: "share.entry", label: "1. Share… from a Files row or the ⋯ menu", view: "flow" },
    { id: "share.folder", label: "2. Share dialog: a folder", view: "flow", local: { open: "share", target: "book" } },
    { id: "share.note", label: "3. Share dialog: a note with a passcode", view: "flow", local: { open: "share", target: "focus", passcode: true } },
    { id: "share.review", label: "4. Review contents over the share dialog", view: "flow", local: { open: "share", target: "book", review: true } },
    { id: "share.first", label: "5. First share: turn on sharing for the project", view: "flow", local: { open: "share", target: "book", sharingOn: false } },
    { id: "share.states", label: "6. Share dialog states: offline, signed out, large folder, deleted", view: "flow", local: { open: "share", target: "book", scenario: "offline" } },
    { id: "share.list", label: "7. Settings → Sharing: all shares, Withdraw, Extend, Copy again, Turn off sharing", view: "shares" },
    { id: "share.invite", label: "8. Invite people to a project", view: "invite" },
    { id: "share.publish", label: "9. Publish… and Preview site", view: "publish" },
  ] as Entry[],
};
