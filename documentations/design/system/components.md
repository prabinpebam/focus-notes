# Component catalog

The complete catalog of design-system components: what each one is for, its variants and key props, the accessibility pattern it implements, and which views and IA components use it. Every view in Focus Notes is assembled from this list and nothing else.

> [!NOTE]
> **TL;DR.** **40 primitives** (Text, Icon, Button, TriggerButton, TextField, Switch, Slider, WindowControls, and so on), plus **6 host components** that wrap imperative DOM (the editor surface, the table controls, the focus mask, the window frame, the color area, and a virtual list). **13 layouts** (AppRoot, Stack, Inline, Grid, Surface, Layer, Positioner, and so on). **9 block components** that render note content in the editor and on published pages, with image and gallery to come. **38 compound components** (some in pairs, like Menu and MenuItem) that compose them, from Toolbar and Menu to CommandPalette, FileTree, and ConflictResolver, each mapped to the IA components it delivers. Every component has a machine-readable **contract**, and the view schema is generated from those contracts (DSY-05).

<h2 id="contracts" data-reader-personas="engineering">Contracts</h2>

Each component declares a contract in `packages/ui`. The build turns contracts into TypeScript types, the view JSON Schema, the gallery's fixture checklist, and the catalog published for agents (DSY-13). This is the contract for `Button`:

```json
{
  "type": "Button",
  "tier": "primitive",
  "props": {
    "label":          { "kind": "message", "required": true },
    "variant":        { "enum": ["primary", "secondary", "subtle", "danger"], "default": "secondary" },
    "size":           { "enum": ["s", "m"], "default": "m" },
    "icon":           { "kind": "icon" },
    "iconPosition":   { "enum": ["start", "end"], "default": "start" },
    "busy":           { "kind": "boolean", "bindable": true },
    "disabled":       { "kind": "boolean", "bindable": true },
    "disabledReason": { "kind": "message", "requiredWhen": "disabled" }
  },
  "events": { "press": {} },
  "slots": {},
  "states": ["rest", "hover", "pressed", "focusVisible", "disabled", "busy"],
  "tokens": "cmp.button.*",
  "a11y": { "pattern": "button", "name": "label" }
}
```

| Field | Meaning |
| --- | --- |
| `props` | Every prop, typed. Kinds: `message` (a string key), `icon` (an icon name), `token` (a token name from one group, such as `space`), `command` (a command ID), `boolean`, `number` (with a range), and `enum`. `bindable` means a view may bind it to state. There are no free-text strings and no open objects. |
| `events` | Named events a view may attach actions to, with the payload's type. |
| `slots` | Named child areas, each listing the component types it accepts and how many. |
| `states` | Every visual state. Each one needs a fixture and a visual baseline. |
| `tokens` | The component's own tokens. It may read nothing else. |
| `a11y` | The ARIA Authoring Practices pattern, and which prop provides the accessible name. |

**Busy state.** Components with a `busy` state (Button, IconButton, FileTreeItem, ResultItem) take `busy` as a boolean bound to the task tracker. One shared primitive hook turns it into the phases `ack`, `on`, and `done`, rendered as `data-busy`, with the timing from the `wait.*` tokens and the look from the component's own `cmp.*.busy` tokens. A busy Button keeps its width. A region being updated shows an indeterminate `ProgressBar` line, placed by its view with the same timing. No component times its own waits ([Waits](../components/feedback-and-dialogs.md#waits), PRF-08).

<h2 id="primitives" data-reader-personas="design engineering">Primitives</h2>

