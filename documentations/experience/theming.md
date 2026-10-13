# Theming

Every color and font the writer sees comes from a theme. A theme is a small JSON document of design tokens, so the writer can change it without anyone touching code.

> [!NOTE]
> **TL;DR.** Themes control **colors** and **fonts** (seed) through semantic tokens. The app ships **Light**, **Dark**, and **System** (auto), confirmed by the owner as D-25. The toolbar's *Theme* action and <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> switch between light and dark. <kbd>Mod</kbd>+<kbd>=</kbd> / <kbd>-</kbd> / <kbd>0</kbd> change the font size. The writer can independently pick the content font family and size. Custom themes are JSON files that override some or all tokens, and missing tokens fall back to the base theme. The same tokens style the editor, the trigger, the toolbar, focus mode, find highlights, the desktop window, and published public pages. Covers THM-01 to THM-06 in the [requirements](../product/requirements.md).

## What a theme controls

| Group | Tokens | Used by |
| --- | --- | --- |
| **Surface** | `color.canvas`, `color.surface`, `color.surfaceRaised`, `color.border` | Canvas background, panels, toolbar, menus |
| **Text** | `color.text`, `color.textMuted`, `color.textPlaceholder`, `color.link` | Note content, labels, placeholder |
| **Accent** | `color.accent`, `color.onAccent`, `color.focusRing`, `color.selection` | Focus outlines, selection, active states |
| **Trigger** | `trigger.dot` (red), `trigger.ring`, `trigger.ringBorder`, `trigger.blur` | The [trigger](main-ui.html) |
| **Focus mode** | `focus.dimOpacity` (default `0.3`), `focus.rowTint` | [Focus mode](focus-mode.md) |
| **Find** | `color.findMatch`, `color.findMatchActive` | [Find and replace](find-and-replace.md) |
| **Status** | `color.danger`, `color.warning`, `color.success` | Save problems, destructive confirmations |
| **Code** | `code.background`, `code.text`, `code.syntax.*` | Code blocks and inline code |
| **Typography** | `font.content`, `font.ui`, `font.mono`, `font.size`, `font.lineHeight` | Note text, UI text, code |
| **Layout** | `layout.measure` (default 70ch), `layout.blockGap` | Reading column width, spacing between blocks |
| **Window** (desktop) | `window.radius` (default 20 px), `window.titleBarHeight` (44 px), `window.shadow` | [Desktop app](desktop-app.html) |

Component code never uses raw color or font values, only token names (THM-01). The app turns tokens into CSS custom properties (for example `color.textMuted` → `--fn-color-text-muted`) on the root element, so switching themes is just swapping a set of variables. No reload is needed.

## Built-in themes

| Theme | Notes |
| --- | --- |
| **Light** | Warm off-white canvas, near-black text. |
| **Dark** | Deep neutral canvas, soft off-white text. The red dot is tuned to stay vivid without glowing. |
| **System** | Follows the operating system's `prefers-color-scheme` and switches live. This is the default. |

Both built-in themes must meet WCAG AA contrast for text, UI controls, and the trigger ring, with focus mode off. The dimmed rows in focus mode are a deliberate exception (see [Focus mode](focus-mode.md#accessibility)).

## Switching themes

| Where | What it does |
| --- | --- |
| Toolbar → *Theme* | Switches between light and dark. In *System* mode, it switches to the opposite of what's showing and stops following the OS. |
| <kbd>⇧⌘L</kbd> / <kbd>Ctrl+Shift+L</kbd> | Same as the toolbar action. |
| ⋯ → Theme | Choose *System*, *Light*, or *Dark* (the current one is checked). |
| Spotlight | `> Theme: System`, `> Theme: Light`, `> Theme: Dark`, `> Toggle light/dark`, each showing the current state. |
| Settings → Appearance | Every option, including custom themes. |

The change applies instantly with a short cross-fade (none with reduced motion). On the desktop, the native parts (traffic lights, menus, context menus) switch at the same moment.

## Fonts

The seed lists fonts as a theming dimension. Fonts can be set separately from the color theme:

- **Content font:** Serif, Sans, Mono, or a custom CSS font stack (THM-03).
- **Size:** steps of 14, 15, 16, 17, 18 (default), 20, 22, 24, 28, and 32 px, with line height scaled to match. <kbd>Mod</kbd>+<kbd>=</kbd> goes up a step, <kbd>Mod</kbd>+<kbd>-</kbd> goes down, and <kbd>Mod</kbd>+<kbd>0</kbd> resets. The ⋯ menu has a single − 18 + row that does the same (THM-06). A small "18 px" readout appears briefly near the trigger after each change. Only the note text changes; interface size is a separate *UI scale* setting.
- **UI font:** follows the system UI font by default, and can be overridden.
- **Web fonts:** any bundled web font is self-hosted with the app. Nothing loads from a third-party font CDN at runtime, so the app works offline in Electron and doesn't leak data.

## Custom themes (P1)

A custom theme is a JSON file that names a base theme and overrides tokens. Example:

```json
{
  "name": "Sepia",
  "base": "light",
  "tokens": {
    "color.canvas": "#f4ecd8",
    "color.text": "#3b2f1e",
    "font.content": "\"Iowan Old Style\", Georgia, serif",
    "focus.dimOpacity": 0.25
  }
}
```

- Missing tokens come from `base`. Unknown token names are ignored, with a warning in Settings.
- Token values are validated (colors, numbers in range, font stacks only, no `url()`), so a shared theme file can't inject CSS.
- Custom themes are stored in the repository at `.focus-notes/themes/*.json`, which makes them version-controlled and lets them sync across devices (THM-04).
- The chosen theme is a per-device setting by default. Opting in to *Sync appearance* stores the choice in `.focus-notes/settings.json` instead (THM-05).

## Where themes apply

| Surface | Uses the theme? |
| --- | --- |
| Editor canvas, trigger, toolbar, panels | Yes, always |
| Published public note pages | Yes. They use the reader's light or dark preference with the site's default theme tokens |
| Private share-link pages | Same as public pages |
| This documentation site (Slate) | No. Slate has its own theme in `documentations/project.theme.css` |
