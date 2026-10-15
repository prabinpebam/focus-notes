/**
 * The renderer (DSY-06, Views as data → Rendering). Maps view nodes to registry components,
 * resolves values, and turns events into actions. It never creates DOM elements itself.
 */
import { Component, createElement, Fragment, memo, useCallback, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import type { App, AppState } from "@focus-notes/core";
// From its own module, so a page that renders without the app (the share reader) doesn't load the app.
import { formatChord } from "@focus-notes/core/commands";
import type { Contract } from "@focus-notes/ui/contracts";
import { evaluate } from "./expr.ts";
import {
  isBind, isComponent, isEach, isExpr, isFragment, isMessage, isRead, isSlot, isSwitch,
  type Action, type Node, type Value, type ViewDocument,
} from "./types.ts";

/** What the renderer uses of the app: a running app, or a static page's fixed data (WP-5.1). */
export interface RuntimeApp {
  store: Pick<App["store"], "state" | "subscribe">;
  viewModels: Pick<App["viewModels"], "select" | "get">;
  messages: Pick<App["messages"], "format" | "has">;
  commands: Pick<App["commands"], "run" | "has" | "describe">;
  bridge: Pick<App["bridge"], "platform">;
}

export interface RuntimeDeps {
  app: RuntimeApp;
  registry: Readonly<Record<string, ComponentType<any>>>;
  contracts: ReadonlyMap<string, Contract>;
  views: Record<string, unknown>;
}

interface Scope {
  state: AppState;
  local: Record<string, unknown>;
  setLocal: (key: string, value: unknown) => void;
  items: Record<string, unknown>;
  event?: Record<string, unknown>;
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Per-contract event wiring, computed once (the renderer's hot path stays allocation-light). */
const eventPlans = new WeakMap<Contract, { event: string; prop: string; binds?: string }[]>();
function eventsOf(c: Contract) {
  let plan = eventPlans.get(c);
  if (!plan) {
    plan = Object.entries(c.events).map(([event, spec]) => ({ event, prop: `on${cap(event)}`, ...(spec.binds ? { binds: spec.binds } : {}) }));
    eventPlans.set(c, plan);
  }
  return plan;
}
const splitCache = new Map<string, string[]>();
const split = (path: string) => {
  let parts = splitCache.get(path);
  if (!parts) {
    parts = path.split(".");
    splitCache.set(path, parts);
  }
  return parts;
};

function pathGet(obj: unknown, parts: string[]): unknown {
  let v = obj;
  for (const p of parts) {
    if (v === null || v === undefined) return undefined;
    v = (v as Record<string, unknown>)[p];
  }
  return v;
}

export function createResolver(deps: RuntimeDeps) {
  const { app } = deps;
  const env = () => ({
    platform: app.bridge.platform,
    colorScheme: app.store.state.appearance.mode === "system" ? app.store.state.appearance.system : app.store.state.appearance.mode,
    locale: "en",
  });

  const read = (path: string, scope: Scope): unknown => {
    const parts = split(path);
    switch (parts[0]) {
      case "vm": return pathGet(app.viewModels.select(`vm.${parts[1]}`, scope.state), parts.slice(2));
      case "local": return pathGet(scope.local, parts.slice(1));
      case "env": return pathGet(env(), parts.slice(1));
      case "event": return pathGet(scope.event, parts.slice(1));
      default: {
        let v: unknown = scope.items[parts[0]!];
        for (let i = 1; i < parts.length && v != null; i++) v = (v as Record<string, unknown>)[parts[i]!];
        return v;
      }
    }
  };

  const value = (v: Value | undefined, scope: Scope): unknown => {
    if (v === undefined || v === null || typeof v !== "object") return v;
    if (isMessage(v)) {
      const args = Object.fromEntries(Object.entries(v.args ?? {}).map(([k, a]) => [k, value(a, scope)]));
      return app.messages.format(v.t, args);
    }
    if (isRead(v)) return read(v.get, scope);
    if (isBind(v)) return read(v.bind, scope);
    if (isExpr(v)) return evaluate(v.expr, (p) => read(p, scope));
    return v;
  };

  const runActions = async (actions: Action | Action[], scope: Scope) => {
    for (const a of Array.isArray(actions) ? actions : [actions]) {
      if ("run" in a) {
        const args = Object.fromEntries(Object.entries(a.args ?? {}).map(([k, v]) => [k, value(v, scope)]));
        await app.commands.run(a.run, args);
      } else {
        scope.setLocal(a.set.slice("local.".length), value(a.to, scope));
      }
    }
  };

  return { read, value, runActions };
}

type Resolver = ReturnType<typeof createResolver>;

/** Renders a view's top node with each child as its own region (PRF-11). */
interface RegionCtx { deps: RuntimeDeps; resolver: Resolver; local: Record<string, unknown>; setLocal: Scope["setLocal"] }

function renderNode(node: Node, scope: Scope, deps: RuntimeDeps, r: Resolver, key: string | number, regions?: RegionCtx): ReactNode {
  if ("when" in node && node.when !== undefined && !r.value(node.when as Value, scope)) return null;
  if (isSlot(node) || isFragment(node)) return null; // Fragments are expanded at build time.
  if (isEach(node)) {
    const list = (r.read(node.each.get, scope) as unknown[] | undefined) ?? [];
    if (list.length === 0) return node.empty ? renderNode(node.empty, scope, deps, r, key) : null;
    return createElement(
      Fragment,
      { key },
      list.map((item, i) => {
        // Items chain to the outer scope's items instead of copying them (hot path).
        const items = Object.create(scope.items) as Record<string, unknown>;
        items[node.as] = item;
        const itemScope: Scope = { state: scope.state, local: scope.local, setLocal: scope.setLocal, items, ...(scope.event ? { event: scope.event } : {}) };
        const k = String(r.read(node.key, itemScope) ?? i);
        return renderNode(node.render, itemScope, deps, r, k);
      }),
    );
  }
  if (isSwitch(node)) {
    const v = String(r.value(node.switch as Value, scope));
    const branch = node.cases[v];
    // Each case is its own subtree: a different case mounts afresh, so its autoFocus runs (a setup
    // step's primary at the same place as the last step's button still takes focus, D-131).
    return branch ? renderNode(branch, scope, deps, r, `${key}:${v}`) : null;
  }
  if (!isComponent(node)) return null;
  const Comp = deps.registry[node.type];
  const contract = deps.contracts.get(node.type);
  if (!Comp || !contract) throw new Error(`Unknown component ${node.type}`);

  const props: Record<string, unknown> = { key: node.id ?? key };
  if (node.id) props.id = node.id;
  for (const [name, v] of Object.entries(node.props ?? {})) props[name] = r.value(v, scope);

  for (const { event, prop, binds } of eventsOf(contract)) {
    const actions = node.on?.[event];
    const bound = binds ? node.props?.[binds] : undefined;
    if (!actions && !(bound && isBind(bound))) continue;
    props[prop] = (payload?: Record<string, unknown>) => {
      const eventScope = { ...scope, event: payload ?? {} };
      if (bound && isBind(bound)) {
        const target = bound.bind;
        const newValue = payload?.value;
        if (target.startsWith("local.")) scope.setLocal(target.slice(6), newValue);
        else {
          const [, vmId, ...field] = target.split(".");
          const setter = deps.app.viewModels.get(`vm.${vmId}`)?.setters?.[field.join(".")];
          if (setter) void deps.app.commands.run(setter, { value: newValue });
        }
      }
      if (actions) void r.runActions(actions, eventScope);
    };
  }
  // Command-driven controls get their name, icon, shortcut, and state from the registry (DSY-12).
  if (typeof props.command === "string" && deps.app.commands.has(props.command)) {
    const d = deps.app.commands.describe(props.command);
    props.commandInfo = { ...d, title: deps.app.messages.format(d.title), shortcut: d.shortcut ? formatChord(d.shortcut, deps.app.bridge.platform) : undefined };
  }
  for (const [slot, nodes] of Object.entries(node.slots ?? {})) props[slot] = nodes.map((n, i) => renderNode(n, scope, deps, r, i));
  const children = (node.children ?? []).map((n, i) =>
    regions ? createElement(RegionHost, { key: (isComponent(n) && n.id) || i, node: n, ...regions }) : renderNode(n, scope, deps, r, i));
  return createElement(Comp, props, ...children);
}

/**
 * What a part of a view reads: the view models in its reads and bindings, or everything when it
 * reads `env` or shows a command's state, which can depend on anything. Found once per node.
 */
interface Needs { vms: readonly string[]; all: boolean }
const needsCache = new WeakMap<object, Needs>();
function needsOf(node: unknown, skipChildren = false): Needs {
  const hit = !skipChildren && typeof node === "object" && node !== null ? needsCache.get(node) : undefined;
  if (hit) return hit;
  const vms = new Set<string>();
  let all = false;
  const visit = (v: unknown, top: boolean): void => {
    if (Array.isArray(v)) { for (const x of v) visit(x, false); return; }
    if (typeof v !== "object" || v === null) return;
    for (const [k, x] of Object.entries(v)) {
      if (top && skipChildren && k === "children") continue;
      if ((k === "get" || k === "bind") && typeof x === "string") {
        const [head, id] = x.split(".");
        if (head === "vm" && id) vms.add(`vm.${id}`);
        else if (head === "env") all = true;
      } else if (k === "command") all = true;
      visit(x, false);
    }
  };
  visit(node, true);
  const needs = { vms: [...vms], all };
  if (!skipChildren && typeof node === "object" && node !== null) needsCache.set(node, needs);
  return needs;
}

interface RegionProps extends RegionCtx { node: Node; top?: boolean; viewKey?: string }

/**
 * One region of a view: a direct child of the view's top node (or the top node's own props). It
 * re-renders only when a view model it reads changes, so typing in the note, or a change shown
 * elsewhere, re-renders nothing here (PRF-11). A region hidden by its `when` reads only what the
 * `when` needs until it first shows, so heavy, rarely shown parts cost nothing until then.
 */
const RegionHost = memo(function RegionHost({ node, top, viewKey, deps, resolver, local, setLocal }: RegionProps): ReactNode {
  const needs = useMemo(() => needsOf(node, top), [node, top]);
  const when = "when" in node ? (node as { when?: unknown }).when : undefined;
  const gate = useMemo(() => (!top && when !== undefined ? needsOf(when) : undefined), [when, top]);
  const shown = useRef(!gate);
  const cache = useRef<{ state: AppState; values: unknown[]; version: number } | undefined>(undefined);
  const subscribe = useCallback((l: () => void) => deps.app.store.subscribe(l), [deps]);
  const snapshot = (): unknown => {
    const state = deps.app.store.state;
    const n = shown.current || !gate ? needs : gate;
    if (n.all) return state;
    const c = cache.current;
    if (c?.state === state) return c.version;
    const values = n.vms.map((id) => deps.app.viewModels.select(id, state));
    if (c && values.length === c.values.length && values.every((v, i) => v === c.values[i])) {
      c.state = state;
      return c.version;
    }
    cache.current = { state, values, version: (c?.version ?? 0) + 1 };
    return cache.current.version;
  };
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const scope: Scope = { state: deps.app.store.state, local, setLocal, items: {} };
  if (!shown.current && resolver.value(when as Value, scope)) shown.current = true;
  return renderNode(node, scope, deps, resolver, viewKey ?? 0, top ? { deps, resolver, local, setLocal } : undefined);
});

/** Hosts one view: its local state, and its regions, each subscribed to what it shows (PRF-11). */
export function ViewHost({ viewId, deps }: { viewId: string; deps: RuntimeDeps }): ReactNode {
  const doc = deps.views[viewId] as ViewDocument | undefined;
  if (!doc) throw new Error(`Unknown view ${viewId}`);
  const [local, setLocalState] = useState<Record<string, unknown>>(() => ({ ...(doc.local ?? {}) }));
  const resolver = useMemo(() => createResolver(deps), [deps]);
  const setLocal = useCallback((k: string, v: unknown) => setLocalState((prev) => ({ ...prev, [k]: v })), []);
  return createElement(RegionHost, { node: doc.root, top: true, viewKey: viewId, deps, resolver, local, setLocal });
}

/** A calm fallback when a view fails, so the rest of the app keeps working. */
export class ViewBoundary extends Component<{ fallback: ReactNode; onError: (e: unknown) => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    this.props.onError(error);
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
