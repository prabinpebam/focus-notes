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
  /** The key passes on (to the field it was typed in) while the command is unavailable: Backspace in a field with text. */
  whenEnabled?: true;
  /** In a text field, only while the caret is at the end of its text, so the key still moves the caret otherwise (→ in Spotlight). */
  atFieldEnd?: true;
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
  /** In a text field: whether the caret is at the end of its text with nothing selected. Unset elsewhere. */
  caretAtEnd?: boolean;
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
  /** Message key saying why the command is unavailable, shown with it (Foundations → States); or one per state. */
  disabledReason?: string | ((state: S) => string);
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
  /** The key scope its shortcut works in, if any (`editor`, `findField`, …). */
  handledBy?: string;
}

export class CommandError extends Error {}

export class CommandRegistry<S> {
  #commands = new Map<string, CommandDef<S, any>>();
  #listeners = new Set<(id: string, error?: unknown) => void>();
  #hold: ((id: string, state: S) => string | undefined) | undefined;
  /** The person's own keys from keybindings.json (KEY-07, D-170), on this platform only. */
  #user: { add: ReadonlyMap<string, readonly string[]>; remove: ReadonlyMap<string, ReadonlySet<string>> } = { add: new Map(), remove: new Map() };

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

  /**
   * Holds commands back while something owns the whole window (the first run, D-126): `hold`
   * returns the message key saying why for each command it holds. A held command is disabled with
   * that reason everywhere it's listed (toolbar, Spotlight, the macOS menu bar), its keys do
   * nothing, and running it does nothing.
   */
  setHold(hold: ((id: string, state: S) => string | undefined) | undefined): void {
    this.#hold = hold;
  }

  /**
   * The person's own keys, layered over the defaults (D-170): added chords come first and win over a
   * default chord on the same key; removed chords go. Only on this platform: the cheat sheet's other
   * platform shows the defaults.
   */
  setUserBindings(user: { add: ReadonlyMap<string, readonly string[]>; remove: ReadonlyMap<string, ReadonlySet<string>> }): void {
    this.#user = user;
  }

  /** The commands with keys the person added. */
  userBound(): Set<string> {
    return new Set([...this.#user.add.keys()].filter((id) => this.#commands.has(id)));
  }

  /** A command's effective chords on a platform: the person's first, then the defaults they kept. */
  #chords(id: string, def: CommandDef<S, any>, platform: Platform): string[] {
    const defaults = chordsFor(def.shortcut, platform);
    // Without custom keys (the usual case) this is exactly the defaults: nothing more on the key path.
    if (platform !== this.platform || (!this.#user.add.size && !this.#user.remove.size)) return defaults;
    const removed = this.#user.remove.get(id);
    const added = this.#user.add.get(id) ?? [];
    return [...added, ...defaults.filter((c) => !removed?.has(c) && !added.includes(c))];
  }

  #held(id: string): string | undefined {
    return this.#hold?.(id, this.getState());
  }

  has(id: string): boolean {
    return this.#commands.has(id);
  }

  ids(): string[] {
    return [...this.#commands.keys()];
  }

  /** A command's keys as registered, for menus that show them for a platform (the macOS menu bar). */
  shortcut(id: string): Shortcut | undefined {
    return this.#commands.get(id)?.shortcut;
  }

  describe(id: string): CommandDescription {
    const def = this.#commands.get(id);
    if (!def) throw new CommandError(`Unknown command ${id}`);
    const state = this.getState();
    const held = this.#held(id);
    const d: CommandDescription = { id, title: def.title, enabled: !held && (def.enabled ? def.enabled(state) : true) };
    if (def.icon) d.icon = def.icon;
    // The effective key: the person's own first, else the default they kept (D-170).
    const chord = this.#chords(id, def, this.platform)[0];
    if (chord) d.shortcut = chord;
    if (def.checked) d.checked = def.checked(state);
    if (held) d.disabledReason = held;
    else if (!d.enabled && def.disabledReason) d.disabledReason = typeof def.disabledReason === "function" ? def.disabledReason(state) : def.disabledReason;
    if (def.shortcut?.handledBy) d.handledBy = def.shortcut.handledBy;
    return d;
  }

  async run(id: string, args: Record<string, unknown> = {}): Promise<void> {
    const def = this.#commands.get(id);
    if (!def) throw new CommandError(`Unknown command ${id}`);
    if (this.#held(id) || (def.enabled && !def.enabled(this.getState()))) return;
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
    // The most specific context wins: keys of the scopes focus is in, then app-wide keys. In each,
    // the person's own keys come first, so they win over a default on the same key (D-170).
    // Without custom keys there's one pass per context, as before D-170 (PRF-14).
    const passes = this.#user.add.size ? [true, false] : [false];
    for (const scoped of [true, false]) {
      for (const user of passes) {
        const id = this.#matchIn(event, scoped ? scopes : [], user);
        if (id) return id;
      }
    }
    return undefined;
  }

  #matchIn(event: KeyEventLike, scopes: readonly string[], user: boolean): string | undefined {
    // With AltGr held the key types a character, so only that character can match.
    for (const byCode of event.altGraph ? [false] : [false, true]) {
      // The person's own keys: only the commands that have some (D-170).
      const entries: Iterable<[string, CommandDef<S, any>]> = user
        ? [...this.#user.add.keys()].flatMap((id): [string, CommandDef<S, any>][] => (this.#commands.has(id) ? [[id, this.#commands.get(id)!]] : []))
        : this.#commands;
      for (const [id, def] of entries) {
        const where = def.shortcut?.handledBy;
        if (scopes.length ? !where || !scopes.includes(where) : where) continue;
        if (def.shortcut?.atFieldEnd && event.caretAtEnd === false) continue;
        const chords = user ? this.#user.add.get(id) ?? [] : this.#chords(id, def, this.platform);
        const quiet = user ? [] : def.shortcut?.quiet ?? [];
        // The key first (string work), then whether the command takes it now: held and enabled are
        // asked only of a command whose key this is, not of every command on every key (PRF-14).
        if (!chords.some((c) => chordMatches(c, event, this.platform, byCode)) && !quiet.some((c) => chordMatches(c, event, this.platform, byCode))) continue;
        if (this.#held(id)) continue;
        if (def.shortcut?.whenEnabled && def.enabled && !def.enabled(this.getState())) continue;
        return id;
      }
    }
    return undefined;
  }

  /** Every command with keys on a platform, in registration order. */
  bindings(platform: Platform = this.platform): Binding[] {
    const out: Binding[] = [];
    for (const [id, def] of this.#commands) {
      const chords = this.#chords(id, def, platform);
      // A command the person gave keys shows with them, in the app group's power layer when it had none.
      const own = platform === this.platform && this.#user.add.has(id);
      if (!chords.length || def.planned || (!own && (!def.layer || !def.group))) continue;
      out.push({ id, title: def.title, layer: def.layer ?? "power", group: def.group ?? "app", chords, ...(def.shortcut?.handledBy ? { handledBy: def.shortcut.handledBy } : {}) });
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
