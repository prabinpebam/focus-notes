/**
 * The command registry: the single way to act (KEY-01, DSY-12). Keys, menus, Spotlight,
 * views, agents, and deep links all run commands by ID.
 */
export type Platform = "macos" | "windows" | "linux" | "web";
/** Keymap layers, learnable in order (Keyboard shortcuts → Strategy). */
export type KeyLayer = "basic" | "writer" | "power" | "pro";
export const KEY_LAYERS: readonly KeyLayer[] = ["basic", "writer", "power", "pro"];
/** Cheat sheet groups, in display order. */
export type KeyGroup = "app" | "editing" | "formatting" | "blocks" | "tables" | "find" | "spotlight" | "files";
export const KEY_GROUPS: readonly KeyGroup[] = ["app", "editing", "formatting", "blocks", "tables", "find", "spotlight", "files"];

export interface Shortcut {
  /** Chord using "Mod" for Cmd on macOS and Ctrl elsewhere, for example "Mod+Shift+L". */
  default?: string;
  macos?: string;
  windows?: string;
  linux?: string;
  /** The substitute where a browser keeps the default for itself. Null: not available on the web (KEY-06). */
  web?: string | null;
  /** Extra chords that also run the command (for example F8). Listed in the cheat sheet, not in menus. */
  alternates?: { default?: string[]; macos?: string[]; windows?: string[]; linux?: string[] };
  /** Chords that also run the command but are never listed (keyboard variants of the same key). */
  quiet?: string[];
  /**
   * Where the key works. "editor": the editor's keymap runs it while typing, so the global handler
   * leaves it alone. Any other name is a key scope (Keyboard shortcuts → Contexts decide): it works only
   * while focus is inside an element marked with that scope, such as the find bar.
   */
  handledBy?: string;
}

/** What a key event looks like to the matcher. */
export interface KeyEventLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
  /** True when AltGr is held (Windows and Linux layouts that type characters with it). */
  altGraph?: boolean;
}

/** Keys the OS keeps for itself. They're never bound (KEY-06). */
export const OS_RESERVED: Record<"macos" | "windows" | "linux", readonly string[]> = {
  macos: ["Mod+Tab", "Mod+Space", "Mod+H", "Mod+M", "Mod+Q", "Mod+`", "Mod+Alt+Escape", "Mod+Shift+3", "Mod+Shift+4", "Mod+Shift+5"],
  windows: ["Alt+Tab", "Alt+F4", "Ctrl+Alt+Delete", "Ctrl+Escape", "Ctrl+Shift+Escape", "Alt+Space"],
  linux: ["Alt+Tab", "Alt+F4", "Ctrl+Alt+Delete", "Ctrl+Alt+T", "Alt+Space"],
};
/** Keys browsers don't let pages use. Commands with these defaults need a web substitute. */
export const BROWSER_RESERVED: readonly string[] = ["Mod+N", "Mod+T", "Mod+W", "Mod+Shift+N", "Mod+Shift+T", "Mod+Shift+W", "Mod+Tab"];

/** Physical keys for chord keys that aren't letters, for layout-independent matching. */
const CODES: Record<string, string> = {
  "/": "Slash", "\\": "Backslash", "[": "BracketLeft", "]": "BracketRight", "=": "Equal", "-": "Minus", ".": "Period",
  ",": "Comma", ";": "Semicolon", "'": "Quote", "`": "Backquote",
  ...Object.fromEntries([..."0123456789"].map((d) => [d, `Digit${d}`])),
};

export interface CommandContext<S> {
  state: S;
  update(recipe: (s: S) => S): void;
  run(id: string, args?: Record<string, unknown>): Promise<void>;
}

export interface CommandDef<S, A extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  /** Message key for the command's name. */
  title: string;
  icon?: string;
  shortcut?: Shortcut;
  enabled?: (state: S) => boolean;
  /** Message key saying why the command is unavailable, shown with it (Foundations → States). */
  disabledReason?: string;
  checked?: (state: S) => boolean;
  /** Where its shortcut appears in the cheat sheet. Commands with a shortcut need both. */
  layer?: KeyLayer;
  group?: KeyGroup;
  /** Named now but arriving in a later milestone: its keys are reserved, not listed in the cheat sheet. */
  planned?: true;
  run: (args: A, ctx: CommandContext<S>) => void | Promise<void>;
}

