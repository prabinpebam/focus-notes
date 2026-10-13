# Design foundations

The shared building blocks every view and component uses: layout, spacing, shape, surfaces, type, icons, states, motion, and words. Every value here is a [token](system/tokens.md), and the [design system](system/overview.html) defines how components may use them. The values are proposals, tuned during M1.

> [!NOTE]
> **TL;DR.** A 4 px spacing grid, a 70-character reading column, and a 44 px top band. Radii step down with size: window 20, sheet and dialog 16, popover and menu 12, control 8. **Frosted** surfaces (blurred and translucent) are used only for things that float over text, and they turn solid when the OS asks for reduced transparency. Note text and interface text have separate type ramps. All icons come from **Fluent UI System Icons** (MIT). Motion is short (80–200 ms) and switches off with reduced motion. Words are plain, in sentence case, and buttons say what they do. Every value traces to a promise or user-can in the decisions at the end of the page.

<h2 data-reader-personas="design">Layout</h2>

| Token | Value | Notes |
| --- | --- | --- |
| `layout.topBand` | 110 px | The trigger's band: 40 px above the trigger (`layout.triggerTop`), the 30 px circle, and 40 px below. It's the window's drag area on the desktop. Nothing else lives there at rest. |
| `layout.measure` | 70 ch (themeable, 50–100) | Width of the reading column. |
| `layout.gutter` | 48 px wide, 24 px compact | Minimum space beside the reading column. |
| `layout.wideContent` | Up to 1040 px, never wider than the canvas minus 2 gutters | Tables and future galleries may grow wider than the reading column, centered on it. |
| `layout.sheetWidth` | 320 px (Files), 380 px (Theme) | Side sheets. Under 600 px of window width they become full-width. |
| `layout.dialogWidth` | 480 px (confirmation), 760 px (Settings, Shortcuts) | Never taller than 85% of the window. Content scrolls inside. |

**Size classes.** *Compact* is under 600 px wide (phones, narrow windows): sheets and dialogs become full-screen and toolbars become bottom-anchored. *Medium* is 600–1023 px. *Wide* is 1024 px and up.

<h3 data-reader-personas="design engineering">Reading zone</h3>

Text is read and written in the band between **25% and 65% of the window height** (UI-11, [D-78](../plan/decisions.md)):

| Rule | Value |
| --- | --- |
| Top of the note | 25% of the window height down (`layout.readingTop`, never less than the trigger band), so the title starts at the top of the band. |
| End of the note | 35% of the window height of space below the last line (`layout.editorEndPadding`), so the last line can always scroll up to the band's bottom edge, even in a short or empty note. |
| The line being edited | Kept inside the band (`layout.readingZoneTop` 0.25, `layout.readingZoneBottom` 0.65). Typing, arrow keys, or a click that puts it outside scrolls the note at once so it sits on the nearest edge of the band. A drag-selection doesn't scroll until the pointer is released. |
| With the find bar open | The top of the band never sits under the bar. |

<h2 data-reader-personas="design">Spacing and shape</h2>

| Spacing token | `space.xs` | `space.s` | `space.m` | `space.l` | `space.xl` | `space.xxl` | `space.xxxl` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Value | 4 px | 8 px | 12 px | 16 px | 24 px | 32 px | 48 px |

| Radius token | Value | Used by |
| --- | --- | --- |
| `radius.window` | 20 px | Desktop window on Windows and Linux (macOS uses the native window) |
| `radius.sheet` | 16 px | Side sheets (inner edge only), dialogs, Spotlight |
| `radius.popover` | 12 px | Toolbar, menus, popovers, toasts, contextual toolbar |
| `radius.control` | 8 px | Buttons, fields, chips, list rows |
| `radius.small` | 4 px | Inline code, cell selection, keyboard key caps |
| `radius.round` | 50% | Trigger, avatars, color swatches |

<h2 data-reader-personas="design">Surfaces and elevation</h2>

| Layer (bottom to top) | Surface | Elevation |
| --- | --- | --- |
| 0. Canvas | `color.canvas`, opaque | None |
| 1. Focus-mode mask | Mask over the canvas only | None |
| 2. Contextual UI (formatting toolbar, block handle, table handles, hover cards) | Frosted popover | Shadow 1 |
| 3. Trigger | Frosted circle | Shadow 1 |
| 4. Panels (toolbar, menus, side sheets, Spotlight, popovers) | Frosted | Shadow 2 |
| 5. Dialogs, with the canvas dimmed behind | `color.surfaceRaised`, solid | Shadow 3 |
| 6. Toasts | Frosted | Shadow 2 |
| 7. Tooltips | Solid inverted (dark on light themes, light on dark) | Shadow 1 |

