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

## Permissions

**Settings → Agents** (IA-VIEW-SETTINGS):

| Permission | Default | Effect |
| --- | --- | --- |
| Agents can connect | Off until the writer turns it on or copies a connection snippet | Without it the server refuses to start |
| Read public notes | On (once connected) | Read tools see `content/` |
| Read private and shared notes | **Off** | Read tools also see `private/` |
| Create and edit notes | **Off** | Enables the write tools |
| Limit to folders | All | Restricts every tool to chosen folders |
| Create public notes | **Off** | Otherwise `create_note` always makes private notes |

The page also shows **Connect an agent** snippets with [Copy] for VS Code (`mcp.json`), Claude Desktop, and a generic stdio command, plus **Recent agent changes**.

## Attribution and undo

- Each agent write is one commit: `Agent edit: <note path>`, with the trailer `Focus-Notes-Agent: <client name>`. The client name comes from the MCP `initialize` handshake.
- If the note is open, it reloads in place. A toast says "Claude edited “On focus”" with [Review] (opens [note history](../design/views/secondary-views.md#note-history) with the change highlighted) and [Undo] (reverts that commit).
- Agent commits sync like any other. Recent agent changes in Settings lists the last 50.

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

## Deep links

The desktop app registers `focus-notes://`:

- `focus-notes://open?path=<path>` opens a note.
- `focus-notes://new?folder=<folder>&title=<title>` opens a new, empty note (nothing is saved until the writer types).
- `focus-notes://search?q=<query>` opens Spotlight with the query.

Deep links never write content, delete, or change visibility, and they only work inside the open workspace.

## Files and schemas for agents

- **`AGENTS.md`** at the root of every workspace (from the template) explains the layout, front matter, link style, that `private/` must be pulled on its own, that `access.json` mustn't be edited by hand, and the commit message style. The product repository has its own `AGENTS.md` for contributors.
- **JSON Schemas** (JSON Schema 2020-12) for note front matter, `.focus-notes/workspace.json`, `settings.json`, theme files, `keybindings.json`, `access.json`, and `access-message.json`. They live in the product repository's `schemas/` folder and are published on the product site with stable `$id` URLs (AGT-08).
- **The design system's vocabulary**: component contracts, the UI schema, token names, and fragments, published as JSON (DSY-13). Agents contributing to Focus Notes write views as data and get precise errors from `ui:check` ([Views as data](../design/system/views-as-data.md)).
- **`llms.txt`** at the product site root lists these docs for language models, following the emerging `llms.txt` convention.

## Risks specific to agents

| Risk | Mitigation |
| --- | --- |
| Prompt injection in note text makes an agent act against the writer | Content is returned as labeled data. Destructive and sharing actions aren't tools. Writes are attributed and undoable. |
| An agent copies private notes into another tool or service | Private reading is off by default and its toggle explains this risk. Once private notes are read, the agent host decides where content goes, so only connect agents you trust. |
| Runaway edits | Rate limits, the version check on every update, and Undo for each commit |
| A malicious MCP client pretends to be another | Client names are self-reported. Attribution is informational, and permissions are what protect. |
