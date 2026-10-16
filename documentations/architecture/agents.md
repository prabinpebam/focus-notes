# Agents and automation

How AI agents and scripts work with Focus Notes: an MCP server, a command-line tool, deep links, and plain files with published schemas. Everything stays under the writer's control.

> [!NOTE]
> **TL;DR.** Notes are plain Markdown in Git, so any agent can already read them. Focus Notes adds safe, structured ways in (D-44): a local **MCP server** (`focus-notes mcp`, stdio) with tools to search, read, create, and edit notes; a **command-line tool** with `--json` output; read-only **deep links** (`focus-notes://open?…`); and **`AGENTS.md` plus JSON Schemas** in every workspace, so coding agents edit files correctly. Agents get **only what the writer allows** (D-45). Reading public notes is the default. Reading private notes, editing, and anything that changes who can see a note are off until enabled, and sharing changes are never available to agents. **Every agent change is its own attributed commit**, shown in the app with Review and Undo. Note content is always treated as untrusted data, never as instructions. Serves UC-AGENT-01 to UC-AGENT-06.

## Principles

1. **Files are the API.** Markdown, front matter, and folders are documented ([Content model](content-model.md)) and have schemas. Agents that only read files need nothing else.
2. **The writer decides.** Each capability is a separate permission, and the defaults are conservative.
3. **Every change is visible and reversible.** One commit per agent action, with attribution, and Undo in the app.
4. **Content isn't instructions.** Text inside notes may try to steer an agent (prompt injection). The server returns it as quoted data and never acts on it.
5. **Nothing leaves the computer.** The MCP server and command-line tool run locally, talk only to the workspace on disk (and to GitHub through normal sync), and have no network service.

## MCP server