**Frost** is `color.surface` at 78% opacity with a 24 px backdrop blur and a 1 px `color.border` hairline. It's used only where something floats over text, so you can still sense the content under it. When the OS asks for reduced transparency (`prefers-reduced-transparency`, Windows "Transparency effects" off, macOS "Reduce transparency"), every frosted surface becomes solid `color.surface`. Dialogs are always solid, because they ask for full attention.

**Shadows:** shadow 1 is a soft 0 1 px 2 px and 0 2 px 8 px at low opacity, shadow 2 is 0 8 px 24 px, and shadow 3 is 0 16 px 48 px. In dark themes shadows are weaker, and a lighter 1 px border carries the edge instead.

<h3 data-reader-personas="design engineering">Scrollbars</h3>

Every scrolling area (the note, sheets, menus, dialogs, result lists) uses the same minimal scrollbar (UI-09, [D-73](../plan/decisions.md)):

| Rule | Value |
| --- | --- |
| Shape | A rounded thumb only. No arrow buttons and no visible track. `size.scrollbar` (10 px) wide, inset by `border.scrollbarInset` (2 px), so the visible thumb is 6 px. |
| At rest | Hidden. |
| Appears | While scrolling (by wheel, keyboard, or caret), and for 900 ms after the last scroll. Also while the pointer is over the scrollbar's edge, so it can always be found and dragged. |
| Color | `color.scrollbar` (ink at 30%), and `color.scrollbarHover` (ink at 55%) under the pointer or while dragged. Dark themes use paper tints. |
| Space | Always reserved (`scrollbar-gutter: stable`), so text never moves when the thumb appears, hides, or when a note grows long enough to scroll. |
| Forced colors | The thumb stays visible at all times in a system color, so it never disappears in high-contrast modes (delivered with the forced-colors mode in WP-1.9). |

The same rules apply on every platform. On macOS they match the system's overlay scrollbars, except that space is still reserved.

<h2 data-reader-personas="design">Type</h2>

**Note text** follows the content font preset, **Roboto Mono** by default; headings use the preset's heading font (`font.contentHeading`), which differs only in the Serif preset (Fraunces over Newsreader, [D-79](../plan/decisions.md)) (see [Theming](../experience/theming.md#fonts) and [D-78](../plan/decisions.md)). Sizes are relative to `font.size`, default 16 px. Blocks are 1.5 em apart, and headings have their own space above them:

| Role | Size | Line height | Weight | Space above |
| --- | --- | --- | --- | --- |
| Body | 1 em | 1.5 | Regular | 1.5 em |
| Heading 1 | 2.5 em | 1.25 | Bold | 1.5 em |
| Heading 2 | 2.0 em | 1.25 | Bold | 1.2 em |
| Heading 3 | 1.6 em | 1.25 | Bold | 1.0 em |
| Heading 4 | 1.3 em | 1.25 | Bold | 0.8 em |
| Heading 5 | 1.1 em | 1.25 | Bold | 0.6 em |
| Heading 6 | 1.0 em | 1.25 | Bold | 0.5 em |
| Table cell | 0.94 em | 1.45 | Regular (header semibold) |
| Code | 0.9 em, `font.mono` | 1.5 | Regular |

**Interface text** uses `font.ui` (the system UI font by default) and doesn't scale with the note's font size, only with *UI scale*:

| Role | Size | Used for |
| --- | --- | --- |
| Caption | 12 px | Key caps, metadata, counts |
| Secondary | 13 px | Hints, row details, tooltips |
| Body | 14 px | Menus, buttons, fields, list rows |
| Emphasis | 16 px | Spotlight field, dialog field |
| Title | 20 px | Dialog and sheet titles |

**Bundled fonts** are self-hosted and licensed under the SIL Open Font License, which D-29 proposes adding to the allowed list for fonts: Roboto Mono (mono, the default for note text and code), Newsreader and Fraunces (the serif preset: Newsreader for text, Fraunces for headings), Inter (sans), Atkinson Hyperlegible (a highly legible font designed for low vision), and OpenDyslexic (an option for some dyslexic readers). License checks in CI confirm each one.

<h2 data-reader-personas="design">Icons</h2>

- **One family: Fluent UI System Icons** (MIT). *Regular* at 20 px in toolbars and menus, 16 px in dense rows. *Filled* only marks a selected or active state (for example, Focus on).
- Every icon button has a text label in its tooltip and accessible name. Icons are never the only signal: active states also use a pressed background.
- The red trigger dot isn't an icon. It's the product's signature and is drawn with its own tokens.

