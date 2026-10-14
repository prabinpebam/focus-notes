/**
 * The theme manager (IA-VIEW-THEME, THM-07, THM-13): a right side sheet with the real note as the
 * live preview. Themes (the gallery: arrow keys preview each theme on the note, Enter or a click
 * chooses it for its slot, Esc goes back to the chosen one), Reading (the reading settings, which
 * apply to every theme), and Edit colors (the five key colors of the theme showing, each checked
 * by the contrast guard, with a one-click fix). Every choice runs the same commands as the ⋯
 * menu, so it's remembered and synced the same way (THM-05, D-46).
 *
 * As built (D-108): edited colors are a copy of the theme showing, "⟨Theme⟩ (custom)", kept while
 * the app runs; saving custom themes, and the Yours group, arrive with custom themes (WP-8.2),
 * which saves through `checkBeforeSave`.
 */
import type { AppStateFile } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import { KEY_COLORS, checkBeforeSave, checkTheme, fixColor, parseHex, textContrast, type KeyColor } from "./contrast.ts";
import { toHex } from "./color.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import {
  BUILT_IN_THEMES, CONTENT_FONTS, FOCUS_DIM, LINE_HEIGHT, MEASURE, PARAGRAPH_SPACINGS, UI_SCALES, onSteps, themeById,
  type ContentFont, type ParagraphSpacing, type ThemeKind,
} from "./themes.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { themeValues } from "@focus-notes/tokens";

export const THEME_TABS = ["themes", "reading", "colors"] as const;
export type ThemeTab = (typeof THEME_TABS)[number];
const KEYS = Object.keys(KEY_COLORS) as KeyColor[];

/** Edited key colors over a built-in theme: "⟨Theme⟩ (custom)". */
export interface ThemeDraft {
  base: string;
  colors: Partial<Record<KeyColor, string>>;
}

export interface Appearance {
  mode: "system" | "light" | "dark";
  system: ThemeKind;
  fontSize: number;
  lightTheme: string;
  darkTheme: string;
  contentFont: ContentFont;
  uiScale: number;
  lineHeight: number;
  measure: number;
  paragraphSpacing: ParagraphSpacing;
  /** Unset: each theme's own `focus.dimOpacity`. */
  focusDim?: number;
}
type Snapshot = Omit<Appearance, "system" | "uiScale"> & { draft?: ThemeDraft };

export interface ThemeManagerState {
  open: boolean;
  tab: ThemeTab;
  /** The theme the gallery's keyboard focus is previewing on the note. */
  preview?: string;
  /** Bumped to move focus to the gallery's showing theme. */
  focusRequest: number;
  /** What was active when the sheet opened, for Revert. */
  opened?: Snapshot;
  draft?: ThemeDraft;
  /** Hex values being typed that aren't colors yet. */
  typing: Partial<Record<KeyColor, string>>;
  /** The key color Fix last changed, and a count that moves focus back to its field (the Fix button goes away). */
  fixed: { key?: KeyColor; n: number };
}
export const THEME_MANAGER_CLOSED: ThemeManagerState = { open: false, tab: "themes", focusRequest: 0, typing: {}, fixed: { n: 0 } };

interface S {
  appearance: Appearance;
  ui: { theme: ThemeManagerState; toolbarOpen: boolean };
}

interface Ctx<St extends S> {
  store: Store<St>;
  commands: CommandRegistry<St>;
  viewModels: ViewModelRegistry<St>;
  catalog: MessageCatalog;
  persistAppState: (patch: Partial<AppStateFile>) => Promise<void>;
  announce: (text: string) => void;
}

/** The scheme showing (System follows the OS). */
export const schemeOf = (a: Appearance): ThemeKind => (a.mode === "system" ? a.system : a.mode);
/** The theme on the note now: the one being previewed, else the chosen theme for the scheme showing (THM-08). */
export const shownTheme = (s: S): string => s.ui.theme.preview ?? (schemeOf(s.appearance) === "dark" ? s.appearance.darkTheme : s.appearance.lightTheme);
/** A theme's colors, with a draft's edits when it's the draft's base. */
export function colorsOf(id: string, draft?: ThemeDraft): Record<string, string> {
  const colors: Record<string, string> = { ...themeValues[id] };
  if (draft?.base === id) for (const k of KEYS) if (draft.colors[k]) for (const t of KEY_COLORS[k]) colors[t] = draft.colors[k]!;
  return colors;
}
/** The draft's colors as token overrides for the root, while its base is the theme showing. */
export const draftTokens = (s: S): { id: string; value: string }[] => {
  const d = s.ui.theme.draft;
  if (!d || d.base !== shownTheme(s)) return [];
  return KEYS.flatMap((k) => (d.colors[k] ? KEY_COLORS[k].map((id) => ({ id, value: d.colors[k]! })) : []));
};