The [Model Context Protocol](https://modelcontextprotocol.io) server ships with the desktop app and starts with `focus-notes mcp` over **stdio**, launched by the agent host (VS Code, Claude Desktop, and other MCP clients). There's no HTTP listener. It follows the current published MCP specification and declares tools, resources, and prompts.

### Tools

| Tool | Does | Needs permission |
| --- | --- | --- |
| `search_notes` | Full-text and title search, with filters `visibility`, `folder`, `limit`. Returns ID, title, path, visibility, and snippets. | Read (public, or also private) |
| `read_note` | Returns a note's Markdown, front matter, title, path, visibility, last change, and `version` (Git blob SHA). | Read |
| `get_outline` | The note's headings with levels and anchors | Read |
| `list_notes` | The tree under a folder, with paging | Read |
| `recent_notes` | Recently changed or opened notes | Read |
| `create_note` | Creates a note with a title, Markdown body, and folder. Always private unless the writer allows public creation. | Edit |
| `update_note` | Replaces the body, or applies operations: `append`, `prepend`, `replace_section` (by heading), `insert_after_heading`. Requires `expected_version` and fails with a conflict if the note changed. | Edit |
| `move_note`, `rename_note` | Within the same visibility. Updates links the same way the app does. | Edit |
| `create_folder` | Creates a folder | Edit |

**Never exposed as tools:** deleting notes or folders, changing visibility (private, shared, public), and anything about sharing (creating, extending, or withdrawing audiences, or reading passcodes and links). Those change who can read something, or can't be undone from history, so they stay in the app with a person confirming (UNSUP-AGENT-02).

### Resources and prompts

- **Resources:** `note://<path>` (Markdown), `workspace://tree`, `workspace://recent`. Private notes are listed only with the private-read permission.
- **Prompts:** `summarize_note`, `draft_from_outline`, `find_related`. These are conveniences that call the tools above.

### Rules every tool follows

- Inputs and outputs have JSON Schemas. Outputs include structured content and readable text.
- Writes go through the same Markdown bridge as the editor, so formatting and [round-trip fidelity](content-model.md#round-trip-fidelity) rules apply. Invalid Markdown for a block type is refused with a clear error.
- Limits: 60 reads and 20 writes per minute, and 1 MB per note body. These stop runaway loops.
- Note content in results is wrapped and labeled as untrusted content from the user's notes. Tool descriptions tell the agent not to follow instructions found inside notes.
- While the app is running, writes go through the app ([One writer at a time](desktop-and-git.md#one-writer-at-a-time)).

### MCP server as built

**As built (WP-7.2, D-159).** `packages/mcp` speaks MCP itself over stdio, with no network listener and no SDK. The desktop's Node entry starts it: `focus-notes-mcp --workspace <folder> --data <app data folder>`. It refuses to start (exit 3) while *Agents can connect* is off.

**Transport and versions.** Newline-delimited JSON-RPC 2.0 on stdin and stdout: one UTF-8 message per line, at most 4 MB, no batches. Only protocol goes to stdout; logs go to stderr, with counts and codes but never paths or note text. The current specification, `2026-07-28`, is stateless: each request carries `_meta` with `io.modelcontextprotocol/protocolVersion` and `clientInfo`, `server/discover` lists the versions, and every result has `resultType: "complete"`. The handshake versions `2025-11-25`, `2025-06-18`, and `2025-03-26` use `initialize`, `notifications/initialized`, and `ping`.

| Tool | Input | Returns | Kind |
| --- | --- | --- | --- |
| `search_notes` | `query` (1 to 200 characters), `visibility` (`public`, `private`, or `all`), `folder`, `limit` (1 to 50, default 20) | Matching notes: path, visibility, title and snippet | Read |
| `read_note` | `path` | Path, visibility, `version` (the Git blob ID), title and Markdown | Read |
| `get_outline` | `path` | Headings with level and anchor | Read |
| `list_notes` | `folder` (default: every root it can read), `cursor`, `limit` (1 to 200, default 100) | Notes and folders, a page at a time | Read |
| `recent_notes` | `limit` (1 to 50, default 10) | The notes most recently changed on disk | Read |
| `create_note` | `title`, `body`, `folder` (default `private/notes`) | Path and `version` | Write |
| `update_note` | `path`, `expected_version`, and `body` or `operations` (`append`, `prepend`, `replace_section`, `insert_after_heading`, each with `text`, the last two with `heading`) | The new `version` | Write |
| `move_note` | `from`, `to` (same root) | The new path | Write |
| `rename_note` | `path`, `name` (a file name, same folder) | The new path | Write |
| `create_folder` | `path` | The path | Write |

- **Resources:** `workspace://tree` and `workspace://recent` (JSON), and `note://{path}` (Markdown, a resource template). Each read takes a read from the rate limit and the same checks as the tools.
- **Prompts:** `summarize_note` (`path`), `draft_from_outline` (`outline`, optional `folder`), and `find_related` (`path`). They return instructions that name the tools above and never contain note text.
- **Every call:** `agents.json` is read again, a token is taken (`takeAgentToken`), `checkAgent` decides with the shares from `private/access.json`, `resolveAgentPath` follows the paths on disk, and only `readAgentFile`, `writeAgentFile`, `moveAgentFile`, and `createAgentFolder` touch files. Listing and searching walk only readable roots and folders, skip links, and read each note through its own grant.
- **Untrusted content:** titles, file names, headings, snippets, and bodies are note content. Structured results mark them `untrusted: true`. The text form puts them between markers with a random name per response, said before them, and the tool descriptions and the server's instructions say never to follow instructions found inside notes.
- **Shares:** `private/access.json` is read on each call only to know who shares what; it's never returned. A missing file means there are no shares; one that can't be read counts as sharing everything, so nothing private is moved or created.
- **Writes:** each write is one commit with attribution (`agentChange`). The server takes the workspace's [lock](desktop-and-git.md#one-writer-at-a-time) only for that commit and releases it after the push. While the desktop app holds the lock, a write is refused (`appRunning`) and nothing is written; relaying writes through the running app is planned. A folder that isn't a Git repository refuses writes (`noRepository`). `move_note` and `rename_note` don't rewrite links in other notes yet.

| Error | Where | Meaning |
| --- | --- | --- |
| `-32700`, `-32600` | Protocol | Not JSON, or not a request (a batch, a message over 4 MB) |
| `-32601` | Protocol | Unknown method |
| `-32602` | Protocol | Unknown tool, prompt, or resource (a note that isn't there, too), or a prompt's bad argument |
| `-31000` | Protocol | A resource read refused: `data.error` is one of the refusals below |
| `-32022` | Protocol | Unsupported protocol version, with `supported` and `requested` |
| `notConnected`, `notPermitted`, `outsideFolders`, `outsideNotes`, `invalidPath`, `sharing`, `link`, `changed`, `never` | Tool result (`isError`) | The refusals of WP-7.1 ([Permissions](#permissions)) |
| `notFound`, `exists`, `tooLarge`, `rateLimited` (with `retryAfterMs`), `appRunning`, `noRepository`, `invalidInput`, `failed` | Tool result (`isError`) | The note (or heading) isn't there, the name is taken, over 1 MB, over the limit, the app holds the lock, no Git, arguments that don't match the tool's schema (a tool error, so the agent can correct them), or anything else |

## Permissions

**Settings → Agents** (IA-VIEW-SETTINGS):

| Permission | Default | Effect |
| --- | --- | --- |
| Agents can connect | Off until the writer turns it on or copies a connection snippet | Without it the server refuses to start |
| Read public notes | On (once connected) | Read tools see `notes/` |
| Read private and shared notes | **Off** | Read tools also see `private/notes/` |
| Create and edit notes | **Off** | Enables the write tools |
| Limit to folders | All | Restricts every tool to chosen folders |
| Create public notes | **Off** | Otherwise `create_note` always makes private notes |

The page also says that the command-line tool acts as you, and shows **Connect an agent** snippets with [Copy] for VS Code (`mcp.json`), Claude Desktop, and a generic stdio command, plus **Recent agent changes**.

**As built (WP-7.1, D-145).** The permissions are one check, `checkAgent` in `@focus-notes/core/agents`, that every MCP tool (WP-7.2) and command (WP-7.3) calls on every call, with the permissions read again each time, so turning one off applies to the very next call. It's pure, denies anything it can't prove is allowed, and is never the last word: an allowed operation comes back *unresolved*, as a grant only the check can make, which must go through `resolveAgentPath` (`@focus-notes/core/agents-fs`) before anything is read or written.

- **One set for every agent.** Client names are self-reported, so a grant per agent would protect nothing (see the risks below). Wherever a client name is shown, it reads "Claude (self-reported)". The permissions are kept per computer in `agents.json` in the app's data folder (`schemas/agents.schema.json`), never synced, written at once and readable only by the user where the system has file modes, and removed on signing out and removing the workspace ([Data inventory](security-and-privacy.md#data-inventory)). A missing or damaged file, or one changed outside the app (its check doesn't match), means the defaults, and Settings → Agents says so. Only `true` turns a switch on, and a damaged folder list allows no folder rather than all of them. The file isn't a boundary against programs running as the same user: they could write the notes themselves.
- **Roots.** Public notes are `notes/`, private and shared ones `private/notes/`, matched exactly as written. Nothing else in the workspace (`private/access.json`, `.focus-notes/`, `AGENTS.md`, `.git`) is reachable. Paths are workspace-relative with `/`; absolute paths, drives, `\`, `.` and `..`, empty segments, control characters, characters Windows doesn't allow (including `:`), segments ending in a dot or space, device names (`CON`, `CONIN$`, `COM¹`, with or without an extension), and paths over 512 characters or 32 levels are refused.
- **On disk.** `resolveAgentPath` checks that each root is exactly its own folder in the real workspace, that no part of a path is a symbolic link, a junction, or a short name (its real path must be itself), that the real path is still in the same root and inside the folder limits, and that no file has a second hard link, since the other name could be somewhere the agent can't go. Each resolved grant is good for its own operation only: `readAgentFile`, `writeAgentFile` (overwrite under `update`, create under `create`), `moveAgentFile`, and `createAgentFolder` open what they touch and compare it with what was resolved, so a file swapped in between is refused. Missing folders are made one level at a time and checked as they're made; a write goes to a temporary file and replaces the note in one rename after a last version check; creating and moving never replace anything there. Every part of a path that exists must be spelled exactly as on disk, so on Windows and macOS `plan.md` can't stand for `Plan.md` and change its case. A move whose old name can't be removed takes the new one back. Creating and moving use a hard link, so on file systems without them (FAT32, exFAT, some network and synced folders) they fail with nothing changed; editing still works. The server and the command-line tool remove their own stale temporary files as they start.
- **What each operation needs.** Reading and listing need the root's read permission. Editing, moving, renaming, and creating need *Create and edit notes* and reading that root too, so an agent never writes where it can't read. In `notes/`, creating also needs *Create public notes*: asking for a public path without it is refused rather than moved somewhere else. *Limit to folders* applies to every path an operation names (both ends of a move), by whole folder names. A move between Public and Private is a visibility change, so it's never allowed, like deleting and sharing.
- **Shares stay as they are.** In `private/notes/`, a move or rename must keep exactly the audiences that open the note, and neither end may be a note a share names (by path or by its front-matter `id`); a note or folder can't be created inside a shared folder or at a path a share names. Every audience that isn't withdrawn counts, expired or not, and an `access.json` that can't be read counts as sharing everything. Without the shares, nothing in `private/notes/` is moved or created. Share paths compare without regard to case, and the check runs again on the real spelling on disk. An agent never adds, changes, or removes a note's `id` (a new note brings none), since a share can name a note by it. Editing a shared note in place is otherwise allowed: it changes what the audience reads, not who reads it.
- **The person at the terminal** acts as themselves: they can read and edit their own notes in both roots whatever the switches say, with the same path, disk, and sharing checks, and deleting, visibility, and sharing stay in the app. Only the command-line tool's entry point can claim it (`claimTerminal`, once per process, as an object nothing else can make); the MCP server seals it as it starts, so no argument, flag, environment variable, or terminal can stand for it. The tool's writes are still one attributed commit each, named `command line`. An agent that can run programs can run the tool too, and so acts as the person: the switches protect only agents limited to the MCP server (D-145 (10)).
- **Safety (AGT-09).** `takeAgentToken` allows 60 reads and 20 writes a minute for the whole computer: a token bucket per kind in `agent-limits.json`, changed while holding `agent-limits.lock`, timed by the monotonic clock every process shares, and refused when the lock can't be had; a refused call takes nothing. `withinSize` holds a note body to 1 MB of UTF-8. `untrustedNote` returns note text as `{ untrusted, source, path, content }`, which the server prefers, and as text between markers with a random name made for each response and said before them; titles, file names, and snippets are note content too and are wrapped the same way. Writes compare the version the agent read, so a save in between is never overwritten (*changed*).

The switches in Settings → Agents and the list of Recent agent changes are WP-7.4.

### Settings → Agents as built

**As built (WP-7.4, D-166).** The page reads and writes `agents.json` through the main process. Each switch is written at once and read back:

| Part | Shows | Does |
| --- | --- | --- |
| Switches | *Agents can connect*, then *Read public notes*, *Read private and shared notes*, *Create and edit notes*, and *Create public notes*, each with one line on what it allows | Writes `agents.json`. The others are disabled while agents can't connect |
| Folder limit | All folders, or the folders in the limit | Editing it is planned |
| Changed outside the app | A warning that the file's check didn't match, so the defaults apply | Any switch writes a fresh file |
| Connect an agent | Snippets for VS Code and Claude Desktop (JSON, the command and its arguments apart), and a command line quoted for this computer's shell (PowerShell on Windows, a POSIX shell elsewhere): the app's own executable with `--cli mcp --data <data folder>` | Copy, then *Copied* |
| Recent agent changes | The last 50: *⟨client⟩ (self-reported)*, the note, and when | *Undo*, by D-145's rules; a refusal says why |
| Command-line tool | Whether `focus-notes` is installed | *Install command-line tool*: on Windows the user's own `Path`, read raw and written back with its kind (`REG_EXPAND_SZ` stays expandable), then read back to check; `~/.local/bin/focus-notes` elsewhere. Only in the installed app |


## Attribution and undo

- Each agent write is one commit: `Agent edit: <note path>`, with the trailer `Focus-Notes-Agent: <client name>`. The client name comes from the MCP `initialize` handshake.
- If the note is open, it reloads in place. A toast says "Claude edited “On focus”" with [Review] (opens [note history](../design/views/secondary-views.md#note-history) with the change highlighted) and [Undo] (reverts that commit).
- Agent commits sync like any other. Recent agent changes in Settings lists the last 50.

**As built (WP-7.1, D-145).** The Git adapter's `agentChange` commits the writer's own uncommitted changes to the note first (as a normal save), then applies the agent's write and commits it alone: `Agent edit: <note path>` (the path in its repository, as other messages are), a line per change when it's a rename or more than one file, and the `Focus-Notes-Agent` trailer, which `git log --format=%(trailers)` reads. The author is the writer's own Git identity, so hooks and signing work as usual and attribution is the trailer. The client name is kept to one plain line of at most 64 characters without invisible characters, and paths and change lines to one line each, so nothing can add lines or trailers. The agent's write itself goes through `writeAgentFile` with the version it read, so a save from the editor in between makes it refuse (*changed*) rather than overwrite, and nothing is committed as the agent's. Changes in both repositories at once, or outside them, are refused before anything is written. A write that fails partway is still committed as the agent's, and the failure reported, so it's never taken for the writer's. As with every commit, no note path or name is a process argument. `undoAgentChange` takes the full ID of an agent commit in the current branch's history, made with this computer's Git identity, whose changed files are exactly its note and the moves it describes, under the notes folder, and puts its notes back to how they were before it, as a new commit by the writer, `Undo agent edit: <note path>`; when any of those notes changed since, committed or not, it refuses (*changed*) and touches nothing, so Undo never overwrites later writing. `agentChanges` lists agent commits from both repositories, newest first. The toast with [Review] and [Undo], and the in-place reload, arrive with the MCP server's writes (WP-7.2); the *Agent* badge in Note history arrives with Note history (WP-8.4).

## Command-line tool

`focus-notes` is installed with the desktop app (Settings → Agents → *Install command-line tool* adds it to `PATH`). It's for scripts and power users, and it starts the MCP server.

| Command | Does |
| --- | --- |
| `focus-notes ls [folder]` | Lists notes and folders |
| `focus-notes cat <path>` | Prints a note's Markdown |
| `focus-notes search <query>` | Searches titles and text |
| `focus-notes new [--folder f] [--title t]` | Creates a note from stdin or empty, private by default |
| `focus-notes append <path>` | Appends stdin to a note |
| `focus-notes open <path>` | Opens a note in the app |
| `focus-notes sync` / `status` | Syncs now / shows sync state |
| `focus-notes mcp` | Starts the MCP server on stdio |

Every command accepts `--json` (stable, schema-documented output) and `--workspace <path>`, and uses documented exit codes: 0 success, 1 error, 2 conflict, 3 not permitted. The command-line tool follows the same permissions as agents, except that the person at the terminal can always read and edit their own notes.

**As built (WP-7.3, D-165).** The commands are `packages/cli`; the desktop app's own executable runs them with `--cli` (released builds can't run Electron as Node), through the `focus-notes` launcher in its resources ([Distribution](../plan/distribution.md)). A command acts as the person at the terminal: it claims the terminal principal once, so both roots are open whatever the switches say, with the same path, disk, and sharing checks as agents. `focus-notes mcp` never claims it and keeps the agent switches. The terminal has no rate limit, and its output isn't wrapped as untrusted.

| Command | Does | `--json` (after `"ok": true`) |
| --- | --- | --- |
| `ls [folder]` | Notes and folders, one path a line (folders end in `/`) | `items`: `path`, `kind`, `visibility` |
| `cat <path>` | The note's Markdown | `path`, `visibility`, `version`, `title`, `content` |
| `search <query> [--limit n]` | `path: snippet`, one a line | `results`: `path`, `visibility`, `title`, `snippet` |
| `new [--folder f] [--title t]` | Makes a note from standard input (or empty), in `private/notes` unless a folder is given. Without `--title`, a first `# heading` in the input is the title | `path`, `version` |
| `append <path>` | Adds standard input at the end | `path`, `version` |
| `edit <path> [--expected-version v]` | Replaces the body with standard input (the front matter stays) | `path`, `version` |
| `mv <from> <to>` | Moves or renames a note in its root | `path` |
| `open <path> [--heading anchor]` | Opens the note in the app (a deep link) | `link` |
| `status` / `sync` | The save state / commits and pushes now | `git`, `state`, `waiting`, `problem` |
| `mcp` | The MCP server on standard input and output | (MCP messages) |

- **Writes** are one commit each, `Agent edit: <path>` with `Focus-Notes-Agent: command line`. While the desktop app holds the workspace, they're refused (`appRunning`) and nothing is written. `edit` and `append` read the note's version first, and a change in between is refused (`changed`).
- **Output:** with `--json`, standard output is exactly one JSON object, `{"ok": true, …}` or `{"ok": false, "error": <code>, "message": …}`. Without it, results go to standard output and problems to standard error as one line.
- **Exit codes:** 0 done; 1 error (`appRunning`, `notFound`, `noRepository`, `failed`, a usage mistake); 2 conflict (`changed`, `exists`); 3 not permitted (`outsideNotes`, `invalidPath`, `link`, `sharing`, `never`, and the other refusals).
- **The workspace** is `--workspace <folder>`, else the one the app last opened (from its data folder, or `--data <folder>`).

## Deep links

The desktop app registers `focus-notes://`:

- `focus-notes://open?path=<path>` opens a note.
- `focus-notes://new?folder=<folder>&title=<title>` opens a new, empty note (nothing is saved until the writer types).
- `focus-notes://search?q=<query>` opens Spotlight with the query.

Deep links never write content, delete, or change visibility, and they only work inside the open workspace.

**As built (WP-7.3, D-165).** Links are read-only. `open` takes a note path in `notes/` or `private/notes/` and an optional `heading` anchor (as `get_outline` gives it); `search` takes `q`. The `new` link isn't offered, because making a note writes a file at once. `parseDeepLink` in core accepts a link only if all of these hold, and ignores it otherwise:

- the scheme is `focus-notes:` and the host is `open` or `search`;
- there's no user, password, port, path, or fragment, and only the named parameters, each once;
- the path is a valid agent path in one of the two roots, ending in `.md`;
- the heading is letters, digits, `-`, and `_`, and the query is 1 to 200 characters with no control characters;
- the whole link is at most 2,048 characters.

The main process opens the note only if it's in the open workspace's roots. Only a packaged app registers the scheme, never development builds or journeys: Windows and Linux pass links as arguments (to the first instance, or handed on by a second), and macOS sends `open-url`.

## Files and schemas for agents

- **`AGENTS.md`** at the root of every instance (from the template) explains the layout, front matter, link style, that `private/` must be pulled on its own, that `access.json` mustn't be edited by hand, and the commit message style. The project repository has its own `AGENTS.md` for contributors.
- **JSON Schemas** (JSON Schema 2020-12) for note front matter, `.focus-notes/workspace.json`, `settings.json`, theme files, `keybindings.json`, `access.json`, and `access-message.json`. They live in the project repository's `schemas/` folder and are published on the project's own Pages site, beside these docs, with stable `$id` URLs (AGT-08).
- **The design system's vocabulary**: component contracts, the UI schema, token names, and fragments, published as JSON (DSY-13). Agents contributing to Focus Notes write views as data and get precise errors from `ui:check` ([Views as data](../design/system/views-as-data.md)).
- **`llms.txt`** at the root of the project's own Pages site lists these docs for language models, following the emerging `llms.txt` convention.

## Risks specific to agents

| Risk | Mitigation |
| --- | --- |
| Prompt injection in note text makes an agent act against the writer | Content is returned as labeled data. Destructive and sharing actions aren't tools. Writes are attributed and undoable. |
| An agent copies private notes into another tool or service | Private reading is off by default and its toggle explains this risk. Once private notes are read, the agent host decides where content goes, so only connect agents you trust. |
| Runaway edits | Rate limits, the version check on every update, and Undo for each commit |
| A malicious MCP client pretends to be another | Client names are self-reported. Attribution is informational, and permissions are what protect. |
