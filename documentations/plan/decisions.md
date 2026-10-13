# Decisions

Every assumption and design choice these docs make beyond the literal [seed spec](../seed-specs.md), so they can be confirmed or overturned in one place.

> [!NOTE]
> **TL;DR.** 37 decisions. The owner settled the trigger size (**D-03**), the editor (**D-01**, Tiptap under MIT), desktop sign-in (**D-02**, GitHub device flow saved into git's credential store), and the license (**D-20**, the app is MIT). The docs now treat the **desktop app as the primary authoring client** (**D-10**). Four proposals need the owner's attention most: the 20 px window-corner trade-offs (**D-14**), the double meaning of <kbd>Ctrl/⌘</kbd>+<kbd>K</kbd> (**D-16**), the OAuth scope (**D-21**), and how "mac and iOS" was read (**D-19**).

## Status legend

| Status | Meaning |
| --- | --- |
| **Decided** | Confirmed by the project owner. |
| **Open** | Needs a decision before the milestone that depends on it. |
| **Proposed** | A default the docs assume. It stands unless someone overrides it. |

## Owner decisions (2026-10-13)

| ID | Decision | Affects |
| --- | --- | --- |
| D-01 | **Editor engine: Tiptap (ProseMirror).** Only MIT-licensed Tiptap packages are used. The paid Tiptap bundles (Collaboration, Content AI, Conversion, Documents/Cloud) are excluded. Markdown comes from either `@tiptap/markdown` (MIT) or our own remark bridge, whichever passes the round-trip corpus in the M0 spike. | [Editor engine](../architecture/editor-engine.md) |
| D-02 | **Desktop sign-in: GitHub device flow** inside a guided first-run experience. The token is saved in git's credential store, so the app's commits and pushes and the user's own terminal `git push` all work with one sign-in. | [First run and sign-in](../experience/first-run.md), [Desktop and Git](../architecture/desktop-and-git.md) |
| D-03 | **Trigger size: a 10 px *diameter* red dot inside a 30 px *diameter* frosted circle.** | [Main UI](../experience/main-ui.html) |
| D-20 | **License: the app is MIT.** Every shipped dependency must be under an MIT-compatible permissive license. The policy details are proposed below. | [Editor engine](../architecture/editor-engine.md#licensing), [Architecture overview](../architecture/overview.html) |
| D-24 | **Desktop window:** 20 px rounded corners and a custom title bar. | [Desktop app](../experience/desktop-app.html) |
| D-25 | **Themes:** Light, Dark, and System (auto). | [Theming](../experience/theming.md) |
| D-26 | **Toolbar:** at most 6 entries. Anything beyond that goes into a ⋯ (more) menu. | [Main UI](../experience/main-ui.html#the-minimal-toolbar) |
| D-27 | **Keyboard:** a thorough shortcut strategy that follows the most popular apps, from basic to niche pro shortcuts, on Apple platforms and others. | [Keyboard shortcuts](../experience/keyboard-shortcuts.md) |
| D-28 | **Find, find and replace, and a Spotlight-style search-and-act panel on <kbd>Ctrl/⌘</kbd>+<kbd>K</kbd>.** | [Find and replace](../experience/find-and-replace.md), [Spotlight](../experience/spotlight.html) |
| D-35 | **Every UX and UI decision is grounded in a chain:** customer promise → scenario (job to be done) → user can → view or component → design decision → requirement. | [The articulation chain](../product/spec/chain.md) |
| D-36 | **Tables are edited the way Microsoft Loop tables are, and text is formatted with a simple contextual toolbar.** The theme manager answers when and why people theme, what they bring, and preset, random, or manual choice. | [Tables](../design/components/tables.html), [Text formatting](../design/components/text-formatting.html), [Theme manager](../design/views/theme-manager.html) |

## Proposed and open

| ID | Decision | Status | Affects |
| --- | --- | --- | --- |
| D-04 | **Focus mode default:** on for new installs, since it's a signature feature. | Proposed | [Focus mode](../experience/focus-mode.md) |
| D-05 | **New notes are private** by default, so nothing gets published by accident. | Proposed | [Files and sharing](../experience/files-and-sharing.md) |
| D-06 | **Save state UI:** saving is invisible. Only failures or unsynced offline edits show, as a status ring on the trigger plus a toast the first time. | Proposed | [Main UI](../experience/main-ui.html#states) |
| D-07 | **Submodule pointer cadence:** the public repository's pointer to the private repository moves only for publishing-relevant private changes (share grants, shared notes), plus once a day. | Proposed | [Repository and publishing](../architecture/repository-and-publishing.html) |
| D-08 | **Public URL stability:** renaming or moving a public note leaves a redirect at the old URL, found through the note's front-matter `id`. | Proposed | [Content model](../architecture/content-model.md#public-urls) |
| D-09 | **Private mount path:** `private/` (the reference `personal-site` uses `private-pages/`). | Proposed | [Content model](../architecture/content-model.md) |
| D-10 | **Desktop first.** The Electron app is the primary authoring client and ships in the first release. In that release the web build serves public pages and share links; editing in the browser follows in M6. This replaces the earlier "web first" proposal, because the owner's sign-in, Git, and window decisions all center on the desktop. | Proposed | [Roadmap](roadmap.md), [Requirements](../product/requirements.md) |
| D-11 | **Component syntax:** generic Markdown directives (`::name{}` / `:::name`) for future components. | Proposed | [Content model](../architecture/content-model.md#components) |
| D-12 | **Markdown-only formatting:** no underline, color, or highlight, because GFM can't represent them. | Proposed | [Editing](../experience/editing.md#inline-formatting) |
| D-13 | **Web sign-in (M6):** a fine-grained personal access token limited to the two content repositories. Browsers can't run GitHub's device flow because its endpoints don't allow cross-origin calls. | Proposed | [Architecture overview](../architecture/overview.html) |
| D-14 | **How to get 20 px corners:** a transparent, frameless window with the corners drawn in CSS. Electron documents that transparent windows aren't natively resizable, can't be maximized from the Windows system menu or by double-clicking the title bar, and lose the native macOS shadow. The app makes up for all of these itself: its own resize edges, maximize and restore, and a drawn shadow. The fallback is native corners (about 8 px on Windows 11) if the M0 spike shows the custom resize isn't smooth enough. | **Open** | [Desktop app](../experience/desktop-app.html#how-the-corners-are-made) |
| D-15 | **Windows and Linux window buttons:** drawn by the app and shown on hover, to keep the blank canvas. Electron's native title-bar overlay can't be used with transparent windows, so the Windows 11 Snap Layouts flyout won't be available. <kbd>Win</kbd>+arrow snapping is checked in the spike. | Proposed | [Desktop app](../experience/desktop-app.html#title-bar) |
| D-16 | **<kbd>Ctrl/⌘</kbd>+<kbd>K</kbd> opens Spotlight**, except when text is selected in the editor, where it adds a link (the convention in Notion, Google Docs, and GitHub, which also uses Ctrl+K for its command palette). <kbd>Ctrl/⌘</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> always opens Spotlight. | **Open** | [Keyboard shortcuts](../experience/keyboard-shortcuts.md), [Spotlight](../experience/spotlight.html) |
| D-17 | **Focus mode shortcut:** <kbd>Ctrl/⌘</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>, with <kbd>F8</kbd> as an alternative (Typora). <kbd>Ctrl/⌘</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> is kept for "find in all notes" (VS Code convention). | Proposed | [Focus mode](../experience/focus-mode.md#turning-it-on-and-off) |
| D-18 | **The six toolbar actions:** New note, Open, Search, Save, Focus, Theme. Everything else is in ⋯. | Proposed | [Main UI](../experience/main-ui.html#the-minimal-toolbar) |
| D-19 | **"mac and iOS"** is read as macOS plus iPadOS and iOS with a hardware keyboard (web build in Safari). Windows and Linux are covered too, because the desktop app ships there. | **Open** | [Keyboard shortcuts](../experience/keyboard-shortcuts.md#platforms) |
| D-21 | **Sign-in uses a GitHub OAuth App with the `repo` scope.** It works directly with git's credential store and the token doesn't expire. The cost is that the scope covers every repository the user can reach. A GitHub App (fine-grained, limited to chosen repositories, tokens that expire every 8 hours and need refreshing) is the later alternative. | **Open** | [Desktop and Git](../architecture/desktop-and-git.md#sign-in) |
| D-22 | **System Git is required, not bundled.** The app runs the user's own `git`, so configuration, hooks, commit signing, and credentials are the same as in the terminal. The first-run experience checks for Git and helps install it. | Proposed | [First run and sign-in](../experience/first-run.md) |
| D-23 | **Save and sync:** edits are written to disk within 1 second. A commit and push happens when the writer presses <kbd>Ctrl/⌘</kbd>+<kbd>S</kbd>, switches or closes a note, quits, or stops typing for 60 seconds (configurable). This avoids a commit for every pause in typing. | Proposed | [Editing](../experience/editing.md#undo-redo-and-saving), [Desktop and Git](../architecture/desktop-and-git.md#save-and-sync) |
| D-29 | **Fonts may use the SIL Open Font License (OFL-1.1).** Bundled fonts: Inter, Source Serif 4, JetBrains Mono, Atkinson Hyperlegible, OpenDyslexic. The licenses are confirmed in CI. | Proposed | [Design foundations](../design/foundations.md#type) |
| D-30 | **A note's file name follows its title until the note is first published, then stays fixed** unless renamed on purpose (with a URL warning). | Proposed | [Files panel](../design/views/files.html#names-and-titles) |
| D-31 | **Appearance has a light slot and a dark slot.** System swaps between the two chosen themes. Reading settings are separate from color themes. | Proposed | [Theme manager](../design/views/theme-manager.html#the-model) |
| D-32 | **One icon family: Fluent UI System Icons (MIT).** | Proposed | [Design foundations](../design/foundations.md#icons) |
| D-33 | **Undo instead of confirmation**, except for changes of audience, deletes at scale, deleting public notes, and discarding text in a conflict. | Proposed | [Feedback and dialogs](../design/components/feedback-and-dialogs.md) |
| D-34 | **Recently deleted is built from Git history** (30 days shown), not a trash folder in the repository. | Proposed | [Files panel](../design/views/files.html#deleting-and-restoring) |
| D-37 | **Working personas** (Writer, Power user, Tinkerer, Comfort-sensitive writer, Reader) are assumptions until checked with real users. | Open | [The articulation chain](../product/spec/chain.md#personas-used-in-scenarios) |

## Licensing policy (D-20 details, proposed)

| Class | Licenses | Rule |
| --- | --- | --- |
| Allowed | MIT, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Apache-2.0, Unlicense, CC0-1.0 | Can ship. Keep their notices in a generated `THIRD_PARTY_NOTICES`. |
| Case by case | MPL-2.0, CC-BY-4.0 (fonts and icons) | Needs a recorded decision here. |
| Not allowed | GPL, LGPL, AGPL, SSPL, BUSL, any proprietary or paid license (including the paid Tiptap bundles) | CI fails the build. |

A license check runs in CI from M0 onward. Development-only tools follow the same list, unless their output never ships.

## Questions for the project owner

1. **D-14:** Are the 20 px corners worth custom resizing and a drawn shadow, or are native corners (smaller, but with native resize, shadow, and Snap Layouts) an acceptable fallback if the spike struggles?
2. **D-16:** Is it acceptable for <kbd>Ctrl/⌘</kbd>+<kbd>K</kbd> to insert a link when text is selected, as most editors do, or should it always open Spotlight?
3. **D-21:** Is the broad `repo` scope acceptable for the first release?
4. **D-19:** Did "mac and iOS" mean macOS and iPadOS, or macOS and Windows? Both are covered either way, but this sets which platforms are tested first.
5. Should the generated documentation also be published with the app at `/docs/`?
6. **D-37:** Do the working personas match the people this is for? In particular, is the Tinkerer (who brings color schemes and theme files) worth the P1 import and shuffle work?
