/**
 * Typed registration (DS-A05, D-199): a component goes into a registry only if its React props
 * take what the renderer passes for its contract. A contract prop the component lacks, a type it
 * can't take, a prop it requires that the contract never sets, or an event handler whose payload
 * doesn't match fails `pnpm typecheck`, with no render needed.
 *
 * The renderer resolves authored values before a component sees them: a message reference
 * (`{ "t": "…" }`) arrives as the formatted string, a read as its value. So these types describe
 * runtime values only; the authored forms are the view schema's (ui-runtime's types.ts).
 */
import type { ComponentType, JSXElementConstructor, ReactElement, ReactNode } from "react";
import type { Contract, EventSpec, ListOf, PropSpec } from "./contract.ts";
import type { ContractsByType } from "./contracts.ts";
import type { IconName } from "./icon-names.ts";
import type { tokenGroups } from "@focus-notes/tokens";
import type { ListItemOf } from "./items.ts";

/** What the renderer passes for a prop of this spec, once resolved. */
export type RuntimeValue<S> =
  S extends { kind: "message" } ? string
  : S extends { kind: "enum"; values: readonly (infer V)[] } ? V
  : S extends { kind: "token"; group: infer G extends keyof typeof tokenGroups } ? (typeof tokenGroups)[G][number]
  : S extends { kind: "command" | "text" | "ref" } ? string
  : S extends { kind: "icon" } ? IconName
  : S extends { kind: "boolean" } ? boolean
  : S extends { kind: "number" } ? number
  : S extends { kind: "list"; of: infer L extends ListOf } ? ListItemOf<L>[]
  : never;

type PayloadKinds = { text: string; boolean: boolean; number: number };
type Declared<E> = E extends { payload: infer P extends Record<string, keyof PayloadKinds> } ? { [K in keyof P]?: PayloadKinds[P[K]] } : {};
/** A two-way binding's event carries the new value as `value` (the renderer writes it back). */
type BoundValue<C extends Contract, E> = E extends { binds: infer B extends keyof C["props"] } ? { value: RuntimeValue<C["props"][B]> } : {};
type Payload<C extends Contract, E extends EventSpec> = Declared<E> & BoundValue<C, E>;
/**
 * The handler the renderer passes for an event: `onPress` for `press`. The component calls it with
 * the payload, or with nothing when the contract declares none.
 */
type Handler<C extends Contract, E extends EventSpec> = keyof Payload<C, E> extends never ? (payload?: Record<string, never>) => void : (payload: Payload<C, E>) => void;

type RequiredKeys<C extends Contract> = { [K in keyof C["props"]]: C["props"][K] extends { required: true } ? K : never }[keyof C["props"]];

type RequiredSlots<C extends Contract> = { [S in keyof C["slots"] & string]: C["slots"][S] extends { min: number } ? (C["slots"][S]["min"] extends 0 ? never : S) : never }[keyof C["slots"] & string];
type OptionalSlots<C extends Contract> = Exclude<keyof C["slots"] & string, RequiredSlots<C>>;
/**
 * Children arrive as the rendered nodes; one required component child (a Tooltip's button) as that
 * element. A named slot arrives as an array of rendered nodes.
 */
type SlotValue<C extends Contract, S extends string> = S extends "default"
  ? C["slots"][S] extends { min: 1; max: 1; accepts: readonly string[] } ? ReactElement : ReactNode
  : ReactNode[];

/** The props the renderer can pass a component for contract `C`, after resolving them. */
export type ContractProps<C extends Contract> =
  & { [K in RequiredKeys<C>]: RuntimeValue<C["props"][K]> }
  & { [K in Exclude<keyof C["props"], RequiredKeys<C>>]?: RuntimeValue<C["props"][K]> }
  & { [E in keyof C["events"] & string as `on${Capitalize<E>}`]?: Handler<C, C["events"][E]> }
  & { [S in OptionalSlots<C> as S extends "default" ? "children" : S]?: SlotValue<C, S> }
  & { [S in RequiredSlots<C> as S extends "default" ? "children" : S]: SlotValue<C, S> }
  /** A view gives the node an id where the contract requires one; ui:check holds it. */
  & (C extends { requiresId: true } ? { id: string } : {});

type Missing<CP, P> = Exclude<keyof CP, keyof P>;
export type Incompatible<CP, P> = { [K in keyof CP & keyof P as [CP[K]] extends [P[K]] ? never : K]: { contract: CP[K]; component: P[K] } };
/** Props the component requires that the renderer may not pass. `id` is one: a view needn't give a node one. */
export type Unset<CP, P> = Exclude<{ [K in keyof P]-?: {} extends Pick<P, K> ? never : K }[keyof P], keyof CP>;

/** `never` when the component conforms; otherwise what's wrong, shown in the type error. */
export type Mismatch<C extends Contract, P> =
  [Missing<ContractProps<C>, P>] extends [never]
    ? [Unset<ContractProps<C>, P>] extends [never]
      ? [ContractProps<C>] extends [P] ? never : { [k in `${C["type"]}: props of the wrong type`]: Incompatible<ContractProps<C>, P> }
      : { [k in `${C["type"]}: requires props its contract never sets`]: Unset<ContractProps<C>, P> }
    : { [k in `${C["type"]}: lacks contract props`]: Missing<ContractProps<C>, P> };

/** A component's own props: function components and lazy or memo ones alike. */
export type PropsOf<T> = T extends (props: infer P) => unknown ? P : T extends new (props: infer P) => unknown ? P : never;

/** Each contract sits under its own type's name, so a registry key names its contract (D-199). */
type KeyedByType = { [K in keyof ContractsByType]: ContractsByType[K]["type"] extends K ? true : K }[keyof ContractsByType];
export type ContractsKeyedByType = KeyedByType extends true ? true : never;
const keyedByType: ContractsKeyedByType = true;
void keyedByType;

type Checked<R> = {
  [K in keyof R]: K extends keyof ContractsByType
    ? [Mismatch<ContractsByType[K], PropsOf<R[K]>>] extends [never] ? R[K] : Mismatch<ContractsByType[K], PropsOf<R[K]>>
    : `${K & string}: no contract of this type`;
};

/** What the renderer receives: resolved props by name. Only `defineRegistry` makes one. */
export type RegisteredComponent = ComponentType<Record<string, unknown>>;
export type Registry = Readonly<Record<string, RegisteredComponent>>;

/**
 * A closed registry, keyed by contract type, whose components each conform to their contract.
 * The one widening to the renderer's props happens here, after the check.
 */
export function defineRegistry<R extends Record<string, JSXElementConstructor<never>>>(components: R & Checked<R>): Registry {
  return Object.freeze({ ...components }) as unknown as Registry;
}
