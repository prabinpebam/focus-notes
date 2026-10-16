/**
 * Custom themes (THM-04, D-173): JSON files of one kind, light or dark, that name a built-in base and
 * override some of its color tokens (Theming → Custom themes). Read from the workspace's
 * `private/.focus-notes/themes/` (or `.focus-notes/themes/` without a private repository). Only
 * color tokens the base has, with hex values, are kept, so a shared file can't inject CSS
 * (UNSUP-THEME-01); a key color also sets the tokens it leads (KEY_COLORS), unless the file sets them.
 */
import { themeValues } from "@focus-notes/tokens";
import { KEY_COLORS, checkBeforeSave, parseHex } from "./contrast.ts";
import { toHex } from "./color.ts";
import { DEFAULT_THEMES, themeById, type ThemeKind } from "./themes.ts";

export interface CustomTheme {
  /** `custom:<slug>`: never a built-in theme's ID. */
  id: string;
  name: string;
  kind: ThemeKind;
  /** The built-in theme it starts from, whose styles it shows with. */
  base: string;
  /** Its colors over the base's: color tokens and hex values. */
  tokens: Record<string, string>;
  /** What was left out, for the theme manager to say. */
  ignored: string[];
  /** Every key pair passes the contrast guard (THM-13). */
  readable: boolean;
  /** The file it came from. */
  file: string;
}

const COLOR_TOKEN = /^(color|trigger|code)\.[a-zA-Z]+$/;
const HEX_VALUE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const CUSTOM_PREFIX = "custom:";
export const isCustomId = (id: string | undefined): id is string => typeof id === "string" && id.startsWith(CUSTOM_PREFIX);
export const themeSlug = (s: string) => s.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "theme";

/** Reads a theme file. Undefined when it isn't a theme at all (not JSON, no name or tokens). */
export function parseThemeFile(file: string, text: string): CustomTheme | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  if (!name || !o.tokens || typeof o.tokens !== "object" || Array.isArray(o.tokens)) return undefined;
  const asked = themeById(typeof o.base === "string" ? o.base : undefined);
  const kind: ThemeKind = o.kind === "light" || o.kind === "dark" ? o.kind : asked?.kind ?? "light";
  // The base must be of the theme's kind; else the default of that kind.
  const base = asked && asked.kind === kind ? asked.id : DEFAULT_THEMES[kind];
  const own = themeValues[base] ?? {};
  const tokens: Record<string, string> = {};
  const ignored: string[] = [];
  for (const [id, value] of Object.entries(o.tokens as Record<string, unknown>)) {
    if (!COLOR_TOKEN.test(id) || !(id in own) || typeof value !== "string" || !HEX_VALUE.test(value.trim())) {
      ignored.push(id);
      continue;
    }
    tokens[id] = toHex(parseHex(value.trim())!);
  }
  // A key color sets the tokens it leads (the link and focus ring follow the accent), unless the file sets them.
  for (const group of Object.values(KEY_COLORS)) {
    const lead = tokens[group[0]];
    if (lead) for (const t of group.slice(1)) if (!(t in tokens) && t in own) tokens[t] = lead;
  }
  const colors = { ...own, ...tokens };
  return {
    id: `${CUSTOM_PREFIX}${themeSlug(name)}`, name, kind, base, tokens, ignored,
    readable: checkBeforeSave(colors, themeById(base)?.contrast === "high").ok, file,
  };
}

/** Every readable theme file, one per ID (the first by file name wins), by name. */
export function customThemesOf(files: readonly { file: string; text: string }[]): CustomTheme[] {
  const out = new Map<string, CustomTheme>();
  for (const f of [...files].sort((a, b) => a.file.localeCompare(b.file))) {
    const t = parseThemeFile(f.file, f.text);
    if (t && !out.has(t.id)) out.set(t.id, t);
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** A custom theme's full colors: its base's, with its own over them. */
export const customColors = (t: CustomTheme): Record<string, string> => ({ ...themeValues[t.base], ...t.tokens });
