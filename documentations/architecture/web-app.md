# Website and browser retirement

GitHub Pages is a clean website, not a second place to write.

> [!NOTE]
> **TL;DR.** The owner dropped browser writing, browser-local IndexedDB notes, the owner vault, the editor demo and the browser-to-desktop ease-in plan completely on 3 November (D-292). Keep public read-only pages and the sealed read-only share reader, with the site's own theme. The current build still contains the old web app; WEB-01 / WP-P.13 removes it safely, without clearing existing drafts. This page replaces the old browser-app architecture; the stable route remains to preserve links.

**ACCEPTED by the owner on 3 November, 13:35:** retirement is approved to plan. There are no users; do not build a speculative migration programme. Keep one safety step: one-click local export of the owner's browser drafts, if any, before removal. No heavy storage inventory, byte-equivalent export or 30-day recovery gate. This task remains specification/planning only.

## What remains

| Surface | Contract |
| --- | --- |
| Public website | Public-only home, folder sections/counts, article excerpts/pages, minimal top navigation, optional project icon, independent theme and paragraph focus; [full experience](../experience/published-site.md) |
| Share reader | Link or single access-code field, read-only authorized scope, generic failure, optional remembered cryptographic key |
| Product site | Screenshots, explanation, downloads and Help; no writing demo |
| One-time recovery | Local recovery/export of drafts created by the retired app, never a continuing browser writing surface |

No hosted server is added. Dropping browser writing is a product/mental-model decision, not a claim that static browser-local editing is technically impossible. Sharing continues to decrypt in the browser, but that is reading, not an editor, private owner vault or note store.

The in-app **Preview site…** uses the exact website renderer with local theme/font/default size draft controls, not a reintroduced browser editor. Apply saves safe site settings, not a deployment. Public site repositories hold plaintext published source and opaque encrypted share output (D-299); the public index never exposes shared-only metadata. Old encrypted Git history cannot be recalled.

## Removing the old surfaces

WP-P.13 removes `/app/`, `/demo/`, root editor entry points in copied instances, writing navigation, Copy to my notes, browser welcome notes, owner Unlock and vault output, browser-export/import marketing, install-as-browser-app messaging and obsolete editor caches after the draft-export opportunity. Old URLs lead to the clean website with an honest download/help route, not a hidden editor. Redirects must not destroy or consume share fragments.

Keep published note URLs and `/s/` share links working. New access-code grants and legacy named grants use explicitly versioned readers; no new recipient names. See [Sharing](../design/views/sharing.md#the-share-reader).

## Preserving existing drafts

1. If this browser has the owner's drafts, show **“Save your browser drafts before browser writing is removed.”** with **Export drafts**. One action downloads the existing drafts locally in the supported export format; no sign-in, upload or per-note wizard.
2. If export fails/cancels, keep the drafts and offer **“Couldn't export your drafts. Try again.”** Do not remove the owner’s draft access on that failure. No drafts means no export step.
3. Then remove the retired editing surfaces/caches; do not clear note stores or share-reader remembered keys as a side effect. Keep only the small one-time export route if needed for the owner's remaining drafts, not an indefinite support/migration system.

The scope is the owner's own data, not a hypothetical user population. An export download/open check and failed-export preservation are sufficient planned evidence; no byte-equivalence corpus or fixed recovery-retention period.

## Three kinds of note

The old editable-browser / public / unlocked-private model is retired. New website visitors see public notes or the exact share they opened, read-only. Private unshared notes have no website output.

## Getting your own instance

Retired browser entry point: use the desktop app to create/open a private project. The website does not make an editable instance or public repository for a visitor.

## What the browser never does

It does not sign in to GitHub, write notes, hold a GitHub token, offer owner-vault access or host an AI model.

## Storage

No new browser note store. Preserve old stores for one-time recovery; optional non-extractable remembered share-reader keys remain separate and keep the existing origin warning/Forget behaviour.

## Your notes in this browser

Retired: no new browser note store, offline editor, persistence request or Copy to my notes. Existing drafts use only [one-time recovery](#preserving-existing-drafts).

## Unlocking private notes

Retired: no owner vault, passphrase setup or owner Unlock. A share link or access code opens only its grant, never every private note.

## Moving notes between the browser and GitHub

The ease-in plan is retired, not deferred. Recovery exports old drafts locally; ordinary desktop file import can read those files as it reads any supported files, without an advertised browser-to-desktop workflow or deleting either copy.

## Validation boundary

UC-SHARE-10 / WEB-01 / [MP.9](../plan/definition-of-done.md#projects-and-simpler-sharing) requires absent retired routes/navigation, intact public/share links, no owner-vault output and one-click owner-draft export when drafts exist. No runtime, real account or data migration is performed by this documentation slice.