const normalizeHex = (v: string): string | undefined => {
  const t = v.trim().toLowerCase();
  const rgb = parseHex(/^#/.test(t) ? t : `#${t}`);
  return rgb && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.test(t) ? toHex(rgb) : undefined;
};

/**
 * The warning before a custom theme that fails the guard is saved (THM-13, UNSUP-THEME-02): "This
 * theme has 2 hard-to-read pairs. Save anyway?" Undefined when every pair passes. Saving is
 * allowed either way (DD-THEME-05); the editor that saves (WP-8.2) asks this first.
 */
export function saveWarning(catalog: MessageCatalog, colors: Readonly<Record<string, string>>, high = false): string | undefined {
  const { ok, failing } = checkBeforeSave(colors, high);
  return ok ? undefined : catalog.format("theme.saveWarning", { count: failing.length });
}

/** The one-click fix for a key color, remembered for the colors it was asked about (the view model asks on every change). */
const fixes = new Map<string, string | undefined>();
function fixFor(colors: Record<string, string>, key: KeyColor, high: boolean): string | undefined {
  const k = `${key}|${high}|${JSON.stringify(colors)}`;
  if (!fixes.has(k)) {
    if (fixes.size > 200) fixes.clear();
    fixes.set(k, fixColor(colors, KEY_COLORS[key], high));
  }
  return fixes.get(k);
}

export function registerThemeManager<St extends S>({ store, commands, viewModels, catalog, persistAppState, announce }: Ctx<St>) {
  const state = () => store.state.ui.theme;
  const set = (patch: Partial<ThemeManagerState>) => store.update((s) => ({ ...s, ui: { ...s.ui, theme: { ...s.ui.theme, ...patch } } }));
  const reg = <A extends Record<string, unknown> = Record<string, never>>(id: string, run: (a: A) => unknown) =>
    commands.register<A>({ id, title: `command.${id}`, run: async (a) => { await run(a); } });
  const str = (a: { value?: unknown }) => (typeof a.value === "string" ? a.value : "");
  const name = (id: string) => catalog.format(themeById(id)?.title ?? id);

  /** Reading settings: kept in the store and persisted like the rest of appearance (synced when Sync appearance is on). */
  const setReading = async (patch: Partial<Pick<Appearance, "lineHeight" | "measure" | "paragraphSpacing" | "focusDim">>) => {
    store.update((s) => ({ ...s, appearance: { ...s.appearance, ...patch } }));
    await persistAppState(patch);
  };

  // ---- the sheet ----
  commands.register({
    id: "theme.manager.open", title: "command.theme.manager.open", icon: "color",
    run: () => {
      const a = store.state.appearance;
      const opened: Snapshot = {
        mode: a.mode, lightTheme: a.lightTheme, darkTheme: a.darkTheme, contentFont: a.contentFont, fontSize: a.fontSize,
        lineHeight: a.lineHeight, measure: a.measure, paragraphSpacing: a.paragraphSpacing, ...(a.focusDim !== undefined ? { focusDim: a.focusDim } : {}),
        ...(state().draft ? { draft: state().draft! } : {}),
      };
      store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false, theme: { ...s.ui.theme, open: true, tab: "themes", opened, typing: {}, focusRequest: s.ui.theme.focusRequest + 1 } } }));
    },
  });
  reg("theme.manager.close", () => {
    const { preview, ...rest } = state();
    void preview;
    store.update((s) => ({ ...s, ui: { ...s.ui, theme: { ...rest, open: false, typing: {} } } }));
  });
  reg<{ value: string }>("theme.manager.setTab", (a) => {
    const v = str(a);
    if ((THEME_TABS as readonly string[]).includes(v)) {
      const { preview, ...rest } = state();
      void preview;
      store.update((s) => ({ ...s, ui: { ...s.ui, theme: { ...rest, tab: v as ThemeTab } } }));
    }
  });
  /** Revert: exactly what was active when the sheet opened, the reading settings included. */
  reg("theme.manager.revert", async () => {
    const o = state().opened;
    if (!o) return;
    const { draft, ...appearance } = o;
    const { preview, draft: _d, ...rest } = state();
    void preview; void _d;
    store.update((s) => ({
      ...s,
      appearance: { ...s.appearance, ...appearance, ...(o.focusDim === undefined ? { focusDim: undefined } : {}) },
      ui: { ...s.ui, theme: { ...rest, typing: {}, ...(draft ? { draft } : {}) } },
    }));
    await persistAppState({
      appearance: o.mode, lightTheme: o.lightTheme, darkTheme: o.darkTheme, contentFont: o.contentFont, fontSize: o.fontSize,
      lineHeight: o.lineHeight, measure: o.measure, paragraphSpacing: o.paragraphSpacing, focusDim: o.focusDim,
    });
    announce(catalog.format("theme.reverted"));
  });

  // ---- the gallery (THM-07) ----
  reg<{ id: string }>("theme.preview", ({ id }) => {
    const t = themeById(String(id));
    if (!t) return;
    set({ preview: t.id });
    const level = textContrast(colorsOf(t.id, state().draft)).level;
    announce(catalog.format("theme.previewing", { name: name(t.id), kind: catalog.format(`theme.kind.${t.kind}`), level: catalog.format(`theme.level.${level}`) }));
  });
  reg("theme.previewEnd", () => {
    const { preview, ...rest } = state();
    if (!preview) return;
    store.update((s) => ({ ...s, ui: { ...s.ui, theme: rest } }));
  });
  /** Choosing fills the theme's slot and shows it, switching the appearance if it's showing the other kind. */
  reg<{ id: string }>("theme.choose", async ({ id }) => {
    const t = themeById(String(id));
    if (!t) return;
    const { preview, ...rest } = state();
    void preview;
    store.update((s) => ({ ...s, ui: { ...s.ui, theme: rest } }));
    await commands.run(`theme.${t.kind}.${t.id}`);
    if (schemeOf(store.state.appearance) !== t.kind) await commands.run(`appearance.${t.kind}`);
    // A copy of another theme goes once neither slot holds its base.
    const d = state().draft;
    const a = store.state.appearance;
    if (d && d.base !== a.lightTheme && d.base !== a.darkTheme) set({ draft: undefined });
    announce(catalog.format("theme.chosen", { name: name(t.id), kind: catalog.format(`theme.kind.${t.kind}`) }));
  });
  reg<{ value: string }>("appearance.setMode", async (a) => {
    const v = str(a);
    if (v === "system" || v === "light" || v === "dark") await commands.run(`appearance.${v}`);
  });

  // ---- Reading ----
  reg<{ value: string }>("reading.setFont", async (a) => {
    if ((CONTENT_FONTS as readonly string[]).includes(str(a))) await commands.run(`font.content.${str(a)}`);
  });
  reg<{ value: number }>("reading.setLineHeight", async ({ value }) => {
    const v = onSteps(value, LINE_HEIGHT);
    if (v !== undefined) await setReading({ lineHeight: v });
  });
  reg<{ value: number }>("reading.setMeasure", async ({ value }) => {
    const v = onSteps(value, MEASURE);
    if (v !== undefined) await setReading({ measure: v });
  });
  reg<{ value: number }>("reading.setFocusDim", async ({ value }) => {
    const v = onSteps(value, FOCUS_DIM);
    if (v !== undefined) await setReading({ focusDim: v });
  });
  reg<{ value: string }>("reading.setParagraphSpacing", async (a) => {
    if ((PARAGRAPH_SPACINGS as readonly string[]).includes(str(a))) await setReading({ paragraphSpacing: str(a) as ParagraphSpacing });
  });
  reg<{ value: string }>("ui.setScale", async (a) => {
    const v = Number(str(a));
    const now = store.state.appearance.uiScale;
    if (!(UI_SCALES as readonly number[]).includes(v) || v === now) return;
    // Through the ⋯ menu's own commands, a step at a time.
    for (let i = 0; i < UI_SCALES.length && store.state.appearance.uiScale !== v; i++) await commands.run(v > store.state.appearance.uiScale ? "ui.scaleUp" : "ui.scaleDown");
  });
  reg("reading.reset", async () => {
    await commands.run("font.content.mono");
    await commands.run("font.reset");
    await setReading({ lineHeight: LINE_HEIGHT.default, measure: MEASURE.default, paragraphSpacing: "comfortable", focusDim: undefined });
    announce(catalog.format("reading.wasReset"));
  });

  // ---- Edit colors (THM-13) ----
  const editing = () => {
    const s = store.state;
    const base = shownTheme(s);
    const d = state().draft;
    return { base, draft: d?.base === base ? d : undefined };
  };
  const setColor = (key: KeyColor, hex: string) => {
    const { base, draft } = editing();
    const colors = { ...draft?.colors, [key]: hex };
    const { [key]: _t, ...typing } = state().typing;
    void _t;
    set({ draft: { base, colors }, typing });
  };
  reg<{ key: string; value: string }>("theme.color.set", ({ key, value }) => {
    if (!(KEYS as string[]).includes(String(key))) return;
    const k = key as KeyColor;
    const hex = normalizeHex(String(value ?? ""));
    if (hex) setColor(k, hex);
    else set({ typing: { ...state().typing, [k]: String(value ?? "") } });
  });
  reg<{ key: string }>("theme.color.fix", ({ key }) => {
    if (!(KEYS as string[]).includes(String(key))) return;
    const k = key as KeyColor;
    const { base, draft } = editing();
    const fixed = fixFor(colorsOf(base, draft), k, themeById(base)?.contrast === "high");
    if (!fixed) return;
    setColor(k, fixed);
    set({ fixed: { key: k, n: state().fixed.n + 1 } });
    announce(catalog.format("colors.fixed", { name: catalog.format(`colors.key.${k}`), value: fixed }));
  });

  // ---- view model ----
  const OPTION = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const } } };
  const NUM = { type: "number" as const };
  const STR = { type: "string" as const };
  const BOOL = { type: "boolean" as const };
  const ratioText = (n: number) => (Math.floor(n * 10) / 10).toFixed(1);
  viewModels.register({
    id: "vm.themeManager",
    schema: {
      type: "object",
      properties: {
        open: BOOL, tab: { type: "string", enum: [...THEME_TABS] }, tabs: { type: "array", items: OPTION },
        mode: { type: "string", enum: ["system", "light", "dark"] }, modes: { type: "array", items: OPTION },
        tiles: { type: "array", items: { type: "object", properties: { id: STR, label: STR, kind: { type: "string", enum: ["light", "dark"] }, slot: STR, badge: STR, description: STR } } },
        showing: STR, previewing: BOOL, focusRequest: NUM, status: STR,
        reading: {
          type: "object",
          properties: {
            font: STR, fontText: STR, fontLabel: STR, fontMenu: { type: "array", items: { type: "object", properties: { id: STR, label: STR, items: { type: "array", items: { type: "object", properties: { id: STR, label: STR, checked: BOOL } } } } } }, sizeText: STR, canSmaller: BOOL, canLarger: BOOL,
            lineHeight: NUM, lineHeightText: STR, measure: NUM, measureText: STR, spacing: { type: "string", enum: [...PARAGRAPH_SPACINGS] }, spacings: { type: "array", items: OPTION },
            focusDim: NUM, focusDimText: STR,
          },
        },
        colors: {
          type: "object",
          properties: {
            note: STR, failing: BOOL, summary: STR,
            rows: { type: "array", items: { type: "object", properties: { id: STR, label: STR, value: STR, swatch: STR, focusRequest: NUM, invalid: BOOL, error: STR, status: STR, failing: BOOL, canFix: BOOL, fixLabel: STR } } },
          },
        },
      },
    },
    setters: {
      tab: "theme.manager.setTab", mode: "appearance.setMode", "reading.lineHeight": "reading.setLineHeight",
      "reading.measure": "reading.setMeasure", "reading.spacing": "reading.setParagraphSpacing", "reading.focusDim": "reading.setFocusDim",
    },
    reads: ["ui.theme", "appearance"],
    select: (s) => {
      const st = s.ui.theme;
      if (!st.open) return { open: false, tab: st.tab, tabs: [], mode: s.appearance.mode, modes: [], tiles: [], showing: "", previewing: false, focusRequest: st.focusRequest, status: "", reading: {}, colors: { rows: [] } };
      const a = s.appearance;
      const showing = shownTheme(s);
      const chosen = schemeOf(a) === "dark" ? a.darkTheme : a.lightTheme;
      const tiles = BUILT_IN_THEMES.map((t) => {
        const slot = a.lightTheme === t.id ? catalog.format("theme.slot.light") : a.darkTheme === t.id ? catalog.format("theme.slot.dark") : "";
        const level = textContrast(colorsOf(t.id, st.draft)).level;
        const badge = catalog.format(`theme.level.${level}`);
        return { id: t.id, label: name(t.id), kind: t.kind, slot, badge, description: `${catalog.format(`theme.kind.${t.kind}`)}, ${badge}` };
      });
      const colors = colorsOf(showing, st.draft);
      const tc = textContrast(colors);
      const high = themeById(showing)?.contrast === "high";
      const results = checkTheme(colors, high);
      const { draft } = editing();
      const rows = KEYS.map((k) => {
        const tokens: readonly string[] = KEY_COLORS[k];
        const mine = results.filter((r) => tokens.includes(r.fg) || tokens.includes(r.bg));
        // The row names the closest pair, its own color's first ("Text on Background 8.2:1").
        const closest = (xs: typeof results) => [...xs].sort((x, y) => x.ratio / x.need - y.ratio / y.need)[0];
        // Text colors are named as the text ("Text on Background"), surfaces as what's on them.
        const asFg = mine.filter((r) => r.fg === tokens[0]);
        const own = asFg.length ? asFg : mine.filter((r) => r.bg === tokens[0]);
        const worst = closest(own.filter((r) => !r.pass)) ?? closest(mine.filter((r) => !r.pass));
        const shown = worst ?? closest(own.length ? own : mine);
        const label = (t: string) => catalog.format(`colors.token.${t}`);
        const status = !shown ? ""
          : worst ? catalog.format("colors.failing", { fg: label(worst.fg), bg: label(worst.bg), ratio: ratioText(worst.ratio), need: String(worst.need) })
            : catalog.format("colors.passing", { fg: label(shown.fg), bg: label(shown.bg), ratio: ratioText(shown.ratio) });
        const hex = colors[tokens[0]!] ?? "";
        const typed = st.typing[k];
        const canFix = Boolean(worst) && fixFor(colors, k, high) !== undefined;
        return {
          id: k, label: catalog.format(`colors.key.${k}`), value: typed ?? hex, swatch: hex, focusRequest: st.fixed.key === k ? st.fixed.n : 0, invalid: typed !== undefined, error: typed !== undefined ? catalog.format("colors.invalid") : "",
          status, failing: Boolean(worst), canFix, fixLabel: catalog.format("colors.fix", { name: catalog.format(`colors.key.${k}`) }),
        };
      });
      const failing = results.filter((r) => !r.pass).length;
      // The fonts are the ⋯ menu's own commands, each showing whether it's chosen.
      const fontMenu = [{ id: "fonts", items: CONTENT_FONTS.map((id) => ({ id: `font.content.${id}`, label: catalog.format(`font.${id}`), checked: a.contentFont === id })) }];
      const fontText = catalog.format(`font.${a.contentFont}`);
      return {
        open: true, tab: st.tab, tabs: THEME_TABS.map((id) => ({ id, label: catalog.format(`theme.tab.${id}`) })),
        mode: a.mode, modes: (["system", "light", "dark"] as const).map((id) => ({ id, label: catalog.format(`command.appearance.${id}`) })),
        tiles, showing, previewing: Boolean(st.preview && st.preview !== chosen), focusRequest: st.focusRequest,
        status: catalog.format("theme.status", { ratio: ratioText(tc.ratio), level: catalog.format(`theme.level.${tc.level}`) }),
        reading: {
          font: a.contentFont, fontText, fontLabel: catalog.format("reading.fontLabel", { font: fontText }), fontMenu, sizeText: catalog.format("reading.sizeText", { size: a.fontSize }),
          canSmaller: commands.describe("font.smaller").enabled, canLarger: commands.describe("font.larger").enabled,
          lineHeight: a.lineHeight, lineHeightText: a.lineHeight.toFixed(1), measure: a.measure, measureText: catalog.format("reading.measureText", { count: a.measure }),
          spacing: a.paragraphSpacing, spacings: PARAGRAPH_SPACINGS.map((id) => ({ id, label: catalog.format(`reading.spacing.${id}`) })),
          focusDim: a.focusDim ?? Number(themeValues[showing]?.["focus.dimOpacity"] ?? 0.3), focusDimText: catalog.format("reading.percent", { value: Math.round((a.focusDim ?? Number(themeValues[showing]?.["focus.dimOpacity"] ?? 0.3)) * 100) }),
        },
        colors: {
          note: draft ? catalog.format("colors.copyNote", { name: name(draft.base) }) : catalog.format("colors.builtInNote", { name: name(showing) }),
          failing: failing > 0, summary: failing ? catalog.format("colors.summary", { count: failing }) : catalog.format("colors.allPass"),
          rows,
        },
      };
    },
  });
}
