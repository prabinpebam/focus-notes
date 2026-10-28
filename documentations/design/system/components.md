# Component catalog

The design system's components: what each one is for, its variants and key props, the accessibility pattern it implements, and which views and IA components use it. Every row says whether the component is **implemented** (a registered contract a view can name), **composed** (built from implemented parts in a view document, or drawn inside another implemented component), or **planned** (no contract yet, so no view can use it). Views are assembled only from implemented components.

> [!NOTE]
> **TL;DR.** **70 registered contracts**: **45 primitives** (Text, Icon, Button, TextField, SearchField, Slider, FileTree, WindowControls, and so on), **5 host components** that wrap imperative DOM (EditorSurface, TableControls, BlockHandle, WindowFrame, TextMenu), **16 layouts** (AppRoot, Stack, Inline, Columns, Surface, Layer, Positioner, Sheet, and so on), **1 block component** (NoteContent, which renders a note's blocks on published pages and on paper), and **3 compound components** (Trigger, Toolbar, Dialog). The [implemented inventory](#inventory) is generated from those contracts and checked by `pnpm check`, so its names and counts can't drift (D-200). The guidance tables below also keep composed entries (Spotlight, the find bar, the formatting toolbar and other surfaces built in the canvas view document) and planned entries (Checkbox, Switch, Select, VirtualList, and others), each marked. The view schema is generated from the contracts (DSY-05).

<h2 id="inventory" data-reader-personas="design engineering">Implemented inventory</h2>

The table below is generated from the registered contracts (`schemas/ui/catalog.v1.json`, which `ui:check` keeps equal to the contracts in `packages/ui`). Don't edit it by hand: run `node tools/component-inventory.mjs`. `pnpm check` runs it with `--check`, which fails when the table is stale, when the TL;DR's counts differ, when a guidance row marked *Implemented* names a component that isn't registered in that tier, when a *Composed* or *Planned* row names one that is, or when a registered component has no *Implemented* row (D-200).

| Status | Meaning |
| --- | --- |
| **Implemented** | A registered contract. *Implemented as a primitive* (or another tier) marks a component documented in one section but built in another tier. |
| **Composed** | No contract of its own: built in a view document from implemented components, or drawn inside one. The row says which. |
| **Planned** | No contract yet. A view that names it fails validation. |

A declared state is covered by a fixture, reached by a named journey, or listed as a gap with its reason (D-198); the fixture count says nothing about states the fixtures don't reach. The product site's components (`Site*`) are registered in the site's own registry, not the app's.

<!-- generated:component-inventory: node tools/component-inventory.mjs; do not edit by hand -->

**70 registered contracts:** 45 primitives, 5 host components, 16 layouts, 1 block component, 3 compound components.

| Component | Tier | Declared states | Fixtures | States listed as gaps |
| --- | --- | --- | ---: | --- |
| Text | primitive | `rest` | 20 | None |
| Heading | primitive | `rest` | 4 | None |
| Icon | primitive | `rest` | 4 | None |
| Button | primitive | `rest`, `hover`, `pressed`, `selected`, `focusVisible`, `disabled`, `busy` | 14 | `hover`, `pressed`, `focusVisible` |
| IconButton | primitive | `rest`, `hover`, `pressed`, `selected`, `mixed`, `focusVisible`, `disabled`, `busy` | 8 | `hover`, `pressed` |
| Tooltip | primitive | `hidden`, `visible` | 4 | `visible` |
| SignalDot | primitive | `rest` | 3 | None |
| TriggerButton | primitive | `rest`, `hover`, `pressed`, `focusVisible` | 3 | `hover`, `pressed`, `focusVisible` |
| Divider | primitive | `rest` | 2 | None |
| PopoverPanel | primitive | `closed`, `open` | 7 | `open` |
| MenuButton | primitive | `closed`, `open`, `itemFocused`, `itemDisabled`, `itemChecked` | 6 | None |
| Shortcut | primitive | `rest` | 2 | None |
| SearchField | primitive | `rest`, `focused`, `filled`, `invalid` | 15 | `focused` |
| SegmentedControl | primitive | `rest`, `hover`, `selected`, `focusVisible` | 4 | `hover`, `focusVisible` |
| DialogPanel | primitive | `open`, `entering`, `exiting` | 5 | `entering`, `exiting` |
| Spinner | primitive | `rest` | 2 | None |
| Skeleton | primitive | `rest` | 6 | None |
| LiveRegion | primitive | `rest` | 1 | None |
| Toast | primitive | `rest`, `paused`, `focusVisible` | 2 | `paused`, `focusVisible` |
| ResultList | primitive | `rest`, `active`, `disabled` | 6 | None |
| Tabs | primitive | `rest`, `hover`, `selected`, `focusVisible` | 3 | `hover`, `focusVisible` |
| MorphPanel | primitive | `closed`, `opening`, `open`, `closing` | 2 | None |
| TextField | primitive | `rest`, `focused`, `invalid` | 11 | `focused` |
| PillButton | primitive | `rest`, `hover`, `pressed`, `focusVisible` | 1 | `hover`, `pressed`, `focusVisible` |
| FileTree | primitive | `rest`, `hover`, `focusVisible`, `selected`, `current`, `multiSelected`, `editing`, `invalid`, `dropTarget`, `pending`, `readOnly`, `menuOpen` | 2 | `hover`, `focusVisible`, `dropTarget`, `menuOpen` |
| VersionPane | primitive | `rest`, `changed`, `empty` | 2 | None |
| WindowControls | primitive | `hidden`, `shown`, `buttonHover`, `closeHover`, `focusVisible`, `layoutsOpen`, `zoneHover` | 3 | `buttonHover`, `focusVisible`, `zoneHover` |
| ThemeGallery | primitive | `rest`, `hover`, `selected`, `focusVisible`, `previewing` | 2 | `hover`, `focusVisible` |
| Slider | primitive | `rest`, `hover`, `dragging`, `focusVisible` | 3 | `hover`, `dragging`, `focusVisible` |
| ColorField | primitive | `rest`, `focused`, `invalid` | 2 | `focused` |
| AppMark | primitive | `rest` | 3 | None |
| StepMark | primitive | `rest` | 9 | None |
| ItemCard | primitive | `rest` | 8 | None |
| SaveState | primitive | `rest`, `hover`, `pressed`, `focusVisible`, `savedLocal`, `pending`, `syncing`, `synced`, `offline`, `error` | 6 | `hover`, `pressed`, `focusVisible` |
| StepDots | primitive | `rest` | 3 | None |
| StatusRow | primitive | `rest` | 5 | None |
| CodeBlock | primitive | `rest` | 2 | None |
| VersionCompare | primitive | `rest` | 1 | None |
| StrengthMeter | primitive | `rest` | 5 | None |
| ProgressBar | primitive | `rest` | 3 | None |
| DatePicker | primitive | `rest`, `focused`, `open`, `invalid` | 3 | `focused`, `open` |
| SiteLink | primitive | `rest`, `hover`, `focus` | 6 | `hover`, `focus` |
| SiteText | primitive | `rest` | 10 | None |
| SiteFigure | primitive | `rest` | 3 | None |
| SiteThemeShowcase | primitive | `light`, `dark`, `focus` | 1 | `dark`, `focus` |
| EditorSurface | host component | `empty`, `editing`, `readOnly` | 0 | `readOnly` |
| TableControls | host component | `hidden`, `hover`, `handleHover`, `menuOpen`, `insertPoint`, `dragging`, `resizing`, `rangeSelected` | 0 | `hidden`, `handleHover` |
| BlockHandle | host component | `hidden`, `shown`, `pressed`, `menuOpen`, `dragging` | 0 | `hidden` |
| WindowFrame | host component | `rest`, `bandHover`, `fullScreenHidden`, `moving`, `resizing`, `menuOpen` | 0 | `bandHover`, `fullScreenHidden` |
| TextMenu | host component | `closed`, `open`, `itemFocused`, `itemDisabled` | 1 | None |
| Stack | layout | `rest` | 16 | None |
| Inline | layout | `rest` | 16 | None |
| Columns | layout | `rest` | 1 | None |
| Surface | layout | `rest` | 24 | None |
| Layer | layout | `rest` | 19 | None |
| Center | layout | `rest` | 11 | None |
| AppRoot | layout | `rest` | 29 | None |
| ToolbarRow | layout | `rest` | 1 | None |
| Field | layout | `rest`, `error` | 2 | None |
| Positioner | layout | `above`, `below`, `offscreen` | 5 | `offscreen` |
| Sheet | layout | `rest`, `entering`, `pinned`, `docked` | 4 | `entering` |
| ReaderPage | layout | `rest` | 1 | None |
| PrintPage | layout | `rest` | 2 | None |
| SitePage | layout | `rest` | 3 | None |
| SiteSection | layout | `rest` | 5 | None |
| SiteGrid | layout | `rest` | 1 | None |
| NoteContent | block component | `rest` | 1 | None |
| Trigger | compound component | `rest`, `hover`, `pressed`, `focusVisible`, `open`, `problem` | 2 | `pressed`, `focusVisible` |
| Toolbar | compound component | `rest` | 1 | None |
| Dialog | compound component | `open`, `entering`, `exiting` | 5 | `entering`, `exiting` |

<!-- /generated:component-inventory -->

<h2 id="contracts" data-reader-personas="engineering">Contracts</h2>

Each component declares a contract in `packages/ui`. `ui:check` turns the contracts into the view JSON Schema, the gallery's fixtures, and the catalog published for agents (DSY-13), and fails when the committed copies in `schemas/ui` differ (D-138). Each component's React props are written beside its contract, and every registry is built with `defineRegistry` (`packages/ui/src/register.ts`), which checks them against the contract at compile time (D-199). Contracts are also exported keyed by type as `contractsByType`, and a contract can declare `requiresId`, which `ui:check` enforces (ResultList, FileTree). This is the contract for `Button`, abridged from `schemas/ui/contracts.v1.json`:

```json
{
  "type": "Button",
  "tier": "primitive",
  "props": {
    "label":          { "kind": "message", "required": true },
    "variant":        { "kind": "enum", "values": ["primary", "secondary", "subtle", "danger"], "default": "secondary" },
    "size":           { "kind": "enum", "values": ["s", "m", "l"], "default": "m" },
    "icon":           { "kind": "icon" },
    "iconPosition":   { "kind": "enum", "values": ["start", "end"], "default": "start" },
    "busy":           { "kind": "boolean", "default": false },
    "disabled":       { "kind": "boolean", "default": false },
    "disabledReason": { "kind": "message", "requiredWhen": "disabled" }
  },
  "events": { "press": {} },
  "slots": {},
  "states": ["rest", "hover", "pressed", "selected", "focusVisible", "disabled", "busy"],
  "uncovered": {
    "hover": "Pointer hover: a static fixture can't show it, and no journey checks it yet."
  },
  "tokens": "cmp.button.*",
  "a11y": { "pattern": "button", "name": "label" }
}
```

| Field | Meaning |
| --- | --- |
| `props` | Every prop, typed. Kinds: `message` (a string key), `icon` (an icon name), `token` (a token name from one group, such as `space`), `command` (a command ID), `boolean`, `number` (with a range), `enum`, and list kinds whose items are checked against the data types they hold (`commandItems`, `menuSections`, and so on, D-198). A view may bind a prop to state. There are no free-text strings and no open objects. |
| `events` | Named events a view may attach actions to, with the payload's type. |
| `slots` | Named child areas, each listing the component types it accepts and how many. |
| `states` | Every visual state. `ui:check` requires each one to be rendered by a fixture (`covers`), reached by a journey that exists (`journeys`), or listed in `uncovered` with its reason (D-198). Approved pixel baselines for states are **planned (DS-A03)**. |
| `tokens` | The component's own tokens. It may read nothing else; the boundary check enforces this (D-197). |
| `a11y` | The ARIA Authoring Practices pattern, and which prop provides the accessible name. |

**Busy state (D-199).** Button, IconButton and ItemCard take `busy` as a boolean bound to the task tracker (`busyProps` in `packages/core/src/tasks.ts`). One shared hook, `useBusy` (`packages/ui/src/behaviors/busy.ts`), turns it into `data-busy` phases and sets `aria-busy`; it has no timer of its own. The `ack` phase is the delay in the control's style: the spinner appears after `cmp.button.busy.signDelay` or `cmp.iconButton.busy.signDelay` (both `{wait.signDelay}`, 300 ms), replacing the icon in the same cell, and `done` shows for 1.5 s. A busy control is inert but not dimmed and keeps its width; Button can show a `busyLabel`. A region being updated shows an indeterminate `ProgressBar` line placed by its view, and no component times its own waits ([Waits](../components/feedback-and-dialogs.md#waits), PRF-08). View models that set `busy` directly rather than through the tracker get the reveal delay but not the minimum display time.

<h2 id="primitives" data-reader-personas="design engineering">Primitives</h2>

| Component | Status | Variants and key props | Pattern | Used by |
| --- | --- | --- | --- | --- |
| **Text** | Implemented | `role`: caption, secondary, body, emphasis, title, label. `tone`: default, muted, accent, danger, warning, success. `lines` (truncate), `value` (message or binding) | Text | Everywhere |
| **Heading** | Implemented | `level` 1 to 3 (interface headings, not note headings), `value` | Heading | Sheets, dialogs, settings |
| **Icon** | Implemented | `name` (Fluent registry), `size` s/m/l, `filled` | Image, or hidden when decorative | Everywhere |
| **Shortcut** | Implemented | `keys` (key caps in the platform's symbols, from a view model, which takes them from the command registry) and `label` (the chord in words). Caps are hidden from screen readers, which read the words instead | Text, with an accessible name that says the keys in words | Menus, tooltips, Spotlight, cheat sheet |
| **Button** | Implemented | `variant` primary, secondary, subtle, danger. `size`, `icon`, `busy`, `disabledReason`, `toggle` with `pressed`, `autoFocus` (takes focus when it appears: a confirmation's *Cancel*, D-100, or a first-run step's primary action, D-101). Inside an editor companion (Positioner), a pointer press leaves focus in the note | Button, or toggle button | Dialogs, forms, banners, the formatting toolbar's Link, the first run |
| **IconButton** | Implemented | `icon`, `label` (required), `variant` subtle or frost, `toggle` with `pressed`, and `mixed` for a toggle that applies to only part of what it acts on (`aria-pressed="mixed"`, a lighter fill) | Button, or toggle button | Toolbar, window controls, find bar, formatting toolbar |
| **Link** | Planned | `label`, `command` (internal) or `url` (opened through the `link.open` command). The product site's links are **SiteLink** | Link | Help text, About |
| **Checkbox** | Planned | `label`, `checked` (bindable), `indeterminate` | Checkbox | Lists, settings |
| **RadioGroup** | Planned | `label`, `options` (bound list), `value` (bindable), `orientation`. Today SegmentedControl serves settings choices | Radio group | Settings |
| **Switch** | Planned | `label`, `description`, `checked` (bindable) | Switch | Settings |
| **TextField** | Implemented | `label`, `description`, `error`, `value` (bindable), `placeholder`, `icon`, `type` text, email, url, or password (secrets). `labelHidden` keeps the label for screen readers only, for one-line editors | Text box | Forms, rename, link editor, passcodes |
| **TextArea** | Planned | As TextField, plus `rows` | Text box, multi-line | Invite message |
| **SearchField** | Implemented | `label`, `value` (bindable), `placeholder`, `clearLabel`, `autoFocus`, `keyScope` (the first run's repository search is `repoField`, Spotlight's `spotlightField`, Find in all notes' `findAllField`), `chip` (a mode shown before the text, such as Spotlight's All or Commands; hidden from screen readers, so the label says the mode in words). <kbd>Esc</kbd> clears it, or passes on to close the dialog when it's already empty | Search box | Spotlight, Files, Settings |
| **SecretField** | Planned | `label`, `value`, `reveal` toggle, `strength` (bound). Today passphrases use TextField `type` password with a **StrengthMeter** | Text box, with a reveal button | Passcodes, tokens |
| **NumberStepper** | Planned | `label`, `value`, `min`, `max`, `step`, `format` | Spin button | Font size row |
| **Select** | Planned | `label`, `options`, `value` (bindable) | Select (list box popup) | Settings |
| **Combobox** | Planned | `label`, `options` (bound, filtered by a view model), `value` | Combobox | Move to, audience names |
| **Slider** | Implemented | `label`, `value`, `min`, `max`, `step`, `format`. As built (D-108): `value` bindable, `valueText` shown beside the label ("60 characters"), `format` number or percent for what's spoken; changes apply as it moves; `cmp.slider.*` | Slider | Reading width, line spacing, focus dim |
| **SegmentedControl** | Implemented | `label` (visible), `options` (2 to 5, from a view model), `value` (bindable), `orientation` (`horizontal`, or `vertical`: one full-width row per choice, for labels that don't fit side by side, D-123). Arrow keys move and select | Radio group, drawn as segments | Appearance, find options, cheat sheet filters |
| **Badge** | Composed | `tone`, `value`. No contract: ItemCard draws its own badge (`badge`, such as Public or Private) | Text | Visibility, agent changes, status |
| **Tag** | Planned | `value`, `removable` | Button, when removable | Audiences, filters |
| **Swatch** | Composed | `color` (a token or a theme's value), `selected`, `label`. As built (D-108), not a component of its own: ThemeGallery draws its tiles' samples and ColorField its swatch | Radio or button | Theme gallery, color editor |
| **ColorField** | Implemented | As built (D-108): `label` (required), `value`, `swatch` (only `#rgb` or `#rrggbb` is painted), `description` (said with it: the contrast it's checked against), `invalid`, `error`, `focusRequest`; event `commit`. A hex field committed on <kbd>Enter</kbd> or on leaving it, so typing never applies half a color; <kbd>Esc</kbd> puts the value back; `cmp.colorField.*` | Text box | Theme manager → Edit colors |
| **DatePicker** | Implemented | `label` (required), `value`, `min`, `max`, `description`, `invalid`; event `change`. A day typed segment by segment or picked on a calendar that opens from its button, every part named in the locale's words (D-143); `cmp.datePicker.*` | Date picker: spin buttons, and a dialog with a grid | An audience's last day |
| **SignalDot** | Implemented | `tone` red, warning, danger (size from `cmp.signalDot.size`) | Decorative, with status in its parent's name | Trigger, save state |
| **TriggerButton** | Implemented | `label` (required), `tone`, `expanded`, `shortcut`. A 30 px frosted circle holding a SignalDot, with a 32 px (44 px touch) hit area | Menu button | Trigger |
| **SaveState** | Implemented | `state` (savedLocal, pending, syncing, synced, offline, error; required), `label` (required), `text`, `interactive`; event `press`. An always-outlined circle whose border spins while backing up; it can open the backup-details card (EDT-11, UI-12, D-132); `cmp.saveState.*` | Button | The save indicator (UI-12) |
| **PopoverPanel** | Implemented | `label` (required), `open`, `placement`; slots `trigger` and `content`; event `openChange`. Frosted, anchored, closes on Esc (in one press, even over a tooltip) and outside click, and moves focus to its first action | Dialog (non-modal popover) | Trigger's toolbar, Share, link editor |
| **DialogPanel** | Implemented | `label` (required), `open`, `size` s, m (Spotlight's 640 px, `layout.dialogM`), l, or xl (the conflict resolver's, `layout.dialogXL`), `placement` center or top (about 20% down, `layout.dialogTop`, as Spotlight opens), `material` raised or frosted (the theme's frost); slots `header`, `fixed`, the scrolling body, and `footer`; event `openChange`. The scrim, the raised panel, focus kept inside and returned on close, <kbd>Esc</kbd> and scrim click to close. The body takes focus so it can be scrolled from the keyboard, and uses the minimal scrollbar | Dialog (modal) | Dialog, and through it Settings, the cheat sheet, and confirmations |
| **VersionPane** | Implemented | `label` (required), `blocks` (`versionBlocks` from a view model: id, text, changed), `emptyText`, `changedLabel`. One version of a note as plain-text blocks; changed blocks get `color.findMatch` and a mark at their start, and screen readers hear `changedLabel` before them. Tokens `cmp.versionPane.*` (D-102) | Region, labelled by its heading | The conflict resolver (IA-CMP-CONFLICT) |
| **MorphPanel** | Implemented | `label` (required), `open`; slots `trigger` and `content`; event `openChange`. Closed it's the trigger's circle; open, the circle grows into the content's frosted shape (sizes measured from the content, `motion.morph`) while the trigger shrinks away and the content fades in after `motion.enter`. Esc and clicking outside close it, and it reverses (UI-10) | Dialog (non-modal) | The trigger's toolbar |
| **MenuButton** | Implemented | `icon`, `label` (required), `variant` icon, pill, or text (pill and text show `text`; text adds a chevron, as in Turn into), `placement` bottom end, bottom start, or top start, `sections` (command items from a view model), event `action`. Checkable items use `menuitemcheckbox`; each item shows its shortcut. An unavailable item stays reachable by the arrow keys, says why under its label (part of its name), and does nothing when chosen, and a menu opened from the keyboard starts on its first available item; in a narrow window a submenu opens below its item (D-100, D-104). Its menu (`CommandMenu`) is also what FileTree, BlockHandle, TableControls, WindowFrame, and TextMenu open | Menu button | ⋯ menu, block menu, account pill (UI-12), Turn into |
| **PillButton** | Implemented | `label` (required), event `press`. Muted caption text in a pill with no fill or border until pointed at or focused; full opacity, so it keeps AA contrast | Button | *Unlock* and the owner's name in the account pill (UI-12), *Use this app for yourself*, and *Read only · Copy to my notes* |
| **ItemCard** | Implemented | `title` (required), `detail`, `badge`, `icon`, `avatar`, `initials`, `mark`, `size` m or l, `personal`, `label`, `busy`, `disabled`, `skeleton`, `autoFocus`; event `press`; a default slot for its actions. One thing shown rather than described: an account, a workspace, or an option (D-126, D-127); `cmp.itemCard.*` | Group, named by its label | The first run's account and workspace choices |
| **AppMark** | Implemented | `size` m or l, `label`. The app icon drawn from the brand tokens, a dark tile in a dark theme (D-126, D-135); decorative unless labelled | Image | The full-window setup's hero |
| **StepMark** | Implemented | `icon` (required), `tone` neutral, accent, danger, or success, `size` hero or compact, `busy`, `label`. A setup step's icon in a large tile; while the step waits a ring turns around it, still with reduced motion (D-127, D-135, D-132); decorative unless labelled | Image | Setup steps, the backup card |
| **StepDots** | Implemented | `current`, `total`, `label` (required). One dot per step, done steps filled, the current one longer (D-142); named as a whole ("Step 2 of 4") | Image | The first run |
| **StatusRow** | Implemented | `message` (required), `tone` danger, warning, info, or success, `icon`. One status on a tinted row, announced politely when it appears (D-142) | Status | Setup problems |
| **CodeBlock** | Implemented | `value` (required), `label`, `copyLabel` (required), `size` m or l; event `copy`. Something to type or paste elsewhere, such as a terminal command or a one-time code, in monospace with its own Copy (D-142). Not a note's code block, which NoteContent and the editor draw | Group, named by its label | Setup steps |
| **VersionCompare** | Implemented | `found`, `needed`, `foundLabel`, `neededLabel` (all required), `label`. The version found against the version needed, as two pills with an arrow (D-142) | Group, named by its label | Setup's tool checks |
| **StrengthMeter** | Implemented | `value`, `label` (required), `valueText`. Four segments toned by a passphrase's strength, with a word beside them (D-142) | Meter | Passphrase fields |
| **Spinner** | Implemented | `size`, `label` | Progress bar, indeterminate | Busy buttons, saving rows in Files, "Checking changes…" ([Waits](../components/feedback-and-dialogs.md#waits)) |
| **Skeleton** | Implemented | `shape` line, tile or avatar; `width` full, long, medium or short. A placeholder shaped like content on its way, with a light that passes three times (4.5 s) and then stands still; still with reduced motion, a plain GrayText shape in forced colours (D-208); `cmp.skeleton.*` | None: always hidden, the region beside it carries the one status | ItemCard skeletons in the first run, the spelling menu's "Checking spelling…", Settings' account, sharing, agents and About while they load, Send feedback's report, history and Recently deleted |
| **ProgressBar** | Implemented | `value`, `max`, `label`. A determinate bar for work that reports how far it has got, read out as a percentage; the words beside it say what the work is (PRF-13, D-149) | Progress bar | Setup, publishing, long work |
| **LiveRegion** | Implemented | `message` (required), `announceKey`. A polite announcement with nothing on screen; `cmp.liveRegion.*` | Status (live region) | Announcements that have no visible text |
| **Divider** | Implemented | `orientation` | Separator | Menus, toolbars |
| **Tooltip** | Implemented | `target` (by ID), `label`, `shortcut`. Renders inside its control's outermost landmark, so all content stays in landmarks (D-100) | Tooltip | Every icon button |
| **WindowControls** | Implemented | `label`, `minimizeLabel`, `maximizeLabel`, `restoreLabel`, `closeLabel`, `layoutsLabel` (all required), `maximized` and `reveal` (bindings), `layouts` (`vm.window.layouts`: each layout's zones, each a command); events `action` and `dismiss` (<kbd>Esc</kbd> on a button, the canvas closes the toolbar and the caret goes back to the note). Minimize, maximize or restore, and close (red on hover), hidden until the band is hovered (in full screen, once the pointer reaches the top edge, D-106), a button has focus, the window isn't active, or the toolbar is open. They sit in the 44 px title bar band, at its end. Hovering maximize for `window.snapLayoutsDelay`, or <kbd>↓</kbd> on it, opens the Snap Layouts picker: each layout a small screen whose zones are buttons of at least 24 × 24 px, moved between with the arrow keys, wrapping in a narrow window. Tokens `cmp.windowControls.*` (D-104) | Group of buttons; the picker is a non-modal dialog | The Windows and Linux title bar (IA-CMP-TITLEBAR) |

ResultList, Tabs, FileTree, ThemeGallery, and Toast are primitives too; they're described with the compounds they were first planned as, below. The product site's primitives (SiteLink, SiteText, SiteFigure, SiteThemeShowcase) are under [SitePage](#compound-components).

### Host components

Primitives that wrap a library needing direct DOM access. They have contracts like any other primitive, and views use them like any other component. A host's states are reached by the journeys its contract names (D-198), not by gallery fixtures.

| Component | Status | Wraps | Contract highlights |
| --- | --- | --- | --- |
| **EditorSurface** | Implemented | Tiptap and ProseMirror. Note content renders through the editor's own node views, with the same rules as the [block components](#block-components). | `note` (binding), `readOnly`, `measure`, events `selectionChange`, `contextMenu` |
| **TableControls** | Implemented | The table controls drawn over the note from geometry the editor surface publishes: row, column, and table handles with menus and drag to reorder, the + insertion point, New row and New column bars, the column tint, the range outline, and the cell menu ([Tables](../components/tables.html), D-96) | Labels and menus from `vm.table`, `menuRequest`; events `action` (`id`, `table`, `row`, `col`, `index`, `from`, `to`) and `close`. Tokens `cmp.tableControls.*` |
| **BlockHandle** | Implemented | The block handle drawn in the gutter beside the hovered block from geometry the editor surface publishes: a six-dot grip that answers on pointer-down, opens the block menu, and drags the block between blocks with an accent drop line, scrolling the note near its edges ([Text formatting → Block handle](../components/text-formatting.html#block-handle), D-160) | Label and menu from `vm.block`, `menuRequest` (Shift+F10, the Menu key); events `action` (`id`, `block`, `to`) and `close`. Its menu ends the note's auto-scroll as it opens (DEF-21). Tokens `cmp.blockHandle.*` |
| **FocusMask** | Composed | The focus-mode mask that tracks the caret's visual row ([Focus mode](../../experience/focus-mode.md)). Drawn by EditorSurface's own styles, with the dim level from AppRoot's `focusDim` | `active` (binding), `dim` (token) |
| **WindowFrame** | Implemented | The app-built window's behavior on Windows and Linux (D-104): moving by the band (double-click maximizes, right-click opens the system menu), showing the window controls while the pointer is on the band, and in full screen only once it reaches the top edge (`window.revealEdge`, DSK-04, D-106), the resize handles on every edge and corner, the system menu (<kbd>Alt</kbd>+<kbd>Space</kbd>), and the keys of its Move and Size. The shape and shadow are AppRoot's `frame`; the snap preview is drawn by the shell, outside the window | `frame` (native, rounded, square), `resizable`, `fullScreen`, `menu`, `menuLabel`, `menuRequest`, `menuX`, `menuY`, `keyboard` (bindings); events `drag`, `toggleMaximize`, `menu`, `action`, `key`. Tokens `cmp.windowFrame.*` |
| **TextMenu** | Implemented | The right-click menu in text on Windows and Linux (D-204, EDT-14): the spell checker's suggestions, Add to dictionary, and Cut, Copy, Paste and Select all, as the shell sent them, drawn as `CommandMenu` at the pointer so it follows the theme. It flips or shifts to stay in the window and scrolls in a short one; Esc, a click or right-click outside, a scroll, the window losing focus or a resize close it, and the caret and selection go back to the text or field as they were. Shortcuts are plain text, as in every menu. An unavailable item (Cut with nothing selected, No suggestions) shows as unavailable, its shortcut too; in forced colors the focused item is in Highlight and unavailable ones in GrayText. macOS shows the system's menu, in the app's appearance. 1 fixture | `label`, `sections` (from `vm.textMenu`), `request`, `x`, `y`, `open`; events `action` (`id`) and `close`. Tokens `cmp.menuButton.*` |
| **ColorArea** | Planned | The 2-D color picker, with custom themes (WP-8.2) | `value` (binding), `channels` |
| **VirtualList** | Planned | A virtualized scroller for long lists and trees | `items` (binding), `itemHeight` (token), with an item template from the view |

<h2 id="layouts" data-reader-personas="design engineering">Layouts</h2>

Layout props accept only token names: `gap`, `padding`, and `inset` take `space.*` steps, `width` takes `layout.*` sizes, and alignment takes enums. Layout props may vary by size class (`{ "compact": "s", "default": "m" }`) where the contract allows it.

| Component | Status | What it does | Key props |
| --- | --- | --- | --- |
| **Stack** | Implemented | Children in a column | `gap`, `align`, `padding` |
| **Inline** | Implemented | Children in a row | `gap`, `align`, `justify`, `wrap`, `padding` |
| **ToolbarRow** | Implemented | A row with the toolbar role: one tab stop, arrow keys, Home and End between its items. A new `focusRequest` moves focus into it (<kbd>Alt+F10</kbd>) | `label` (required), `focusRequest` |
| **Columns** | Implemented | Children side by side in equal columns while each has room (`layout.sheetMin`), one under the other when it doesn't (D-142): two short fields on one row, so a setup step fits the window | `gap` |
| **Grid** | Planned | Children in columns. Columns covers equal columns today, and SiteGrid the product site's tiles | `columns` (1 to 6) or `minItem` (a size token), `gap` |
| **Center** | Implemented | Centers content up to a maximum width | `maxWidth` (for example `layout.measure`), `gutter` |
| **Split** | Planned | Two panes, optionally resizable | `start` and `end` sizes (tokens), `resizable`, `collapseBelow` (a size class) |
| **Spacer** | Planned | Takes the remaining space in a Stack or Inline | None |
| **Surface** | Implemented | The only way to get a background, border, radius, or shadow | `variant` canvas, frost, raised, sunken, inverted. `shape` window, sheet, popover, control. `padding` |
| **ScrollArea** | Planned | Scrolling with consistent scrollbars and edge fades | `axis`, `fade` |
| **Layer** | Implemented | Puts its content on a layer (contextual, trigger, panel, dialog, toast, tooltip) at a fixed position, with the right order. Its content may use frost. It can form a landmark, and put the desktop title bar band under its content: the window's top `layout.titleBar` (44 px), the drag region, which its own content (the trigger) never is (DSK-02, D-106) | `layer`, `position` (topBand, topEnd (the window controls, in the 44 px band, D-104, D-106), belowTopBand, fill, center, bottomCenter, bottomStart), `landmark` (none, banner, main, complementary, region) with `label` (main: the first run's card, while no note shows, D-101), `dragBand`; later `scrim`, `trapFocus`, `restoreFocus` |
| **Positioner** | Implemented | Anchors floating content to a range in the note (the selection, a link, or the `/` the slash menu opened at) that the editor surface publishes: centered on it or lined up with its start, never covering it, flipping below near the top band (always below on touch screens), kept 12 px inside the window, following it as it scrolls, and hidden while it's out of view. Its content may use frost. Tokens `cmp.positioner.*` | `anchor` selection, link, or caret, `placement` above or below, `align` center or start, `offset` (space token), `landmark` none or region, `label` |
| **Show** | Planned | Shows children only in some size classes, platforms, or pointer types | `sizeClass`, `platform`, `pointer` |
| **AppRoot** | Implemented | The root of every view. Applies the theme (`data-theme`) and the token modes (platform, reduced motion, reduced transparency, coarse pointer) to the document, and holds the global token stylesheet. With `frame` rounded or square (Windows and Linux) the page is transparent and the window is drawn inside it: 20 px corners, the shadow in a 16 px margin, and the container for fixed layers and every menu, tooltip, and dialog (D-104). The reading settings override their tokens on the root (`lineHeight`, `measure` in characters, `focusDim`; `paragraphSpacing` is a token mode), and `themeColors` lays an edited copy's colors over the theme (color tokens and `#rrggbb` values only, D-108) | `scheme`, `platform`, `frame` (native, rounded, square), `lineHeight`, `measure`, `paragraphSpacing`, `focusDim`, `themeColors` |
| **ReaderPage** | Implemented | A published page (IA-VIEW-PUBLIC, WP-5.1, D-114): a skip link, the reading column as the `main` landmark, and a quiet footer; follows the reader's light or dark preference and reads from 320 px wide. Tokens `cmp.readerPage.*` | `skipLabel`, a `footer` slot |
| **PrintPage** | Implemented | A note laid out for paper (SHR-12, WP-8.12, D-230): hidden on screen; while printing, the only thing on the page, in Paper's colors at the print text size (12 pt), with the print margin and, with `pageNumbers` on (D-231), the page number and count at the foot of every page (the named pages `fn-print` and `fn-print-numbered`, written by the tokens build). Tokens `cmp.printPage.*` | `pageNumbers`, a default slot (the canvas puts NoteContent in it) |

Field and Sheet are layouts too; they're described with the compounds they were first planned as, below. The product site's layouts (SitePage, SiteSection, SiteGrid) are under SitePage there.

Frost appears only through `Surface variant="frost"`, and `Surface` refuses frost unless it's inside a floating `Layer`. That enforces the foundations rule that frost is only for things that float over text ([Foundations → Surfaces](../foundations.md#surfaces-and-elevation)).

<h2 id="block-components" data-reader-personas="design engineering">Block components</h2>

As built (WP-5.1, D-114), note content renders on published pages through one block component, **NoteContent**, read-only, inside the ReaderPage layout. The editor draws the same blocks as its own node views, with the same rules, so a note looks identical in both places. The per-block components first planned here are parts of NoteContent, not registered contracts. Each block also has a registration in the [block registry](../../architecture/editor-engine.md#block-registry-contract).

| Component | Status | Renders |
| --- | --- | --- |
| **NoteContent** | Implemented | A note's blocks (`blocks`, a view model's note as the Markdown bridge parses it), read-only; tokens `cmp.noteContent.*`, aliasing the same semantic tokens as the editor surface |
| **ParagraphBlock** | Composed | Paragraphs, with `dir="auto"`. Drawn inside NoteContent and by the editor |
| **HeadingBlock** | Composed | Note headings 1 to 6, using the `font.content.h*` ratios. Drawn inside NoteContent and by the editor |
| **ListBlock** | Composed | Bulleted, numbered, and task lists, with task checkboxes. Drawn inside NoteContent and by the editor |
| **QuoteBlock** | Composed | Block quotes. Drawn inside NoteContent and by the editor |
| **CodeBlock** | Composed | A note's code, with syntax colors from `code.syntax.*`. Drawn inside NoteContent and by the editor; the registered CodeBlock primitive is a different thing (something to copy, in setup) |
| **TableBlock** | Composed | Loop-style tables. In the editor the table renders through the editor surface's own styles (`cmp.editorSurface.table*`), and its grips and insert lines are the TableControls host component (D-96, [Tables](../components/tables.html)) |
| **DividerBlock** | Composed | Horizontal rules. Drawn inside NoteContent and by the editor |
| **InlineMarks** | Composed | Bold, italic, strikethrough, inline code, links, and find highlights. Drawn inside NoteContent and by the editor |
| **UnknownBlock** | Composed | Unknown component syntax, kept verbatim and shown read-only (EXT-05). Drawn inside NoteContent and by the editor |
| **ImageBlock**, **GalleryBlock** | Planned | Later (EXT-03, EXT-04) |

<h2 id="compound-components" data-reader-personas="design engineering">Compound components</h2>

Compounds compose primitives, layouts, and other compounds. They hold behavior (keyboard handling, focus movement, state machines) but never markup or styles. Only three are built as compounds; most of the entries first planned here became primitives or layouts, or are composed in a view document, and their rows say which.

| Component | Status | Composes | Delivers | Notes |
| --- | --- | --- | --- | --- |
| **Trigger** | Implemented | TriggerButton | IA-CMP-TRIGGER, IA-CMP-SAVESTATE | The save state is a `SignalDot` tone, not a separate badge. |
| **Toolbar** | Implemented | ToolbarRow, IconButton, Divider, MenuButton | IA-CMP-TOOLBAR | Takes `items` (command items) and `more` (menu sections for ⋯) from a view model. Shows at most six and moves the rest into ⋯ by itself (UI-04). Roving focus. |
| **Menu**, **MenuItem**, **MenuSection** | Composed | Layer, Surface, Stack, Text, Icon, Shortcut | IA-CMP-OVERFLOW, IA-CMP-CONTEXTMENU | Items name a `command`. Supports submenus, checkable items, and inline rows such as the font size row. As built, the menu is MenuButton's `CommandMenu`, fed `menuSections`; there's no standalone Menu contract. |
| **ContextMenu** | Composed | Menu, Positioner | IA-CMP-CONTEXTMENU | Opens at the pointer, or at the focused element with <kbd>Shift</kbd>+<kbd>F10</kbd>. As built, the desktop's context menus are native menus from the command registry, and FileTree, BlockHandle, TableControls, and WindowFrame open `CommandMenu` themselves. The right-click menu in text is TextMenu on Windows and Linux, and the system's menu on macOS (D-204). |
| **Popover** | Composed | Layer, Positioner, Surface, Stack, Heading | IA-VIEW-SHARE, IA-CMP-LINK | A titled, anchored panel. As built, the PopoverPanel primitive placed in the view document. |
| **HoverCard** | Composed | Popover | IA-CMP-LINK | Opens on hover or focus after a delay, never on its own. The link hover card is composed in the canvas view document (D-91). |
| **Dialog** | Implemented | DialogPanel, Heading, IconButton (close), Inline | IA-VIEW-SETTINGS, IA-VIEW-SHORTCUTS | `title` and `closeLabel` are required. `size` s, l, or xl. A `toolbar` slot holds controls that stay put above the scrolling body. Full-screen in the compact size class. |
| **ConfirmDialog** | Composed | Dialog | IA-CMP-DIALOG | Takes the object's name and a verb. The confirm button names the action (Foundations → Words). Composed in the canvas view document from Dialog and Buttons (`vm.confirm`). |
| **Sheet** | Implemented as a layout | Its own frosted surface (D-94) | IA-VIEW-FILES, IA-VIEW-THEME, IA-VIEW-HISTORY | `label`, `side` start or end, `width` files, theme, or find (a `layout.sheet*` token; find is Find in all notes', D-110), `keyScope` (`files`, `findAll`); slots `header`, the body (which scrolls), and `footer` (Files' Recently deleted, D-102); event `close` (<kbd>Esc</kbd>, or a click on the note). A complementary landmark, not modal. Tokens `cmp.sheet.*`. |
| **CommandPalette** | Composed | Layer, Surface, SearchField, ResultList, Inline, Shortcut | IA-VIEW-SPOTLIGHT | Modes and prefixes come from a view model. As built (WP-4.2, D-109): Spotlight is composed in the canvas view from a frosted `DialogPanel` (size m, placement top), a `SearchField` with its mode chip, a `ResultList`, and caption `Text` in the footer, like Move to… (D-94). |
| **ResultList** | Implemented as a primitive | VirtualList, Inline, Icon, Text, Badge, Shortcut | Spotlight, Move to, slash menu, Find in all notes | List box pattern, with groups and per-item actions. Built as a primitive (WP-1.4): its owner keeps focus and points at the active item, and the list is also a tab stop that takes the arrow keys, Home, End, and Enter itself (WP-1.3). `width` fill or menu (the slash menu's 320 px); `height` content (up to a popover's height) or fill (what a side sheet gives it, D-110). One API for Spotlight (D-109) and Find in all notes (D-110), unified when they merged: an item with `header` heads a group of the items after it, up to the next header (a `role="group"` named by the header's label and its muted `description`: Spotlight's Top hit, Notes, Commands…; a note with its path, visibility, and count), and the arrow keys pass over headers; `highlights` and `descriptionHighlights` mark where the query matched, in bold on the find highlight (`cmp.resultList.match`, its text `matchText`, `matchWeight`, `matchRadius`); a `state` at the end of the row ("On", "16 px", a match's note) is read with it. Group tokens: `groupGap`, `header`, `headerWeight`, `headerPaddingBlock`; the state's color `state`. |
| **ResultItem** | Composed | Inline, Icon, Text, Shortcut | Spotlight, Move to, slash menu, Find in all notes | Each of ResultList's `items`, drawn by ResultList. |
| **FindAllSheet** | Composed | Sheet (`side` end, `width` find, `keyScope` findAll), Heading, IconButton, SearchField (`keyScope` findAllField, driving the list), Text, ResultList (`height` fill) | IA-VIEW-CANVAS | Find in all notes (FND-04). Composed in the canvas view document from catalog parts, like the find bar (D-76, D-110). The summary is a live region. |
| **FileTree** | Implemented as a primitive | Draws its rows (D-94): Icon, Spinner, and its own name field | IA-VIEW-FILES | Tree pattern on a flat list of rows with `aria-level` and `aria-multiselectable`, with type-ahead, multiple selection, drag and drop, and inline naming. `items` (tree items from a view model), `focusId`, `focusRequest`, `editValue` (bindable), `editLabel`, `editError`; events `select`, `expand`, `action`, `drop`, `editChange`, `editBlur`. Its keys are commands scoped to `filesTree` and `filesEdit`. Tokens `cmp.fileTree.*`; its code loads when first shown. Paging through VirtualList comes with long trees. |
| **Tabs** | Implemented as a primitive | Inline, Text, Stack | Theme manager, Settings' categories | Tabs pattern. `label`, `items`, `value` bindable; `orientation` vertical puts the list on the inline start, `cmp.tabs.listWidth` wide, with the up and down arrows (Settings, D-103); `autoFocus` focuses the selected tab when the tabs appear (Settings opens on its category). |
| **NavList** | Planned | Stack, Icon, Text | Settings categories | Navigation list with the current item marked. Settings' categories use vertical Tabs today (D-103). |
| **Field** | Implemented as a layout | Stack, Text | Every form | Label, control, description, and error in one consistent arrangement; the group is named by the label. |
| **SettingsRow** | Planned | Inline, Stack, Text, and one control | IA-VIEW-SETTINGS | The label and description on the left, the control on the right, stacked in the compact size class. |
| **Toast** | Implemented as a primitive | Layer, Surface, Inline, Text, Button | IA-CMP-TOAST | `message` (required), `tone` info or error, `actionLabel`, `dismissLabel` (required), `focusRequest`; events `action`, `dismiss`, `pausedChange`. A live region (errors as alerts). One toast at a time, with an optional action and Undo; pauses while hovered or focused, and <kbd>Esc</kbd> dismisses it. |
| **ToastRegion** | Composed | Layer | IA-CMP-TOAST | The place toasts appear: a Layer on the toast layer in the view document. |
| **Banner** | Planned | Surface, Inline, Icon, Text, Button | Note history, sync problems | Inline, persistent until resolved. |
| **EmptyState** | Composed | Center, Stack, Icon, Text, Button | Files, Spotlight, Sharing | One sentence and at most one action. As built, views show a muted Text where a list is empty. |
| **FindBar** | Composed | Surface (`keyScope` findBar), Stack, Inline, SearchField (`keyScope` findField and replaceField), IconButton, Button, Text | IA-CMP-FINDBAR | Composed in the canvas view document rather than as a compound (D-76). Match count and notices are live regions. |
| **FormattingToolbar** | Composed | Positioner, Surface (`keyScope` formatToolbar), ToolbarRow, MenuButton (text), IconButton, Button, Divider | IA-CMP-FORMAT | Composed in the canvas view document rather than as a compound (D-91). Follows the selection. Its items are commands, and `vm.format` says which show. |
| **LinkEditor** | Composed | Positioner, Surface (`keyScope` linkEditor), Stack, Inline, TextField, Button, Text | IA-CMP-LINK | Composed in the canvas view document (D-91). Opens with <kbd>Mod</kbd>+<kbd>K</kbd> or the toolbar's Link. |
| **SlashMenu** | Composed | Positioner (`anchor` caret, `align` start, region "Block menu"), Surface, ResultList (`width` menu), Text | IA-CMP-SLASH | Composed in the canvas view document, like the formatting toolbar (D-91, D-93). Items come from the block registry through `vm.slash`; the editor surface reports the `/query` with its `slash` event and drives the list while focus stays in the note. |
| **BlockHandle** | Implemented as a host | Positioner, IconButton, Menu | IA-CMP-HANDLE | Drag handle and block menu. Built as a host component that draws its grip itself, like TableControls (see [Host components](#host-components), D-160), with the menu MenuButton opens (`CommandMenu`). |
| **TableControls** | Implemented as a host | Positioner, IconButton, Menu | IA-CMP-TABLE | Row and column grips, insert lines, and the cell menu. Built as a host component that draws them itself (see [Host components](#host-components), D-96), with the menus MenuButton opens (`CommandMenu`). |
| **MovePicker** | Composed | Dialog, SearchField, ResultList | IA-CMP-MOVE | Folder picker. Composed in the canvas view document from these parts, like the find bar (D-76, D-91, D-94). |
| **ConflictResolver** | Composed | Dialog, Split, DiffView, Button | IA-CMP-CONFLICT | Side-by-side choice with a merged preview. As built (D-102): composed in the canvas view from an xl Dialog, Inline, Buttons, and two VersionPane primitives, without a merged preview. |
| **DiffView** | Planned | Stack, block components (read-only), Badge | IA-VIEW-HISTORY, IA-CMP-CONFLICT | Highlights changed blocks with `color.findMatch` style tokens. For the resolver, the **VersionPane** primitive (D-102) does this for one version; note history (IA-VIEW-HISTORY) still needs DiffView with block components. |
| **TitleBar** | Composed | Inline, IconButton, Show, WindowFrame | IA-CMP-TITLEBAR | Platform variants. Hidden on macOS, which draws its own. As built (D-104): the canvas view places the band, the WindowFrame host, and the WindowControls primitive directly; there's no TitleBar compound. |
| **SnapLayoutPicker** | Composed | Popover, Grid, Button | IA-CMP-TITLEBAR | Windows snap layouts, for the app-built window. As built, drawn inside the WindowControls primitive (D-104). |
| **StepFlow**, **StepCard** | Composed | Center, Surface, Stack, ProgressBar, Inline, Button | IA-VIEW-FRE | Setup steps with Back and Continue. As built, composed in the canvas view document, with StepMark, StepDots, ItemCard, and StatusRow (D-126, D-142). |
| **ThemeCard** | Composed | Grid, Surface, Swatch, Text | IA-VIEW-THEME | Each tile of ThemeGallery, drawn by it. |
| **ThemeGallery** | Implemented as a primitive | Grid, Surface, Swatch, Text | IA-VIEW-THEME | Live preview on focus, revert on <kbd>Esc</kbd>. As built (D-108): `label`, `items` (`themeTiles`), `value` (the theme showing), `previewing`, `focusRequest`; events `preview`, `choose`, `revert`. A list box whose selection follows keyboard focus; each tile's sample is drawn in its own theme's colors (`data-theme-sample`, `cmp.themeGallery.sample*`). |
| **ColorEditor** | Composed | Stack, ColorArea, Slider, TextField, Swatch | IA-VIEW-THEME | Shows the contrast guard result. As built (D-108), composed in the theme view from ColorField rows and Fix buttons, the result in words; the ColorArea picker comes with custom themes (WP-8.2). |
| **AudienceRow**, **AudienceList** | Planned | Inline, Text, Badge, Tag, IconButton, Menu | IA-VIEW-SHARE | Name, ways in, expiry, and state. |
| **ShortcutList** | Planned | Stack, SearchField, Text, Shortcut | IA-VIEW-SHORTCUTS | Search by name or by pressing the keys. |
| **CopyField** | Planned | Inline, TextField (read-only), IconButton | Sharing, Settings → Agents | Copies and announces "Copied". For setup, the CodeBlock primitive has its own Copy. |
| **KeyValueList** | Planned | Stack, Inline, Text | Settings → About, diagnostics | Read-only facts. |
| **ReaderPage** | Implemented as a layout | Center, Stack, NoteContent | IA-VIEW-PUBLIC | The published note, rendered to static HTML. See [Layouts](#layouts). |
| **PasscodeGate** | Composed | TextField, Button | IA-VIEW-PUBLIC | The share reader's passcode entry. As built, composed in the share reader's view document from a password TextField, a Button, and Text, inside ReaderPage (WP-5.4). |
| **SitePage**, **SiteSection**, **SiteGrid** | Implemented as a layout | Stack, Inline, Text, Icon, NoteContent | IA-VIEW-SITE | The product site's pages (WP-10.1): a skip link, the site's navigation and a footer around the content; sections with stable anchors, some on a raised band; a grid of tiles for the visual-first landing page (D-174). Rendered to static HTML with no script (HLP-08). |
| **SiteLink**, **SiteText**, **SiteFigure**, **SiteThemeShowcase** | Implemented as a primitive | Plain anchors, text, images, and radio buttons | IA-VIEW-SITE | Plain links, the brand, navigation with the current page marked, and two call-to-action looks; the display type; the app's window as a screenshot with its size and a shadow (or a glow, dark on dark); every theme's screenshot chosen by swatches and a *Light / Dark* switch by radio buttons (D-169, D-174, D-176). |

<h2 data-reader-personas="product design engineering">Design decisions</h2>

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-CMP-01 | Behavior for every interactive primitive comes from one accessible behavior library (React Aria Components, D-58). | UC-KEY-02, UC-THEME-09 | Keyboard, focus, and screen-reader behavior is the hardest part to get right and the easiest to get inconsistent. One audited source covers it. | Writing each widget's behavior by hand. |
| DD-CMP-02 | `Surface` is the only way to get a background, border, radius, or shadow, and frost only works inside a floating `Layer`. | UC-CANVAS-02 | The foundations' surface and elevation rules become impossible to break rather than easy to forget. | Background and border props on every layout. |
| DD-CMP-03 | Text props take message keys or bindings, never literal strings. | UC-AGENT-06 | Every word can be translated (I18N-01), reviewed in one place, and checked by agents against the strings file. | Inline English in views. |
| DD-CMP-04 | Block rendering is shared by the editor and the publisher. | UC-READ-01 | A reader sees the note exactly as the writer did. | A separate stylesheet for published pages. |
| DD-CMP-05 | The implemented inventory (names, tiers, states, fixture counts) is generated from the registered contracts, and each guidance row says whether it's implemented, composed, or planned; `pnpm check` fails when they disagree (D-200). | UC-AGENT-06 | Authors and agents choose from what exists, and a hand-written list can't silently drift from the code (audit DS-A07). | A hand-maintained list; generating the whole page and losing the human guidance. |
