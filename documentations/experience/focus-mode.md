# Focus mode

Focus mode keeps the paragraph you are writing at full strength and dims everything else. It is one of the two signature features, and it is the only concept carried over from the earlier [`markdown-focus-editor`](https://github.com/prabinpebam/markdown-focus-editor) project.

> [!NOTE]
> **TL;DR.** The focus unit is the **whole current paragraph**, including wrapped lines and hard breaks (owner, 29 October, D-232). A full-width mask leaves that paragraph at 100% and subdues the rest of the canvas to 30%. Moving between lines in the same paragraph leaves its band unchanged; moving to another paragraph moves the band. Selections cover complete endpoint paragraphs and everything between them. Covers FOC-01 to FOC-06 in the [requirements](../product/requirements.md).

<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 470" role="img" aria-labelledby="focus-title focus-desc" preserveAspectRatio="xMidYMid meet" data-slate-svg-motion="viewport">
<title id="focus-title">Focus mode highlights the whole current paragraph</title>
<desc id="focus-desc">Three paragraphs of text. The second paragraph wraps onto three rows; all three are at full strength inside a full-width band, with the caret on the middle row. The other paragraphs are subdued.</desc>
<g id="focus-rows" data-slate-svg-step="0" data-slate-svg-effect="fade" fill="var(--color-neutral-fg-1)" fill-opacity="0.3">
<rect x="100" y="74" width="540" height="12" rx="6"/>
<rect x="100" y="108" width="520" height="12" rx="6"/>
<rect x="100" y="142" width="300" height="12" rx="6"/>
<rect x="100" y="334" width="540" height="12" rx="6"/>
<rect x="100" y="368" width="470" height="12" rx="6"/>
<rect x="100" y="402" width="220" height="12" rx="6"/>
</g>
<g id="focus-active" data-slate-svg-step="1" data-slate-svg-effect="fade">
<rect x="64" y="188" width="612" height="112" rx="10" fill="var(--color-neutral-bg-3)"/>
<rect x="100" y="204" width="540" height="12" rx="6" fill="var(--color-neutral-fg-1)"/>
<rect x="100" y="238" width="540" height="12" rx="6" fill="var(--color-neutral-fg-1)"/>
<rect x="100" y="272" width="400" height="12" rx="6" fill="var(--color-neutral-fg-1)"/>
</g>
<g id="focus-caret" data-slate-svg-step="2" data-slate-svg-effect="draw">
<path d="M430 230 V258" stroke="var(--color-brand-fg-1)" stroke-width="3" stroke-linecap="round" fill="none"/>
</g>
<g id="focus-labels" data-slate-svg-step="3" data-slate-svg-effect="fade-rise" font-family="var(--font-family-base)">
<text x="696" y="106" font-size="19" fill="var(--color-neutral-fg-2)">Other paragraphs:</text>
<text x="696" y="132" font-size="19" fill="var(--color-neutral-fg-2)">subdued to 30%</text>
<text x="696" y="217" font-size="19" fill="var(--color-neutral-fg-1)">Current paragraph:</text>
<text x="696" y="251" font-size="19" font-weight="700" fill="var(--color-neutral-fg-1)">all lines at full strength</text>
<text x="696" y="374" font-size="19" fill="var(--color-neutral-fg-2)">Other paragraphs: subdued</text>
</g>
</svg>
<figcaption>The highlighted unit is the whole paragraph that holds the caret. Every wrapped line and hard break in it stays bright.</figcaption>
</figure>

<details class="slate-figure-data">
<summary>Data</summary>
<table>
<thead><tr><th>Region</th><th>Strength</th><th>Source</th></tr></thead>
<tbody>
<tr><td>Current paragraph (full canvas width)</td><td>100%</td><td>Owner's paragraph-focus decision, D-232</td></tr>
<tr><td>Everything else</td><td>30%</td><td>Reference mask: base <code>rgba(255,255,255,0.3)</code></td></tr>
</tbody>
</table>
</details>

## The focus unit: a paragraph

The seed spec and reference implementation use a visual row. The owner changed that unit to the **entire current paragraph** on 29 October ([D-232](../plan/decisions.md)); the seed itself is not edited. A paragraph is the editor's text block, not a Markdown source line: soft wraps and hard breaks stay inside it.

| Candidate unit | Used? | Why |
| --- | --- | --- |
| Visual row (wrapped line) | No | The earlier behavior, superseded by D-232. |
| Paragraph or text block | **Yes** | Keeps the whole passage being written bright, even when it wraps. |
| Sentence | No | The reference project's docs mentioned it, but its code never implemented it. It would need language-aware segmentation. |

## Visual treatment

- **Technique: a full-canvas mask.** The writing surface gets a CSS gradient mask. The base layer is `focus.dimOpacity` (default `0.3`), and the paragraph's full-width band is `1.0`. Masking the whole surface lets tables and code blocks dim without changing every block's styles.
- **Band geometry.** The band spans the full canvas width. Its top and bottom come from the containing paragraph's rendered box, so every line stays bright and margins outside the paragraph stay dim.
- **No blur and no tint by default.** The reference used neither. A theme can set `focus.rowTint` for a subtle band background. The figure draws a tint only so the band shows up.
- **Transition.** The reference had none. Proposed: move the band with an 80 ms ease-out, and switch instantly when `prefers-reduced-motion: reduce` is set (FOC-04).
- **Theming.** `focus.dimOpacity` and `focus.rowTint` are theme tokens (see [Theming](theming.md)). The dim strength is also a user setting, from 0.15 to 0.6.

## How the active paragraph is found

Only the selection's endpoint blocks are measured; there is no walk through the document's text nodes.

1. **Resolve** the selection's start and end through the editor's `domAtPos`.
2. **Find the nearest text block** around each endpoint: a paragraph, heading or code block. A paragraph inside a list, quote or table wins over its outer container.
3. **Measure** those blocks with `getBoundingClientRect()`, including empty paragraphs. Use the outermost top and bottom when the selection spans blocks.
4. **Write** the edges into the mask in *content* coordinates relative to the column, so scrolling moves the band with the text and doesn't trigger a recompute.

### When it recomputes

All triggers mark the band as stale, and one `requestAnimationFrame` callback batches the geometry reads before writing the two edges (FOC-05).

| Trigger | Reference | This spec |
| --- | --- | --- |
| `selectionchange` | Yes | Yes |
| Document change (typing, paste, undo) | `input`, paste | Editor transaction listener (covers all of them) |
| Arrow, Home, End keys | `keyup` | Covered by `selectionchange` |
| Click | Yes | Covered by `selectionchange` |
| IME composition | No | `compositionupdate` and `compositionend` |
| Window or container resize | `resize`, `ResizeObserver` | `ResizeObserver` on the canvas, and the window's `resize` |
| Line metrics change: text size (<kbd>Mod</kbd>+<kbd>=</kbd> / <kbd>-</kbd> / <kbd>0</kbd>, <kbd>Ctrl</kbd>+wheel), content font, zoom | No | `ResizeObserver` on the caret's block, re-aimed as the caret moves: a short note's canvas keeps its minimum height when the text grows, but the caret's block always changes size ([D-130](../plan/decisions.md)) |
| Web fonts finished loading, theme or font change | No | `document.fonts` `loadingdone`, theme-change event |
| Scrolling | No | Not needed (band is in content coordinates) |

## Edge cases

| Situation | Behavior |
| --- | --- |
| **Selection within a paragraph** | The whole paragraph remains bright, even if only part of one line is selected. |
| **Selection across paragraphs** | The band covers the entire first and last paragraphs and all content between them, in either selection direction. |
| **Empty document or empty paragraph** | The band covers the empty paragraph's line-height. The placeholder text stays subdued. |
| **Headings** | The whole heading stays bright, including wrapped lines. |
| **Lists and quotes** | The containing paragraph stays bright, not the entire list or quote. Bullets and quote bars at the same height show because the mask covers the full width. |
| **Tables** | The containing paragraph inside the cell stays bright. The full-width band also shows neighboring cells' content at the same height, as before. |
| **Code blocks** | The whole code block stays bright, including source lines and wrapped lines. |
| **Future components (image, gallery)** | A selected component counts as a single row, and the whole component is shown at full strength. |
| **Editor loses focus to a toolbar panel** | The band stays at the last caret position. Panels open above the canvas. |
| **Window loses focus** | No change. |
| **Focus mode off** | The mask is removed entirely. Nothing about the content's styling changes. |
| **Print and export** | Focus mode never affects printed or exported output. |

## Turning it on and off

- **Toolbar:** the *Focus* action in the [trigger toolbar](main-ui.html).
- **Shortcut:** <kbd>⇧⌘D</kbd> / <kbd>Ctrl+Shift+D</kbd>, or <kbd>F8</kbd> (Typora's focus-mode key) ([D-17](../plan/decisions.md)). <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> is kept for *find in all notes*, following VS Code. The reference project had no shortcut.
- **Spotlight:** `> Focus mode`, which shows the current state.
- **Persistence:** stored per device, like the reference's `localStorage` `focusEnabled` flag. In Electron it goes in app settings.
- **Default:** *on* for new installs, since this is a signature feature. Proposed; see [decisions](../plan/decisions.md) D-04. The first-run experience offers it as a choice.

## Working with find

While the [find bar](find-and-replace.md#highlights-and-focus-mode) is open, the bright paragraph follows the **current match** instead of the caret. Matches outside that band stay dimmed, but their highlight color still shows. When the find bar closes, the band goes back to the caret.

## Accessibility

**Planned rewrite interaction (FOC-07).** [Fresh-text decorations](../design/rewrite-with-ai.md#fresh-text) never replace the D-232 paragraph band or move its selection/caret. Selection, find, links/code and spelling retain priority. Outside the active band, or anywhere composed contrast cannot be proved ≥4.5:1, suppress the gradient and keep ordinary text plus the review status/variation announcement. Reduced motion, forced colors and effect-off show ordinary text immediately. All integration fixtures and contrast measurements remain future work.

- Focus mode is purely visual. The DOM, reading order, and screen-reader output stay the same.
- Dimmed text deliberately falls below normal contrast ratios. This is an opt-out mode the user controls, the dim strength is adjustable, and the shortcut toggles it instantly.
- No animation when reduced motion is requested.

## Carried over and left behind

| From `markdown-focus-editor` | Status |
| --- | --- |
| Visual-row focus unit | Replaced by paragraph focus at the owner's request (D-232) |
| Mask technique (translucent base + full-width bright band) | **Carried over** |
| 30% dim strength | **Carried over** as the default token value |
| Persisted on/off setting | **Carried over** |
| Walking all text nodes on each update | Replaced (search only the caret's block) |
| Unbatched updates | Replaced (one update per animation frame) |
| Everything else in that repository (editor, Markdown handling, tables, themes, files, Electron setup) | **Not carried over**, as the seed spec requires |

## Acceptance checks

- **FOC-01:** With the caret on the 2nd visual row of a three-row paragraph, all three rows are at full strength and neighboring paragraphs are subdued. Hard breaks do not split the band.
- **FOC-02:** The band stays on the whole paragraph after typing, wraps, arrow keys, clicks, paste, undo, a web-font swap, and **window resize in real time**. Moving to a different paragraph moves it. While resizing, the band is re-measured every frame and never waits for the next caret move (D-156).
- **FOC-03:** The shortcut and toolbar both toggle it, and the state survives a reload.
- **FOC-04:** With reduced motion set, band changes are instant.
- **FOC-05:** Typing in a 10,000-word note holds 60 fps on a mid-range laptop, with geometry reads batched into one update per frame.
- **FOC-06:** Multi-paragraph selections, an empty note, a table cell, and IME input (for example Japanese) all behave as in the edge-case table.
