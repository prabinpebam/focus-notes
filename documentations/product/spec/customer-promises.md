# Customer promises

The twelve promises Focus Notes makes. Every scenario, capability, screen, and decision traces back to one of them. If something serves none of them, it doesn't belong in the product.

> [!NOTE]
> **TL;DR.** **Calm**, **focus**, **fluent editing**, **reach**, **order**, **safety**, **ownership**, **deliberate sharing**, **comfort**, **ready in minutes**, **agents on your terms**, and **know what you're getting**. Each promise below states what the customer experiences, why it matters, how it can be broken (the test any design must pass), and its scenarios. The promises come from the [seed spec](../../seed-specs.md) and the owner's decisions of 2026-10-13 and 2026-10-16. The "signals" are proposed measures, not data.

<h2 data-reader-personas="product design">Promise map</h2>

| ID | Promise (short) | Main source | Scenarios |
| --- | --- | --- | --- |
| `CP-CALM-01` | Nothing competes with your words | Seed: blank UI with one trigger | SC-WRITE-01 |
| `CP-FOCUS-01` | Your eye stays on the line you're writing | Seed: focus mode | SC-WRITE-02 |
| `CP-FLOW-01` | Shaping text and tables feels fluid | Seed: Notion/Loop editing, tables; owner: Loop tables, contextual toolbar | SC-WRITE-03 to SC-WRITE-07, SC-TABLE-01 to SC-TABLE-04 |
| `CP-REACH-01` | Anything is a few keystrokes away | Owner: Spotlight, find, keyboard | SC-FIND-01 to SC-FIND-06 |
| `CP-ORDER-01` | Organized your way, safely reorganized | Seed: file and folder CRUD with moves | SC-FILE-01 to SC-FILE-04 |
| `CP-SAFE-01` | Never lose, never leak | Seed: public/private; derived from Git storage | SC-FILE-05, SC-SAFE-01 to SC-SAFE-05 |
| `CP-OWN-01` | Yours to keep | Seed: Markdown in a GitHub repo; owner: no hosting, no registration | SC-TABLE-05, SC-OWN-01, SC-SETUP-04 |
| `CP-SHARE-01` | Sharing is deliberate | Seed: public links, private content | SC-FILE-06, SC-SHARE-01 to SC-SHARE-03 |
| `CP-YOURS-01` | Comfortable and yours in a minute | Seed: change theme, colors, fonts; owner: light/dark/system, theme management | SC-THEME-01 to SC-THEME-07 |
| `CP-READY-01` | Ready in minutes | Owner: device sign-in, first-run, Git works from the terminal | SC-SETUP-01 to SC-SETUP-03, SC-SETUP-05 |
| `CP-AGENT-01` | Agents on your terms | Owner: agent-friendly, MCP | SC-AGENT-01 to SC-AGENT-03 |
| `CP-KNOW-01` | Know what you're getting, and get help when you need it | Owner: product site, support articles, demo (2026-10-16) | SC-HELP-01 to SC-HELP-04 |

<h2 data-reader-personas="product">The promises</h2>

### CP-CALM-01 — Calm canvas

| Field | Value |
| --- | --- |
| Customer promise | Nothing on screen competes with your words. |
| Why it matters | Starting to write is fragile. Every visible control is a small invitation to do something else. |
| Breaks when | Any control stays visible without being needed, or a panel opens without being asked for. |
| Signals | Time from launch to first keystroke. Number of always-visible controls (target: one, the trigger). |
| Scenarios | SC-WRITE-01 |

### CP-FOCUS-01 — Focused attention

| Field | Value |
| --- | --- |
| Customer promise | Your eye stays on the line you're writing, and the rest of the page waits quietly. |
| Why it matters | Long drafting sessions are lost to rereading and fiddling. Dimming everything else keeps momentum. |
| Breaks when | The bright row lags, jumps, flickers, or is lost inside tables, lists, or IME input. |
| Signals | Focus mode staying on across sessions. No reports of the band lagging behind the caret. |
| Scenarios | SC-WRITE-02 |

