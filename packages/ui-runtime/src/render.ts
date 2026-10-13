/**
 * The renderer (DSY-06, Views as data → Rendering). Maps view nodes to registry components,
 * resolves values, and turns events into actions. It never creates DOM elements itself.
 */
import { Component, createElement, Fragment, useMemo, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import type { App, AppState } from "@focus-notes/core";
import { formatChord } from "@focus-notes/core";
import type { Contract } from "@focus-notes/ui/contracts";
import { evaluate } from "./expr.ts";
import {
  isBind, isComponent, isEach, isExpr, isFragment, isMessage, isRead, isSlot, isSwitch,
  type Action, type Node, type Value, type ViewDocument,
} from "./types.ts";

export interface RuntimeDeps {
  app: App;
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

function renderNode(node: Node, scope: Scope, deps: RuntimeDeps, r: Resolver, key: string | number): ReactNode {
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
    return branch ? renderNode(branch, scope, deps, r, key) : null;
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
  const children = (node.children ?? []).map((n, i) => renderNode(n, scope, deps, r, i));
  return createElement(Comp, props, ...children);
}

/** Hosts one view: subscribes to the store and renders the view document. */
export function ViewHost({ viewId, deps }: { viewId: string; deps: RuntimeDeps }): ReactNode {
  const doc = deps.views[viewId] as ViewDocument | undefined;
  if (!doc) throw new Error(`Unknown view ${viewId}`);
  const state = useSyncExternalStore(
    (l) => deps.app.store.subscribe(l),
    () => deps.app.store.state,
    () => deps.app.store.state,
  );
  const [local, setLocalState] = useState<Record<string, unknown>>(() => ({ ...(doc.local ?? {}) }));
  const resolver = useMemo(() => createResolver(deps), [deps]);
  const scope: Scope = {
    state,
    local,
    setLocal: (k, v) => setLocalState((prev) => ({ ...prev, [k]: v })),
    items: {},
  };
  return renderNode(doc.root, scope, deps, resolver, viewId);
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
