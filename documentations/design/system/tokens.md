# Tokens

Every visual value in Focus Notes is a named token. This page defines the three tiers, the naming grammar, the complete inventory, the modes tokens respond to, what a theme may change, and what the token build produces. The values themselves are tuned in [Foundations](../foundations.md).

> [!NOTE]
> **TL;DR.** Three tiers. **Reference** tokens (`ref.*`) are the raw palette and scales and are never used directly by components. **Semantic** tokens (`color.text`, `space.m`, `radius.popover`) name a role and are the only thing themes and layouts may touch. **Component** tokens (`cmp.button.primary.background.hover`) belong to one component and alias semantic tokens. Aliases only point down a tier. Tokens respond to **modes**: color scheme, contrast, forced colors, motion, transparency, pointer, platform, and UI scale. Themes may override the semantic groups listed in [Theming](../../experience/theming.md#what-a-theme-controls) and nothing else. The source is DTCG JSON in `packages/tokens`, and Style Dictionary generates the CSS variables, TypeScript types, and JSON Schema enums. Covers DSY-01 to DSY-03.

<h2 data-reader-personas="design engineering">Tiers</h2>

| Tier | Prefix | Example | Holds | Who may read it | Who may change it |
| --- | --- | --- | --- | --- | --- |
| **Reference** | `ref.` | `ref.color.red.600`, `ref.size.16`, `ref.duration.150` | Raw values: the palette, the numeric scales, the font files | Semantic tokens only | The design system |
| **Semantic** | none | `color.textMuted`, `space.m`, `radius.popover`, `motion.enter` | Roles: what a value is *for* | Component tokens, and layouts for space, size, radius, elevation, and layer | The design system. Themes may override the themeable groups. |
| **Component** | `cmp.` | `cmp.button.primary.background.hover`, `cmp.trigger.dot.size` | One component's parts, variants, and states | That component only | The design system, through the [component process](overview.html#adding-or-changing-a-component) |

**Alias rules.** A component token's value is always an alias of a semantic token, never a raw value. A semantic token's value is an alias of a reference token, or a raw value only in the reference-free groups (opacity and z order). The build fails on an alias that points up or across a tier, on a cycle, or on a component token read by another component.

<h2 data-reader-personas="design engineering">Naming</h2>

Names are dot-separated lowerCamelCase segments, from general to specific:

```text
reference:  ref.{category}.{scale}[.{step}]                  ref.color.neutral.900
semantic:   {category}.{role}[.{variant}]                     color.surfaceRaised, font.ui.body
component:  cmp.{component}.{variant|part}.{property}[.{state}]   cmp.menuItem.danger.text.hover
```

- **States** use a fixed list: `rest`, `hover`, `pressed`, `selected`, `focusVisible`, `disabled`, `busy`, `invalid`. A token for `rest` can be written without the suffix.
- **Properties** use a fixed list: `background`, `text`, `icon`, `border`, `borderWidth`, `radius`, `shadow`, `paddingInline`, `paddingBlock`, `gap`, `height`, `minWidth`, `size`, `opacity`, `duration`, `easing`.
- **Generated names:** `color.textMuted` becomes the CSS variable `--fn-color-text-muted` and the TypeScript constant `tokens.color.textMuted`.

<h2 data-reader-personas="design engineering">Semantic inventory</h2>

The complete semantic tier. Adding to it needs a decision (see [Adding or changing a component](overview.html#adding-or-changing-a-component)). Values are in [Foundations](../foundations.md) and [Theming](../../experience/theming.md).

| Group | Tokens | Themeable |
| --- | --- | --- |
| **Surface color** | `color.canvas`, `color.surface`, `color.surfaceRaised`, `color.surfaceSunken`, `color.scrim`, `color.border`, `color.borderStrong` | Yes |
| **Text color** | `color.text`, `color.textMuted`, `color.textPlaceholder`, `color.textDisabled`, `color.textInverse`, `color.link` | Yes |
| **Accent and interaction** | `color.accent`, `color.onAccent`, `color.accentMuted`, `color.hover`, `color.pressed`, `color.selection`, `color.focusRing` | Yes |
| **Status** | `color.danger`, `color.onDanger`, `color.dangerMuted`, `color.warning`, `color.warningMuted`, `color.success`, `color.successMuted`, `color.info`, `color.infoMuted` | Yes |
| **Feature roles** | `trigger.dot`, `trigger.ring`, `trigger.ringBorder`, `trigger.blur`, `focus.dimOpacity`, `focus.rowTint`, `color.findMatch`, `color.findMatchActive`, `code.background`, `code.text`, `code.syntax.*` | Yes |
| **Typography** | `font.content`, `font.ui`, `font.mono`, `font.size` (content base), `font.lineHeight` (content), `font.content.h1` to `font.content.h3` (ratios), `font.ui.caption`, `font.ui.secondary`, `font.ui.body`, `font.ui.emphasis`, `font.ui.title`, `font.weight.regular`, `font.weight.semibold`, `font.weight.bold` | Fonts, content size, and line height |
| **Space** | `space.none` (0), `space.xs` (4), `space.s` (8), `space.m` (12), `space.l` (16), `space.xl` (24), `space.xxl` (32), `space.xxxl` (48), `layout.blockGap` | `layout.blockGap` only |
| **Size** | `size.hit` (32 fine, 44 coarse), `size.icon.s` (16), `size.icon.m` (20), `size.icon.l` (24), `size.control.s` (28), `size.control.m` (32), `size.control.l` (40), `size.trigger.dot` (10), `size.trigger.ring` (30) | No |
| **Layout** | `layout.topBand` (44), `layout.measure` (70ch), `layout.gutter`, `layout.wideContent`, `layout.sheet.files` (320), `layout.sheet.theme` (380), `layout.popover` (360), `layout.dialog.s` (480), `layout.dialog.l` (760), `layout.dialog.maxHeight` (85%) | `layout.measure` only |
| **Radius** | `radius.window`, `radius.sheet`, `radius.popover`, `radius.control`, `radius.small`, `radius.round` | `radius.window` only |
| **Border** | `border.hairline` (1), `border.focus` (2), `border.focusOffset` (2), `border.selectedBar` (2) | No |
| **Elevation** | `shadow.0` to `shadow.3`, `frost.opacity` (0.78), `frost.blur` (24) | No |
| **Opacity** | `opacity.disabled` (0.4), `opacity.hover` (0.06), `opacity.pressed` (0.10) | No |
| **Motion** | `motion.micro`, `motion.enter`, `motion.sheet`, `motion.exit`, `motion.theme` (durations), `easing.standard`, `easing.decelerate`, `easing.accelerate` | No |
| **Layer order** | `layer.canvas` (0), `layer.mask` (1), `layer.contextual` (2), `layer.trigger` (3), `layer.panel` (4), `layer.dialog` (5), `layer.toast` (6), `layer.tooltip` (7) | No |
| **Breakpoints** | `breakpoint.medium` (600), `breakpoint.wide` (1024). Size classes are *compact*, *medium*, and *wide*. | No |
| **Window** (desktop) | `window.radius`, `window.titleBarHeight`, `window.shadow` | `window.radius` only, and only on Windows and Linux |

Structural groups (space, size, border, elevation, opacity, motion, layer order, breakpoints) aren't themeable, so a theme can't break layout, hit targets, or accessibility. Reading settings (font, size, line height, measure, block gap) are set by the writer in the theme manager, separately from color themes.

<h2 data-reader-personas="design engineering">Modes</h2>

A mode switches a set of token values without changing any name. Components never check modes themselves; they read tokens, and the runtime resolves the mode.

| Mode | Values | Set by | What changes |
| --- | --- | --- | --- |
| **Color scheme** | light, dark | Appearance (System, Light, or Dark) | Every color token, from the chosen light or dark theme |
| **Contrast** | standard, high | The High contrast themes, or the OS asking for more contrast | Color tokens, `border.*` (heavier), `focus.dimOpacity` floor |
| **Forced colors** | off, active | Windows contrast themes (`forced-colors: active`) | Color tokens map to system colors (`Canvas`, `CanvasText`, `Highlight`, `ButtonText`, `GrayText`). Frost and shadows turn off. |
| **Motion** | full, reduced | `prefers-reduced-motion` | `motion.*` durations become 0, except opacity fades |
| **Transparency** | frost, solid | `prefers-reduced-transparency` and the OS settings | `frost.opacity` becomes 1, and `frost.blur` becomes 0 |
| **Pointer** | fine, coarse | `pointer: coarse` | `size.hit` becomes 44, and dense rows get more padding |
| **Platform** | macos, windows, linux, web, ipados | The shell | `window.radius` (0 on macOS, which uses the native window), the window control style, and shortcut glyphs |
| **UI scale** | 90% to 150% | Settings → Appearance | Every `font.ui.*`, `size.*`, and `space.*` value is multiplied. Note text is unaffected. |

Mode values are stored as separate token sets in the DTCG source, one file per mode value, and resolved at build time into CSS variable blocks keyed by data attributes on the root element (for example `data-scheme="dark"`, `data-motion="reduced"`).

<h2 data-reader-personas="design engineering">What themes may change</h2>

- A theme file (DTCG JSON, D-53) may set **reference color tokens** and the **themeable semantic groups** above. Anything else, including any `cmp.*` token, is rejected by the theme schema with a message naming the token.
- Missing tokens inherit from the base theme of the same scheme (Paper or Ink).
- The [contrast guard](../views/theme-manager.html#contrast-guard) checks the semantic color pairs after the theme is resolved, so a theme can't make a component unreadable without being flagged.
- Because components only read component tokens, which alias semantic tokens, a theme reaches every component consistently, and no component can opt out.

<h2 data-reader-personas="engineering">Source and build</h2>

```text
packages/tokens/
├─ src/
│  ├─ reference/        # palette.json, scales.json, fonts.json
│  ├─ semantic/         # color.json, type.json, space.json, … (DTCG)
│  ├─ component/        # button.json, menu.json, trigger.json, … (one per component)
│  ├─ modes/            # dark.json, high-contrast.json, forced-colors.json, reduced-motion.json, …
│  └─ themes/           # paper.json, ink.json, sepia.json, … (built-in themes)
└─ dist/                # generated, never edited
   ├─ tokens.css        # CSS custom properties, one block per mode
   ├─ tokens.ts         # typed constants and name unions
   └─ tokens.schema.json   # enums for view props and the theme schema
```

The build (Style Dictionary) runs on every change and in CI. It checks the alias rules, checks that every component token is used by its component and every component reads only its own tokens, and generates the token reference tables for this site.

<h2 data-reader-personas="product design engineering">Design decisions</h2>

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-TOK-01 | Three tiers with aliases that only point down. | UC-THEME-01, UC-THEME-09 | Themes change roles, not components, and every component follows. One change to `color.accent` reaches every button, focus ring, and selection. | Two tiers (components reading semantic tokens directly), which lets each component pick slightly different roles. |
| DD-TOK-02 | Structural tokens aren't themeable. | UC-THEME-09 | Spacing, hit targets, motion, and layer order protect usability and accessibility. Themes are about color and reading comfort. | Fully themeable tokens, which lets a theme break layout. |
| DD-TOK-03 | Modes are resolved by the runtime, never checked by components. | UC-THEME-02, UC-THEME-09 | Reduced motion, reduced transparency, forced colors, and touch then work in every component automatically. | Components checking media queries one by one, which is how gaps appear. |
| DD-TOK-04 | Semantic spacing uses t-shirt names (`xs` to `xxxl`) on the 4 px grid. | UC-CANVAS-02 | Views choose a step by meaning, and the grid stays intact. Numbers in views invite one-offs. | Numeric spacing props in views. |
