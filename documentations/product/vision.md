# Vision and principles

Focus Notes is a calm, Markdown-native writing app: an empty page, one small trigger for everything else, and a focus mode that lights up only the line you are writing. Your notes live in a GitHub repository you own, and the app runs on the web (GitHub Pages) or as an Electron desktop app.

> [!NOTE]
> **TL;DR.** A Notion/Loop-style block editor that saves **Markdown** to **GitHub**, wrapped in an almost empty UI. The two signature features are the **trigger** (a red dot in a frosted circle at the top center that opens a minimal toolbar) and **focus mode** (only the caret's row is fully visible). Theming, public/private content, and shareable links follow. Pluggable components such as images and galleries come later, but the editor's design must allow for them from the start.

## What makes it different

| Signature | What the writer sees | Why it matters |
| --- | --- | --- |
| **The blank canvas** | Nothing but text and a single trigger at the top center. | Takes away the visual noise that competes with writing. |
| **The trigger** | A 10 px red dot inside a frosted 30 px-radius circle. One click opens a minimal toolbar. | Every non-writing action sits one step away but stays out of sight. |
| **Focus mode** | The row under the caret is fully visible and every other row is dimmed. | Keeps attention on the sentence being written. |
| **Notion/Loop-grade editing** | Familiar block editing, inline formatting, and real table editing. | Calm doesn't mean less capable. |
| **Markdown in your own GitHub repo** | Plain `.md` files in a repository, public or private. | No lock-in. Notes stay portable, diffable, and versioned. |

## Principles

1. **Writing first, chrome last.** Every pixel that isn't the writer's text has to earn its place. New features go into the trigger toolbar, keyboard shortcuts, or contextual UI, never into permanent chrome.
2. **Markdown is the source of truth.** What's on disk is readable Markdown. Editor-only state that can't be expressed in Markdown is either avoided or stored in a documented, human-readable extension syntax (see [Content model](../architecture/content-model.md)).
3. **You own your data.** Notes are files in a Git repository the writer controls. The app never needs a proprietary backend to read or write them.
4. **Extensible by design.** Blocks are registered components. Future components (image, gallery, …) plug into a block registry without changes to the editor core (see [Editor engine](../architecture/editor-engine.md)).
5. **Themeable everywhere.** Color and typography come from design tokens. A theme is data, not code (see [Theming](../experience/theming.md)).
6. **One codebase, two shells.** The same web app runs on GitHub Pages and inside Electron. Shell-specific code stays thin (see [Architecture overview](../architecture/overview.html)).
7. **Start clean.** The earlier `markdown-focus-editor` project is the reference for **focus mode only**. None of its other concepts are carried over.

## Scope

### In scope for the first release

- Markdown text editing with standard formatting, Notion/Loop-style block interactions, and table editing.
- The blank canvas, the trigger, and the minimal toolbar.
- Focus mode.
- Create, read, update, and delete for files and folders, including moves.
- Public and private content, plus sharing public links.
- Theme switching (colors and fonts).
- Web delivery through GitHub Pages and desktop delivery through Electron.

### Planned extension points (not in the first release)

- Rich components such as image and gallery, added through the block registry.

### Out of scope until decided otherwise

- Real-time multi-user collaboration.
- A proprietary sync service or database.
- Carrying over any concepts from `markdown-focus-editor` other than focus mode.

## Glossary

| Term | Meaning |
| --- | --- |
| **Canvas** | The full-window writing surface. It is blank except for the document text and the trigger. |
| **Trigger** | The red 10 px dot inside a frosted 30 px-radius circle at the top center. It opens the toolbar. |
| **Toolbar** | The minimal, transient set of app actions opened from the trigger. |
| **Focus mode** | A reading treatment where only the caret's visual row is at full strength and other rows are subdued. |
| **Row** | One *rendered* (visually wrapped) line of text, not a paragraph or a source line. |
| **Block** | A unit of document structure: paragraph, heading, list item, table, code block, or a future component. |
| **Note** | One Markdown file. |
| **Workspace** | The content tree (folders and notes) backed by a Git repository. |
| **Public content** | Notes in the public content repository. They are published as readable pages on GitHub Pages. |
| **Private content** | Notes in the private content repository, mounted as a Git submodule. They are never published in plaintext. |
| **Share link** | A URL that lets someone without edit access read a note. |
