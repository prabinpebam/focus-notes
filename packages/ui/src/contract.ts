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
  | { kind: "number"; min?: number; max?: number; default?: number; bindable?: boolean; description?: string }
  /** Text that comes from data (a note, a file name). Never a literal in a view. */
  | { kind: "text"; bindable?: boolean; required?: boolean; description?: string }
  /** An element ID in the same view, for anchors and tooltips. */
  | { kind: "ref"; description?: string }
  /** Structured data from a view model (menu sections, command items). Only ever a read. */
  | { kind: "list"; of: "commandItems" | "menuSections" | "options" | "keyCaps" | "keyBindings" | "resultItems" | "treeItems" | "versionBlocks" | "themeTiles" | "colorValues" | "noteBlocks" | "siteThemes"; required?: boolean; description?: string };

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
  /**
   * The declared states this fixture renders through its props (DS-A02, D-198). A fixture
   * without `covers` renders `rest`, when the contract declares it.
   */
  covers?: readonly string[];
}

/** An end-to-end journey that reaches declared states in the running app (DS-A02, D-198). */
export interface JourneyCoverage {
  /** The spec file, from the repository root: "apps/desktop/e2e/m1-toolbar.spec.ts". */
  spec: string;
  covers: readonly string[];
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
  /** Every enum value needs a fixture (DSY-09); every state a fixture, a journey, or a reasoned exception (D-198). */
  fixtures: readonly Fixture[];
  /** Journeys that reach states no fixture can render. Hosts, which have no fixtures, need at least one (D-198). */
  journeys?: readonly JourneyCoverage[];
  /** Declared states nothing reaches yet, each with why: known gaps, not coverage (D-198). */
  uncovered?: Readonly<Record<string, string>>;
}

export const defineContract = <C extends Contract>(c: C): C => c;

/**
 * Why a declared state is a known gap (D-198): nothing in the gallery or the journeys reaches it
 * yet. These are reported as gaps, never counted as coverage.
 */
export const GAP = {
  hover: "Pointer hover: a static fixture can't show it, and no journey checks it yet.",
  pressed: "Pointer press: a static fixture can't show it, and no journey checks it yet.",
  focusVisible: "Keyboard focus: a static fixture can't show it, and no journey checks it yet.",
  focused: "Focus in the field: a static fixture can't show it, and no journey checks it yet.",
  motion: "A transition's frames: a fixture shows where it settles, and no journey checks the motion yet.",
  open: "Opened by interaction: the gallery shows it closed, and no journey checks it open yet.",
  drag: "A drag in progress: a static fixture can't show it, and no journey checks it yet.",
} as const;
