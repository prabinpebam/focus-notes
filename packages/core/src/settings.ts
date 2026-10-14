/**
 * Synced settings (PRV-03, D-46): which of the app's settings follow the person across devices,
 * stored in the private repository's `.focus-notes/settings.json` (`schemas/settings.schema.json`),
 * and which stay on one device in its app state (`schemas/app-state.schema.json`).
 *
 * Syncing is opted into (THM-05): while that file exists, the app reads and writes the synced
 * settings there; otherwise everything stays on the device, as before. The window, the last note,
 * and focus mode are always per device.
 */
import type { AppStateFile } from "./bridge.ts";

/** The settings that sync: appearance, the light and dark themes, and the reading settings. */
export const SYNCED_KEYS = ["appearance", "lightTheme", "darkTheme", "contentFont", "fontSize", "lineHeight", "measure", "paragraphSpacing", "focusDim"] as const;
export type SyncedKey = (typeof SYNCED_KEYS)[number];
export type SyncedSettings = Pick<AppStateFile, SyncedKey>;

/** `private/.focus-notes/settings.json`. Parts this version doesn't write (the toolbar) are kept as they are. */
export interface SettingsFile {
  appearance?: { mode?: "system" | "light" | "dark"; lightTheme?: string; darkTheme?: string };
  reading?: { contentFont?: string; fontSize?: number; lineHeight?: number; measure?: number; paragraphSpacing?: "compact" | "comfortable" | "airy"; focusDim?: number };
  toolbar?: string[];
}

const FONT_SIZES = [14, 15, 16, 17, 18, 20, 22, 24, 28, 32];
const MODES = ["system", "light", "dark"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const inRange = (v: unknown, min: number, max: number) => typeof v === "number" && v >= min && v <= max;
const name = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 100;

/** Reading settings whose absence means "the default" (focus dim: the theme's own), so a reset removes them. */
const READING_KEYS = ["lineHeight", "measure", "paragraphSpacing", "focusDim"] as const;
const SPACINGS = ["compact", "comfortable", "airy"];

/** Splits app state into what stays on the device and what syncs. A key present with no value (a removal) is kept. */
export function splitAppState<T extends Partial<AppStateFile>>(state: T): { device: Omit<T, SyncedKey>; synced: Partial<SyncedSettings> } {
  const device: Record<string, unknown> = {};
  const synced: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    ((SYNCED_KEYS as readonly string[]).includes(k) ? synced : device)[k] = v;
  }
  return { device: device as Omit<T, SyncedKey>, synced: synced as Partial<SyncedSettings> };
}

/** Reads a settings file, keeping only what's valid against the schema. Undefined when it isn't a settings file at all. */
export function parseSettings(text: string | undefined): SettingsFile | undefined {
  if (text === undefined || text.length > 64 * 1024) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isObject(raw)) return undefined;
  const out: SettingsFile = {};
  if (isObject(raw.appearance)) {
    const a = raw.appearance;
    const appearance: NonNullable<SettingsFile["appearance"]> = {};
    if (typeof a.mode === "string" && MODES.includes(a.mode)) appearance.mode = a.mode as "system";
    if (name(a.lightTheme)) appearance.lightTheme = a.lightTheme as string;
    if (name(a.darkTheme)) appearance.darkTheme = a.darkTheme as string;
    if (Object.keys(appearance).length) out.appearance = appearance;
  }
  if (isObject(raw.reading)) {
    const r = raw.reading;
    const reading: NonNullable<SettingsFile["reading"]> = {};
    if (name(r.contentFont)) reading.contentFont = r.contentFont as string;
    if (FONT_SIZES.includes(r.fontSize as number)) reading.fontSize = r.fontSize as number;
    if (inRange(r.lineHeight, 1.2, 2.2)) reading.lineHeight = r.lineHeight as number;
    if (inRange(r.measure, 50, 100) && Number.isInteger(r.measure)) reading.measure = r.measure as number;
    if (inRange(r.focusDim, 0.1, 0.6)) reading.focusDim = r.focusDim as number;
    if (typeof r.paragraphSpacing === "string" && SPACINGS.includes(r.paragraphSpacing)) reading.paragraphSpacing = r.paragraphSpacing as "compact";
    if (Object.keys(reading).length) out.reading = reading;
  }
  if (Array.isArray(raw.toolbar) && raw.toolbar.length <= 6 && raw.toolbar.every((c) => typeof c === "string" && /^[a-z][A-Za-z]*(\.[a-z][A-Za-z]*)+$/.test(c))) {
    out.toolbar = raw.toolbar as string[];
  }
  return out;
}

/** The synced settings in a settings file, as app state. */
export function appStateOfSettings(file: SettingsFile | undefined): Partial<SyncedSettings> {
  const a = file?.appearance;
  const r = file?.reading;
  return {
    ...(a?.mode ? { appearance: a.mode } : {}),
    ...(a?.lightTheme ? { lightTheme: a.lightTheme } : {}),
    ...(a?.darkTheme ? { darkTheme: a.darkTheme } : {}),
    ...(r?.contentFont ? { contentFont: r.contentFont } : {}),
    ...(r?.fontSize ? { fontSize: r.fontSize } : {}),
    ...Object.fromEntries(READING_KEYS.filter((k) => r?.[k] !== undefined).map((k) => [k, r![k]])),
  };
}

/** A settings file with these synced settings, keeping everything else in `base`. */
export function settingsFileOf(synced: Partial<SyncedSettings>, base: SettingsFile = {}): SettingsFile {
  const appearance = {
    ...base.appearance,
    ...(synced.appearance ? { mode: synced.appearance } : {}),
    ...(synced.lightTheme ? { lightTheme: synced.lightTheme } : {}),
    ...(synced.darkTheme ? { darkTheme: synced.darkTheme } : {}),
  };
  const reading = {
    ...base.reading,
    ...(synced.contentFont ? { contentFont: synced.contentFont } : {}),
    ...(synced.fontSize ? { fontSize: synced.fontSize } : {}),
  };
  for (const k of READING_KEYS) {
    if (!(k in synced)) continue;
    if (synced[k] === undefined) delete reading[k];
    else Object.assign(reading, { [k]: synced[k] });
  }
  return {
    ...(Object.keys(appearance).length ? { appearance } : {}),
    ...(Object.keys(reading).length ? { reading } : {}),
    ...(base.toolbar ? { toolbar: base.toolbar } : {}),
  };
}