/** A command's keys, for the cheat sheet and the editor's keymap. */
export interface Binding {
  id: string;
  title: string;
  layer: KeyLayer;
  group: KeyGroup;
  chords: string[];
  handledBy?: string;
}

export interface CommandDescription {
  id: string;
  title: string;
  icon?: string;
  shortcut?: string;
  enabled: boolean;
  disabledReason?: string;
  checked?: boolean;
}

export class CommandError extends Error {}

export class CommandRegistry<S> {
  #commands = new Map<string, CommandDef<S, any>>();
  #listeners = new Set<(id: string, error?: unknown) => void>();

  private readonly getState: () => S;
  private readonly update: (recipe: (s: S) => S) => void;
  private readonly platform: Platform;

  constructor(getState: () => S, update: (recipe: (s: S) => S) => void, platform: Platform) {
    this.getState = getState;
    this.update = update;
    this.platform = platform;
  }

  register<A extends Record<string, unknown>>(def: CommandDef<S, A>): void {
    if (this.#commands.has(def.id)) throw new CommandError(`Command ${def.id} is already registered`);
    this.#commands.set(def.id, def);
  }

  has(id: string): boolean {
    return this.#commands.has(id);
  }

  ids(): string[] {
    return [...this.#commands.keys()];
  }

  describe(id: string): CommandDescription {
    const def = this.#commands.get(id);
    if (!def) throw new CommandError(`Unknown command ${id}`);
    const state = this.getState();
    const d: CommandDescription = { id, title: def.title, enabled: def.enabled ? def.enabled(state) : true };
    if (def.icon) d.icon = def.icon;
    const chord = shortcutFor(def.shortcut, this.platform);
    if (chord) d.shortcut = chord;
    if (def.checked) d.checked = def.checked(state);
    if (!d.enabled && def.disabledReason) d.disabledReason = def.disabledReason;
    return d;
  }

  async run(id: string, args: Record<string, unknown> = {}): Promise<void> {
    const def = this.#commands.get(id);
    if (!def) throw new CommandError(`Unknown command ${id}`);
    if (def.enabled && !def.enabled(this.getState())) return;
    try {
      await def.run(args, { state: this.getState(), update: this.update, run: (i, a) => this.run(i, a) });
      for (const l of this.#listeners) l(id);
    } catch (error) {
      for (const l of this.#listeners) l(id, error);
      throw error;
    }
  }

  onRun(listener: (id: string, error?: unknown) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Finds the command bound to a keyboard event, for the global key handler (KEY-06). Nothing runs
   * while an IME is composing or AltGr is typing a character. The character the key types wins
   * (layout-aware); the physical key is the fallback, for punctuation, digits, and non-Latin layouts.
   */
  match(event: KeyEventLike, scopes: readonly string[] = []): string | undefined {
    if (event.isComposing) return undefined;
    // The most specific context wins: keys of the scopes focus is in, then app-wide keys.
    for (const scoped of [true, false]) {
      const id = this.#matchIn(event, scoped ? scopes : []);
      if (id) return id;
    }
    return undefined;
  }

  #matchIn(event: KeyEventLike, scopes: readonly string[]): string | undefined {
    // With AltGr held the key types a character, so only that character can match.
    for (const byCode of event.altGraph ? [false] : [false, true]) {
      for (const [id, def] of this.#commands) {
        const where = def.shortcut?.handledBy;
        if (scopes.length ? !where || !scopes.includes(where) : where) continue;
        for (const chord of [...chordsFor(def.shortcut, this.platform), ...(def.shortcut?.quiet ?? [])]) if (chordMatches(chord, event, this.platform, byCode)) return id;
      }
    }
    return undefined;
  }

  /** Every command with keys on a platform, in registration order. */
  bindings(platform: Platform = this.platform): Binding[] {
    const out: Binding[] = [];
    for (const [id, def] of this.#commands) {
      const chords = chordsFor(def.shortcut, platform);
      if (!chords.length || !def.layer || !def.group || def.planned) continue;
      out.push({ id, title: def.title, layer: def.layer, group: def.group, chords, ...(def.shortcut?.handledBy ? { handledBy: def.shortcut.handledBy } : {}) });
    }
    return out;
  }
}

/** The primary chord and any alternates for a platform. */
export function chordsFor(s: Shortcut | undefined, platform: Platform): string[] {
  if (!s) return [];
  const primary = shortcutFor(s, platform);
  const alts = ((platform === "web" ? undefined : s.alternates?.[platform]) ?? s.alternates?.default ?? [])
    .filter((c) => platform !== "web" || !BROWSER_RESERVED.includes(c));
  return [...(primary ? [primary] : []), ...alts];
}

export function shortcutFor(s: Shortcut | undefined, platform: Platform): string | undefined {
  if (!s) return undefined;
  if (platform === "web") {
    if (s.web !== undefined) return s.web ?? undefined;
    return s.default && !BROWSER_RESERVED.includes(s.default) ? s.default : undefined;
  }
  return s[platform] ?? s.default;
}

export function chordMatches(chord: string, e: KeyEventLike, platform: Platform, byCode = false): boolean {
  const parts = chord.split("+");
  const named = parts.pop()!.toLowerCase();
  // "Plus" names the + key, which can't be written inside a chord; arrows and Space have short names.
  const ALIAS: Record<string, string> = { plus: "+", up: "arrowup", down: "arrowdown", left: "arrowleft", right: "arrowright", space: " ", esc: "escape" };
  const key = ALIAS[named] ?? named;
  const want = new Set(parts.map((p) => p.toLowerCase()));
  if (platform === "macos") {
    if (want.has("mod") !== e.metaKey || want.has("ctrl") !== e.ctrlKey) return false;
  } else {
    // Off macOS, Ctrl is Mod: a chord may name either.
    if ((want.has("mod") || want.has("ctrl")) !== e.ctrlKey) return false;
  }
  if (want.has("shift") !== e.shiftKey) return false;
  if (want.has("alt") !== e.altKey) return false;
  if (!byCode) return e.key.toLowerCase() === key;
  // Ctrl+Alt is AltGr on many Windows and Linux layouts: if it typed a character, the character wins.
  if (platform !== "macos" && e.ctrlKey && e.altKey) return false;
  if (!e.code) return false;
  if (/^[a-z]$/.test(key)) return !/^[a-z]$/i.test(e.key) && e.code === `Key${key.toUpperCase()}`;
  return CODES[key] !== undefined && e.code === CODES[key];
}

const KEY_NAMES: Record<string, string> = { Up: "↑", Down: "↓", Left: "←", Right: "→", Plus: "+", Escape: "Esc", Space: "Space" };

/** Renders a chord for people: "⇧⌘L" on macOS, "Ctrl+Shift+L" elsewhere. */
export function formatChord(chord: string, platform: Platform): string {
  return chordParts(chord, platform).join(platform === "macos" ? "" : "+");
}

/** A chord as separate key caps, in the platform's order and symbols: ["⇧", "⌘", "L"] or ["Ctrl", "Shift", "L"]. */
export function chordParts(chord: string, platform: Platform): string[] {
  const parts = chord.split("+");
  const last = parts.at(-1)!;
  const key = last.length === 1 ? last.toUpperCase() : (KEY_NAMES[last] ?? last);
  const mods = parts.slice(0, -1).map((p) => p.toLowerCase());
  if (platform === "macos") {
    const glyph: Record<string, string> = { mod: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧" };
    const order = ["ctrl", "alt", "shift", "mod"];
    return [...mods.sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((m) => glyph[m] ?? m), key];
  }
  const name: Record<string, string> = { mod: "Ctrl", ctrl: "Ctrl", alt: "Alt", shift: "Shift" };
  const order = ["mod", "ctrl", "alt", "shift"];
  return [...mods.sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((m) => name[m] ?? m), key];
}

const SPOKEN: Record<string, string> = {
  "⌘": "Command", "⌃": "Control", "⌥": "Option", "⇧": "Shift", Ctrl: "Control", "↑": "Up", "↓": "Down", "←": "Left", "→": "Right",
  "+": "Plus", "-": "Minus", "=": "Equals", "/": "Slash", "\\": "Backslash", ".": "Period", ",": "Comma", "`": "Backtick", Esc: "Escape",
};

/** A chord in words, for screen readers: "Shift Command L", "Control Slash". */
export function spokenChord(chord: string, platform: Platform): string {
  return chordParts(chord, platform).map((k) => SPOKEN[k] ?? k).join(" ");
}
