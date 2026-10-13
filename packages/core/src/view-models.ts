/**
 * View models: typed, read-only state for views (Views as data → View models).
 * The schema is what `ui:check` type-checks bindings against.
 */
export interface JsonSchema {
  type?: "object" | "string" | "number" | "integer" | "boolean" | "array" | "null";
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: readonly (string | number | boolean)[];
  required?: readonly string[];
  description?: string;
}

/** Workspace content a view model shows (PRF-11): the tree, one note by path, or the format. */
export type Content = { kind: "tree" } | { kind: "note"; path: string } | { kind: "format" };

export interface ViewModelDef<S, T extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  schema: JsonSchema & { type: "object"; properties: Record<string, JsonSchema> };
  select: (state: S) => T;
  /** Bindable fields and the command that sets each one. */
  setters?: Record<string, string>;
  /**
   * The state it reads, as dotted paths ("note.key", "ui.find"), so a change anywhere else keeps
   * its value and re-renders nothing (PRF-11). "*" for one that reads command states, which can
   * depend on anything: its value is kept while it's equal. Undefined is treated as "*".
   */
  reads?: readonly string[] | "*";
  /** The workspace content it shows, so outside changes reach only the view models that show them. */
  shows?: (state: S) => readonly Content[];
}

const at = (state: unknown, path: readonly string[]) => {
  let v = state;
  for (const p of path) v = v == null ? undefined : (v as Record<string, unknown>)[p];
  return v;
};
/** Structural equality for selected values (plain data: objects, arrays, and primitives). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
const sameContent = (a: Content, b: Content) => a.kind === b.kind && (a.kind !== "note" || a.path === (b as { path: string }).path);

export class ViewModelRegistry<S> {
  #defs = new Map<string, ViewModelDef<S, any>>();
  #cache = new Map<string, { state: S; value: Record<string, unknown> }>();
  #paths = new Map<string, string[][]>();

  register<T extends Record<string, unknown>>(def: ViewModelDef<S, T>): void {
    if (this.#defs.has(def.id)) throw new Error(`View model ${def.id} is already registered`);
    this.#defs.set(def.id, def);
    if (def.reads && def.reads !== "*") this.#paths.set(def.id, def.reads.map((r) => r.split(".")));
  }

  get(id: string): ViewModelDef<S, any> | undefined {
    return this.#defs.get(id);
  }

  list(): ViewModelDef<S, any>[] {
    return [...this.#defs.values()];
  }

  /**
   * The selected value. It stays the same object while nothing it reads changed, so views that
   * show it don't re-render (PRF-11): a view model with declared reads isn't even selected again.
   */
  select(id: string, state: S): Record<string, unknown> {
    const def = this.#defs.get(id);
    if (!def) throw new Error(`Unknown view model ${id}`);
    const hit = this.#cache.get(id);
    if (hit && hit.state === state) return hit.value;
    const paths = this.#paths.get(id);
    if (hit && paths?.every((p) => at(hit.state, p) === at(state, p))) {
      hit.state = state;
      return hit.value;
    }
    let value = def.select(state);
    if (hit && !paths && sameValue(hit.value, value)) value = hit.value;
    this.#cache.set(id, { state, value });
    return value;
  }

  /** The view models whose value differs between two states. */
  changed(prev: S, next: S): string[] {
    return this.list().filter((d) => this.select(d.id, prev) !== this.select(d.id, next)).map((d) => d.id);
  }

  /** The view models that show any of the changed content (PRF-11). */
  showing(changes: readonly Content[], state: S): string[] {
    return this.list().filter((d) => d.shows?.(state).some((c) => changes.some((x) => sameContent(c, x)))).map((d) => d.id);
  }
}

/** Resolves a dotted path inside a JSON schema, for binding type checks. */
export function schemaAt(schema: JsonSchema, path: string[]): JsonSchema | undefined {
  let node: JsonSchema | undefined = schema;
  for (const part of path) {
    if (!node) return undefined;
    if (node.type === "array" && /^\d+$/.test(part)) node = node.items;
    else node = node.properties?.[part];
  }
  return node;
}
