# Release notes

What each Focus Notes release brings, in the words a person who writes would use. The GitHub release lists every commit; this page is the short version, and the Store's *What's new* comes from it ([the template](../../store/listing.en-US.md#release-notes-template)).

> [!NOTE]
> **TL;DR.** **1.1.0 is a draft**: everything below is on `main` and was gated on Windows CI, but it isn't tagged or released yet; the owner tags it (see [Roadmap → Waiting on the owner](roadmap.md#waiting-on-the-owner)). 1.1.0 brings projects, sharing and a public website, images, Rewrite with AI, Actions and many fixes to saving, recovery and backup status. 1.0.0 to 1.0.2 are on [GitHub Releases](https://github.com/prabinpebam/focus-notes/releases).

## 1.1.0 (draft, 28 November 2026)

### Projects

- **Projects.** Each project is its own folder and window, with its own colour outline, pill and optional logo. Create one on this computer or on GitHub, open one from GitHub (only Focus Notes projects are listed), and reuse a copy that's already on this computer instead of downloading it again ([D-415](decisions.md#d-415-offer-a-copy-thats-already-here-before-downloading-again), [D-416](decisions.md#d-416-open-from-github-lists-only-focus-notes-projects)).
- **You always land in writing.** Every way into a project opens an empty Untitled note with the caret ready, or the note you had open last ([D-397](decisions.md#d-397-every-project-entry-opens-a-note-never-open-first), [D-420](decisions.md#d-420-an-existing-project-reopens-its-session-not-an-empty-note)). If the record of your last note can't be read, Focus Notes opens your most recent note or an empty one, says so once, and repairs the record. If a project's list of recent notes can't be read, the project still opens and is listed, you're told once, and the list is rebuilt.
- **A project's colour everywhere.** Inside a project window, links, focus rings, selection and buttons take the project's colour, adjusted per theme so text stays readable ([D-435](decisions.md#d-435-a-projects-colour-takes-every-accent-role-solved-per-theme)).
- **Delete a project**, in the app or on GitHub's website, with an optional copy of anything not yet backed up ([D-413](decisions.md#d-413-delete-linked-projects-on-github-web-with-automatic-detection-and-optional-unsynced-save)).
- **Files**: Opened files as tabs above Pinned ([D-410](decisions.md#d-410-opened-files-as-vertical-tabs-above-pinned)), New note in…, Rename file, Local notes, and marks on shared and published files ([D-431](decisions.md#d-431-shared-and-published-files-are-marked-in-files-and-each-shared-file-has-share-details)).

### Sharing and your website

- **Share… for every note**, with an access code, expiry, Extend and Withdraw; the message is written to the person receiving it ([D-409](decisions.md#d-409-share-information-is-written-to-the-recipient), [D-424](decisions.md#d-424-share-for-every-note-publish-and-unpublish-and-a-published-note-shares-its-address)). Copying a share is instant, and saving a shared note updates its shares ([D-433](decisions.md#d-433-copying-a-share-is-local-and-saving-a-shared-note-updates-its-shares)).
- **Publish and Unpublish** a note to your project's public website, checked so nothing private leaks; renames follow, and a published file shows when its page is live ([D-419](decisions.md#d-419-the-publish-workflow-works-end-to-end-and-a-public-note-never-links-to-a-private-one), [D-423](decisions.md#d-423-renaming-a-published-note-follows-the-rename), [D-436](decisions.md#d-436-website-rebuilds-follow-their-source-and-a-published-file-shows-when-its-live)).
- **One public repository** for a Private + Public project holds both the published pages and the encrypted shares, with a guided move from an older separate site ([D-429](decisions.md#d-429-one-public-repository-in-the-private--public-layout-published-pages-and-encrypted-shares-together)).
- **Site appearance**: one theme and font for published pages and shared notes, in Settings → Sharing ([D-430](decisions.md#d-430-one-website-look-for-published-pages-and-shared-notes-in-settings--sharing--site-appearance)).
- **Honest steps**: sharing and publishing show their real steps in plain words, and a stop names its cause ([D-427](decisions.md#d-427-share-and-publish-show-their-real-steps-in-plain-words), [D-432](decisions.md#d-432-a-site-upload-is-built-again-when-its-branch-moves-and-a-stop-names-its-cause)). Deleting a shared or published note takes it down first ([D-428](decisions.md#d-428-deleting-a-shared-or-published-note-takes-it-down-first)).

### Images

- Paste, drop or insert images; Column, Wide or Actual size, rounded corners, a height limit, crop and rotate. Location and camera details are removed before an image goes public; published pages show images, and shared notes carry them sealed.
- Print and Save as PDF keep images and captions in place.

### Rewrite with AI

- Select words, give a prompt, and the rewrite streams in place as one undo step; or write at the caret. Settings → AI connects an AI app on this computer, an online service with your own key, or the GitHub Copilot CLI. Every connection is tried for real rather than ruled out by version, and a service's own error is shown in full ([D-438](decisions.md#d-438-ai-connections-are-tried-never-prefiltered)).
- **Image captions with AI** work with every connection that can send an image, Anthropic and Gemini included (all but the GitHub Copilot CLI); a model that can't see images says so in its own words.

### Saving, recovery and backup

- **Backup status you can trust**: the corner never says *Backed up* while work isn't on GitHub, including just after launch; until Git has answered it says *Saved on this computer* ([D-414](decisions.md#d-414-what-on-github-means-is-the-save-states-measure-unknown-is-its-own-answer)).
- **Crash recovery**: unsaved text comes back in its note after a crash, even when its file was renamed or moved; in a rare case it waits in Files › Recovered, character for character, to save as a new note. When both a recovered version and the saved file exist, Focus Notes says the note has two versions and lets you keep either.
- **Backup that can't stall your project**: a GitHub step that hangs is stopped with everything it started, while a save or commit on this computer always runs to completion; deleting a project or removing it waits briefly for a running backup to finish first.
- A missing notes folder is offered back rather than replaced with an empty one, and a mass deletion pauses to ask.

### Also

- Actions (the renamed Spotlight) finds files, folders and the actions that apply to them. Pressing Enter straight after typing runs what you typed, never an earlier result.
- A failed delete explains what went wrong and offers Retry, without repeating it in the message.
- Dialogs and cards in two columns, Switches for every on/off setting, notifications that dismiss themselves, and many spacing and contrast fixes.

### Known issues

- A crash in a narrow window just after a new note's first save and title rename can leave its text in Files › Recovered instead of back in the note. Nothing is lost; putting it back in place automatically is planned after 1.1 ([Roadmap](roadmap.md#specced-but-missing-or-partial)).
- Builds are unsigned outside the Microsoft Store.

### For the Store's What's new

> What's new in Focus Notes 1.1.0:
> Projects, each in its own window and colour, created here or on GitHub. Share any note with an access code, or publish it to your own website. Images, with crop and rotate. Rewrite with AI using the service you choose. Backup status you can trust, and better crash recovery.
>
> Every change: https://github.com/prabinpebam/focus-notes/releases/tag/v1.1.0
