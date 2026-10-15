# Focus mode

Focus mode keeps the row you are writing at full strength and dims everything else. It is one of the two signature features, and it is the only concept carried over from the earlier [`markdown-focus-editor`](https://github.com/prabinpebam/markdown-focus-editor) project.

> [!NOTE]
> **TL;DR.** The focus unit is the **visual row**: the rendered, wrapped line under the caret, not the whole paragraph. A full-width mask leaves that row at 100% and subdues the rest of the canvas to 30%, which is the reference implementation's value. This spec keeps the reference's core technique (caret rectangle, then row band, then mask) and fixes its documented gaps: per-frame batching, IME, multi-row selections, empty lines, blur, and reduced motion. Covers FOC-01 to FOC-06 in the [requirements](../product/requirements.md).

<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 470" role="img" aria-labelledby="focus-title focus-desc" preserveAspectRatio="xMidYMid meet" data-slate-svg-motion="viewport">
<title id="focus-title">Focus mode highlights only the caret's visual row</title>
<desc id="focus-desc">Three paragraphs of text. The second paragraph wraps onto three rows; only its middle row, which holds the caret, is at full strength inside a full-width band. Every other row, including the other rows of the same paragraph, is subdued.</desc>
<g id="focus-rows" data-slate-svg-step="0" data-slate-svg-effect="fade" fill="var(--color-neutral-fg-1)" fill-opacity="0.3">
<rect x="100" y="74" width="540" height="12" rx="6"/>
<rect x="100" y="108" width="520" height="12" rx="6"/>
<rect x="100" y="142" width="300" height="12" rx="6"/>
<rect x="100" y="204" width="540" height="12" rx="6"/>
<rect x="100" y="272" width="400" height="12" rx="6"/>
<rect x="100" y="334" width="540" height="12" rx="6"/>
<rect x="100" y="368" width="470" height="12" rx="6"/>
<rect x="100" y="402" width="220" height="12" rx="6"/>
</g>
<g id="focus-active" data-slate-svg-step="1" data-slate-svg-effect="fade">
<rect x="64" y="222" width="612" height="44" rx="10" fill="var(--color-neutral-bg-3)"/>
<rect x="100" y="238" width="540" height="12" rx="6" fill="var(--color-neutral-fg-1)"/>
</g>
<g id="focus-caret" data-slate-svg-step="2" data-slate-svg-effect="draw">
<path d="M430 230 V258" stroke="var(--color-brand-fg-1)" stroke-width="3" stroke-linecap="round" fill="none"/>
</g>
<g id="focus-labels" data-slate-svg-step="3" data-slate-svg-effect="fade-rise" font-family="var(--font-family-base)">
<text x="696" y="106" font-size="19" fill="var(--color-neutral-fg-2)">Other paragraphs:</text>
<text x="696" y="132" font-size="19" fill="var(--color-neutral-fg-2)">subdued to 30%</text>
<text x="696" y="217" font-size="19" fill="var(--color-neutral-fg-2)">Same paragraph: dimmed</text>
<text x="696" y="251" font-size="19" font-weight="700" fill="var(--color-neutral-fg-1)">Caret row: full strength</text>
<text x="696" y="285" font-size="19" fill="var(--color-neutral-fg-2)">Same paragraph: dimmed</text>
<text x="696" y="374" font-size="19" fill="var(--color-neutral-fg-2)">Other paragraphs: subdued</text>
</g>
</svg>
<figcaption>The highlighted unit is the visual row that holds the caret. Rows directly above and below belong to the same paragraph but are still dimmed.</figcaption>
</figure>

<details class="slate-figure-data">
<summary>Data</summary>
<table>
<thead><tr><th>Region</th><th>Strength</th><th>Source</th></tr></thead>
<tbody>
<tr><td>Caret row (full canvas width)</td><td>100%</td><td>Reference mask: white <code>#focus-line</code> rectangle</td></tr>
<tr><td>Everything else</td><td>30%</td><td>Reference mask: base <code>rgba(255,255,255,0.3)</code></td></tr>
</tbody>
</table>
</details>

## The focus unit: a visual row

The seed spec says *"only the row where the text-cursor/caret-position is is highlighted."* The reference implementation agrees: its unit is a **rendered, wrapped line**, not a paragraph, sentence, or Markdown source line. This spec keeps that definition.

| Candidate unit | Used? | Why |
| --- | --- | --- |
| Visual row (wrapped line) | **Yes** | Matches the seed's "row" and the reference behavior. Gives the tightest focus. |
| Paragraph or block | No | Too large for long paragraphs; this is what "typewriter-style" focus modes in other editors do. |
| Sentence | No | The reference project's docs mentioned it, but its code never implemented it. It would need language-aware segmentation. |

## Visual treatment

- **Technique: a full-canvas mask.** The writing surface gets a CSS mask. The base layer is `focus.dimOpacity` (default `0.3`), and a full-width band at the caret row is `1.0`. This is the reference technique: an SVG `<mask>` with a translucent base `rect` and a white `focus-line` `rect`, applied through `mask-image`. Masking the whole surface is what lets tables, code blocks, and future components dim correctly without changing every block's styles.
- **Band geometry.** The band spans the full canvas width, as in the reference. Its top and height come from the row's line box, so headings get taller bands than body text.
- **No blur and no tint by default.** The reference used neither. A theme can set `focus.rowTint` for a subtle band background. The figure draws a tint only so the band shows up.
- **Transition.** The reference had none. Proposed: move the band with an 80 ms ease-out, and switch instantly when `prefers-reduced-motion: reduce` is set (FOC-04).
- **Theming.** `focus.dimOpacity` and `focus.rowTint` are theme tokens (see [Theming](theming.md)). The dim strength is also a user setting, from 0.15 to 0.6.

## How the active row is found

The reference measured the caret with `Range.getClientRects()`, then walked **every text node in the editor**, sampling about 20 character positions per node to group rows by Y. Its own architecture notes flag this as a likely source of jank. This spec keeps the measurement and narrows the search:

1. **Collapse** the selection to its focus point (or, for multi-row selections, see the edge cases below) and read the caret rectangle.
2. **Find the containing block** for the caret from the editor model, rather than walking the DOM.
3. **Measure only that block's line boxes** (`getClientRects()` on a range over the block's inline content) and pick the line box whose vertical range contains the caret's center Y.
4. **Fallback:** if there's no caret rectangle (an empty block, for example), use the block's own rectangle and its computed `line-height`.
5. **Write** the band's `y` and `height` into the mask in *content* coordinates, so scrolling moves the band with the text and doesn't trigger a recompute.

