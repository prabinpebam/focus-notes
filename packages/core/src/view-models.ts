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

export interface ViewModelDef<S, T extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  schema: JsonSchema & { type: "object"; properties: Record<string, JsonSchema> };
  select: (state: S) => T;
  /** Bindable fields and the command that sets each one. */
  setters?: Record<string, string>;
}

export class ViewModelRegistry<S> {
  #defs = new Map<string, ViewModelDef<S, any>>();
  #cache = new Map<string, { state: S; value: Record<string, unknown> }>();

  register<T extends Record<string, unknown>>(def: ViewModelDef<S, T>): void {
    if (this.#defs.has(def.id)) throw new Error(`View model ${def.id} is already registered`);
    this.#defs.set(def.id, def);
  }

  get(id: string): ViewModelDef<S, any> | undefined {
    return this.#defs.get(id);
  }

  list(): ViewModelDef<S, any>[] {
    return [...this.#defs.values()];
  }

  /** The selected value, memoized per state object so unchanged state never re-selects. */
  select(id: string, state: S): Record<string, unknown> {
    const def = this.#defs.get(id);
    if (!def) throw new Error(`Unknown view model ${id}`);
    const hit = this.#cache.get(id);
    if (hit && hit.state === state) return hit.value;
    const value = def.select(state);
    this.#cache.set(id, { state, value });
    return value;
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
