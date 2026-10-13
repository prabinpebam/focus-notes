# Theming

Every color and font the writer sees comes from a theme. A theme is a small JSON document of design tokens, so the writer can change it without anyone touching code.

> [!NOTE]
> **TL;DR.** Themes control **colors** and **fonts** (seed) through semantic tokens. The app ships **Light**, **Dark**, and **System** (auto), confirmed by the owner as D-25. The toolbar's *Theme* action and <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> switch between light and dark. <kbd>Mod</kbd>+<kbd>=</kbd> / <kbd>-</kbd> / <kbd>0</kbd> change the font size. The writer can independently pick the content font family and size. Custom themes are JSON files that override some or all tokens, and missing tokens fall back to the base theme. The same tokens style the editor, the trigger, the toolbar, focus mode, find highlights, the desktop window, and published public pages. Covers THM-01 to THM-13 in the [requirements](../product/requirements.md). The detailed design is the [theme manager](../design/views/theme-manager.html).

## What a theme controls

| Group | Tokens | Used by |
| --- | --- | --- |
| **Surface** | `color.canvas`, `color.surface`, `color.surfaceRaised`, `color.border` | Canvas background, panels, toolbar, menus |
| **Text** | `color.text`, `color.textMuted`, `color.textPlaceholder`, `color.link` | Note content, labels, placeholder |
| **Accent** | `color.accent`, `color.onAccent`, `color.focusRing`, `color.selection` | Focus outlines, selection, active states |
| **Interaction** | `color.hover`, `color.pressed` | Hover and pressed fills (see [Design foundations](../design/foundations.md#states)) |
| **Trigger** | `trigger.dot` (red), `trigger.ring`, `trigger.ringBorder`, `trigger.blur` | The [trigger](main-ui.html) |
| **Focus mode** | `focus.dimOpacity` (default `0.3`), `focus.rowTint` | [Focus mode](focus-mode.md) |
| **Find** | `color.findMatch`, `color.findMatchActive` | [Find and replace](find-and-replace.md) |
| **Status** | `color.danger`, `color.warning`, `color.success` | Save problems, destructive confirmations |
| **Code** | `code.background`, `code.text`, `code.syntax.*` | Code blocks and inline code |
| **Typography** | `font.content`, `font.ui`, `font.mono`, `font.size`, `font.lineHeight` | Note text, UI text, code |
| **Layout** | `layout.measure` (default 70ch), `layout.blockGap` | Reading column width, spacing between blocks |
| **Window** (desktop) | `window.radius` (default 20 px, Windows and Linux), `window.titleBarHeight` (44 px), `window.shadow` | [Desktop app](desktop-app.html) |

Component code never uses raw color or font values, only token names (THM-01). Themes set these semantic tokens, and components read their own component tokens, which alias them ([Tokens](../design/system/tokens.md), DSY-01). The app turns tokens into CSS custom properties (for example `color.textMuted` → `--fn-color-text-muted`) on the root element, so switching themes is just swapping a set of variables. No reload is needed.

## Appearance and built-in themes

Appearance is **System** (default, follows the OS's `prefers-color-scheme` live), **Light**, or **Dark**. There's one chosen **light theme** and one chosen **dark theme**, and System swaps between them (THM-08). Built-in themes:

| Theme | Kind | Notes |
| --- | --- | --- |
| **Paper** | Light | Warm off-white canvas, near-black text. Default light theme. |
| **Ink** | Dark | Deep neutral canvas, soft off-white text. The red dot is tuned to stay vivid without glowing. Default dark theme. |
| **Sepia** | Light | Warm paper tone for long sessions. |
| **Dusk** | Dark | Warm dark, without a cold blue cast. |
| **Harbor**, **Forest** | Light and dark | Cool blue-grey and muted green families. |
| **High contrast** | Light and dark | At least 7:1 everywhere, heavier focus outlines. |

Every built-in theme passes the [contrast guard](../design/views/theme-manager.html#contrast-guard) (THM-13) with focus mode off. The dimmed rows in focus mode are a deliberate exception (see [Focus mode](focus-mode.md#accessibility)). Named classic schemes (Solarized, Nord, Dracula, Gruvbox, Catppuccin) follow in P1 (THM-09).

## Switching themes

| Where | What it does |
| --- | --- |
| Toolbar → *Theme* | Switches between your light and dark themes. In *System* mode, it switches to the opposite of what's showing and stops following the OS. Right-click or long-press opens the theme manager. |
| <kbd>⇧⌘L</kbd> / <kbd>Ctrl+Shift+L</kbd> | Same as the toolbar action. |
| ⋯ → Theme | Choose *System*, *Light*, or *Dark* (the current one is checked), or *Theme…* for the theme manager. |
| Spotlight | `> Theme: System`, `> Theme: Light`, `> Theme: Dark`, `> Toggle light/dark`, `> Theme…`, each showing the current state. |
| [Theme manager](../design/views/theme-manager.html) | The gallery, reading settings, color editing, and creating themes from a color, by shuffling, or by import. |

The change applies instantly with a short cross-fade (none with reduced motion). On the desktop, the native parts (traffic lights, menus, context menus) switch at the same moment.
## Fonts

The seed lists fonts as a theming dimension. Fonts can be set separately from the color theme:

- **Content font:** Sans (Inter), Serif (Source Serif 4), Mono (JetBrains Mono), Hyperlegible (Atkinson Hyperlegible), OpenDyslexic, System, or a custom CSS font stack (THM-03). Bundled fonts use the SIL Open Font License (D-29).
- **Size:** steps of 14, 15, 16, 17, 18 (default), 20, 22, 24, 28, and 32 px, with line height scaled to match. <kbd>Mod</kbd>+<kbd>=</kbd> goes up a step, <kbd>Mod</kbd>+<kbd>-</kbd> goes down, and <kbd>Mod</kbd>+<kbd>0</kbd> resets. The ⋯ menu has a single − 18 + row that does the same (THM-06). A small "18 px" readout appears briefly near the trigger after each change. Only the note text changes; interface size is a separate *UI scale* setting.
- **Line spacing, reading width, paragraph spacing, and focus dim** are set in the theme manager's Reading tab. Reading settings are separate from color themes, so switching theme never resets them.
- **UI font:** follows the system UI font by default, and can be overridden.
- **Web fonts:** any bundled web font is self-hosted with the app. Nothing loads from a third-party font CDN at runtime, so the app works offline in Electron and doesn't leak data.

## Custom themes (P1)

A custom theme is a JSON file of one kind (light or dark) that names a base theme and overrides tokens. Example:

```json
{
  "name": "Sepia evening",
  "kind": "light",
  "base": "paper",
  "family": "sepia",
  "tokens": {
    "color.canvas": "#f4ecd8",
    "color.text": "#3b2f1e",
    "color.accent": "#9a5b13"
  }
}
```

- Missing tokens come from `base`, or are derived from the five key colors (canvas, surface, text, muted text, accent). Unknown token names are ignored, with a warning in the theme manager.
- Token values are validated (colors, numbers in range, no `url()` and no raw CSS), so a shared theme file can't inject CSS (UNSUP-THEME-01). Fonts and reading settings aren't part of a theme (see above).
- Custom themes are created in the [theme manager](../design/views/theme-manager.html): duplicate and edit, generate from a color (THM-11), shuffle (THM-12), or import a VS Code theme, a base16 scheme, or a theme file (THM-10).
- Custom themes are stored in the private repository at `private/.focus-notes/themes/*.json`, which makes them version-controlled and lets them sync across devices without being published (THM-04, D-46). Without a private repository they fall back to `.focus-notes/themes/` in the notes repository, which is public.
- The chosen appearance, the light and dark slots, and reading settings are per device by default. Opting in to *Sync appearance* stores them in `private/.focus-notes/settings.json` instead (THM-05, D-46).
## Where themes apply

| Surface | Uses the theme? |
| --- | --- |
| Editor canvas, trigger, toolbar, panels | Yes, always |
| Published public note pages | Yes. They use the reader's light or dark preference with the site's default theme tokens |
| Private share-link pages | Same as public pages |
| This documentation site (Slate) | No. Slate has its own theme in `documentations/project.theme.css` |