### When it recomputes

All triggers mark the band as stale, and one `requestAnimationFrame` callback does the measuring and writing. That means at most one layout read per frame (FOC-05).

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
| **Selection across several rows** | The band grows to cover every row from the selection's first row to its last (the reference only highlighted the selection's start). |
| **Empty document or empty line** | The band covers one line-height at the caret's block (fallback in step 4). The placeholder text stays subdued. |
| **Headings** | The band uses the heading's line box, so it's taller. |
| **Lists and quotes** | Same row rule. Bullets and quote bars dim or show along with their row because the mask covers the full width. |
| **Tables** | The row is the caret's wrapped line inside its cell. The band spans the full canvas width, so neighboring cells' text at the same height also shows. That is accepted and consistent with the reference's full-width band. |
| **Code blocks** | The row rule applies to wrapped code lines. Horizontally scrolled code doesn't wrap, so each source line is one row. |
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

While the [find bar](find-and-replace.md#highlights-and-focus-mode) is open, the bright row follows the **current match** instead of the caret. Other matches stay dimmed with their rows, but their highlight color still shows. When the find bar closes, the band goes back to the caret.

## Accessibility

- Focus mode is purely visual. The DOM, reading order, and screen-reader output stay the same.
- Dimmed text deliberately falls below normal contrast ratios. This is an opt-out mode the user controls, the dim strength is adjustable, and the shortcut toggles it instantly.
- No animation when reduced motion is requested.

## Carried over and left behind

| From `markdown-focus-editor` | Status |
| --- | --- |
| Visual-row focus unit | **Carried over** |
| Mask technique (translucent base + full-width bright band) | **Carried over** |
| 30% dim strength | **Carried over** as the default token value |
| Persisted on/off setting | **Carried over** |
| Walking all text nodes on each update | Replaced (search only the caret's block) |
| Unbatched updates | Replaced (one update per animation frame) |
| Everything else in that repository (editor, Markdown handling, tables, themes, files, Electron setup) | **Not carried over**, as the seed spec requires |

## Acceptance checks

- **FOC-01:** With the caret on the 2nd visual row of a three-row paragraph, only that row's band is at full strength.
- **FOC-02:** The band follows the caret after typing at the end of a row (wrap), arrow keys, clicks, paste, undo, a web-font swap, and **window resize in real time**. While the window is being resized, the band is re-measured every frame, so it stays on the caret's row as lines rewrap. It never waits for the resize to end or for the next caret move (D-156).
- **FOC-03:** The shortcut and toolbar both toggle it, and the state survives a reload.
- **FOC-04:** With reduced motion set, band changes are instant.
- **FOC-05:** Typing in a 10,000-word note holds 60 fps on a mid-range laptop, and each update does at most one layout read.
- **FOC-06:** Multi-row selections, an empty note, a table cell, and IME input (for example Japanese) all behave as in the edge-case table.
