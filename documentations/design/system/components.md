# Component catalog

The complete catalog of design-system components: what each one is for, its variants and key props, the accessibility pattern it implements, and which views and IA components use it. Every view in Focus Notes is assembled from this list and nothing else.

> [!NOTE]
> **TL;DR.** **30 primitives** (Text, Icon, Button, TriggerButton, TextField, Switch, Slider, and so on), plus **5 host components** that wrap imperative DOM (the editor surface, the focus mask, the window frame, the color area, and a virtual list). **13 layouts** (AppRoot, Stack, Inline, Grid, Surface, Layer, Positioner, and so on). **9 block components** that render note content in the editor and on published pages, with image and gallery to come. **38 compound components** (some in pairs, like Menu and MenuItem) that compose them, from Toolbar and Menu to CommandPalette, FileTree, and ConflictResolver, each mapped to the IA components it delivers. Every component has a machine-readable **contract**, and the view schema is generated from those contracts (DSY-05).

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
| **Shortcut** | `command` (renders that command's current key chord, per platform), or `chord` | Text, with an accessible name that says the keys in words | Menus, tooltips, Spotlight, cheat sheet |
| **Button** | `variant` primary, secondary, subtle, danger. `size`, `icon`, `busy`, `disabledReason` | Button | Dialogs, forms, banners |
| **IconButton** | `icon`, `label` (required), `variant` subtle or frost, `toggle` with `pressed` | Button, or toggle button | Toolbar, window controls, find bar |
| **Link** | `label`, `command` (internal) or `url` (opened through the `link.open` command) | Link | Help text, About |
| **Checkbox** | `label`, `checked` (bindable), `indeterminate` | Checkbox | Lists, settings |
| **RadioGroup** | `label`, `options` (bound list), `value` (bindable), `orientation` | Radio group | Settings |
| **Switch** | `label`, `description`, `checked` (bindable) | Switch | Settings |
| **TextField** | `label`, `description`, `error`, `value` (bindable), `placeholder`, `icon`, `type` text, email, or url | Text box | Forms, rename |
| **TextArea** | As TextField, plus `rows` | Text box, multi-line | Invite message |
| **SearchField** | `label`, `value`, `shortcut` hint, `clearable` | Search box | Spotlight, Files, Settings |
| **SecretField** | `label`, `value`, `reveal` toggle, `strength` (bound) | Text box, with a reveal button | Passcodes, tokens |
| **NumberStepper** | `label`, `value`, `min`, `max`, `step`, `format` | Spin button | Font size row |
| **Select** | `label`, `options`, `value` (bindable) | Select (list box popup) | Settings |
| **Combobox** | `label`, `options` (bound, filtered by a view model), `value` | Combobox | Move to, audience names |
| **Slider** | `label`, `value`, `min`, `max`, `step`, `format` | Slider | Reading width, focus dim |
| **SegmentedControl** | `label`, `options` (2 to 5), `value` | Radio group, drawn as segments | Appearance, find options |
| **Badge** | `tone`, `value` | Text | Visibility, agent changes, status |
| **Tag** | `value`, `removable` | Button, when removable | Audiences, filters |
| **Swatch** | `color` (a token or a theme's value), `selected`, `label` | Radio or button | Theme gallery, color editor |
| **SignalDot** | `tone` red, warning, danger (size from `cmp.signalDot.size`) | Decorative, with status in its parent's name | Trigger, save state |
| **TriggerButton** | `label` (required), `tone`, `expanded`, `shortcut`. A 30 px frosted circle holding a SignalDot, with a 32 px (44 px touch) hit area | Menu button | Trigger |
| **PopoverPanel** | `label` (required), `open`, `placement`; slots `trigger` and `content`; event `openChange`. Frosted, anchored, closes on Esc (in one press, even over a tooltip) and outside click, and moves focus to its first action | Dialog (non-modal popover) | Trigger's toolbar, Share, link editor |
| **MenuButton** | `icon`, `label` (required), `sections` (command items from a view model), event `action`. Checkable items use `menuitemcheckbox`; each item shows its shortcut | Menu button | ⋯ menu, block menu |
| **Spinner** | `size`, `label` | Progress bar, indeterminate | Busy buttons, saving rows in Files, "Checking changes…" ([Waits](../components/feedback-and-dialogs.md#waits)) |
| **ProgressBar** | `value` (omit for an indeterminate line), `max`, `label` | Progress bar | Setup, publishing, a view opening, a region being updated |
| **Divider** | `orientation` | Separator | Menus, toolbars |
| **Tooltip** | `target` (by ID), `label`, `shortcut` | Tooltip | Every icon button |

### Host components

Primitives that wrap a library needing direct DOM access. They have contracts like any other primitive, and views use them like any other component.

| Component | Wraps | Contract highlights |
| --- | --- | --- |
| **EditorSurface** | Tiptap and ProseMirror. Note content renders through the [block components](#block-components). | `note` (binding), `readOnly`, `measure`, events `selectionChange`, `contextMenu` |
| **FocusMask** | The focus-mode mask that tracks the caret's visual row ([Focus mode](../../experience/focus-mode.md)) | `active` (binding), `dim` (token) |
| **WindowFrame** | The transparent window's resize handles, drawn shadow, and snap previews on Windows and Linux | `platform`, `maximized`, `fullScreen` (bindings) |
| **ColorArea** | The 2-D color picker | `value` (binding), `channels` |
| **VirtualList** | A virtualized scroller for long lists and trees | `items` (binding), `itemHeight` (token), with an item template from the view |

<h2 id="layouts" data-reader-personas="design engineering">Layouts</h2>

Layout props accept only token names: `gap`, `padding`, and `inset` take `space.*` steps, `width` takes `layout.*` sizes, and alignment takes enums. Every layout prop may vary by size class (`{ "compact": "s", "default": "m" }`).

| Component | What it does | Key props |
| --- | --- | --- |
| **Stack** | Children in a column | `gap`, `align`, `padding` |
| **Inline** | Children in a row | `gap`, `align`, `justify`, `wrap`, `padding` |
| **ToolbarRow** | A row with the toolbar role: one tab stop, arrow keys, Home and End between its items | `label` (required) |
| **Grid** | Children in columns | `columns` (1 to 6) or `minItem` (a size token), `gap` |
| **Center** | Centers content up to a maximum width | `maxWidth` (for example `layout.measure`), `gutter` |
| **Split** | Two panes, optionally resizable | `start` and `end` sizes (tokens), `resizable`, `collapseBelow` (a size class) |
| **Spacer** | Takes the remaining space in a Stack or Inline | None |
| **Surface** | The only way to get a background, border, radius, or shadow | `variant` canvas, frost, raised, sunken, inverted. `shape` window, sheet, popover, control. `padding` |
| **ScrollArea** | Scrolling with consistent scrollbars and edge fades | `axis`, `fade` |
| **Layer** | Puts its content on a layer (contextual, trigger, panel, dialog, toast, tooltip) at a fixed position, with the right order. Its content may use frost. It can form a landmark and mark the desktop drag band | `layer`, `position` (topBand, fill, center, bottomCenter), `landmark` (none, banner, complementary, region) with `label`, `dragBand`; later `scrim`, `trapFocus`, `restoreFocus` |
| **Positioner** | Anchors floating content to a target, flipping and shifting to stay on screen | `anchor`, `placement`, `offset` (token) |
| **Show** | Shows children only in some size classes, platforms, or pointer types | `sizeClass`, `platform`, `pointer` |
| **AppRoot** | The root of every view. Applies the theme (`data-theme`) and the token modes (platform, reduced motion, reduced transparency, coarse pointer) to the document, and holds the global token stylesheet | `scheme`, `platform` |

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
| **TableBlock** | Loop-style tables, with grips and insert lines in the editor ([Tables](../components/tables.html)) |
| **DividerBlock** | Horizontal rules |
| **InlineMarks** | Bold, italic, strikethrough, inline code, links, and find highlights |
| **UnknownBlock** | Unknown component syntax, kept verbatim and shown read-only (EXT-05) |
| **ImageBlock**, **GalleryBlock** | Later (EXT-03, EXT-04) |

<h2 id="compound-components" data-reader-personas="design engineering">Compound components</h2>

Compounds compose primitives, layouts, and other compounds. They hold behavior (keyboard handling, focus movement, state machines) but never markup or styles.

| Component | Composes | Delivers | Notes |
| --- | --- | --- | --- |
| **Trigger** | TriggerButton | IA-CMP-TRIGGER, IA-CMP-SAVESTATE | The save state is a `SignalDot` tone, not a separate badge. |
| **Toolbar** | Inline, IconButton, Divider, Menu | IA-CMP-TOOLBAR | Takes `commands` (a list of command IDs). Shows at most six and moves the rest into ⋯ by itself (UI-04). Roving focus. |
| **Menu**, **MenuItem**, **MenuSection** | Layer, Surface, Stack, Text, Icon, Shortcut | IA-CMP-OVERFLOW, IA-CMP-CONTEXTMENU | Items name a `command`. Supports submenus, checkable items, and inline rows such as the font size row. |
| **ContextMenu** | Menu, Positioner | IA-CMP-CONTEXTMENU | Opens at the pointer, or at the focused element with <kbd>Shift</kbd>+<kbd>F10</kbd>. |
| **Popover** | Layer, Positioner, Surface, Stack, Heading | IA-VIEW-SHARE, IA-CMP-LINK | A titled, anchored panel. |
| **HoverCard** | Popover | IA-CMP-LINK | Opens on hover or focus after a delay, never on its own. |
| **Dialog** | Layer (scrim), Surface (raised), Stack, Heading, Inline, Button | IA-VIEW-SETTINGS, IA-VIEW-SHORTCUTS | `title` is required. `size` s or l. Full-screen in the compact size class. |
| **ConfirmDialog** | Dialog | IA-CMP-DIALOG | Takes the object's name and a verb. The confirm button names the action (Foundations → Words). |
| **Sheet** | Layer, Surface, Stack, Heading, IconButton | IA-VIEW-FILES, IA-VIEW-THEME, IA-VIEW-HISTORY | `side` start or end. `width` is a `layout.sheet.*` token. |
| **CommandPalette** | Layer, Surface, SearchField, ResultList, Inline, Shortcut | IA-VIEW-SPOTLIGHT | Modes and prefixes come from a view model. Results use ResultItem. |
| **ResultList**, **ResultItem** | VirtualList, Inline, Icon, Text, Badge, Shortcut | Spotlight, Move to, slash menu | List box pattern, with sections and per-item actions. |
| **FileTree**, **FileTreeItem** | VirtualList, Inline, Icon, Text, Badge, TextField (rename) | IA-VIEW-FILES | Tree pattern, with type-ahead, multiple selection, drag and drop, and inline rename. |
| **Tabs** | Inline, Text, Stack | Theme manager, Settings (compact) | Tabs pattern. |
| **NavList** | Stack, Icon, Text | Settings categories | Navigation list with the current item marked. |
| **Field** | Stack, Text | Every form | Label, control, description, and error in one consistent arrangement. |
| **SettingsRow** | Inline, Stack, Text, and one control | IA-VIEW-SETTINGS | The label and description on the left, the control on the right, stacked in the compact size class. |
| **Toast**, **ToastRegion** | Layer, Surface, Inline, Text, Button | IA-CMP-TOAST | A live region. One toast at a time, with an optional action and Undo. |
| **Banner** | Surface, Inline, Icon, Text, Button | Note history, sync problems | Inline, persistent until resolved. |
| **EmptyState** | Center, Stack, Icon, Text, Button | Files, Spotlight, Sharing | One sentence and at most one action. |
| **FindBar** | Surface, Inline, SearchField, TextField, IconButton, SegmentedControl, Text | IA-CMP-FINDBAR | Match count is a live region. |
| **FormattingToolbar** | Layer, Positioner, Toolbar | IA-CMP-FORMAT | Follows the selection. Its items are commands. |
| **LinkEditor** | Popover, TextField, Inline, IconButton | IA-CMP-LINK | Opens with <kbd>Mod</kbd>+<kbd>K</kbd>. |
| **SlashMenu** | Layer, Positioner, ResultList | IA-CMP-SLASH | Items come from the block registry. |
| **BlockHandle** | Positioner, IconButton, Menu | IA-CMP-HANDLE | Drag handle and block menu. |
| **TableControls** | Positioner, IconButton, Menu | IA-CMP-TABLE | Row and column grips, insert lines, and the cell menu. |
| **MovePicker** | Dialog, SearchField, FileTree | IA-CMP-MOVE | Folder picker. |
| **ConflictResolver** | Dialog, Split, DiffView, Button | IA-CMP-CONFLICT | Side-by-side choice with a merged preview. |
| **DiffView** | Stack, block components (read-only), Badge | IA-VIEW-HISTORY, IA-CMP-CONFLICT | Highlights changed blocks with `color.findMatch` style tokens. |
| **TitleBar**, **WindowControls** | Inline, IconButton, Show, WindowFrame | IA-CMP-TITLEBAR | Platform variants. Hidden on macOS, which draws its own. |
| **SnapLayoutPicker** | Popover, Grid, Button | IA-CMP-TITLEBAR | Windows snap layouts, for the app-built window. |
| **StepFlow**, **StepCard** | Center, Surface, Stack, ProgressBar, Inline, Button | IA-VIEW-FRE | Setup steps with Back and Continue. |
| **ThemeCard**, **ThemeGallery** | Grid, Surface, Swatch, Text | IA-VIEW-THEME | Live preview on focus, revert on <kbd>Esc</kbd>. |
| **ColorEditor** | Stack, ColorArea, Slider, TextField, Swatch | IA-VIEW-THEME | Shows the contrast guard result as a Badge. |
| **AudienceRow**, **AudienceList** | Inline, Text, Badge, Tag, IconButton, Menu | IA-VIEW-SHARE | Name, ways in, expiry, and state. |
| **ShortcutList** | Stack, SearchField, Text, Shortcut | IA-VIEW-SHORTCUTS | Search by name or by pressing the keys. |
| **CopyField** | Inline, TextField (read-only), IconButton | Sharing, Settings → Agents | Copies and announces "Copied". |
| **KeyValueList** | Stack, Inline, Text | Settings → About, diagnostics | Read-only facts. |
| **ReaderPage**, **PasscodeGate** | Center, Stack, block components, TextField, SecretField, Button | IA-VIEW-PUBLIC | The published note and the share reader, rendered to static HTML with only the gate made interactive. |

<h2 data-reader-personas="product design engineering">Design decisions</h2>

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-CMP-01 | Behavior for every interactive primitive comes from one accessible behavior library (React Aria Components, D-58). | UC-KEY-02, UC-THEME-09 | Keyboard, focus, and screen-reader behavior is the hardest part to get right and the easiest to get inconsistent. One audited source covers it. | Writing each widget's behavior by hand. |
| DD-CMP-02 | `Surface` is the only way to get a background, border, radius, or shadow, and frost only works inside a floating `Layer`. | UC-CANVAS-02 | The foundations' surface and elevation rules become impossible to break rather than easy to forget. | Background and border props on every layout. |
| DD-CMP-03 | Text props take message keys or bindings, never literal strings. | UC-AGENT-06 | Every word can be translated (I18N-01), reviewed in one place, and checked by agents against the strings file. | Inline English in views. |
| DD-CMP-04 | Block components are shared by the editor and the publisher. | UC-READ-01 | A reader sees the note exactly as the writer did. | A separate stylesheet for published pages. |
