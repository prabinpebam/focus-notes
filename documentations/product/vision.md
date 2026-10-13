# Vision and principles

Focus Notes is a calm, Markdown-native writing app: an empty page, one small trigger for everything else, and a focus mode that lights up only the line you are writing. Your notes live in a GitHub repository you own. The main way to write is a desktop app (Electron), with soft 20 px corners on Windows and Linux and a native window on macOS. Each user's own GitHub Pages site serves their published notes, and browser editing comes later. Every user's Focus Notes runs entirely on their own GitHub account. The app is open source under the MIT license.

> [!NOTE]
> **TL;DR.** A Notion/Loop-style block editor that saves **Markdown** to **GitHub**, wrapped in an almost empty UI. The two signature features are the **trigger** (a red dot in a frosted circle at the top center that opens a toolbar of at most six actions) and **focus mode** (only the caret's row is fully visible). A Spotlight-style **search-and-act** panel on <kbd>Ctrl/⌘</kbd>+<kbd>/</kbd> and a thorough **keyboard** design make it fast for heavy users. Sign-in goes through Git's own sign-in tools (with a device code), so one sign-in serves the app and the terminal. Every user's Focus Notes lives entirely in their own GitHub account, with nothing hosted by the project. Notes are private by default, and can be published or **shared with named audiences** through magic links and passcodes. **Agents** can help through MCP and a command-line tool, within permissions the writer grants. There is no telemetry. Pluggable components such as images and galleries come later, but the editor's design must allow for them from the start.

## What makes it different

| Signature | What the writer sees | Why it matters |
| --- | --- | --- |
| **The blank canvas** | Nothing but text and a single trigger at the top center. On the desktop, an invisible title bar (with 20 px corners on Windows and Linux). | Takes away the visual noise that competes with writing. |
| **The trigger** | A red dot 10 px across inside a frosted circle 30 px across. One click opens a toolbar of at most six actions, plus a ⋯ menu. | Every non-writing action sits one step away but stays out of sight. |
| **Focus mode** | The row under the caret is fully visible and every other row is dimmed. | Keeps attention on the sentence being written. |
| **Spotlight and the keyboard** | <kbd>Ctrl/⌘</kbd>+<kbd>/</kbd> finds any note, heading, or command and acts on it. The full keymap follows the shortcuts people already know. | Power without chrome. The keyboard reaches everything. |
| **Notion/Loop-grade editing** | Familiar block editing, inline formatting, real table editing, and find and replace. | Calm doesn't mean less capable. |
| **Markdown in your own GitHub repo** | Plain `.md` files in a repository, public or private, committed and pushed by your own `git`. | No lock-in. Notes stay portable, diffable, and versioned. |

## Principles

1. **Writing first, chrome last.** Every pixel that isn't the writer's text has to earn its place. New features go into the trigger toolbar, keyboard shortcuts, or contextual UI, never into permanent chrome.
2. **Markdown is the source of truth.** What's on disk is readable Markdown. Editor-only state that can't be expressed in Markdown is either avoided or stored in a documented, human-readable extension syntax (see [Content model](../architecture/content-model.md)).
3. **You own your data.** Notes are files in a Git repository the writer controls. The app never needs a proprietary backend to read or write them.
4. **Extensible by design.** Blocks are registered components. Future components (image, gallery, …) plug into a block registry without changes to the editor core (see [Editor engine](../architecture/editor-engine.md)).
5. **Themeable everywhere, strict everywhere.** Every visual value is a design token, and a theme is data, not code (see [Theming](../experience/theming.md)). The interface itself is data too: views are JSON documents built only from the design system's components, and the app contains no HTML or CSS of its own (see [Design system](../design/system/overview.html)).
6. **One codebase, two shells.** The same web app runs inside Electron (the primary writing client) and on GitHub Pages. Shell-specific code stays thin (see [Architecture overview](../architecture/overview.html)).
7. **Keyboard first, never keyboard only.** Every action is a command reachable by a familiar shortcut, by [Spotlight](../experience/spotlight.html), and by pointer (see [Keyboard shortcuts](../experience/keyboard-shortcuts.md)).
8. **Borrow conventions.** Shortcuts, file-manager keys, and window behavior copy the most popular apps on each platform, so nothing has to be learned twice.
9. **Open and permissive.** The app is MIT-licensed, and so is everything it ships with, or it uses a compatible permissive license ([D-20](../plan/decisions.md)).
10. **Start clean.** The earlier `markdown-focus-editor` project is the reference for **focus mode only**. None of its other concepts are carried over.
11. **Private unless you say otherwise.** New notes are private, settings and themes stay in the private repository, there is no telemetry, and nothing leaves the user's computer and GitHub account except what they publish or share (see [Security and privacy](../architecture/security-and-privacy.md)).
12. **Agent-friendly, writer in charge.** Agents work through the same files, commands, and Git history as the writer, via MCP and a command-line tool, only with the permissions the writer grants, and every change can be undone (see [Agents and automation](../architecture/agents.md)).
13. **Nothing hosted by the project.** Each user's Focus Notes runs entirely in their own GitHub account. The project only publishes the app, the docs, and a static Get started page on GitHub Pages.
14. **Every decision has a reason.** Each screen, control, and behavior traces through [the articulation chain](spec/chain.md) (promise → scenario → user can → view or component → design decision → requirement). Anything that can't be traced isn't built.

## Scope

### In scope for the first release

- The desktop app (Electron): a custom title bar on every platform, 20 px rounded corners with app-built window management on Windows and Linux, native windows on macOS, and a guided first run that signs in through Git's own tools and creates the user's own workspace in their GitHub account.
- Markdown text editing with standard formatting, Notion/Loop-style block interactions, and table editing.
- The blank canvas, the trigger, and the toolbar (six actions plus ⋯).
- Focus mode.
- Find, find and replace, and find in all notes.
- Spotlight search-and-act on <kbd>Ctrl/⌘</kbd>+<kbd>/</kbd>, including quick open and commands.
- A full keyboard shortcut system for macOS, iPadOS, Windows, and Linux.
- Create, read, update, and delete for files and folders, including moves.
- Public, private, and shared notes. Sharing private notes and folders with named audiences through magic links and passcodes ([Sharing and visibility](../design/views/sharing.md)).
- Theme switching (Light, Dark, System), fonts, and font size.
- Public note pages and sealed shared pages, published on the user's own GitHub Pages site.
- The product site's [Get started page](../design/views/get-started.md), with signed downloads from GitHub Releases ([Packaging and distribution](../plan/distribution.md)).

### Planned extension points (not in the first release)

- Editing and setup in the browser (M6, the web app at the product site's `/app/`).
- Agents: a local MCP server, a command-line tool, and deep links (M7).
- Custom keybindings, multiple windows, replace across notes.
- Rich components such as image and gallery, added through the block registry.

### Out of scope until decided otherwise

- Real-time multi-user collaboration.
- A proprietary sync service or database.
- Carrying over any concepts from `markdown-focus-editor` other than focus mode.

## Glossary

| Term | Meaning |
| --- | --- |
| **Canvas** | The full-window writing surface. It is blank except for the document text and the trigger. |
| **Trigger** | A red dot 10 px across inside a frosted circle 30 px across, at the top center. It opens the toolbar. |
| **Toolbar** | The transient panel opened from the trigger. At most six actions, with everything else in ⋯. |
| **⋯ (more) menu** | The seventh slot in the toolbar, holding every action that isn't one of the six. |
| **Spotlight** | The search-and-act panel on <kbd>Ctrl/⌘</kbd>+<kbd>/</kbd>, covering notes, headings, full text, folders, commands, and settings. |
| **Command** | A named action (for example `focus.toggle`) that a shortcut, menu, toolbar, or Spotlight can run. |
| **Find bar** | The compact bar for finding and replacing in the open note. |
| **Title bar band** | The invisible top 44 px of the desktop window, used to drag it. The trigger sits in its center. |
| **First run** | The guided setup on first launch: Git, sign-in, identity, workspace, preferences. |
| **Device code** | A short code the writer approves on github.com to sign in. Shown by Git Credential Manager or the GitHub CLI, the sign-in tools Focus Notes relies on. |
| **Workspace** | A user's own Focus Notes: their notes repository, private repository, and GitHub Pages site, all in their GitHub account. Also used for the folders and notes inside it. |
| **Focus mode** | A reading treatment where only the caret's visual row is at full strength and other rows are subdued. |
| **Row** | One *rendered* (visually wrapped) line of text, not a paragraph or a source line. |
| **Block** | A unit of document structure: paragraph, heading, list item, table, code block, or a future component. |
| **Note** | One Markdown file. |
| **Public content** | Notes in the public content repository. They are published as readable pages on GitHub Pages. |
| **Private content** | Notes in the private content repository, mounted as a Git submodule. They are never published in plaintext. |
| **Audience** | A person or group, identified only by a name, that a private note or folder is shared with. |
| **Magic link** | A share URL whose secret, after `#`, opens the shared notes without typing anything. |
| **Passcode** | A secret the writer gives an audience. With their name, it opens the shared notes. |
| **Agent** | An AI tool that works with notes through MCP, the command-line tool, or the files, within the writer's permissions. |
