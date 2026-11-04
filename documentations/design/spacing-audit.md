# Spacing audit

> [!NOTE]
> **TL;DR.** The whole app and its design system were audited against the `spacing` skill, statically (every style in `packages/ui`, the tokens and all 50 view documents) and natively (the probe in the built app, on 50 surfaces, in light and dark, at the default and the 480 × 360 window). It found **15 root causes**: 6 S1, 3 S2, 5 S3 and 1 S4, behind about 3,400 measured instances. Almost every instance traces to the system, not to a view:
> 1. **No spacing roles.** All 172 component spacing tokens and about 1,400 view props pick a bare scale step (`s`, `m`, `l`), never a relationship, so families drift and groups read wrong (ST-1, SP-7, SP-8).
> 2. **Space set by negative margins.** The bleed buttons, the dialog and sheet bodies, and the scrolling lists pull themselves into their container's padding, so content sits inside insets and moves with them (SP-2, SP-3).
> 3. **Space by sibling position.** Result groups space themselves with `:not(:first-child)`, the same class of bug as the dialog that lost 24 px when a tooltip was appended (SP-1, ST-2).
>
> Each root cause has one fix at the token, primitive or layout level, and a test that keeps it fixed. The fixes land after vq-ui-states reaches main.

**Scope:** every surface the visual quality journey opens (the writing window, the toolbar and its menus, find, find in all notes, the cheat sheet, Files, Move to, Delete confirmation, Spotlight in five modes, the theme manager and its tabs, Settings in three tabs, Send feedback as Problem and Idea, the formatting toolbar, Turn into, the link editor and card, the slash menu, the table cell menu, the toast, the window controls, Snap layouts and the window menu), everything the ⋯ menu opens (Theme, Share, Settings, Send feedback, Customize toolbar), the Open view, New project in four steps, Open from GitHub, and the first run's first two steps. Light and dark; the default window and the minimum (480 × 360); hover, focus and press forced on one control of each kind; a child appended to every container; right to left; 200 % text with WCAG 1.4.12 text spacing on the canvas and Settings.
**Probe:** the kit's `spacing-probe.mjs` (agentic-craft `e032a55`), base 4 px, allowed 1 and 2 px hairlines, target 32 px (`size.hit`, the project's control size), run by `apps/desktop/e2e/spacing-audit.spec.ts` on a build with readable class names (`FOCUS_NOTES_DEBUG_CLASSES=1`). Static pass: the kit's `lint-spacing.mjs` and `lint-styles.mjs` over all 80 `.css.ts` files compiled to CSS (`tools/spacing/compile-css.mjs`).
**Progress:** 7 of 15 root causes fixed on branch `spacing-audit` (`fac28854`), with `pnpm check` now running `check:spacing` (`tools/spacing/lint.mjs`); the rest are open, in the order SP-4, SP-5, SP-6, ST-1 with SP-7 and SP-8, SP-10, SP-11.
**Totals:** S1 6 · S2 3 · S3 5 · S4 1 root causes (about 3,400 instances, counted once per surface, theme and size: S1 926 · S2 960 · S3 1,414 · S4 70). Not reached: Publish (its ⋯ item didn't open a surface in the harness) and the Files selection state (its helper is stale on this branch).

## How Focus Notes spaces today

| Layer | What it has | What the skill asks |
| --- | --- | --- |
| Scale | `space.none, xxs 2, xs 4, s 8, m 12, l 16, xl 24, xxl 32, xxxl 48`, in px | 4 px multiples in `rem`; 2 px only as a described component compensation |
| Roles | `space.related` (8) and `space.section` (16), read by 2 of about 1,400 props | `stack-pair/item/group/section`, `inline-pair/item/group`, `inset-sm/md/lg`, `gutter`, `margin-page` |
| Components | 172 spacing tokens, every one aliasing a bare step | Component tokens alias roles |
| Layouts | `Stack`, `Inline` and `Surface` take `gap` and `padding` as step names | Layouts take role names |
| Views | `gap: s` 468, `m` 341, `l` 138, `xs` 105; `padding: l` 102, `m` 89 | Views name roles, never sizes |
| Containers | Dialog 24, sheet 16, popover and menu 4, tooltip 4 × 8, toast 8 × 12, status row 8 × 12 | One inset per family, from `inset-sm/md/lg` |

## Root causes

| ID | Severity | Root cause | Tier and source | Instances | System-level fix | Test that holds it | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SP-1 | S1 | Result groups space themselves by sibling position: `.group:not(:first-child) { margin-block-start }`. A prepended child (a live region, a focus guard) moves every group 8 px. | primitive `ResultList`, `ResultList.css.ts:66` | 64 on 5 surfaces (Spotlight ×4, Find in all notes) | The list owns the space: `list { display: flex; flex-direction: column; row-gap: var(cmp.resultList.groupGap) }`; remove the margin | perturb on every ResultList fixture; `lint-spacing` sibling-position rule | fixed in `fac28854` (branch spacing-audit): the list's `grouped` gap, groups 16 px apart; perturb finds 0 (was 10) |
| SP-2 | S1 | Bleed by negative margin: `IconButton.bleed` (`margin: (icon − size) / 2`), `Button.bleed` (`margin-inline-start: −padding`), `MenuButton.textBleed`, `OpenItem.path` pull their box into the parent's padding, so content intrudes on every header with a close button (−6 px) | primitives `IconButton.css.ts:34`, `Button.css.ts:57`, `MenuButton.css.ts:117`, `OpenItem.css.ts:63` | 834 on 30 surfaces | Optical alignment without moving the box: the box stays in flow at its parent's inset and the hit area grows by an invisible `::before` extension (`inset: calc(-1 * var(cmp.iconButton.hitExtension))`); the icon's side bearing is a described component token | `content-intrudes` = 0 on every dialog, sheet and Open fixture; `lint-spacing` outer-margin rule | fixed in `fac28854`: `::before` hit extensions on IconButton, Button, MenuButton text and Open's path; header intrusions 103 → 3, negative margins 148 → 0 |
| SP-3 | S1 | Scroll bodies made with negative margins: dialog and sheet bodies `margin-block: −bodySlack` with `padding-block: bodySlack`; lists `margin-inline: −scrollbarSize`; the body's end padding is `padding − scrollbar` (14 px) | primitive `DialogPanel.css.ts` (`body`), layout `Sheet.css.ts`, primitive `ResultList.css.ts:17` | 522 on 30 surfaces | The regions own the slack: header and footer padding become `inset − slack`, the body's `padding-block: slack` and `scroll-padding` hold it, so nothing is negative; the scrollbar gutter is a `scrollbar-gutter: stable` with `padding-inline-end: inset − gutter` written as a component token `cmp.<x>.paddingEndBesideScrollbar` | `negative-margin` = 0; scroll each body to its end and assert its end padding; anatomy test on DialogPanel and Sheet | dialog and sheet fixed in `fac28854`: regions own slack and scroll room; `Sheet.main` intrusions 27 → 0, body negative margins 65 → 0. Lists open (ResultList's gutter margin, a named exemption) |
| SP-4 | S1 | Fixed heights that their content outgrows: the project mark is 1 px taller than the pill's content box; the Files pin control sits 8 px above its row; Files rows lose their end inset at 480 px; the find count wraps to two lines in a 17 px box at 480 px | primitives `ProjectPill`/`ProjectMark`, `FileTree` (`pinControl`, `row`), `SearchField` count | 406 on 50 surfaces | `min-block-size` instead of `height` on text-holding parts; the pill's block padding is `(pillHeight − mark) / 2` as a component token; the pin control is positioned inside the row's padding box; the count is `white-space: nowrap` with the field shrinking first | no `content-intrudes` or `clipped` at 480 px, at 200 % text and with text spacing | open |
| SP-5 | S1 | The ⋯ menu's content (1,165 px) is taller than its popover (685 px) and the popover clips instead of scrolling | primitive `MenuButton` popover | 8 (⋯ menu and its submenu, both themes) | The popover is a scroll container with `max-block-size` and `scroll-padding` equal to its inset; the menu inside never clips | `clipped` = 0 on every menu at both window sizes | open, verify |
| SP-6 | S2 (S1 on Open) | Hit areas tied to the visual size: the trigger 30 px, buttons at size s 28 px, the project pill 24 px, search fields 30 px, their clear 28 px, Open's path link 18 px next to its row, the colour field 21 px, the slider thumb 16 px, Snap layouts' zones 25 px | primitives `TriggerButton`, `Button`, `ProjectPill`, `SearchField`, `OpenItem`, `ColorField`, `Slider`, `WindowControls` | 762 on 49 surfaces | One hit-area token, `size.hit` (32 px), on every pointer target through padding or an invisible extension; a written dense-surface list (the project pill, the window controls' zones) allowed 24 px; nothing under 24 px | targets ≥ 32 px outside the list, ≥ 24 px on it, on every surface | open |
| SP-7 | S2 | Views choose gaps by size, so a section gap ends up smaller than the groups inside it (8 between groups of 16 in Find and replace, the cheat sheet and Customize toolbar) and Share's heading sits as close to the content above as to its own | views (`find`, `cheat-sheet`, `share`, `toolbar-composer`) via layouts `Stack`/`Inline` | 106 on 12 surfaces | Roles in the layouts (ST-1) and the views migrated to them; `Stack` gets a `heading` arrangement: `stack-section` above a heading, `stack-pair` below | probe `group-separation` and `heading-space` = 0 at S2; the schema rejects step names | open |
| SP-8 | S2 | Menus and lists separate groups by less than their items: menu sections 2 px apart with 12 px inside, Files tree groups 2 px with 4 px rows, Spotlight result groups 4 px with 12 px items | primitives `MenuButton` (`itemGap: xxs`, `separator`), `FileTree` (`rowGap: xxs`), `ResultList` (`groupGap: s`) | 60 on 9 surfaces | The menu family takes one shared group: items `stack-item` minus their highlight room, groups `stack-group` or a separator with `stack-item` either side; Files and Spotlight the same | `group-separation` = 0 on every menu and list | open |
| ST-1 | S3 | No relationship roles: component tokens and views read bare steps, and `xxs` (2 px) is a half step used as a role | tokens `semantic/structure.json` `space`; layouts `Stack.css.ts`, `Surface.css.ts`, `Positioner`, `Layer`, `ToolbarRow`, `AppRoot` | 172 tokens, about 1,400 view props | Add the role tier in rem aliasing the scale: `stack-pair 4, stack-item 8, stack-group 16, stack-section 32, inline-pair 8, inline-item 8, inline-group 16, inset-sm 8, inset-md 16, inset-lg 24, gutter 24, margin-page`; layouts take role names; component tokens alias roles; views migrate (a codemod by context: `xs` → pair, `s` → item, `l` → group, `xl`/`xxl` → section; `m` (12) decided per use); `xxs` becomes described component tokens | token test: every role aliases a step, has a relationship description, and the ratios hold; `lint-spacing` bare-step warning made an error | open |
| ST-2 | S3 | Sibling-position spacing beyond SP-1: the minimap's first item gets pin room by `li:first-child > button` | host `DocMinimap.css.ts` | 1 rule | The pin is a slot in the list's header row, not padding on the first item | `lint-spacing` in `pnpm check` | fixed in `fac28854`: a `data-pin-room` slot |
| ST-3 | S2 | Geometry in a state: the minimap's current heading changes font weight (its width changes) | host `DocMinimap.css.ts` | 1 rule | Reserve the bold width at rest (a hidden bold copy, `data-text` pseudo) and change colour only | `lint-spacing` geometry-in-a-state rule; state compare on the minimap | fixed in `fac28854`: a text stroke (`font.strokeEmphasis`), never a weight |
| SP-9 | S3 | Outer margins on components: `Divider` and menu separators (`margin-block: inset`), the switch track and status icon centred by margins, the window controls' flyout `margin-top`, `EmptyState.action` and `StatusRow.detailsBody` `margin-block-start`, the picker preview's dot, the table bars | primitives `Divider`, `MenuButton`, `Switch`, `StatusRow`, `EmptyState`, `PickerButton`, `WindowControls`, host `TableControls` | 96 instances, 16 rules | The parent's gap: a divider is a box whose own padding holds its inset (the line drawn on the content box); centring by `align-self: center` in a line-height box; `EmptyState` and `StatusRow` own a column gap | `lint-spacing` outer-margin rule (prose exempt) | fixed in `fac28854`: no outer margins on dividers, separators, switch, empty state, status details, window flyout, picker preview; table bars offset by translation |
| SP-10 | S3 | Off-scale insets: buttons at size m pad 10 px, Settings' tab panel 11.1 px, the link card's text 9 px, the project pill's 6 px end padding, the setup body's 14 px end | primitives `Button`, `Tabs`, `Text` (link card), `ProjectPill`, layout `Surface` | 484 | Component tokens on the scale; real compensations (an icon's side bearing, a scrollbar) become described component tokens instead of literals or calc against a step | probe `off-scale` = 0 outside described tokens | open |
| ST-4 | S3 | Physical properties: 62 `left`, `right` and `margin-left` declarations; most are `left: 0; right: 0` pairs or coordinates measured in px by script | hosts `WindowFrame`, `TableControls`, `BlockHandle`, `TextMenu`, `DocMinimap`; layouts `Layer`, `Sheet`, `Positioner`, `AppRoot`; primitives `CodeBlock`, `ImageFrame`, `Tooltip`, `MorphPanel`, `FileTree` | 62 declarations | `inset-inline: 0` for pairs, `inset-inline-end` for the code block's copy button and sheets; script-measured coordinates keep `left` with a named exemption in the lint (`/* physical: measured */`) | `lint-spacing` physical rule with the exemption list | fixed in `fac28854`: logical insets; window edges, image handles, the minimap rail and the centred morph panel are named physical exemptions |
| SP-11 | S4 | Edges out of line by 2 to 4 px: sheet bodies and footers 4 px from their headers, Settings' footer padding 12 top and 0 bottom, Open's path 2 px off its title, the setup's text 0.6 px | layout `Sheet`, primitives `Tabs`, `OpenItem`, `Text` | 28 | Follows from SP-2 and SP-3 (one inset per region); `Tabs.footer` takes the dialog region's inset | probe `alignment` and `uneven-insets` | open |

## For the toolbar design worker

ToolbarComposer and ScanRadar are being wired on `vq-toolbar-design`, so this audit doesn't change them. Customize toolbar shows SP-6 (its buttons at 28 px, below `size.hit`) and SP-7 (8 px between groups whose members are 16 px apart). Both clear when its view moves to the roles and buttons take the hit-area token.

## Findings

Grouped by component; each line is one rule on one component, with the count over every surface, theme and size it was seen on.

| # | Root cause | Severity | Rule | Where | Measured | Expected |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | SP-1 | S1 | spacing-changed, moved | `ResultList.group` in Spotlight (4 modes) and Find in all notes | margin-t 0 → 8 px after a child was prepended; groups move 8 px | unchanged |
| 2 | SP-1 | S2 | group-separation | `ResultList.group` in Spotlight | between groups 4 px, within 12 px | ≥ 24 px |
| 3 | SP-2 | S1 | content-intrudes | `Inline` headers holding an `IconButton` bleed: dialogs, sheets, the cheat sheet, Files, Move to, Delete (20 surfaces) | inset-t −6 px (a child's negative margin) | ≥ its padding |
| 4 | SP-2 | S3 | negative-margin | `IconButton.base` (208), `Button.base` bleed (first run), `OpenItem.path` | margin −6 px, −12 px, −2 px | 0 |
| 5 | SP-2 | S1 | target-size | `OpenItem.path` in the Open view | 330 × 18 px, too close to its row | ≥ 24 px |
| 6 | SP-3 | S1 | content-intrudes | `Sheet.main` (Files, Find in all notes, Theme); `Sheet.sheet` at 480 px | inset-b −4 px, inset-t 12 px | ≥ its padding |
| 7 | SP-3 | S3 | negative-margin | `DialogPanel.body` (19 dialogs), `DialogPanel.fixedBody` (Settings), `Sheet.body`, `ResultList.list` | margin-t −4 px; margin-r −10 px | 0 |
| 8 | SP-3 | S3 | off-scale | `DialogPanel.body` | padding-r 14 px | a multiple of 4 |
| 9 | SP-4 | S1 | content-intrudes | `ProjectMark` in the project pill, every surface | inset-t −1 px | ≥ 0 |
| 10 | SP-4 | S1 | content-intrudes | `FileTree.pinControl`; `FileTree.row` at 480 px | inset-t −8 px; inset-r 1.9 px with a 4 px gap | ≥ its padding |
| 11 | SP-4 | S1 | clipped | the find count (`Text`) at 480 px | 26 × 34 px in 26 × 17 px | nothing hidden |
| 12 | SP-5 | S1 | clipped | `MenuButton.popover` (⋯ menu and submenu) | 1,165 px of content in 685 px | scrolls |
| 13 | SP-6 | S2 | below-target | `TriggerButton.ring` 30, `Button` (size s) 28, `ProjectPill` 24, `SearchField` 30, its clear 28, `OpenItem.hit` 28, `WindowControls.zone` 25 | as listed | ≥ 32 px, or 24 px on the dense list |
| 14 | SP-6 | S2 | target-size | `ColorField.input` 21 px tall (S1 at 480 px, next to another), `Slider.thumb` 16 px | as listed | ≥ 24 px |
| 15 | SP-7 | S2 | group-separation | `Stack` in Find and replace, the cheat sheet, Customize toolbar; `Sheet.header` in the theme manager | between groups 8 px, within 16 px | ≥ 32 px |
| 16 | SP-7 | S2 | heading-space | Share's heading | above 16 px, below 16 px | above ≥ 2 × below |
| 17 | SP-8 | S2 | group-separation | `MenuButton.menu` and `.section`, `FileTree.tree`, `Sheet.body` (Files), `ResultList.list` (slash menu, Spotlight actions) | 2 px between groups with 2 to 12 px inside | ≥ 2 × inside |
| 18 | SP-9 | S3 | outer-margin | `Divider` (toolbars, menus), `MenuButton.separator`, `Switch.track`, `WindowControls.flyout`, `EmptyState.action` (Open) | margin 4 to 12 px | 0, the parent's gap |
| 19 | SP-10 | S3 | off-scale | `Button` (size m) 10 px, `Tabs.panel` 11.1 px, link card `Text` 9 px, `ProjectPill` 6 px, `Surface.body` 14 px | as listed | a multiple of 4, or a described compensation |
| 20 | SP-11 | S4 | alignment, uneven-insets | `Sheet.body`, `Sheet.footer` 4 px; `Tabs.footer` 12/0 px; `OpenItem.path` 2 px; setup `Text` 0.6 px | as listed | in line; equal block insets |

Static findings (from the compiled CSS, prose exempt):

| Rule | Count | Where |
| --- | --- | --- |
| Outer margin | 39 outside prose | `Button`, `IconButton`, `MenuButton`, `Divider`, `EmptyState`, `StatusRow`, `Switch`, `ResultList`, `OpenItem`, `PickerButton`, `ImageFrame` (Wide, a deliberate bleed past the column), `WindowControls`, `TableControls`, `Sheet`, `DialogPanel`, `EditorSurface` layout |
| Sibling-position spacing | 2 outside prose | `ResultList.group:not(:first-child)`, `DocMinimap li:first-child > button` |
| Geometry in a state | 4 | `DocMinimap` current weight; `MorphPanel[data-open]` width and height (the morph is the state: kept, exempt by name); `Switch` thumb `inset-inline-start` (move by `transform` instead) |
| Physical property | 62 | see ST-4 |
| Bare scale step | 130 reads | `Surface` 63, `Stack` 44, `Positioner` 11, `Layer` 10, `ToolbarRow`, `AppRoot` |
| Literal spacing value | 0 | none outside the token source and prose |

## Tests to add

- `tools/spacing/lint.mjs` in `pnpm check`: compiles every `.css.ts` and runs the kit's `lint-spacing` (outer margin, sibling position, geometry in a state, physical properties; bare steps as errors once ST-1 lands) with named exemptions for prose (`EditorSurface.prose`, `NoteContent.prose`), `ImageFrame` Wide, `MorphPanel` and measured coordinates. Covers SP-1 to SP-3, SP-9, ST-2 to ST-4.
- A token test in `packages/tokens`: every `space` role aliases a scale step, has a relationship description, and the ratios hold (`stack-pair < stack-item < stack-group < stack-section`, `stack-group ≤ inset-md ≤ inset-lg`). Covers ST-1.
- The UI schema: layout `gap` and `padding` accept role names only. Covers SP-7, ST-1.
- `apps/desktop/e2e/spacing-audit.spec.ts` as an enforcing journey: on every surface, no S1 or S2 from `analyze`, zero `compare` findings after `perturb` and after forced hover, focus and press, at both window sizes and both themes. Covers SP-1 to SP-8.
- Anatomy tests for `DialogPanel` and `Sheet`: measured insets equal the resolved tokens within 0.5 px, at rest and scrolled to the end. Covers SP-3.

## Not fixed, and why

These are what the probe measured but the rules don't mean; each is excluded by name in the enforcing journey.

- **Visually hidden controls** (react-aria's dismiss buttons and native radio and switch inputs inside a 1 px clipped wrapper): the probe measures the child, not the clipped wrapper, so it reports 16 × 6 px targets, 6 px padding, intruding insets and unmirrored margins. 566 instances; not spacing.
- **Prose re-rendering:** forcing hover in Find and replace, or focus in the table cell menu, re-renders or scrolls the note, and the probe counts the note's moved boxes. 96 instances; the note is prose and follows its own rules.
- **Computed centring:** the note column's top padding (195 px), the anchored confirmation's offset (313 px) and the setup's centring margin are computed to centre, not spacing values. 372 instances.
- **Edge-to-edge rows:** a theme swatch and a menu's value row spread label and value with `space-between`; their "gap" is alignment, not grouping. 16 instances.
- **SVG and tables:** a step mark's SVG shapes and a table's `colgroup` overlap by design. 18 instances.
- **Hit extensions:** a bleeding IconButton's box is its 20 px icon; its 32 px hit area is a `::before` the probe can't see, so it reports a small target.
- **Described compensations:** a sheet's inline padding is its inset less a 2 px ring room and a 10 px scrollbar (14, 6, 10 and 2 px), each a described component token.
- **Probe limits found:** `ignore` exempts only some rules (prose still reports clipping, targets and state moves), and a box inside a 1 px clipped wrapper isn't treated as hidden. Reported to the kit; the journey filters both.
