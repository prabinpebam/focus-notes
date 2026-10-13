/**
 * Component contracts (DSY-05): closed, machine-readable descriptions of every component.
 * The UI schema, ui:check, the gallery, and the catalog published for agents are generated
 * from these. Contracts import nothing from React so tools can read them in plain Node.
 */
export type TokenGroup = "space" | "size" | "layout" | "radius" | "shadow" | "layer";

export type PropSpec =
  | { kind: "message"; required?: boolean; requiredWhen?: string; description?: string }
  | { kind: "enum"; values: readonly string[]; default?: string; required?: boolean; responsive?: boolean; description?: string }
  | { kind: "token"; group: TokenGroup; default?: string; responsive?: boolean; description?: string }
  | { kind: "icon"; required?: boolean; description?: string }
  | { kind: "command"; required?: boolean; description?: string }
  | { kind: "boolean"; default?: boolean; bindable?: boolean; description?: string }
  | { kind: "number"; min?: number; max?: number; default?: number; description?: string }
  /** Text that comes from data (a note, a file name). Never a literal in a view. */
  | { kind: "text"; bindable?: boolean; required?: boolean; description?: string }
  /** An element ID in the same view, for anchors and tooltips. */
  | { kind: "ref"; description?: string }
  /** Structured data from a view model (menu sections, command items). Only ever a read. */
  | { kind: "list"; of: "commandItems" | "menuSections" | "options" | "keyCaps" | "keyBindings" | "resultItems" | "treeItems"; required?: boolean; description?: string };

export type PropKind = PropSpec["kind"];

export interface EventSpec {
  /** Payload field names and their kinds, readable in actions as `event.<name>`. */
  payload?: Record<string, "text" | "boolean" | "number">;
  /** The bindable prop this event writes back, for two-way bindings. */
  binds?: string;
}

export interface SlotSpec {
  accepts: readonly string[] | "any";
  min?: number;
  max?: number;
}

export interface Fixture {
  name: string;
  props?: Record<string, unknown>;
  slots?: Record<string, unknown[]>;
  children?: unknown[];
}

export interface Contract {
  type: string;
  tier: "primitive" | "layout" | "host" | "compound" | "block";
  description: string;
  props: Record<string, PropSpec>;
  events: Record<string, EventSpec>;
  /** "default" is the children slot. */
  slots: Record<string, SlotSpec>;
  states: readonly string[];
  tokens: string;
  a11y: { pattern: string; name?: string };
  /** Every enum value and state needs a fixture (DSY-09). */
  fixtures: readonly Fixture[];
}

export const defineContract = <C extends Contract>(c: C): C => c;