<h2 data-reader-personas="design">States</h2>

| State | Treatment | Applies to |
| --- | --- | --- |
| Rest | No fill, `color.text` or `color.textMuted` | All controls |
| Hover (fine pointer only) | `color.hover` fill (text at 6% opacity) | Buttons, rows, handles |
| Pressed or active | `color.pressed` fill (text at 10%). Toggle buttons stay filled with a filled icon. | Buttons, toggles |
| Selected | `color.selection` fill and a 2 px accent bar or outline | Rows, cells, gallery tiles |
| Focus visible | 2 px `color.focusRing` outline with a 2 px offset, shown only for keyboard focus | Every focusable element |
| Disabled | 40% opacity, no hover, still focusable when its tooltip explains why | Buttons, menu items |
| Destructive | `color.danger` text. Filled with `color.danger` only on the confirming button. | Delete actions |

**Hit targets:** at least 32 &times; 32 px with a fine pointer and 44 &times; 44 px with a coarse pointer (touch, pen), even when the visible control is smaller.

<h2 data-reader-personas="design">Motion</h2>

| Token | Duration | Easing | Used for |
| --- | --- | --- | --- |
| `motion.micro` | 80 ms | Standard | Focus band moves, hover fills, toggles |
| `motion.enter` | 150 ms | Decelerate | Popovers, menus, the contextual toolbar (fade and 4 px rise) |
| `motion.sheet` | 200 ms | Decelerate | Side sheets sliding in, Spotlight scaling from 98% |
| `motion.exit` | 120 ms | Accelerate | Everything closing |
| `motion.theme` | 180 ms | Standard | Cross-fade when the theme changes |

Standard easing is `cubic-bezier(0.2, 0, 0, 1)`, decelerate is `cubic-bezier(0, 0, 0, 1)`, and accelerate is `cubic-bezier(0.3, 0, 1, 1)`. With `prefers-reduced-motion: reduce`, durations become 0 and only opacity changes remain. Nothing loops or bounces.

<h2 data-reader-personas="design product">Words</h2>

- **Sentence case** everywhere ("Move to…", not "Move To…"). An ellipsis means the action opens something before acting.
- **Buttons say what they do.** "Delete 3 notes", not "OK". "Make public", not "Confirm".
- **Name the thing.** "Delete “On focus”?" says which note. Dialogs never ask "Are you sure?" on their own.
- **Plain and short.** No "please", no exclamation marks, no blame ("Couldn't reach GitHub", not "You are offline").
- **Numbers as digits** ("3 notes"), with correct plurals.
- **Tooltips** appear after 500 ms of hovering, show the name and shortcut ("Bold ⌘B"), and never hold information you can't get another way.

<h2 data-reader-personas="product design">Design decisions</h2>

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-FND-01 | Frost only on surfaces that float over text, and solid when reduced transparency is requested. | UC-CANVAS-02, UC-THEME-09 | Frost keeps the sense of place over the note without hiding it (CP-CALM-01). Honoring the OS setting protects readability (CP-YOURS-01). | Frost everywhere, which lowers dialog legibility. No frost, which loses the seed's frosted trigger look. |
| DD-FND-02 | Separate type ramps for note text and interface text. | UC-THEME-08 | Changing the reading size shouldn't blow up menus and buttons, and vice versa. | One scale for everything, as with browser zoom. |
| DD-FND-03 | A single icon family, Fluent UI System Icons. | UC-CANVAS-02 | One consistent stroke and metaphor style reads as calm. MIT fits D-20. Its Office lineage matches the Loop-like editing feel. | Material Symbols (Apache-2.0, fine, but heavier visually). Mixing sets. |
| DD-FND-04 | Motion of 200 ms or less, opacity-only with reduced motion. | UC-FOCUS-02, UC-KEY-02 | Motion should explain where something came from, never slow down a keyboard user. | Expressive, spring-based motion. |
| DD-FND-05 | Hit targets of 32 px for pointers and 44 px for touch, regardless of visual size. | UC-CANVAS-02 | Lets visuals stay small and quiet (the 30 px trigger) without making them hard to hit. | Making every visual control 44 px, which clutters the canvas. |
| DD-FND-06 | Bundle a highly legible font (Atkinson Hyperlegible) and a dyslexia-friendly option (OpenDyslexic). | UC-THEME-08 | Comfort-sensitive writers (SC-THEME-06) shouldn't have to install fonts system-wide. | Only offering system fonts. |
