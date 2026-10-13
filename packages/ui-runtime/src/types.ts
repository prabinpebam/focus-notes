/** The view document format (Views as data). */
export type Literal = string | number | boolean | null;
export interface MessageValue { t: string; args?: Record<string, Value> }
export interface ReadValue { get: string }
export interface BindValue { bind: string }
export interface ExprValue { expr: unknown }
export type Value = Literal | MessageValue | ReadValue | BindValue | ExprValue;

export type Action =
  | { run: string; args?: Record<string, Value> }
  | { set: string; to: Value };

export interface ComponentNode {
  type: string;
  id?: string;
  props?: Record<string, Value>;
  on?: Record<string, Action | Action[]>;
  children?: Node[];
  slots?: Record<string, Node[]>;
  when?: Value;
}
export interface FragmentNode { use: string; params?: Record<string, Value>; slots?: Record<string, Node[]>; when?: Value }
export interface EachNode { each: ReadValue; as: string; key: string; render: Node; empty?: Node; when?: Value }
export interface SwitchNode { switch: Value; cases: Record<string, Node>; when?: Value }
export interface SlotOutlet { slot: string }
export type Node = ComponentNode | FragmentNode | EachNode | SwitchNode | SlotOutlet;

export interface ViewDocument {
  $schema: string;
  id: string;
  ia?: string;
  viewModels: string[];
  /** The element ID that receives focus when the view opens. */
  focus?: string;
  local?: Record<string, Literal>;
  root: Node;
}
export interface FragmentDocument {
  $schema: string;
  id: string;
  params?: Record<string, { kind: string; required?: boolean }>;
  slots?: Record<string, { accepts: string[] | "any"; count?: number }>;
  root: Node;
}

export const isComponent = (n: Node): n is ComponentNode => "type" in n;
export const isFragment = (n: Node): n is FragmentNode => "use" in n;
export const isEach = (n: Node): n is EachNode => "each" in n;
export const isSwitch = (n: Node): n is SwitchNode => "switch" in n;
export const isSlot = (n: Node): n is SlotOutlet => "slot" in n;

export const isMessage = (v: unknown): v is MessageValue => typeof v === "object" && v !== null && "t" in v;
export const isRead = (v: unknown): v is ReadValue => typeof v === "object" && v !== null && "get" in v;
export const isBind = (v: unknown): v is BindValue => typeof v === "object" && v !== null && "bind" in v;
export const isExpr = (v: unknown): v is ExprValue => typeof v === "object" && v !== null && "expr" in v;
