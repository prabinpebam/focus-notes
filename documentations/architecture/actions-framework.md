# Actions framework

**Approved by the owner, 6 November 2026 (D-361 to D-364), with the recommended defaults on the five open questions.** How Focus Notes decides what may appear in **Actions** (today's Spotlight), what an action is, and the rules that keep every listed action working and distinct. The feature, its starter set, flows and views are on [Actions: find and act](../experience/actions.md); the plan is the [MACT stage](../plan/implementation-plan.md#mact).

> [!NOTE]
> **TL;DR.** Today Spotlight lists **every command the app registers unless someone remembered to hide it** (a deny-list, D-111 and KEY-01), so steps like *Cancel*, *Retry* and *Next*, look-alike pairs such as *Share…* and *Share…*, and actions that can't work where you are all show up. The owner's Spotlight note asks for the opposite: **only actions we know make sense and work**, each clearly distinct. This framework flips the rule to an **allow-list catalogue**. An action gets in only if it is something a person sets out to do, starts from the dialog, names **one anchor** (the app, the project, the current note, a selection, or a chosen result), has a label no other action shares, and has a check that proves its outcome. Results are grouped by anchor (*This selection*, *This note*, *This project*, *App*), actions that can't apply here are hidden, blocked ones say why and list their fix, and anything that changes files, sends words elsewhere or uses AI goes through the flow and disclosures that already guard it. User-defined actions (saved prompts and templates) are a later, separately approved stage; there is no plugin or scripting surface.

## The owner's Spotlight note (5 November 2026)

Captured from the owner's Spotlight note of 5 November. Only Focus Notes product content is present and no line is omitted. Everything on this page and the [feature page](../experience/actions.md) interprets this note; when they disagree, the note wins. Lines marked **Owner** below come from it; lines marked **Proposal** are this spec's extrapolation, each with its assumption, risk, cheapest check and the decision it changes.

```text
# Spotlight

We don't want to call this Spotlight as that's a direct name that MacOS use.

The purpose of this feature is "Find and act", and we will simply call this "Actions" to keep it simple.

The tagline will be "Find and act"

## What does it do?

We need to have a good framework to qualify what goes as result in the "Actions" dialog.

- What content qualify?
  - All files and folders across public and private.
  - The goal is to open the content
  - Folders are opened in the files panel, focused.
- What actions qualify?
  - Independent actions, within the context of the app. These tend to be global across the Projects and any instances of the app.
    - Sign in to GitHub
    - Connect to AI
    - View shortcuts mapping (We need one)
    - Customize toolbar
    - ...
  - Actions that need an anchor, like a selection.
    - Explicit selection needed
      - Select text and make it bold
    - Selection is implicit
      - I'm already within a project scope, so the project is assumed selected.
        - So I can open settings of the project
        - I can rename the project
        - I can change the theme
      - Share current file
      - Publish current file

---

- We need to add more actions that are a fit for Actions dialog.
- Actions should be such that I can trigger it from the Action dialog. I can click or select the action and hit enter and the action is either performed as a single action or the task-flow for performing that action is triggered.
- We don't want to dump all actions and then figure out which ones don't work and remove it. Instead we want to put actions confidently and only the ones we know for sure makes sense and actually works.
- The current "Actions" (Spotlight) has so many actions that don't work, can't work, the action doesn't even makes sense, similar looking actions with no distinctions to clearly identify which one is which and what it is supposed to do.

---

- Critical thinking required on having enough distinction for each action so that it's not confused with anything else.
```

## Why today's list fails

Spotlight's command rows come from the command registry, the single way to act (KEY-01, DSY-12). `isInternalCommand` in `packages/core/src/spotlight.ts` leaves out setters, a fixed list of IDs and some prefixes, and **lists everything else** (D-111: "it lists every action the app has"). Every command a dialog registers for its own buttons therefore becomes a Spotlight row unless someone adds it to the deny-list. A static read of `packages/core/src` on 6 November (labels from `en.json`, before key-scope filtering, not counting commands registered in loops such as formatting, AI settings and fonts) finds **about 200 listed commands**, including:

| What the owner sees | Examples in today's list | Why it's wrong |
| --- | --- | --- |
| Steps from inside a flow | *Retry* (6 rows), *Cancel* (5), *Next* (2), *Back* (2), *Save the name*, *Cancel naming*, *Got it*, *Dismiss* | They only mean something inside the dialog that owns them; from Spotlight they do nothing or act on a flow that isn't open |
| Look-alikes with no distinction | *Share…* (2), *Publish…* (2), *New note in…* (7), *Open project…* (2), *Pin* (2), *Upload SVG…* (2), *Edit image* (2), *Image options* (2), *Focus mode* (command and setting), *Sync appearance* (2) | Same words, different targets or none; nothing says which note, folder or project they act on |
| Can't work here | *Download the desktop app*, *Lock*, *Forget this browser*, *Reset demo* (browser retired, D-292); *Open in new window* (one window per project, D-309) | Kept from an earlier product |
| Not an action at all | *Cut, copy, paste*, *Indent or outdent a list item*, *Line break within a block*, *Next result group*, *Announce the selected blocks*, *Reload panel*, *Report an action failure* | Key descriptions for the cheat sheet, keys inside Spotlight itself, or plumbing |

**The root cause is the rule, not the rows.** Removing these by hand repeats the problem the owner named ("dump all actions and then figure out which ones don't work"): the next dialog's *Cancel* arrives with it. The fix is to make listing a deliberate, checked decision per action.

## Two kinds of result

**Owner:** the Actions dialog returns **content** and **actions**, and nothing else.

| Kind | What qualifies | Enter does | Source |
| --- | --- | --- | --- |
| **Content** | Every file and folder in the active project, public and private | Opens it. A note opens in the window; a folder opens in the Files panel, revealed and focused | Owner |
| **Action** | A catalogued action whose anchor is present (below) | Performs it in one step, or starts its task flow | Owner |

Proposals that sharpen the content rule:

- **Content is exactly what Files shows** (proposal P-01). If the Files panel lists it, Actions can find it; if Files hides it (`.focus-notes/`, `.git/`, managed image assets), so does Actions. One rule, two surfaces that never disagree (H4).
- **Only the active project** (already decided, D-273). "Across public and private" means both of the project's roots, never another project. A standalone file's window finds that file and recent files, nothing inside a project.
- **Headings and text are reasons, not rows** (proposal P-02). A heading or sentence that matches makes its **file** appear, with the match as the row's detail; Enter opens the file at that place. The separate *Headings* and *In notes* groups go. *Find "…" in all notes* stays for an exhaustive text search ([Find in all notes](../experience/find-and-replace.md#find-in-all-notes), D-110). The `#` prefix still lists this note's headings, because that is navigation within the open content, not a search for content.

## What qualifies an action

The owner asks for "a good framework to qualify what goes as result", with "only the ones we know for sure makes sense and actually works" and "enough distinction for each action so that it's not confused with anything else". Every catalogued action passes all seven tests. Q2, Q6 and Q7 come straight from the note; the rest make it checkable.

| Test | An action qualifies only if… | Fails it, today | Source |
| --- | --- | --- | --- |
| **Q1 Intent** | It's something a person sets out to do and would name in their own words, not a step inside another flow or a key's description. | *Retry*, *Next*, *Save the name*, *Cut, copy, paste* | Proposal, from "doesn't even make sense" |
| **Q2 Starts here** | Enter performs it in one step, or opens the start of its task flow with focus inside. Nothing needs a dialog to be open already. | *Cancel naming*, *Restore this version* | Owner |
| **Q3 One anchor** | It names exactly one anchor (app, project, current note, selection, chosen result) and is listed only while that anchor is there. | *Bold* with no selection; *Share…* with nothing to share | Owner (independent vs anchored) |
| **Q4 Distinct** | Its label is unique in the catalogue, and its label, group and one-line outcome can't be mistaken for another action's. | *Share…* ×2, *New note in…* ×7 | Owner |
| **Q5 Proven** | A check runs it **from Actions** and asserts the outcome the person sees. An action that leaves the app (GitHub, the browser, Explorer, printing) is proven at that boundary: a fake service or system shell asserts the exact request or path. Unproven actions are not listed. | Most of today's rows have no such check | Owner ("know for sure… actually works") |
| **Q6 Works here** | It works on this platform and in this kind of window (project or standalone file). | *Lock*, *Reset demo*, *Open in new window* | Owner ("can't work") |
| **Q7 Reachable elsewhere** | It also has a pointer path (toolbar, menu, Files context menu, Settings), so Actions is a shortcut, never the only door. | — (kept from Spotlight's accessibility rule) | Existing rule |

<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" role="img" aria-labelledby="fnact-gate__title fnact-gate__desc" preserveAspectRatio="xMidYMid meet" data-slate-safe-margin="24">
<title id="fnact-gate__title">From command to listed action: the catalogue gate</title>
<desc id="fnact-gate__desc">Left, the command registry with every command the app has. An arrow leads to the catalogue gate, which applies tests Q1 to Q7: intent, starts here, one anchor, distinct, proven, works here, reachable elsewhere. Commands that fail stay commands, still run by keys, menus and their own dialogs, but are never listed. Commands that pass become catalogued actions. At run time a second filter, the anchor check, lists only the actions whose anchor is present now, grouped as This selection, This note, This project and App.</desc>
<g id="fnact-gate__boxes" font-family="Segoe UI, system-ui, -apple-system, sans-serif">
<rect id="fnact-gate__reg" x="24" y="60" width="200" height="150" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" stroke-width="1.5" />
<text x="44" y="96" fill="var(--color-neutral-fg-1)" font-size="18" font-weight="600" data-slate-fit-target="fnact-gate__reg" data-slate-fit-padding="14">Command registry</text>
<text x="44" y="126" fill="var(--color-neutral-fg-2)" font-size="14" data-slate-fit-target="fnact-gate__reg" data-slate-fit-padding="14">Every command:</text>
<text x="44" y="148" fill="var(--color-neutral-fg-2)" font-size="14" data-slate-fit-target="fnact-gate__reg" data-slate-fit-padding="14">keys, menus, dialogs,</text>
<text x="44" y="170" fill="var(--color-neutral-fg-2)" font-size="14" data-slate-fit-target="fnact-gate__reg" data-slate-fit-padding="14">agents, deep links</text>
<rect id="fnact-gate__gate" x="290" y="40" width="230" height="190" rx="14" fill="var(--color-brand-bg-2, var(--color-neutral-bg-3))" stroke="var(--color-brand-stroke)" stroke-width="2" />
<text x="310" y="76" fill="var(--color-neutral-fg-1)" font-size="18" font-weight="600" data-slate-fit-target="fnact-gate__gate" data-slate-fit-padding="14">Catalogue gate</text>
<text x="310" y="106" fill="var(--color-neutral-fg-2)" font-size="14" data-slate-fit-target="fnact-gate__gate" data-slate-fit-padding="14">Q1 Intent · Q2 Starts here</text>
<text x="310" y="130" fill="var(--color-neutral-fg-2)" font-size="14" data-slate-fit-target="fnact-gate__gate" data-slate-fit-padding="14">Q3 One anchor · Q4 Distinct</text>
<text x="310" y="154" fill="var(--color-neutral-fg-2)" font-size="14" data-slate-fit-target="fnact-gate__gate" data-slate-fit-padding="14">Q5 Proven · Q6 Works here</text>
<text x="310" y="178" fill="var(--color-neutral-fg-2)" font-size="14" data-slate-fit-target="fnact-gate__gate" data-slate-fit-padding="14">Q7 Reachable elsewhere</text>
<text x="310" y="210" fill="var(--color-neutral-fg-2)" font-size="13" font-style="italic" data-slate-fit-target="fnact-gate__gate" data-slate-fit-padding="14">decided once, checked in CI</text>
<rect id="fnact-gate__cat" x="586" y="60" width="150" height="150" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" stroke-width="1.5" />
<text x="604" y="96" fill="var(--color-neutral-fg-1)" font-size="18" font-weight="600" data-slate-fit-target="fnact-gate__cat" data-slate-fit-padding="14">Catalogue</text>
<text x="604" y="126" fill="var(--color-neutral-fg-2)" font-size="14" data-slate-fit-target="fnact-gate__cat" data-slate-fit-padding="14">Proven actions</text>
<text x="604" y="148" fill="var(--color-neutral-fg-2)" font-size="14" data-slate-fit-target="fnact-gate__cat" data-slate-fit-padding="14">with anchor,</text>
<text x="604" y="170" fill="var(--color-neutral-fg-2)" font-size="14" data-slate-fit-target="fnact-gate__cat" data-slate-fit-padding="14">effect, proof</text>
<rect id="fnact-gate__now" x="790" y="40" width="146" height="190" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" stroke-width="1.5" />
<text x="806" y="76" fill="var(--color-neutral-fg-1)" font-size="18" font-weight="600" data-slate-fit-target="fnact-gate__now" data-slate-fit-padding="12">Listed now</text>
<text x="806" y="106" fill="var(--color-neutral-fg-2)" font-size="14" data-slate-fit-target="fnact-gate__now" data-slate-fit-padding="12">This selection</text>
<text x="806" y="130" fill="var(--color-neutral-fg-2)" font-size="14" data-slate-fit-target="fnact-gate__now" data-slate-fit-padding="12">This note</text>
<text x="806" y="154" fill="var(--color-neutral-fg-2)" font-size="14" data-slate-fit-target="fnact-gate__now" data-slate-fit-padding="12">This project</text>
<text x="806" y="178" fill="var(--color-neutral-fg-2)" font-size="14" data-slate-fit-target="fnact-gate__now" data-slate-fit-padding="12">App</text>
</g>
<g id="fnact-gate__arrows" stroke="var(--color-neutral-fg-2)" stroke-width="2" fill="none">
<path d="M228 135 H284" /><path d="M276 129 L284 135 L276 141" />
<path d="M524 135 H580" /><path d="M572 129 L580 135 L572 141" />
<path d="M740 135 H784" /><path d="M776 129 L784 135 L776 141" />
<path d="M405 234 V262" stroke-dasharray="4 4" />
</g>
<g id="fnact-gate__labels" font-family="Segoe UI, system-ui, -apple-system, sans-serif" font-size="13" fill="var(--color-neutral-fg-2)">
<text x="405" y="284" text-anchor="middle">Fails: stays a command, never listed</text>
<text x="863" y="256" text-anchor="middle">filtered at each open</text>
</g>
</svg>
<figcaption>Listing becomes a decision made once per action and checked, not a side effect of registering a command.</figcaption>
</figure>
<details class="slate-figure-data">
  <summary>Data</summary>
  <table>
    <thead><tr><th>Stage</th><th>What it holds</th><th>When it's decided</th></tr></thead>
    <tbody>
      <tr><td>Command registry</td><td>Every command; unchanged, still the one way to act</td><td>When code registers it</td></tr>
      <tr><td>Catalogue gate</td><td>Tests Q1 to Q7</td><td>Once per action, in review; Q4 and Q5 also by a repository check</td></tr>
      <tr><td>Catalogue</td><td>Proven actions with their metadata</td><td>In code, with its proof</td></tr>
      <tr><td>Listed now</td><td>Catalogued actions whose anchor is present, grouped by anchor</td><td>Each time Actions opens</td></tr>
    </tbody>
  </table>
</details>

**Commands don't change.** A command that isn't catalogued still runs from its key, its menu, its dialog's button, an agent or a deep link. Only listing in Actions becomes deliberate. This amends KEY-01 ("every action is a named command that can be run from Spotlight") to "every action is a named command; the catalogued ones are listed in Actions", and supersedes D-111's "lists every action the app has" (decision [D-361: allow-list](../plan/decisions.md#d-361-actions-lists-only-catalogued-actions)).

## Anchors and context

**Owner:** some actions are independent ("global across the Projects and any instances of the app"); others need an anchor, either explicit (a selection) or implicit (the project you're in, the current file). The framework makes the anchor the organising idea: it decides when an action is listed, which group it appears in, and what it acts on.

| Anchor | Explicit or implicit | Present when | Group heading | Examples | Source |
| --- | --- | --- | --- | --- | --- |
| **Selection** | Explicit | Text, an image or blocks are selected in the note when Actions opens | *This selection* | Bold, Add link…, Rewrite with AI…, Caption image with AI… | Owner (bold); the rest proposals |
| **Chosen result** | Explicit | A note or folder row is active in Actions and you press <kbd>→</kbd> | *the item's name* | The same note and folder actions (*Rename this note…*, *Move this folder to…*), acting on the chosen item | Existing quick actions, curated |
| **Current note** | Implicit | A note or standalone file is open | *This note* | Share this note…, Publish this note…, Note history | Owner (share, publish) |
| **Project** | Implicit | The window is a project's window | *This project* | Project settings…, Rename project… | Owner (settings, rename) |
| **App** | None | Always | *App* | Sign in to GitHub…, Connect to AI…, Keyboard shortcuts, Customize toolbar… | Owner |

Rules:

1. **One anchor per action** (Q3). An action that could act on several kinds of thing (rename a note, a folder, a project) is several actions, each naming its object: *Rename this note…*, *Rename this folder…*, *Rename project…*. This is what makes two actions with the same verb distinguishable. A note action is one entry whether it acts on the open note (in *This note*) or on a chosen note (in that note's panel): one entry, one label, never a second look-alike.
2. **The owner's "change the theme"** sits in *App*: themes are yours and per device (D-46), so the row says *Your theme, on this device* rather than pretending to belong to the project (question 5 on the feature page).
2. **The context is captured as Actions opens** (proposal P-03): the project, the current note and its revision, the selection and its kind, and the Files panel's selection if it was focused. Actions acts on that snapshot. If, when you press Enter, the snapshot no longer matches (the note changed on disk, another window moved it, the selection was edited), the action **refuses and says why**; it never acts on something else. This reuses Rewrite's target-version guard.
3. **The narrowest anchor wins the top of the list.** With a selection, *This selection* comes first; then *This note*, *This project*, *App*. Typing ranks across groups, but each row keeps its group heading, so the anchor is always visible.
4. **A standalone file's window has no project anchor.** Project actions aren't listed there; app actions such as *Open project…* are.
5. **Read-only content** (a note Focus Notes can't save) has no editing actions; they're hidden, as on any other missing anchor.

## Hidden, blocked and listed

The owner doesn't want rows "that don't work, can't work". Three states, decided per action from its anchor and its preconditions:

| State | When | What shows | Source |
| --- | --- | --- | --- |
| **Hidden** | Its anchor is missing, or it can never work in this window or platform | Nothing | Proposal P-04 (VS Code's `when` clauses hide; see [prior art](#prior-art)) |
| **Blocked** | Its anchor is present but a precondition you can fix is missing (signed out, no AI connection, project not linked to GitHub) | The row, unavailable, with the reason as its detail (*Connect to AI first*), and the fix listed right after it as its own row | Proposal P-05 (H9: say how to recover) |
| **Listed** | Anchor present and preconditions met | The row, its shortcut and its state (*On*, *Dark*) | Existing (SPT-04) |

**Browsing everything** is still possible: the `>` prefix lists the whole catalogue grouped by anchor, with hidden actions shown unavailable and the anchor they need (*Select text first*). That's where people learn what exists without the everyday list carrying rows that can't run (proposal P-06).

## Anatomy of an action

Each catalogue entry is data in `packages/core` beside the command it runs. The catalogue is code, reviewed like code; it isn't a user file (user-defined actions are, [below](#user-defined-actions-later-stage)).

| Field | What it holds | Why it exists |
| --- | --- | --- |
| `id` | Stable action ID, never reused (`note.share`, `appearance.dark`) | Frecency, keybindings and future pins refer to it |
| `command` + `args` | The command it runs, with fixed arguments | One command can back several distinct actions (*Use dark appearance* and *Use light appearance*) |
| `label` | Message key: a verb and its object, unique in the catalogue | Q4 |
| `outcome` | Message key: one sentence saying what happens (*Opens the share dialog for this note*) | Shown for the active row only, and read by screen readers |
| `synonyms` | Message key: extra search words (*keys, hotkeys, mapping, cheat sheet*) | People search in their own words (H2) |
| `anchor` | `app`, `project`, `note`, `selection:text`, `selection:image`, `result:note`, `result:folder` | Q3; decides group and listing |
| `when` | Pure predicates over the context snapshot that make it **hidden** | Q3, Q6 |
| `blockedWhen` | Predicates that make it **blocked**, each with its reason key and the fix action's ID | H9 |
| `effect` | `navigate`, `toggle`, `flow`, `edit`, `files`, `visibility`, `outbound`, `destructive` | Decides confirmation, undo and wait (next section) |
| `leaves` | `none`, `github`, `ai`, `system-share`, `browser` | The data boundary, stated in the row for AI and checked by review |
| `wait` | `instant`, `responsive`, `waiting`, `long`, with its `fn:` measure | [Perceived performance](perceived-performance.md) |
| `undo` | How it's reversed: `ctrl-z`, `toggle-back`, `recently-deleted`, `unpublish`, `confirm-first` | Every change has a way back or asks first |
| `proof` | The check that runs it from Actions and asserts what the person sees | Q5; an entry without one isn't listed |
| `platforms`, `windows` | Desktop OSs, and `project` / `file` windows | Q6 |
| `alsoIn` | Its pointer paths: toolbar, ⋯ menu, Files menu, Settings | Q7 |

The shortcut, icon and current state come from the command, so Actions shows the same key as the cheat sheet and menus. Group order and headings come from `anchor`; nothing else decides layout.

## Telling actions apart

**Owner:** "Critical thinking required on having enough distinction for each action so that it's not confused with anything else." The rules (proposal P-07), each checkable:

| Rule | Example | Checked by |
| --- | --- | --- |
| **D1 Unique label.** No two catalogued actions share a label, in any language file. | *Share…* and *Share…* become *Share this note…* and *Share folder…* | Catalogue check |
| **D2 Verb, then object.** Labels start with the verb; the object is named whenever another action uses the same verb. | *Rename this note…*, *Rename this folder…*, *Rename project…* | Catalogue check: same first word ⇒ an object is required |
| **D3 "This" names the target.** Note and folder actions say *this note*, *this folder*; in the list "this" is the open note, in a result's panel it's that result, and the panel's heading is context, never what tells two rows apart. | *Publish this note…* in both places | Review |
| **D4 Ellipsis means more input.** "…" only when a flow asks for something before anything changes. | *Rename project…* (asks a name), *Bold* (doesn't) | Review, existing convention |
| **D5 One outcome, one action.** Two actions never reach the same outcome; two outcomes never share an action. | *Files* and *Show the current note in Files* become *Show Files* and *Show this note in Files* | Review |
| **D6 State in the row, not a second action.** A toggle is one action showing its state; a choice of a few values is one action per value. | *Focus mode · On*; *Use dark appearance*, *Use light appearance*, *Match system appearance* | Review |
| **D7 Synonyms never collide with a label.** A synonym that is another action's label is removed. | *shortcuts* can be a synonym of *Keyboard shortcuts* only while no other action is labelled *Shortcuts* | Catalogue check |
| **D8 Look-alike review.** Any two labels sharing a verb, or within a short edit distance, are listed for review with their outcomes side by side when the catalogue changes. | *Open project…* / *Open file…* / *Open project on GitHub* | Catalogue check prints the pairs |

## Effects, confirmation and undo

What an action can change decides how it confirms and how it's undone. Actions never adds a confirmation of its own; it reuses the one the action already has elsewhere (H4).

| Effect | Examples | Confirmation | Undo | Actions closes? |
| --- | --- | --- | --- | --- |
| `navigate` | Open a note, Show this note in Files, Keyboard shortcuts | None | Back (<kbd>Alt</kbd>+<kbd>←</kbd>) | Yes, focus goes to the destination |
| `toggle` | Focus mode, Use dark appearance | None; the row's state changes | Run it again | Yes; <kbd>Shift</kbd>+<kbd>Enter</kbd> keeps it open (SPT-10) |
| `flow` | Rename project…, Connect to AI…, Customize toolbar… | The flow's own steps; nothing changes until you confirm there | The flow's own | Yes, focus moves into the flow |
| `edit` | Bold, Add link… | None | One <kbd>Ctrl</kbd>+<kbd>Z</kbd> step | Yes, focus and selection return to the note |
| `files` | Move this note to…, Duplicate this note | Files' own confirmations and batches (D-94, D-99) | Files' undo, Recently deleted | Yes |
| `visibility` | Make this note public | Always asks (CP-REACH-01 conflict table: "even from Spotlight") | Make private | Yes, into the confirmation |
| `outbound` | Share this note…, Publish this note…, Rewrite with AI… | The flow's disclosure (destination, integration, model, where it runs) | Unpublish, stop sharing, one undo step for AI text | Yes, into the flow |
| `destructive` | Delete this note, Delete project… | Its existing confirmation; the danger button | Recently deleted; none for a project (GitHub's own) | Yes, into the confirmation |

**No action chains into an outbound or destructive effect without the person seeing the destination or the consequence first.** That's why [chaining](#composition-and-chaining) is out.

## AI-backed actions

Focus Notes integrates with an AI service the person chose; it never runs a model (RWR-70). AI-backed actions are ordinary catalogue entries with `leaves: ai`, built on surfaces the owner has approved:

- **They open the existing prompt, they don't send.** *Rewrite with AI…* opens the [inline prompt](../experience/rewrite-with-ai.md) on the selection; *Write with AI…* opens it at the caret (RWR-92); a preset-backed action such as *Make shorter with AI…* opens it **pre-filled** (proposal P-08). <kbd>Ctrl</kbd>+<kbd>Enter</kbd> sends, exactly as today, so "presets never send" (UC-RWR-01) still holds and the integration, model and *This computer*/*Cloud* are on screen before anything leaves.
- **The row says where words go.** The active row's outcome line names the integration and where it runs: *Opens the prompt · Ollama · This computer*.
- **Blocked without a connection.** With no AI connection the row is blocked with *Connect to AI first*, and *Connect to AI…* follows it.
- **They send only their anchor.** The selection and the prompt, or the selected image and its instruction (D-303). Never the note, the project or the query typed into Actions.
- **Out: "ask AI about my notes".** An action that sends notes for search or answers would send private content beyond an explicit selection. Not proposed; it would need its own promise and decision.

## Privacy, network and providers

- **Finding stays on the device.** The index, the query and the ranking never leave it (SPT-08, D-107). Actions makes no request while you type, including no AI ranking, no web search and no telemetry.
- **Only this project.** Results and anchors come from the window's project (D-273); a private note appears only in its own project's window.
- **No new network destination.** Every outbound action goes to a destination the app already has: GitHub (share, publish, sign-in), the chosen AI integration, the system share sheet, or the browser for *Open … on GitHub*. Adding an action never adds a destination; one that would is escalated to the owner.
- **Agents are separate.** Agents run commands through MCP with their own permissions (AGT-03); the catalogue doesn't widen them. Its `effect` and `leaves` fields could later inform agent permissions, but that's not proposed here.

## Failure and recovery

Following [UI states](../design/ui-states-audit.md), every failure keeps the person's input and offers a way forward.

| What fails | What the person sees | Way forward |
| --- | --- | --- |
| The anchor changed after Actions opened (note moved, selection edited, project closed) | Actions stays open, the query kept, and the row says *This note changed. Try again.*; the list refreshes | Run it again on the fresh context |
| A precondition is missing | The row is blocked with its reason | Its fix, listed next |
| The action starts but fails (disk, network, GitHub refuses) | The flow's own error, or the notification pill with the action's name (SPT-10's command error) | Retry from the pill or the flow; nothing half-done is left behind |
| A long action is under way (publish) | Actions closes; the task tracker shows its steps | Leave it running; cancel where the flow allows |
| An action has no proof yet or its check fails in CI | It isn't listed | Fix it or leave it out; never ship a row "to be fixed" |

## Composition and chaining

**Out, deliberately** (proposal P-09). No macros, no "run A then B", no passing one action's output to another. The owner's note asks for confidence and distinction; a chain multiplies the ways an action can fail and hides outbound steps inside a name. Apple Shortcuts, Alfred workflows and QuickAdd macros show the power and the cost ([prior art](#prior-art)). Revisit only when the owner names a repeated multi-step job the starter set can't do.

## User-defined actions (later stage)

**Proposal P-10, planned: built after the starter set has been in use for a week (question 3, approved default).** The most useful extension a writer is likely to want is **their own words, reused**: a prompt they keep typing, or a block of text they keep starting notes with. Two kinds only, both declarative:

| Kind | Anchor | Does | Leaves the device |
| --- | --- | --- | --- |
| **Saved prompt** | `selection:text` or `note` (caret) | Opens the AI prompt pre-filled with the saved words; <kbd>Ctrl</kbd>+<kbd>Enter</kbd> sends | Only when sent, to the chosen integration |
| **Template** | `note` (caret) or `project` (new note) | Inserts saved Markdown at the caret as one undo step, or makes a new note from it in a chosen folder | Never |

- **No scripts, no shell commands, no URLs that run.** Templater's own README warns that running arbitrary JavaScript or system commands from templates is dangerous; Focus Notes is an Electron app holding private notes and keys, so code execution is a security boundary it doesn't open.
- **Stored per person, not per project:** `actions.json` in the app's data folder, beside `ai.json`, never committed. A project's `.focus-notes/` can be in a public repository, and a saved prompt can quote private material. Project-shared templates are a later question.
- **They follow the same rules:** a unique label (D1, against built-ins too), an anchor, and a *Yours* group heading so they're never mistaken for built-ins. The catalogue proof covers the two kinds, not each saved entry.
- **Format:** `schemas/actions.schema.json` (JSON Schema 2020-12, published with the others, AGT-08), `"version": 1`, unknown fields kept, a newer version opened read-only rather than rewritten. The schema is drafted in the plan (WP-A.8), not committed before the owner approves the stage.

## Extension surface

**None** (proposal P-11). No plugins, no third-party actions, no store. Raycast's and Obsidian's extension ecosystems are their products' centre; Focus Notes' promise is calm, private writing, and every extension point is a supply-chain and privacy boundary in an Electron app. Agents already have a documented surface (MCP, CLI, deep links, AGT-01 to AGT-06). User-defined actions above are data, not code.

## Performance and waits

| Measure | Budget | Notes |
| --- | --- | --- |
| Opening Actions | 50 ms (SPT-07, unchanged) | The context snapshot and availability are pure functions over in-memory state: no disk, no IPC, no network |
| Availability for the whole catalogue | 2 ms at 150 actions (`fn:actions.available`, new) | Runs on open and on each context change, never per keystroke |
| Per keystroke | 16 ms (SPT-07, unchanged) | Actions are a short list matched in memory |
| Running | By `wait` class | `navigate`, `toggle`, `edit` instant; `flow` shows its first frame within 100 ms; `outbound` uses its flow's existing waiting or long pattern and the task tracker |

## Keyboard and accessibility

Unchanged from Spotlight, where it's built: the combobox and listbox pattern, focus kept in the field, the active row by `aria-activedescendant`, results announced politely, and focus, caret and selection returned exactly on close. Additions:

- **Group headings are anchors**, read as the group's name: *This selection*, *This note*, *This project*, *App*, *Yours*.
- **The active row's outcome line** is its accessible description, so a screen reader hears what will happen, and, for AI actions, where the words go.
- **Blocked rows** are announced unavailable with their reason; the fix row follows in reading order.
- **Keys:** <kbd>Enter</kbd> runs; <kbd>Shift</kbd>+<kbd>Enter</kbd> runs a toggle and stays open; <kbd>→</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> opens a result's own actions; <kbd>Esc</kbd> goes back, then closes. No new keys.

## Versioning

- Action IDs are stable and never reused, like requirement IDs. Renaming a label keeps the ID.
- Removing an action from the catalogue doesn't remove its command; the change is recorded in decisions with the reason.
- `actions.json`, when it exists, carries `"version"`, is read by every later version, and is never silently rewritten by an older one.

## Prior art

Official documentation, checked 6 November 2026. Lessons, not features.

| Product | What its documentation says | The lesson taken here |
| --- | --- | --- |
| [VS Code: contribution points](https://code.visualstudio.com/api/references/contribution-points#contributes.commands) | "The Command Palette doesn't show icons nor disabled commands", while the editor context menu shows disabled items; a `menus.commandPalette` entry with `when: "false"` keeps a command out of the palette but runnable elsewhere; the palette prefixes commands with their `category` | Hide what can't apply in the quick list (P-04); a command can exist without being listed (the gate); group to tell look-alikes apart (D2, anchors) |
| [VS Code: when clause contexts](https://code.visualstudio.com/api/references/when-clause-contexts), [Tasks](https://code.visualstudio.com/docs/debugtest/tasks) | Availability is a boolean expression over context keys; people define their own tasks in `tasks.json` | `when` as pure predicates over a snapshot; user-defined actions as a plain, inspectable file |
| [Obsidian: commands](https://docs.obsidian.md/Plugins/User+interface/Commands) | `checkCallback` is called once to check and once to run; "editor commands only appear in the Command Palette when there's an active editor" | Check, then act, on the same context (P-03); editing actions need a note anchor |
| [Raycast: Action Panel](https://developers.raycast.com/api-reference/user-interface/action-panel), [Store guidelines](https://developers.raycast.com/basics/prepare-an-extension-for-store) | Actions are context-aware for the selected item; the first two actions get <kbd>↵</kbd> and <kbd>⌘↵</kbd>; sections group related actions; titles are verb and noun without articles, with context in a searchable subtitle | A result's own actions behind <kbd>→</kbd>; verb-then-object labels (D2) and an outcome line (anatomy) |
| [Raycast: arguments](https://developers.raycast.com/information/lifecycle/arguments.md), [Quicklinks](https://manual.raycast.com/quicklinks) | Up to three typed arguments, entered inline before a command opens; people save their own Quicklinks with placeholders | Parameters stay in each flow for now (P-12); saved user items are data with their own actions (P-10) |
| [Alfred: Universal Actions](https://www.alfredapp.com/help/features/universal-actions/), [File Actions](https://www.alfredapp.com/help/workflows/triggers/file-action/) | "Alfred will intelligently narrow down the list to show relevant actions" for the selected text, file or URL; custom actions are scoped by content type | The selection's kind is the anchor (`selection:text`, `selection:image`) and narrows the list |
| [Alfred: Workflows](https://www.alfredapp.com/help/workflows/), [QuickAdd macros](https://quickadd.obsidian.guide/docs/Choices/MacroChoice/) | Visual chains of triggers and actions; macros chain commands, scripts and AI prompts | Powerful, and the reason chaining is out until a real job needs it (P-09) |
| [Templater](https://github.com/SilentVoid13/Templater) | "It can be dangerous to execute arbitrary JavaScript code or system commands from untrusted sources" | Templates are text only; no code (P-10, P-11) |
| [Notion AI](https://www.notion.com/help/notion-ai-faqs) | *Edit with AI* on a highlight: "accept, discard, or ask it to try again"; a separate setting requires confirmation for AI web requests | AI actions keep an obvious way back and say where words go; Focus Notes keeps its approved in-place stream with one undo step (D-256) rather than an accept step |
| [Apple App Intents: `isDiscoverable`](https://developer.apple.com/documentation/appintents/appintent/isdiscoverable), [parameters](https://developer.apple.com/documentation/appintents/adding-parameters-to-an-app-intent), [intent types](https://developer.apple.com/documentation/appintents/app-intent-types) | An intent can run from the app's own interface while not being discoverable by Spotlight or Siri; required parameters are prompted for; roles such as `UndoableIntent` and `DeleteIntent` add standard behaviour | Listing is a separate, explicit decision from existing (the gate); the `effect` field gives each action its standard confirmation and undo |

## Proposals register

Everything here that isn't in the owner's note, with what it assumes and how to check it cheaply. The assumptions are in [Risks](../plan/risks.md#actions-risks-and-assumptions).

| # | Proposal | Assumption and risk | Cheapest check | Decision it changes |
| --- | --- | --- | --- | --- |
| P-01 | Content is exactly what Files shows | Nothing worth opening is hidden from Files. Low risk, not in the register | Owner looks for 5 files in the mock list | Which files Actions finds |
| P-02 | Headings and text are reasons on the file row, not their own groups | A-ACT-03: a file row with the matching line is as findable as separate groups, and calmer. Medium | Owner finds a note by a phrase in its body in the mock | Whether *Headings* and *In notes* groups return |
| P-03 | Context snapshot and refuse-on-change | Stale context would act on the wrong text (R-57). Feasible: Rewrite already guards its target | Unit check after design approval | Whether actions re-read context at run time |
| P-04 | Hide what can't apply | A-ACT-02: people don't think a feature vanished when its anchor is missing. Medium | Owner, with no selection, looks for Bold; finds it via `>` | Hidden vs shown unavailable |
| P-05 | Blocked rows with a reason and their fix listed next | Fix-next is clear without a two-purpose row. Low | Mock review | Whether a blocked row runs its fix itself |
| P-06 | `>` browses the whole catalogue, with what each needs | Browsing is how rarely used actions are learned. Low | Mock review | Empty-field contents |
| P-07 | Distinction rules D1 to D8 and anchor groups | A-ACT-01: anchor groups plus object-naming labels make look-alikes distinct. High value | Owner picks the right row for *share*, *rename*, *publish*, *settings*, *delete* in the mock without reading outcomes | Labels, groups |
| P-08 | Preset-backed AI actions open the prompt pre-filled | Worth a row each only if people reuse presets; R-58 if it ever sent directly. Medium | Owner tries *Make shorter with AI…* in the review build | Whether presets get rows |
| P-09 | No chaining | No starter job needs it. Low | Owner names any repeated multi-step job | Adds a composition stage |
| P-10 | User-defined saved prompts and templates, later | A-ACT-05: the owner wants their own actions. Unknown | Ask (open question 3) | Whether stage 3 exists |
| P-11 | No plugin or extension surface | Agents and user data cover extension needs. Low | None needed | Would need a security review and a new promise |
| P-12 | Parameters are collected by each action's existing flow, not inline in Actions | Inline fields would duplicate approved flows. Low | Mock review | Adds inline arguments |
| P-13 | Groups by anchor: *This selection*, *This note*, *This project*, *App* | The anchor is the most useful grouping. Medium | Same as P-07 | Group names and order |