### CP-FLOW-01 — Fluent editing

| Field | Value |
| --- | --- |
| Customer promise | Shaping text, lists, and tables feels as fluid as Loop or Notion, from keyboard or pointer, without breaking your train of thought. |
| Why it matters | Structure is part of thinking. If formatting is slow or surprising, people stop structuring. |
| Breaks when | A formatting action needs a trip to a distant menu, covers the text being formatted, or produces something Markdown can't keep. |
| Signals | Use of the contextual toolbar and shortcuts against undo right after a conversion (a sign of surprise). |
| Scenarios | SC-WRITE-03, SC-WRITE-04, SC-WRITE-05, SC-WRITE-06, SC-WRITE-07, SC-TABLE-01, SC-TABLE-02, SC-TABLE-03, SC-TABLE-04 |

### CP-REACH-01 — Everything within reach

| Field | Value |
| --- | --- |
| Customer promise | Any note, line, setting, or command is a few keystrokes away. |
| Why it matters | A blank canvas only works if hidden things are easy to summon. |
| Breaks when | Something can only be reached by browsing, or a common action has no familiar shortcut. |
| Signals | Share of note opens through Spotlight. Keystrokes from intent to action. |
| Scenarios | SC-FIND-01, SC-FIND-02, SC-FIND-03, SC-FIND-04, SC-FIND-05, SC-FIND-06 |

### CP-ORDER-01 — Organized your way

| Field | Value |
| --- | --- |
| Customer promise | Your notes are organized the way you think, and reorganizing never loses or breaks anything. |
| Why it matters | People capture first and organize later. Fear of breaking links or losing files stops them from tidying. |
| Breaks when | Creating a note forces a decision about where it goes, or a rename or move breaks a link or loses history. |
| Signals | Notes left in the root against notes filed. Moves and renames that are undone. |
| Scenarios | SC-FILE-01, SC-FILE-02, SC-FILE-03, SC-FILE-04 |

### CP-SAFE-01 — Never lose, never leak

| Field | Value |
| --- | --- |
| Customer promise | Nothing you write is lost, and nothing private is published by accident. |
| Why it matters | Trust is the base of a writing tool. A single lost paragraph or leaked note ends it. |
| Breaks when | Unsaved text can be lost, a delete can't be undone, a conflict silently overwrites, or a private note becomes public without explicit confirmation. |
| Signals | Restores from Recently deleted. Conflicts resolved without data loss. Zero leaks found by the publish check. |
| Scenarios | SC-FILE-05, SC-SAFE-01, SC-SAFE-02, SC-SAFE-03, SC-SAFE-04, SC-SAFE-05 |

### CP-OWN-01 — Yours to keep

| Field | Value |
| --- | --- |
| Customer promise | Your notes are plain Markdown in your own GitHub repository, running on nothing but your own account; you can leave any time and take everything. |
| Why it matters | Notes outlive apps. Lock-in is a hidden cost people resent later. |
| Breaks when | The app writes anything a plain Markdown viewer can't show, rewrites files it didn't need to touch, or depends on any service other than the user's own GitHub account. |
| Signals | Round-trip test corpus passes. Notes render the same on GitHub. |
| Scenarios | SC-TABLE-05, SC-OWN-01, SC-SETUP-04 |

### CP-SHARE-01 — Deliberate sharing

| Field | Value |
| --- | --- |
| Customer promise | Sharing is a deliberate, reversible act, and you always know who can read what. |
| Why it matters | A note is written for its audience. Accidental audiences change what people dare to write. |
| Breaks when | Visibility is unclear, a share happens as a side effect, or a link can't be withdrawn. |
| Signals | Visibility visible at a glance. Private links revoked when no longer needed. |
| Scenarios | SC-FILE-06, SC-SHARE-01, SC-SHARE-02, SC-SHARE-03 |

### CP-YOURS-01 — Made comfortable

