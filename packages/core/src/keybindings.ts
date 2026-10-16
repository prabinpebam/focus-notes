/**
 * Custom keybindings (WP-8.3, KEY-07, D-170; Keyboard shortcuts → Custom keybindings as built):
 * `keybindings.json` read into user bindings layered over the registry's defaults, with every
 * entry the app can't apply reported by its position instead of stopping the rest, and the keys
 * that run more than one command in the same context listed as conflicts.
 */
import { OS_RESERVED, type Binding, type Platform } from "./commands.ts";

export interface UserBindings {
  /** Chords added to a command: they win over a default chord on the same key. */
  add: ReadonlyMap<string, readonly string[]>;
  /** Default chords taken off a command. */
  remove: ReadonlyMap<string, ReadonlySet<string>>;
}
export const NO_USER_BINDINGS: UserBindings = { add: new Map(), remove: new Map() };

export type KeybindingProblemReason = "notJson" | "notList" | "notObject" | "unknownField" | "unknownCommand" | "badKey" | "reserved" | "badPlatform";
export interface KeybindingProblem { /** The entry's position, from 1; 0 for the file as a whole. */ position: number; reason: KeybindingProblemReason; command?: string }
export interface ParsedKeybindings { bindings: UserBindings; problems: KeybindingProblem[]; /** Entries that apply on this platform. */ applied: number }

const MODIFIERS = ["Mod", "Ctrl", "Alt", "Shift", "Meta"] as const;
const PLATFORMS = ["macos", "windows", "linux"] as const;
const CHORD = /^((Mod|Ctrl|Alt|Shift|Meta)\+)*[^+\s]+$/;
const COMMAND = /^-?[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/;
const MAX_ENTRIES = 1000;

/**
 * A chord as the matcher compares it on a platform: `Mod` as the platform's key, the modifiers in
 * one order, the key in lower case. `Mod+Shift+s` and `Shift+Ctrl+S` are the same chord on Windows.
 */
export function canonicalChord(chord: string, platform: Platform): string {
  const parts = chord.split("+");
  const key = parts.pop()!.toLowerCase();
  const mods = new Set(parts.map((m) => (m === "Mod" ? (platform === "macos" ? "Meta" : "Ctrl") : m)));
  return [...MODIFIERS.filter((m) => m !== "Mod" && mods.has(m)), key].join("+");
}

/** Reads `keybindings.json`. Never throws: what can't apply is reported, and the rest applies. */
export function parseKeybindings(text: string | undefined, platform: Platform, known: (id: string) => boolean): ParsedKeybindings {
  const add = new Map<string, string[]>();
  const remove = new Map<string, Set<string>>();
  const problems: KeybindingProblem[] = [];
  let applied = 0;
  const done = (): ParsedKeybindings => ({ bindings: { add, remove }, problems, applied });
  if (text === undefined || text.trim() === "") return done();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    problems.push({ position: 0, reason: "notJson" });
    return done();
  }
  if (!Array.isArray(raw)) {
    problems.push({ position: 0, reason: "notList" });
    return done();
  }
  const reserved = platform === "web" ? [] : OS_RESERVED[platform].map((c) => canonicalChord(c, platform));
  raw.slice(0, MAX_ENTRIES).forEach((e: unknown, i) => {
    const position = i + 1;
    if (typeof e !== "object" || e === null || Array.isArray(e)) return void problems.push({ position, reason: "notObject" });
    const o = e as Record<string, unknown>;
    if (Object.keys(o).some((k) => k !== "command" && k !== "key" && k !== "platform")) return void problems.push({ position, reason: "unknownField" });
    const command = typeof o.command === "string" ? o.command : "";
    const id = command.replace(/^-/, "");
    if (!COMMAND.test(command) || !known(id)) return void problems.push({ position, reason: "unknownCommand", ...(command ? { command: command.slice(0, 80) } : {}) });
    if (typeof o.key !== "string" || o.key.length > 64 || !CHORD.test(o.key)) return void problems.push({ position, reason: "badKey", command: id });
    if (o.platform !== undefined && !(PLATFORMS as readonly unknown[]).includes(o.platform)) return void problems.push({ position, reason: "badPlatform", command: id });
    if (o.platform !== undefined && o.platform !== platform) return;
    if (platform === "web") return;
    const removing = command.startsWith("-");
    if (!removing && reserved.includes(canonicalChord(o.key, platform))) return void problems.push({ position, reason: "reserved", command: id });
    if (removing) remove.set(id, new Set([...(remove.get(id) ?? []), o.key]));
    else add.set(id, [...(add.get(id) ?? []).filter((c) => c !== o.key), o.key]);
    applied++;
  });
  if (raw.length > MAX_ENTRIES) problems.push({ position: MAX_ENTRIES + 1, reason: "notObject" });
  return done();
}

export interface KeyConflict { chord: string; /** The commands, the one that runs first. */ ids: string[] }

/**
 * Keys that run more than one command in the same context (`handledBy`, or app-wide), from the
 * effective bindings in the order the matcher tries them: user chords first, then defaults.
 */
export function keyConflicts(bindings: readonly Binding[], platform: Platform, userFirst: ReadonlySet<string> = new Set()): KeyConflict[] {
  const seen = new Map<string, { chord: string; ids: string[] }>();
  const ordered = [...bindings].sort((a, b) => Number(!userFirst.has(a.id)) - Number(!userFirst.has(b.id)));
  for (const b of ordered) {
    for (const chord of b.chords) {
      const k = `${b.handledBy ?? ""}|${canonicalChord(chord, platform)}`;
      const at = seen.get(k) ?? { chord, ids: [] };
      if (!at.ids.includes(b.id)) at.ids.push(b.id);
      seen.set(k, at);
    }
  }
  return [...seen.values()].filter((c) => c.ids.length > 1);
}
