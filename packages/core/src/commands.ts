/**
 * The command registry: the single way to act (KEY-01, DSY-12). Keys, menus, Spotlight,
 * views, agents, and deep links all run commands by ID.
 */
export type Platform = "macos" | "windows" | "linux" | "web";

export interface Shortcut {
  /** Chord using "Mod" for Cmd on macOS and Ctrl elsewhere, for example "Mod+Shift+L". */
  default?: string;
  macos?: string;
  windows?: string;
  linux?: string;
}

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
  checked?: (state: S) => boolean;
  run: (args: A, ctx: CommandContext<S>) => void | Promise<void>;
}

export interface CommandDescription {
  id: string;
  title: string;
  icon?: string;
  shortcut?: string;
  enabled: boolean;
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

  /** Finds the command bound to a keyboard event, for the global key handler. */
  match(event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): string | undefined {
    for (const [id, def] of this.#commands) {
      const chord = shortcutFor(def.shortcut, this.platform);
      if (chord && chordMatches(chord, event, this.platform)) return id;
    }
    return undefined;
  }
}

export function shortcutFor(s: Shortcut | undefined, platform: Platform): string | undefined {
  if (!s) return undefined;
  const specific = platform === "web" ? undefined : s[platform];
  return specific ?? s.default;
}

export function chordMatches(
  chord: string,
  e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean },
  platform: Platform,
): boolean {
  const parts = chord.split("+");
  const key = parts.pop()!.toLowerCase();
  const want = new Set(parts.map((p) => p.toLowerCase()));
  const mod = platform === "macos" ? e.metaKey : e.ctrlKey;
  if (want.has("mod") !== mod) return false;
  if (want.has("shift") !== e.shiftKey) return false;
  if (want.has("alt") !== e.altKey) return false;
  if (platform === "macos" && want.has("ctrl") !== e.ctrlKey) return false;
  if (platform !== "macos" && !want.has("mod") && e.ctrlKey !== want.has("ctrl")) return false;
  return e.key.toLowerCase() === key;
}

/** Renders a chord for people: "⇧⌘L" on macOS, "Ctrl+Shift+L" elsewhere. */
export function formatChord(chord: string, platform: Platform): string {
  const parts = chord.split("+");
  if (platform === "macos") {
    const glyph: Record<string, string> = { mod: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧" };
    const order = ["ctrl", "alt", "shift", "mod"];
    const mods = parts.slice(0, -1).map((p) => p.toLowerCase()).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return mods.map((m) => glyph[m] ?? m).join("") + parts.at(-1)!.toUpperCase();
  }
  return parts.map((p) => (p.toLowerCase() === "mod" ? "Ctrl" : p.length === 1 ? p.toUpperCase() : p)).join("+");
}
