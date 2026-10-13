# Scenarios

The situations in which each [customer promise](customer-promises.md) matters, written as jobs to be done. Each scenario names the behavior people should see and the user-can capabilities that deliver it.

> [!NOTE]
> **TL;DR.** 47 scenarios in ten areas (writing, tables, files, sharing, find, theme, agents, setup, safety, ownership), plus 13 **unsupported boundaries** where we deliberately say no and offer something else instead. Each row reads *When ⟨situation⟩, I want to ⟨motivation⟩, so I can ⟨outcome⟩*. The column order (ID, promise, situation, persona, expected behavior, user can, views) follows the Slate spec convention. Personas are the working personas in [The articulation chain](chain.md#personas-used-in-scenarios).

<h2 data-reader-personas="product design">Writing</h2>

| ID | Promise | Situation | Persona | Expected behavior | User can | Views |
| --- | --- | --- | --- | --- | --- | --- |
| SC-WRITE-01 | CP-CALM-01 | When I open the app to write, I want nothing but my words on screen, so I can start without friction. | Writer | The last note, or a new one, opens with the caret placed. Only text and the trigger are visible. | UC-CANVAS-01, UC-CANVAS-02, UC-CANVAS-03 | IA-VIEW-CANVAS, IA-CMP-TRIGGER, IA-CMP-TITLEBAR |
| SC-WRITE-02 | CP-FOCUS-01 | When I'm drafting a long passage, I want everything but my current line to recede, so I can keep momentum. | Writer, Comfort | Focus mode dims all but the caret's row and follows it with no visible lag. | UC-FOCUS-01, UC-FOCUS-02 | IA-VIEW-CANVAS |
| SC-WRITE-03 | CP-FLOW-01 | When I want to emphasize or restructure a phrase, I want the formatting I need right where I selected, so I don't hunt through menus. | Writer | A small contextual toolbar appears above the selection with only the actions that apply there. | UC-FMT-01, UC-FMT-02, UC-FMT-03, UC-FMT-04 | IA-CMP-FORMAT, IA-CMP-LINK |
| SC-WRITE-04 | CP-FLOW-01 | When I'm typing fast, I want my Markdown habits (`#`, `-`, `**`) to just work, so formatting never interrupts typing. | Writer, Power user | Markdown typed at the start of a block or around text converts as you type. Undo right after brings back the literal characters. | UC-FMT-05, UC-FMT-06 | IA-VIEW-CANVAS |
| SC-WRITE-05 | CP-FLOW-01 | When I need a new kind of block, I want to insert it without leaving the keyboard, so structure follows my thinking. | Writer, Power user | `/` opens a filterable block menu at the caret, showing only blocks valid at that spot. | UC-BLOCK-01, UC-BLOCK-02, UC-BLOCK-04 | IA-CMP-SLASH |
| SC-WRITE-06 | CP-FLOW-01 | When a paragraph is in the wrong place, I want to move it directly, so reorganizing a draft is quick. | Writer | Drag the block handle, or press <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd>. | UC-BLOCK-03, UC-FMT-06 | IA-CMP-HANDLE |
| SC-WRITE-07 | CP-FLOW-01 | When I bring in text from elsewhere (a web page, Word, another note), I want it to arrive as clean, structured Markdown, so I don't have to reformat it. | Writer | Pasted HTML and Markdown become the nearest supported blocks and formats. Anything unsupported becomes plain text. Plain-text paste is one shortcut away. | UC-FMT-07 | IA-VIEW-CANVAS |

<h2 data-reader-personas="product design">Tables</h2>

| ID | Promise | Situation | Persona | Expected behavior | User can | Views |
| --- | --- | --- | --- | --- | --- | --- |
| SC-TABLE-01 | CP-FLOW-01 | When I need to compare things side by side, I want to drop in a table and fill it the way I do in Loop, so I can structure data inline. | Writer | `/table` inserts a 3 &times; 3 table with a header row and the caret in the first cell. <kbd>Tab</kbd> moves between cells and adds rows. Cells, rows, and columns can be selected and acted on together. | UC-TABLE-01, UC-TABLE-02, UC-TABLE-07 | IA-CMP-TABLE |
| SC-TABLE-02 | CP-FLOW-01 | When a table needs another row or column in the middle, I want to add it exactly there, so I don't rebuild the table. | Writer | Hovering a row or column boundary at the table edge shows a + insertion point. Handle menus offer insert before or after. | UC-TABLE-03 | IA-CMP-TABLE |
| SC-TABLE-03 | CP-FLOW-01 | When a table's order is wrong, I want to reorder rows and columns or sort by a column, so the table reads correctly. | Writer | Drag row or column handles, or use the keyboard. The column menu sorts once, and the sort can be undone. | UC-TABLE-04, UC-TABLE-05 | IA-CMP-TABLE |
| SC-TABLE-04 | CP-FLOW-01 | When my data is in a spreadsheet, I want to paste it as a table, so I don't have to retype it. | Writer | A pasted spreadsheet range becomes a table, or fills cells from the selected cell, adding rows and columns as needed. | UC-TABLE-06 | IA-CMP-TABLE |
| SC-TABLE-05 | CP-OWN-01 | When I open my table on GitHub or in another editor, I want it to look the same, so my data isn't locked in. | Writer | The table is saved as a GFM pipe table with alignment. Features GFM can't hold are never offered. | UC-TABLE-08, UC-OWN-01 | IA-CMP-TABLE |

<h2 data-reader-personas="product design">Files and folders</h2>

| ID | Promise | Situation | Persona | Expected behavior | User can | Views |
| --- | --- | --- | --- | --- | --- | --- |
| SC-FILE-01 | CP-ORDER-01 | When an idea strikes, I want to start a note instantly without choosing a place or a name, so the thought isn't lost. | Writer | New note opens at once in the current folder (or the Private root). Its file name follows the title as I type it. | UC-FILE-01, UC-FILE-02 | IA-VIEW-CANVAS, IA-VIEW-FILES |
| SC-FILE-02 | CP-ORDER-01 | When I come back to my notes, I want to see how they're organized and open the one I need, so I can pick up where I left off. | Writer | The Files panel shows Public and Private trees with the current note revealed. Quick open finds by name. | UC-FILE-03, UC-FILE-10, UC-FIND-01, UC-CANVAS-04 | IA-VIEW-FILES, IA-VIEW-SPOTLIGHT |
| SC-FILE-03 | CP-ORDER-01 | When my notes pile up, I want to group them into folders and move many at once, so the structure matches how I think. | Writer | Create folders, select several items, then drag, cut and paste, or use Move to…. Each operation is a single commit and can be undone. | UC-FILE-04, UC-FILE-05, UC-FILE-06 | IA-VIEW-FILES, IA-CMP-MOVE |
| SC-FILE-04 | CP-ORDER-01 | When a note's name no longer fits, I want to rename or move it without breaking anything, so tidying is safe. | Writer | Inline rename. Links to the note from other notes are updated in the same commit. | UC-FILE-02, UC-FILE-07 | IA-VIEW-FILES |
| SC-FILE-05 | CP-SAFE-01 | When I delete something by mistake, I want to get it back easily, so cleaning up isn't scary. | Writer | An Undo toast right away. Later, Recently deleted in the Files panel restores from Git history. | UC-FILE-08, UC-FILE-09 | IA-VIEW-FILES, IA-CMP-TOAST |
| SC-FILE-06 | CP-SHARE-01 | When a note is ready to publish, or should stop being public, I want to change its visibility deliberately, so I control who can see it. | Writer | *Make public* or *Make private* shows exactly what will happen, then asks for confirmation. | UC-SHARE-01 | IA-VIEW-SHARE, IA-CMP-DIALOG |

<h2 data-reader-personas="product design">Sharing and reading</h2>

| ID | Promise | Situation | Persona | Expected behavior | User can | Views |
| --- | --- | --- | --- | --- | --- | --- |
| SC-SHARE-01 | CP-SHARE-01 | When I want someone to read a public note, I want to copy its link in one step, so sharing takes no effort. | Writer | *Copy public link* copies the URL and says whether the page is live yet. | UC-SHARE-02 | IA-VIEW-SHARE |
| SC-SHARE-02 | CP-SHARE-01 | When I want specific people (one person or a named group) to read some private notes, I want to give them a magic link or a passcode under their name, so only they can read it and I can withdraw it any time. | Writer | Add an audience by name with a link, a passcode (mine or generated), or both, for notes or folders, with an expiry. Copy a ready-made invite. See, extend, and withdraw every audience. | UC-SHARE-03, UC-SHARE-04, UC-SHARE-05 | IA-VIEW-SHARE, IA-VIEW-SETTINGS |
| SC-SHARE-03 | CP-SHARE-01 | When I receive a link or a passcode, I want to read the note comfortably without an account, so I can focus on what was shared. | Reader | A link opens the note directly. Otherwise I type my name and the passcode. A calm reading view in my light or dark preference, optionally remembered on this device. | UC-READ-01, UC-READ-02 | IA-VIEW-PUBLIC |

<h2 data-reader-personas="product design">Find and keyboard</h2>

| ID | Promise | Situation | Persona | Expected behavior | User can | Views |
| --- | --- | --- | --- | --- | --- | --- |
| SC-FIND-01 | CP-REACH-01 | When I know roughly what I'm looking for, I want to type a few letters and get there, so I don't have to browse. | Writer, Power user | Spotlight's top hit is usually right after two or three letters. Full-text matches show snippets. | UC-FIND-01, UC-FIND-02 | IA-VIEW-SPOTLIGHT |
| SC-FIND-02 | CP-REACH-01 | When I need a command I rarely use, I want to find it by name and learn its shortcut, so I'm faster next time. | Power user | Commands and settings appear in Spotlight with their shortcuts and current state. The cheat sheet is searchable. | UC-FIND-03, UC-KEY-01 | IA-VIEW-SPOTLIGHT, IA-VIEW-SHORTCUTS |
| SC-FIND-03 | CP-REACH-01 | When a word must change everywhere in a note or across notes, I want to find and replace it with a preview, so nothing changes by surprise. | Writer, Power user | The find bar in a note. Replace across notes previews every change and makes one commit that can be reverted. | UC-FIND-04, UC-FIND-05 | IA-CMP-FINDBAR, IA-VIEW-SPOTLIGHT |
| SC-FIND-04 | CP-REACH-01 | When I work from the keyboard, I want every action to have the shortcut I already know from other apps, so I never have to reach for the mouse. | Power user | A platform-correct keymap in four layers. Every pointer action has a keyboard path. | UC-KEY-02, UC-KEY-03, UC-FMT-04 | All views |
| SC-FIND-05 | CP-REACH-01 | When I use a few actions all the time, I want them pinned to the toolbar, so they're always one click away. | Power user | The six toolbar actions can be chosen. Everything else moves into ⋯ automatically. | UC-CANVAS-05 | IA-CMP-TOOLBAR, IA-CMP-OVERFLOW |

<h2 data-reader-personas="product design">Theme and comfort</h2>

These scenarios answer the owner's questions: **when and why** people change the theme, **what they bring with them**, and whether they **choose presets, randomize, or build by hand**. The short version: they change it at setup, when their surroundings or comfort needs change, and when they want to make the tool feel theirs. They bring a named scheme they already love, a color, a font, or an accessibility need. Most pick a preset, some adjust one or two things, and a few build their own or explore randomly. The [theme manager](../../design/views/theme-manager.html) is designed in that order.

| ID | Promise | Situation | Persona | Expected behavior | User can | Views |
| --- | --- | --- | --- | --- | --- | --- |
| SC-THEME-01 | CP-YOURS-01 | When I first set up the app, I want to pick a look I like in seconds, so it feels like mine from the start. | Writer, Tinkerer | A gallery of presets, each previewed live on the real note, plus System, Light, or Dark. | UC-THEME-01, UC-THEME-02 | IA-VIEW-THEME, IA-VIEW-FRE |
| SC-THEME-02 | CP-YOURS-01 | When my surroundings change (writing at night, a bright room, sharing my screen), I want to switch between light and dark instantly, or have it follow the system, so my eyes stay comfortable. | Writer, Comfort | The toolbar Theme button and a shortcut switch between light and dark. System mode follows the OS, using my chosen light theme and dark theme. | UC-THEME-02, UC-THEME-03 | IA-CMP-TOOLBAR, IA-VIEW-THEME |
| SC-THEME-03 | CP-YOURS-01 | When I already love a color scheme from another tool (Solarized, Nord, my VS Code theme), I want to bring it here instead of recreating it, so all my tools feel consistent. | Tinkerer | Well-known schemes available by name. Import from a VS Code theme file, a base16 scheme, or a Focus Notes theme. | UC-THEME-04, UC-THEME-05 | IA-VIEW-THEME |
| SC-THEME-04 | CP-YOURS-01 | When I have a favorite or brand color, I want a whole theme built around it, so I don't have to pick a dozen colors. | Tinkerer | Choose one seed color and get a matching light and dark theme that passes contrast checks. | UC-THEME-06 | IA-VIEW-THEME |
| SC-THEME-05 | CP-YOURS-01 | When I'm exploring or bored, I want to shuffle through generated themes and keep the ones I like, so finding a look is playful, not tedious. | Tinkerer | Shuffle generates readable themes. Lock any color to keep it, step back through history, and save a favorite. | UC-THEME-07 | IA-VIEW-THEME |
| SC-THEME-06 | CP-YOURS-01 | When reading comfort matters to me (low vision, light sensitivity, dyslexia, long sessions), I want to adjust size, font, spacing, width, and contrast, so I can write for hours. | Comfort | Reading controls with a live preview. High-contrast presets. A readable font option. Contrast is checked and fixable. | UC-THEME-08, UC-THEME-09 | IA-VIEW-THEME |
| SC-THEME-07 | CP-YOURS-01 | When I've crafted a theme, I want it on my other computers and to share it, so I only make it once. | Tinkerer | Custom themes are saved in the repository and sync with it. Export and copy as JSON. | UC-THEME-10 | IA-VIEW-THEME |

<h2 data-reader-personas="product design">Setup, safety, and ownership</h2>

| ID | Promise | Situation | Persona | Expected behavior | User can | Views |
| --- | --- | --- | --- | --- | --- | --- |
| SC-SETUP-01 | CP-READY-01 | When I install the app, I want to sign in once and have Git just work, so I can start writing without touching the terminal. | Writer | One sign-in through Git's own sign-in helper (with a device code) or a token signs in both the app and Git. Seven screens or fewer from install to typing. | UC-SETUP-01, UC-SETUP-02 | IA-VIEW-FRE |
| SC-SETUP-02 | CP-READY-01 | When I set up another computer, I want to reuse what I already have, so the second setup is even faster. | Writer | Existing Git credentials and existing clones are found and offered. | UC-SETUP-03 | IA-VIEW-FRE |
| SC-SETUP-03 | CP-READY-01 | When I want to write, I want to open my notes in any browser from my own site, so I'm never cut off from them and need nothing installed. | Writer | The web app on my instance's own Pages site works at once and offline, connects once with a scoped token, and syncs through GitHub, with the same editor and views as the desktop app. | UC-SETUP-04 | IA-VIEW-FRE, IA-VIEW-CANVAS |
| SC-SETUP-05 | CP-READY-01 | When I come across someone's Focus Notes site, I want to see how to get my own, in my browser or as a desktop app, so I'm writing within minutes. | Writer | As a visitor I see *Use this app for yourself*: a dialog that explains how Focus Notes works and gives the steps (copy the template repository, turn on GitHub Pages, connect), plus the desktop download. | UC-SETUP-06, UC-SETUP-04 | IA-VIEW-GETSTARTED |
| SC-SAFE-01 | CP-SAFE-01 | When I close the laptop mid-sentence, I want everything saved and synced without thinking, so I never worry about losing work. | Writer | Saved within a second, synced on its own schedule, and synced on quit. | UC-SAFE-01 | IA-CMP-SAVESTATE |
| SC-SAFE-02 | CP-SAFE-01 | When the same note changed on another computer, I want to choose what to keep, so I lose neither version. | Writer | A conflict view shows both versions. Keep mine, take theirs, or keep both. | UC-SAFE-02 | IA-CMP-CONFLICT |
| SC-SAFE-03 | CP-SAFE-01 | When I'm offline, I want to keep writing and trust that it syncs later, so the network never stops me. | Writer | Writing continues. The trigger shows that changes are waiting, and they sync in order when back online. | UC-SAFE-03 | IA-CMP-SAVESTATE |
| SC-SAFE-04 | CP-SAFE-01 | When a new version comes out, I want it installed without effort or risk, so I always have the latest fixes. | Writer | Signed updates download in the background and install on quit. Nothing interrupts writing. | UC-SAFE-04 | IA-VIEW-SETTINGS |
| SC-SAFE-05 | CP-SAFE-01 | When I regret an edit, mine or an agent's, I want to see earlier versions of a note and bring one back, so no change is permanent by accident. | Writer | Note history lists every saved version with its time and author, labels agent changes, and compares and restores. | UC-SAFE-05 | IA-VIEW-HISTORY |
| SC-OWN-01 | CP-OWN-01 | When I open my notes in another editor or on GitHub, I want clean, familiar Markdown, so I'm never locked in. | Writer | Files contain standard Markdown, and untouched parts are never rewritten. | UC-OWN-01 | None (file format) |
| SC-SETUP-04 | CP-OWN-01 | When I start using Focus Notes, I want my own setup created in my own GitHub account, so my notes never depend on anyone else's servers or permission. | Writer | Copying the template repository in the browser, or *Create my workspace* in the desktop app, gives me the instance repository, the private repository, publishing, and share-link keys in my account. Nothing is hosted or registered by the project. | UC-SETUP-05 | IA-VIEW-FRE |

<h2 data-reader-personas="product design">Agents and automation</h2>

| ID | Promise | Situation | Persona | Expected behavior | User can | Views |
| --- | --- | --- | --- | --- | --- | --- |
| SC-AGENT-01 | CP-AGENT-01 | When I work with an AI agent, I want it to find and read my notes, so it has my context without me copying and pasting. | Power user, Writer | An agent connects to the local MCP server in a minute and searches and reads what I've allowed. Coding agents follow the workspace's AGENTS.md. | UC-AGENT-01, UC-AGENT-06 | IA-VIEW-SETTINGS |
| SC-AGENT-02 | CP-AGENT-01 | When I let an agent draft or edit notes, I want its changes limited to what I allowed, clearly labeled, and easy to undo, so I stay in charge. | Writer | A separate permission for each capability. Each agent change is a labeled commit with Review and Undo. | UC-AGENT-02, UC-AGENT-03 | IA-VIEW-SETTINGS, IA-VIEW-HISTORY, IA-CMP-TOAST |
| SC-AGENT-03 | CP-AGENT-01 | When I automate my workflow (scripts, launchers, other apps), I want a command-line tool and links that open notes, so Focus Notes fits my setup. | Power user | A `focus-notes` command with JSON output, and `focus-notes://` links that open notes. | UC-AGENT-04, UC-AGENT-05 | IA-VIEW-CANVAS |

<h2 id="unsupported-boundaries" data-reader-personas="product design">Unsupported boundaries</h2>

Things a reasonable person might expect that Focus Notes deliberately doesn't do, with what happens instead. Each one exists to protect a promise.

| ID | Promise | Situation | Persona | Boundary behavior | Alternative offered | Views |
| --- | --- | --- | --- | --- | --- | --- |
| UNSUP-FMT-01 | CP-OWN-01 | When I want to underline, color, or highlight text. | Writer | Not offered. <kbd>Mod</kbd>+<kbd>U</kbd> shows a one-time hint that Markdown has no underline. | Bold, italic, strikethrough, inline code. | IA-CMP-FORMAT |
| UNSUP-TABLE-01 | CP-OWN-01 | When I want to merge cells, put line breaks, several paragraphs, or a list in a cell, or nest a table. | Writer | Not offered. In a cell, <kbd>Enter</kbd> moves down, <kbd>Shift</kbd>+<kbd>Enter</kbd> moves up, and block shortcuts are off. | Keep cell text short. Put longer content in a paragraph or list below the table. | IA-CMP-TABLE |
| UNSUP-TABLE-02 | CP-OWN-01 | When I expect Loop-style column types (person, date, label, voting), formulas, totals, filters, or board views. | Writer | Not offered, because GFM tables only hold text. | Plain text columns. A one-time sort. | IA-CMP-TABLE |
| UNSUP-TABLE-03 | CP-OWN-01 | When I want to drag a column wider and have it stay that way. | Writer | Column widths are automatic. GFM has no widths to save. | Wide tables scroll sideways, and long text wraps. | IA-CMP-TABLE |
| UNSUP-COLLAB-01 | CP-OWN-01 | When I want to edit a note at the same time as someone else, or leave comments. | Writer | Not offered. Changes from other computers arrive through sync, and conflicts are resolved explicitly. | Conflict view (UC-SAFE-02). | IA-CMP-CONFLICT |
| UNSUP-THEME-01 | CP-YOURS-01 | When I want to paste my own CSS or set a theme per note. | Tinkerer | Not offered. Themes are validated tokens, never raw CSS, and apply to the whole app. | The full token editor in the theme manager. | IA-VIEW-THEME |
| UNSUP-THEME-02 | CP-YOURS-01 | When I want to save a theme whose text doesn't pass contrast checks. | Tinkerer | Allowed only after an explicit warning, and never as a built-in preset. The fix is one click away. | The contrast guard's suggested fix. | IA-VIEW-THEME |
| UNSUP-FILE-01 | CP-OWN-01 | When I want to keep PDFs, images, or other files among my notes. | Writer | Non-Markdown files are hidden in the Files panel and never touched. | Image and gallery components (later). | IA-VIEW-FILES |
| UNSUP-SHARE-01 | CP-SHARE-01 | When I want someone to edit a note through a share link. | Reader | Share links are read-only. | Give them access to the repository on GitHub. | IA-VIEW-SHARE |
| UNSUP-SHARE-02 | CP-SHARE-01 | When I want to know who opened a shared note and when. | Writer | Not available, because there's no tracking or telemetry. | Use expiry and withdraw to control access. | IA-VIEW-SHARE |
| UNSUP-AGENT-01 | CP-AGENT-01 | When I expect an AI assistant built into the editor. | Writer | Not built in. Focus Notes stays calm and works with any model. | Connect the agent of your choice through MCP (UC-AGENT-01). | IA-VIEW-SETTINGS |
| UNSUP-AGENT-02 | CP-SHARE-01 | When I want an agent to delete notes, change visibility, or manage sharing. | Power user | Never available to agents. | Do it in the app, where a person confirms. | IA-VIEW-SHARE |
| UNSUP-PLAT-01 | CP-OWN-01 | When I want to use GitLab, Bitbucket, or GitHub Enterprise Server. | Writer | Not supported, because setup, publishing, and sharing rely on GitHub.com and GitHub Pages. | Notes are plain Markdown in Git and stay readable anywhere. | IA-VIEW-FRE |