| Component | Variants and key props | Pattern | Used by |
| --- | --- | --- | --- |
| **Text** | `role`: caption, secondary, body, emphasis, title, label. `tone`: default, muted, accent, danger, warning, success. `lines` (truncate), `value` (message or binding) | Text | Everywhere |
| **Heading** | `level` 1 to 3 (interface headings, not note headings), `value` | Heading | Sheets, dialogs, settings |
| **Icon** | `name` (Fluent registry), `size` s/m/l, `filled` | Image, or hidden when decorative | Everywhere |
| **Shortcut** | `keys` (key caps in the platform's symbols, from a view model, which takes them from the command registry) and `label` (the chord in words). Caps are hidden from screen readers, which read the words instead | Text, with an accessible name that says the keys in words | Menus, tooltips, Spotlight, cheat sheet |
| **Button** | `variant` primary, secondary, subtle, danger. `size`, `icon`, `busy`, `disabledReason`, `toggle` with `pressed`, `autoFocus` (takes focus when it appears: a confirmation's *Cancel*, D-100, or a first-run step's primary action, D-101). Inside an editor companion (Positioner), a pointer press leaves focus in the note | Button, or toggle button | Dialogs, forms, banners, the formatting toolbar's Link, the first run |
| **IconButton** | `icon`, `label` (required), `variant` subtle or frost, `toggle` with `pressed`, and `mixed` for a toggle that applies to only part of what it acts on (`aria-pressed="mixed"`, a lighter fill) | Button, or toggle button | Toolbar, window controls, find bar, formatting toolbar |
| **Link** | `label`, `command` (internal) or `url` (opened through the `link.open` command) | Link | Help text, About |
| **Checkbox** | `label`, `checked` (bindable), `indeterminate` | Checkbox | Lists, settings |
| **RadioGroup** | `label`, `options` (bound list), `value` (bindable), `orientation` | Radio group | Settings |
| **Switch** | `label`, `description`, `checked` (bindable) | Switch | Settings |
| **TextField** | `label`, `description`, `error`, `value` (bindable), `placeholder`, `icon`, `type` text, email, or url. `labelHidden` keeps the label for screen readers only, for one-line editors | Text box | Forms, rename, link editor |
| **TextArea** | As TextField, plus `rows` | Text box, multi-line | Invite message |
| **SearchField** | `label`, `value` (bindable), `placeholder`, `clearLabel`, `autoFocus`, `keyScope` (the first run's repository search is `repoField`, Spotlight's `spotlightField`, Find in all notes' `findAllField`), `chip` (a mode shown before the text, such as Spotlight's All or Commands; hidden from screen readers, so the label says the mode in words). <kbd>Esc</kbd> clears it, or passes on to close the dialog when it's already empty | Search box | Spotlight, Files, Settings |
| **SecretField** | `label`, `value`, `reveal` toggle, `strength` (bound) | Text box, with a reveal button | Passcodes, tokens |
| **NumberStepper** | `label`, `value`, `min`, `max`, `step`, `format` | Spin button | Font size row |
| **Select** | `label`, `options`, `value` (bindable) | Select (list box popup) | Settings |
| **Combobox** | `label`, `options` (bound, filtered by a view model), `value` | Combobox | Move to, audience names |
| **Slider** | `label`, `value`, `min`, `max`, `step`, `format`. As built (D-108): `value` bindable, `valueText` shown beside the label ("60 characters"), `format` number or percent for what's spoken; changes apply as it moves; `cmp.slider.*` | Slider | Reading width, line spacing, focus dim |
| **SegmentedControl** | `label` (visible), `options` (2 to 5, from a view model), `value` (bindable), `orientation` (`horizontal`, or `vertical`: one full-width row per choice, for labels that don't fit side by side, D-123). Arrow keys move and select | Radio group, drawn as segments | Appearance, find options, cheat sheet filters |
| **Badge** | `tone`, `value` | Text | Visibility, agent changes, status |
| **Tag** | `value`, `removable` | Button, when removable | Audiences, filters |
| **Swatch** | `color` (a token or a theme's value), `selected`, `label` | Radio or button | Theme gallery, color editor. As built (D-108), not a component of its own: ThemeGallery draws its tiles' samples and ColorField its swatch |
| **ColorField** | As built (D-108): `label` (required), `value`, `swatch` (only `#rgb` or `#rrggbb` is painted), `description` (said with it: the contrast it's checked against), `invalid`, `error`, `focusRequest`; event `commit`. A hex field committed on <kbd>Enter</kbd> or on leaving it, so typing never applies half a color; <kbd>Esc</kbd> puts the value back; `cmp.colorField.*` | Text box | Theme manager → Edit colors |
| **SignalDot** | `tone` red, warning, danger (size from `cmp.signalDot.size`) | Decorative, with status in its parent's name | Trigger, save state |
| **TriggerButton** | `label` (required), `tone`, `expanded`, `shortcut`. A 30 px frosted circle holding a SignalDot, with a 32 px (44 px touch) hit area | Menu button | Trigger |
| **PopoverPanel** | `label` (required), `open`, `placement`; slots `trigger` and `content`; event `openChange`. Frosted, anchored, closes on Esc (in one press, even over a tooltip) and outside click, and moves focus to its first action | Dialog (non-modal popover) | Trigger's toolbar, Share, link editor |
| **DialogPanel** | `label` (required), `open`, `size` s, m (Spotlight's 640 px, `layout.dialogM`), l, or xl (the conflict resolver's, `layout.dialogXL`), `placement` center or top (about 20% down, `layout.dialogTop`, as Spotlight opens), `material` raised or frosted (the theme's frost); slots `header`, `fixed`, the scrolling body, and `footer`; event `openChange`. The scrim, the raised panel, focus kept inside and returned on close, <kbd>Esc</kbd> and scrim click to close. The body takes focus so it can be scrolled from the keyboard, and uses the minimal scrollbar | Dialog (modal) | Dialog, and through it Settings, the cheat sheet, and confirmations |
| **VersionPane** | `label` (required), `blocks` (`versionBlocks` from a view model: id, text, changed), `emptyText`, `changedLabel`. One version of a note as plain-text blocks; changed blocks get `color.findMatch` and a mark at their start, and screen readers hear `changedLabel` before them. Tokens `cmp.versionPane.*` (D-102) | Region, labelled by its heading | The conflict resolver (IA-CMP-CONFLICT) |
| **MorphPanel** | `label` (required), `open`; slots `trigger` and `content`; event `openChange`. Closed it's the trigger's circle; open, the circle grows into the content's frosted shape (sizes measured from the content, `motion.morph`) while the trigger shrinks away and the content fades in after `motion.enter`. Esc and clicking outside close it, and it reverses (UI-10) | Dialog (non-modal) | The trigger's toolbar |
| **MenuButton** | `icon`, `label` (required), `variant` icon, pill, or text (pill and text show `text`; text adds a chevron, as in Turn into), `placement` bottom end, bottom start, or top start, `sections` (command items from a view model), event `action`. Checkable items use `menuitemcheckbox`; each item shows its shortcut. An unavailable item stays reachable by the arrow keys, says why under its label (part of its name), and does nothing when chosen, and a menu opened from the keyboard starts on its first available item; in a narrow window a submenu opens below its item (D-100, D-104) | Menu button | ⋯ menu, block menu, account pill (UI-12), Turn into |
| **PillButton** | `label` (required), event `press`. Muted caption text in a pill with no fill or border until pointed at or focused; full opacity, so it keeps AA contrast | Button | *Unlock* and the owner's name in the account pill (UI-12), *Use this app for yourself*, and *Read only · Copy to my notes* |
| **Spinner** | `size`, `label` | Progress bar, indeterminate | Busy buttons, saving rows in Files, "Checking changes…" ([Waits](../components/feedback-and-dialogs.md#waits)) |
| **ProgressBar** | `value` (omit for an indeterminate line), `max`, `label` | Progress bar | Setup, publishing, a view opening, a region being updated |
| **Divider** | `orientation` | Separator | Menus, toolbars |
| **Tooltip** | `target` (by ID), `label`, `shortcut`. Renders inside its control's outermost landmark, so all content stays in landmarks (D-100) | Tooltip | Every icon button |
| **WindowControls** | `label`, `minimizeLabel`, `maximizeLabel`, `restoreLabel`, `closeLabel`, `layoutsLabel` (all required), `maximized` and `reveal` (bindings), `layouts` (`vm.window.layouts`: each layout's zones, each a command); events `action` and `dismiss` (<kbd>Esc</kbd> on a button, the canvas closes the toolbar and the caret goes back to the note). Minimize, maximize or restore, and close (red on hover), hidden until the band is hovered (in full screen, once the pointer reaches the top edge, D-106), a button has focus, the window isn't active, or the toolbar is open. They sit in the 44 px title bar band, at its end. Hovering maximize for `window.snapLayoutsDelay`, or <kbd>↓</kbd> on it, opens the Snap Layouts picker: each layout a small screen whose zones are buttons of at least 24 × 24 px, moved between with the arrow keys, wrapping in a narrow window. Tokens `cmp.windowControls.*` (D-104) | Group of buttons; the picker is a non-modal dialog | The Windows and Linux title bar (IA-CMP-TITLEBAR) |

### Host components

Primitives that wrap a library needing direct DOM access. They have contracts like any other primitive, and views use them like any other component.

| Component | Wraps | Contract highlights |
| --- | --- | --- |
| **EditorSurface** | Tiptap and ProseMirror. Note content renders through the [block components](#block-components). | `note` (binding), `readOnly`, `measure`, events `selectionChange`, `contextMenu` |
| **TableControls** | The table controls drawn over the note from geometry the editor surface publishes: row, column, and table handles with menus and drag to reorder, the + insertion point, New row and New column bars, the column tint, the range outline, and the cell menu ([Tables](../components/tables.html), D-96) | Labels and menus from `vm.table`, `menuRequest`; events `action` (`id`, `table`, `row`, `col`, `index`, `from`, `to`) and `close`. Tokens `cmp.tableControls.*` |
| **BlockHandle** | The block handle drawn in the gutter beside the hovered block from geometry the editor surface publishes: a six-dot grip that answers on pointer-down, opens the block menu, and drags the block between blocks with an accent drop line, scrolling the note near its edges ([Text formatting → Block handle](../components/text-formatting.html#block-handle), D-160) | Label and menu from `vm.block`, `menuRequest` (Shift+F10, the Menu key); events `action` (`id`, `block`, `to`) and `close`. Its menu ends the note's auto-scroll as it opens (DEF-21). Tokens `cmp.blockHandle.*` |
| **FocusMask** | The focus-mode mask that tracks the caret's visual row ([Focus mode](../../experience/focus-mode.md)) | `active` (binding), `dim` (token) |
| **WindowFrame** | The app-built window's behavior on Windows and Linux (D-104): moving by the band (double-click maximizes, right-click opens the system menu), showing the window controls while the pointer is on the band, and in full screen only once it reaches the top edge (`window.revealEdge`, DSK-04, D-106), the resize handles on every edge and corner, the system menu (<kbd>Alt</kbd>+<kbd>Space</kbd>), and the keys of its Move and Size. The shape and shadow are AppRoot's `frame`; the snap preview is drawn by the shell, outside the window | `frame` (native, rounded, square), `resizable`, `fullScreen`, `menu`, `menuLabel`, `menuRequest`, `menuX`, `menuY`, `keyboard` (bindings); events `drag`, `toggleMaximize`, `menu`, `action`, `key`. Tokens `cmp.windowFrame.*` |
| **ColorArea** | The 2-D color picker | `value` (binding), `channels` |
| **VirtualList** | A virtualized scroller for long lists and trees | `items` (binding), `itemHeight` (token), with an item template from the view |

<h2 id="layouts" data-reader-personas="design engineering">Layouts</h2>

Layout props accept only token names: `gap`, `padding`, and `inset` take `space.*` steps, `width` takes `layout.*` sizes, and alignment takes enums. Every layout prop may vary by size class (`{ "compact": "s", "default": "m" }`).

| Component | What it does | Key props |
| --- | --- | --- |
| **Stack** | Children in a column | `gap`, `align`, `padding` |
| **Inline** | Children in a row | `gap`, `align`, `justify`, `wrap`, `padding` |
| **ToolbarRow** | A row with the toolbar role: one tab stop, arrow keys, Home and End between its items. A new `focusRequest` moves focus into it (<kbd>Alt+F10</kbd>) | `label` (required), `focusRequest` |
| **Grid** | Children in columns | `columns` (1 to 6) or `minItem` (a size token), `gap` |
| **Center** | Centers content up to a maximum width | `maxWidth` (for example `layout.measure`), `gutter` |
| **Split** | Two panes, optionally resizable | `start` and `end` sizes (tokens), `resizable`, `collapseBelow` (a size class) |
| **Spacer** | Takes the remaining space in a Stack or Inline | None |
| **Surface** | The only way to get a background, border, radius, or shadow | `variant` canvas, frost, raised, sunken, inverted. `shape` window, sheet, popover, control. `padding` |
| **ScrollArea** | Scrolling with consistent scrollbars and edge fades | `axis`, `fade` |
| **Layer** | Puts its content on a layer (contextual, trigger, panel, dialog, toast, tooltip) at a fixed position, with the right order. Its content may use frost. It can form a landmark, and put the desktop title bar band under its content: the window's top `layout.titleBar` (44 px), the drag region, which its own content (the trigger) never is (DSK-02, D-106) | `layer`, `position` (topBand, topEnd (the window controls, in the 44 px band, D-104, D-106), belowTopBand, fill, center, bottomCenter, bottomStart), `landmark` (none, banner, main, complementary, region) with `label` (main: the first run's card, while no note shows, D-101), `dragBand`; later `scrim`, `trapFocus`, `restoreFocus` |
| **Positioner** | Anchors floating content to a range in the note (the selection, a link, or the `/` the slash menu opened at) that the editor surface publishes: centered on it or lined up with its start, never covering it, flipping below near the top band (always below on touch screens), kept 12 px inside the window, following it as it scrolls, and hidden while it's out of view. Its content may use frost. Tokens `cmp.positioner.*` | `anchor` selection, link, or caret, `placement` above or below, `align` center or start, `offset` (space token), `landmark` none or region, `label` |
| **Show** | Shows children only in some size classes, platforms, or pointer types | `sizeClass`, `platform`, `pointer` |
| **AppRoot** | The root of every view. Applies the theme (`data-theme`) and the token modes (platform, reduced motion, reduced transparency, coarse pointer) to the document, and holds the global token stylesheet. With `frame` rounded or square (Windows and Linux) the page is transparent and the window is drawn inside it: 20 px corners, the shadow in a 16 px margin, and the container for fixed layers and every menu, tooltip, and dialog (D-104). The reading settings override their tokens on the root (`lineHeight`, `measure` in characters, `focusDim`; `paragraphSpacing` is a token mode), and `themeColors` lays an edited copy's colors over the theme (color tokens and `#rrggbb` values only, D-108) | `scheme`, `platform`, `frame` (native, rounded, square), `lineHeight`, `measure`, `paragraphSpacing`, `focusDim`, `themeColors` |

Frost appears only through `Surface variant="frost"`, and `Surface` refuses frost unless it's inside a floating `Layer`. That enforces the foundations rule that frost is only for things that float over text ([Foundations → Surfaces](../foundations.md#surfaces-and-elevation)).

<h2 id="block-components" data-reader-personas="design engineering">Block components</h2>

Note content renders through these, both as editor node views and on published pages, so a note looks identical in both places. Each block also has a registration in the [block registry](../../architecture/editor-engine.md#block-registry-contract).

| Component | Renders |
| --- | --- |
| **ParagraphBlock** | Paragraphs, with `dir="auto"` |
| **HeadingBlock** | Note headings 1 to 6, using the `font.content.h*` ratios |
| **ListBlock** | Bulleted, numbered, and task lists, with task checkboxes |
| **QuoteBlock** | Block quotes |
| **CodeBlock** | Code with syntax colors from `code.syntax.*` |
| **TableBlock** | Loop-style tables, with grips and insert lines in the editor ([Tables](../components/tables.html)). In WP-1.5 the table renders through the editor surface's own styles (`cmp.editorSurface.table*`), and its grips and insert lines are the TableControls host component (D-96). |
| **DividerBlock** | Horizontal rules |
| **InlineMarks** | Bold, italic, strikethrough, inline code, links, and find highlights |
| **UnknownBlock** | Unknown component syntax, kept verbatim and shown read-only (EXT-05) |
| **ImageBlock**, **GalleryBlock** | Later (EXT-03, EXT-04) |

As built (WP-5.1, D-114), the published pages use these as one block component, **NoteContent** (`blocks`, a view model's note as the Markdown bridge parses it; tokens `cmp.noteContent.*`, aliasing the same semantic tokens as the editor surface), read-only, and the page around it is the **ReaderPage** layout (`skipLabel`, a `footer` slot; a skip link, the `main` landmark, and a footer; tokens `cmp.readerPage.*`). The editor still draws its own node views with the same rules.

<h2 id="compound-components" data-reader-personas="design engineering">Compound components</h2>

Compounds compose primitives, layouts, and other compounds. They hold behavior (keyboard handling, focus movement, state machines) but never markup or styles.

| Component | Composes | Delivers | Notes |
| --- | --- | --- | --- |
| **Trigger** | TriggerButton | IA-CMP-TRIGGER, IA-CMP-SAVESTATE | The save state is a `SignalDot` tone, not a separate badge. |
| **Toolbar** | Inline, IconButton, Divider, Menu | IA-CMP-TOOLBAR | Takes `commands` (a list of command IDs). Shows at most six and moves the rest into ⋯ by itself (UI-04). Roving focus. |
| **Menu**, **MenuItem**, **MenuSection** | Layer, Surface, Stack, Text, Icon, Shortcut | IA-CMP-OVERFLOW, IA-CMP-CONTEXTMENU | Items name a `command`. Supports submenus, checkable items, and inline rows such as the font size row. |
| **ContextMenu** | Menu, Positioner | IA-CMP-CONTEXTMENU | Opens at the pointer, or at the focused element with <kbd>Shift</kbd>+<kbd>F10</kbd>. |
| **Popover** | Layer, Positioner, Surface, Stack, Heading | IA-VIEW-SHARE, IA-CMP-LINK | A titled, anchored panel. |
| **HoverCard** | Popover | IA-CMP-LINK | Opens on hover or focus after a delay, never on its own. The link hover card is composed in the canvas view document instead (D-91). |
| **Dialog** | DialogPanel, Heading, IconButton (close), Inline | IA-VIEW-SETTINGS, IA-VIEW-SHORTCUTS | `title` and `closeLabel` are required. `size` s, l, or xl. A `toolbar` slot holds controls that stay put above the scrolling body. Full-screen in the compact size class. |
| **ConfirmDialog** | Dialog | IA-CMP-DIALOG | Takes the object's name and a verb. The confirm button names the action (Foundations → Words). |
| **Sheet** | Built as a layout (D-94), holding its own frosted surface | IA-VIEW-FILES, IA-VIEW-THEME, IA-VIEW-HISTORY | `label`, `side` start or end, `width` files, theme, or find (a `layout.sheet*` token; find is Find in all notes', D-110), `keyScope` (`files`, `findAll`); slots `header`, the body (which scrolls), and `footer` (Files' Recently deleted, D-102); event `close` (<kbd>Esc</kbd>, or a click on the note). A complementary landmark, not modal. Tokens `cmp.sheet.*`. |
| **CommandPalette** | Layer, Surface, SearchField, ResultList, Inline, Shortcut | IA-VIEW-SPOTLIGHT | Modes and prefixes come from a view model. Results use ResultItem. As built (WP-4.2, D-109), not a compound yet: Spotlight is composed in the canvas view from a frosted `DialogPanel` (size m, placement top), a `SearchField` with its mode chip, a `ResultList`, and caption `Text` in the footer, like Move to… (D-94). |
| **ResultList**, **ResultItem** | VirtualList, Inline, Icon, Text, Badge, Shortcut | Spotlight, Move to, slash menu, Find in all notes | List box pattern, with groups and per-item actions. Built as a primitive (WP-1.4): its owner keeps focus and points at the active item, and the list is also a tab stop that takes the arrow keys, Home, End, and Enter itself (WP-1.3). `width` fill or menu (the slash menu's 320 px); `height` content (up to a popover's height) or fill (what a side sheet gives it, D-110). One API for Spotlight (D-109) and Find in all notes (D-110), unified when they merged: an item with `header` heads a group of the items after it, up to the next header (a `role="group"` named by the header's label and its muted `description`: Spotlight's Top hit, Notes, Commands…; a note with its path, visibility, and count), and the arrow keys pass over headers; `highlights` and `descriptionHighlights` mark where the query matched, in bold on the find highlight (`cmp.resultList.match`, its text `matchText`, `matchWeight`, `matchRadius`); a `state` at the end of the row ("On", "16 px", a match's note) is read with it. Group tokens: `groupGap`, `header`, `headerWeight`, `headerPaddingBlock`; the state's color `state`. |
| **FindAllSheet** | Sheet (`side` end, `width` find, `keyScope` findAll), Heading, IconButton, SearchField (`keyScope` findAllField, driving the list), Text, ResultList (`height` fill) | IA-VIEW-CANVAS | Find in all notes (FND-04). Composed in the canvas view document from catalog parts, like the find bar (D-76, D-110). The summary is a live region. |
| **FileTree** | Built as one primitive that draws its rows (D-94): Icon, Spinner, and its own name field | IA-VIEW-FILES | Tree pattern on a flat list of rows with `aria-level` and `aria-multiselectable`, with type-ahead, multiple selection, drag and drop, and inline naming. `items` (tree items from a view model), `focusId`, `focusRequest`, `editValue` (bindable), `editLabel`, `editError`; events `select`, `expand`, `action`, `drop`, `editChange`, `editBlur`. Its keys are commands scoped to `filesTree` and `filesEdit`. Tokens `cmp.fileTree.*`; its code loads when first shown. Paging through VirtualList comes with long trees. |
| **Tabs** | Inline, Text, Stack | Theme manager, Settings' categories | Tabs pattern. As built a primitive (`label`, `items`, `value` bindable); `orientation` vertical puts the list on the inline start, `cmp.tabs.listWidth` wide, with the up and down arrows (Settings, D-103); `autoFocus` focuses the selected tab when the tabs appear (Settings opens on its category). |
| **NavList** | Stack, Icon, Text | Settings categories | Navigation list with the current item marked. |
| **Field** | Stack, Text | Every form | Label, control, description, and error in one consistent arrangement. |
| **SettingsRow** | Inline, Stack, Text, and one control | IA-VIEW-SETTINGS | The label and description on the left, the control on the right, stacked in the compact size class. |
| **Toast**, **ToastRegion** | Layer, Surface, Inline, Text, Button | IA-CMP-TOAST | A live region. One toast at a time, with an optional action and Undo. |
| **Banner** | Surface, Inline, Icon, Text, Button | Note history, sync problems | Inline, persistent until resolved. |
| **EmptyState** | Center, Stack, Icon, Text, Button | Files, Spotlight, Sharing | One sentence and at most one action. |
| **FindBar** | Surface (`keyScope` findBar), Stack, Inline, SearchField (`keyScope` findField and replaceField), IconButton, Button, Text | IA-CMP-FINDBAR | Composed in the canvas view document rather than as a compound (D-76). Match count and notices are live regions. |
| **FormattingToolbar** | Positioner, Surface (`keyScope` formatToolbar), ToolbarRow, MenuButton (text), IconButton, Button, Divider | IA-CMP-FORMAT | Composed in the canvas view document rather than as a compound (D-91). Follows the selection. Its items are commands, and `vm.format` says which show. |
| **LinkEditor** | Positioner, Surface (`keyScope` linkEditor), Stack, Inline, TextField, Button, Text | IA-CMP-LINK | Composed in the canvas view document (D-91). Opens with <kbd>Mod</kbd>+<kbd>K</kbd> or the toolbar's Link. |
| **SlashMenu** | Positioner (`anchor` caret, `align` start, region "Block menu"), Surface, ResultList (`width` menu), Text | IA-CMP-SLASH | Composed in the canvas view document, like the formatting toolbar (D-91, D-93). Items come from the block registry through `vm.slash`; the editor surface reports the `/query` with its `slash` event and drives the list while focus stays in the note. |
| **BlockHandle** | Positioner, IconButton, Menu | IA-CMP-HANDLE | Drag handle and block menu. Built as a host component that draws its grip itself, like TableControls (see [Host components](#host-components), D-160), with the menu MenuButton opens (`CommandMenu`). |
| **TableControls** | Positioner, IconButton, Menu | IA-CMP-TABLE | Row and column grips, insert lines, and the cell menu. Built as a host component that draws them itself (see [Host components](#host-components), D-96), with the menus MenuButton opens (`CommandMenu`). |
| **MovePicker** | Dialog, SearchField, ResultList | IA-CMP-MOVE | Folder picker. Composed in the canvas view document from these parts, like the find bar (D-76, D-91, D-94). |
| **ConflictResolver** | Dialog, Split, DiffView, Button | IA-CMP-CONFLICT | Side-by-side choice with a merged preview. As built (D-102): composed in the canvas view from an xl Dialog, Inline, Buttons, and two VersionPane primitives, without a merged preview. |
| **DiffView** | Stack, block components (read-only), Badge | IA-VIEW-HISTORY, IA-CMP-CONFLICT | Highlights changed blocks with `color.findMatch` style tokens. For the resolver, the **VersionPane** primitive (D-102) does this for one version: `label`, `blocks` (a view model's `versionBlocks`: text and whether it changed), `emptyText`, `changedLabel` (said before each changed block); a labelled region of plain-text blocks, tokens `cmp.versionPane.*`. Note history (IA-VIEW-HISTORY) still needs DiffView with block components. |
| **TitleBar**, **WindowControls** | Inline, IconButton, Show, WindowFrame | IA-CMP-TITLEBAR | Platform variants. Hidden on macOS, which draws its own. As built (D-104): the canvas view places the band, the WindowFrame host, and the **WindowControls** primitive directly; there's no TitleBar compound. |
| **SnapLayoutPicker** | Popover, Grid, Button | IA-CMP-TITLEBAR | Windows snap layouts, for the app-built window. As built, part of the WindowControls primitive (D-104). |
| **StepFlow**, **StepCard** | Center, Surface, Stack, ProgressBar, Inline, Button | IA-VIEW-FRE | Setup steps with Back and Continue. |
| **ThemeCard**, **ThemeGallery** | Grid, Surface, Swatch, Text | IA-VIEW-THEME | Live preview on focus, revert on <kbd>Esc</kbd>. As built (D-108) one primitive, ThemeGallery: `label`, `items` (`themeTiles`), `value` (the theme showing), `previewing`, `focusRequest`; events `preview`, `choose`, `revert`. A list box whose selection follows keyboard focus; each tile's sample is drawn in its own theme's colors (`data-theme-sample`, `cmp.themeGallery.sample*`). |
| **ColorEditor** | Stack, ColorArea, Slider, TextField, Swatch | IA-VIEW-THEME | Shows the contrast guard result as a Badge. As built (D-108), composed in the theme view from ColorField rows and Fix buttons, the result in words; the ColorArea picker comes with custom themes (WP-8.2). |
| **AudienceRow**, **AudienceList** | Inline, Text, Badge, Tag, IconButton, Menu | IA-VIEW-SHARE | Name, ways in, expiry, and state. |
| **ShortcutList** | Stack, SearchField, Text, Shortcut | IA-VIEW-SHORTCUTS | Search by name or by pressing the keys. |
| **CopyField** | Inline, TextField (read-only), IconButton | Sharing, Settings → Agents | Copies and announces "Copied". |
| **KeyValueList** | Stack, Inline, Text | Settings → About, diagnostics | Read-only facts. |
| **ReaderPage**, **PasscodeGate** | Center, Stack, block components, TextField, SecretField, Button | IA-VIEW-PUBLIC | The published note and the share reader, rendered to static HTML with only the gate made interactive. |
| **SitePage**, **SiteSection**, **SiteLink**, **SiteText**, **SiteFigure**, **SiteSceneToggle**, **SiteGrid** | Stack, Inline, Text, Icon, NoteContent | IA-VIEW-SITE | The product site's pages (WP-10.1): a skip link, the site's navigation and a footer around the content; sections with stable anchors, some on a raised band; plain links, the brand, navigation with the current page marked, and two call-to-action looks; the display type, desktop scenes with their size, a *Light / Dark* choice under one of them by radio buttons, and a grid of tiles for the visual-first landing page (D-174). Rendered to static HTML with no script (HLP-08). |

<h2 data-reader-personas="product design engineering">Design decisions</h2>

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-CMP-01 | Behavior for every interactive primitive comes from one accessible behavior library (React Aria Components, D-58). | UC-KEY-02, UC-THEME-09 | Keyboard, focus, and screen-reader behavior is the hardest part to get right and the easiest to get inconsistent. One audited source covers it. | Writing each widget's behavior by hand. |
| DD-CMP-02 | `Surface` is the only way to get a background, border, radius, or shadow, and frost only works inside a floating `Layer`. | UC-CANVAS-02 | The foundations' surface and elevation rules become impossible to break rather than easy to forget. | Background and border props on every layout. |
| DD-CMP-03 | Text props take message keys or bindings, never literal strings. | UC-AGENT-06 | Every word can be translated (I18N-01), reviewed in one place, and checked by agents against the strings file. | Inline English in views. |
| DD-CMP-04 | Block components are shared by the editor and the publisher. | UC-READ-01 | A reader sees the note exactly as the writer did. | A separate stylesheet for published pages. |