| Field | Value |
| --- | --- |
| Customer promise | The app looks and reads the way you like within a minute, and you can't make it unreadable by accident. |
| Why it matters | People write for hours. Comfort, taste, and accessibility decide whether they come back. |
| Breaks when | Choosing a look takes trial and error, a favorite scheme must be rebuilt by hand, or a custom theme makes text hard to read. |
| Signals | Time to the first theme kept. Custom themes failing contrast (target: none saved without a warning). |
| Scenarios | SC-THEME-01, SC-THEME-02, SC-THEME-03, SC-THEME-04, SC-THEME-05, SC-THEME-06, SC-THEME-07 |

### CP-READY-01 — Ready in minutes

| Field | Value |
| --- | --- |
| Customer promise | From first visit to writing in a few minutes: in the browser with nothing to install, or in the desktop app with one sign-in that also sets up Git. |
| Why it matters | Git-backed tools usually ask for setup expertise. The first five minutes decide whether people stay. |
| Breaks when | Setup asks for things the browser or computer already knows, needs the terminal or a build, or leaves the instance or Git half-configured. |
| Signals | Time from first visit or install to first note. Setup steps skipped because they were detected. |
| Scenarios | SC-SETUP-01 to SC-SETUP-03, SC-SETUP-05 |

### CP-AGENT-01 — Agents on your terms

| Field | Value |
| --- | --- |
| Customer promise | Your AI agents and tools can find, read, and write your notes, but only as far as you allow, and every change they make is visible and reversible. |
| Why it matters | Notes are context, and people increasingly work with agents. Without a safe way in, they either copy and paste or hand an agent everything. |
| Breaks when | An agent sees private notes or changes anything without permission, an agent's change can't be told apart from yours or can't be undone, or an agent can change who can read a note. |
| Signals | Agents connected. Agent changes undone (a sign of trust problems). Zero sharing or visibility changes by agents. |
| Scenarios | SC-AGENT-01, SC-AGENT-02, SC-AGENT-03 |

### CP-KNOW-01 — Clarity before and after you install

| Field | Value |
| --- | --- |
| Customer promise | Before you download anything, you can see what Focus Notes does, what it looks like, and whether it suits you, and try it in your browser. Once you use it, a plain answer is one click from wherever you are. |
| Why it matters | Focus Notes asks for a GitHub account and keeps notes in your own repositories, which is unusual. People decide whether to install from the first page they see, and a writer who's stuck in setup or sync needs steps they can follow, not a developer's spec. |
| Breaks when | The first page uses jargon or overpromises; a screenshot doesn't match the app; the demo needs a sign-in or loses the visitor; a *Learn more* link from the app goes nowhere or to the wrong article; an error in the app has no fix anyone without Git knowledge can follow; or the site tracks its visitors. |
| Signals | Every in-app help link resolves (checked in CI). Articles read at about grade 8 or below. Unaided task success in the help usability test. Issues opened from *Was this helpful?* (no telemetry). |
| Scenarios | SC-HELP-01, SC-HELP-02, SC-HELP-03, SC-HELP-04 |

<h2 data-reader-personas="product">Tensions between promises</h2>

Promises sometimes pull against each other. These are the agreed tie-breakers.

| Tension | Tie-breaker | Example |
| --- | --- | --- |
| Calm against reach | Calm wins at rest; reach wins on request. | Nothing is permanently visible, but <kbd>Ctrl/⌘</kbd>+<kbd>/</kbd> reaches everything. |
| Fluent editing against ownership | Ownership wins. | Loop-style table column types aren't offered because Markdown can't keep them (UNSUP-TABLE-02). |
| Comfort against safety | Safety wins on readability. | A custom theme can be anything except unreadable; the contrast guard warns and offers a fix (DD-THEME-05). |
| Fluent editing against calm | Context decides. | The formatting toolbar appears on selection and disappears when typing resumes. |
| Deliberate sharing against speed | Deliberate wins. | Making a note public always asks for confirmation, even from Spotlight. |
| Reach against safety (agents) | Safety wins. | Agents can't delete, change visibility, or touch sharing, even when that would be faster (UNSUP-AGENT-02). |
