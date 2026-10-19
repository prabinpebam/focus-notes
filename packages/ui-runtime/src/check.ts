/**
 * ui:check (DSY-08): validates every view and fragment. Stages: schema, references, types,
 * accessibility rules, and design rules. Rendering checks run in the gallery tests.
 */
import Ajv2020 from "ajv/dist/2020.js";
import type { Contract, ListOf, PropSpec } from "@focus-notes/ui/contracts";
import { ITEM_SHAPES, STRING_ITEMS } from "@focus-notes/ui/contracts";
import type { JsonSchema } from "@focus-notes/core";
import { schemaAt } from "@focus-notes/core";
import { buildUiSchema, type SchemaInputs } from "./schema.ts";
import { checkExpression, readsOf } from "./expr.ts";
import { migrateView } from "./migrate.ts";
import {
  isBind, isComponent, isEach, isExpr, isFragment, isMessage, isRead, isSlot, isSwitch,
  type Node, type Value, type ViewDocument, type Action,
} from "./types.ts";

export interface CheckInputs extends SchemaInputs {
  views: Record<string, unknown>;
  fragments: Record<string, unknown>;
  commands: ReadonlySet<string>;
  viewModels: ReadonlyMap<string, { schema: JsonSchema; setters?: Record<string, string> }>;
  messages: { has(key: string): boolean; argumentsOf(key: string): string[] };
}

export interface Problem { doc: string; stage: "schema" | "references" | "types" | "accessibility" | "design"; at: string; message: string }

const ENV_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    sizeClass: { type: "string", enum: ["compact", "medium", "wide"] },
    platform: { type: "string", enum: ["macos", "windows", "linux", "web"] },
    pointer: { type: "string", enum: ["fine", "coarse"] },
    colorScheme: { type: "string", enum: ["light", "dark"] },
    reducedMotion: { type: "boolean" },
    locale: { type: "string" },
  },
};

export function checkUi(inputs: CheckInputs): Problem[] {
  const problems: Problem[] = [];
  const contracts = new Map(inputs.contracts.map((c) => [c.type, c]));
  const ajv = new Ajv2020({ allErrors: true, discriminator: true, strict: false });
  const validate = ajv.compile(buildUiSchema(inputs));

  for (const [name, original] of Object.entries(inputs.views)) {
    const add = (stage: Problem["stage"], at: string, message: string) => problems.push({ doc: `view ${name}`, stage, at, message });
    // Every document is brought to this app's UI schema major first; a newer one is refused (DSY-10).
    let raw: unknown;
    try {
      raw = migrateView(original);
    } catch (e) {
      add("schema", "/$schema", (e as Error).message);
      continue;
    }
    const doc = raw as ViewDocument;
    if (!validate(raw)) {
      for (const e of validate.errors ?? []) add("schema", e.instancePath || "/", `${e.message}${e.params && "allowedValues" in e.params ? `: ${(e.params as { allowedValues: unknown[] }).allowedValues.join(", ")}` : ""}`);
      continue;
    }
    if (doc.id !== name) add("references", "/id", `id "${doc.id}" should match the registered name "${name}"`);
    for (const vm of doc.viewModels) if (!inputs.viewModels.has(vm)) add("references", "/viewModels", `unknown view model ${vm}`);
    const ids = new Set<string>();

    // Types a read can resolve to, by scope.
    const typeOfRead = (path: string, scope: Record<string, JsonSchema>): JsonSchema | undefined | "unknown-scope" => {
      const parts = path.split(".");
      if (parts[0] === "vm") {
        const id = `vm.${parts[1]}`;
        if (!doc.viewModels.includes(id)) return "unknown-scope";
        const vm = inputs.viewModels.get(id);
        return vm ? schemaAt(vm.schema, parts.slice(2)) : undefined;
      }
      if (parts[0] === "env") return schemaAt(ENV_SCHEMA, parts.slice(1));
      if (parts[0] === "local") {
        if (!doc.local || !(parts[1]! in doc.local)) return undefined;
        const v = doc.local[parts[1]!];
        return { type: typeof v === "boolean" ? "boolean" : typeof v === "number" ? "number" : "string" };
      }
      const s = scope[parts[0]!];
      return s ? schemaAt(s, parts.slice(1)) : "unknown-scope";
    };

    const checkRead = (path: string, at: string, scope: Record<string, JsonSchema>): JsonSchema | undefined => {
      const t = typeOfRead(path, scope);
      if (t === "unknown-scope") { add("references", at, `"${path}" reads a scope this view doesn't declare`); return undefined; }
      if (!t) { add("references", at, `"${path}" doesn't exist`); return undefined; }
      return t;
    };

    const checkValue = (v: Value, spec: PropSpec | undefined, at: string, scope: Record<string, JsonSchema>) => {
      if (isMessage(v)) {
        if (!inputs.messages.has(v.t)) add("references", at, `message "${v.t}" doesn't exist`);
        else {
          const want = new Set(inputs.messages.argumentsOf(v.t));
          for (const a of Object.keys(v.args ?? {})) if (!want.has(a)) add("types", at, `message "${v.t}" has no argument "${a}"`);
          for (const a of want) if (!(a in (v.args ?? {}))) add("types", at, `message "${v.t}" needs argument "${a}"`);
        }
        for (const [k, a] of Object.entries(v.args ?? {})) checkValue(a, undefined, `${at}/args/${k}`, scope);
        return;
      }
      if (isRead(v)) {
        const t = checkRead(v.get, at, scope);
        if (t && spec) {
          const want = spec.kind === "boolean" ? "boolean" : spec.kind === "number" ? "number" : spec.kind === "list" ? "array" : ["message", "text", "enum", "token", "icon"].includes(spec.kind) ? "string" : undefined;
          if (want && t.type && t.type !== want) add("types", at, `"${v.get}" is ${t.type}, but this prop needs ${want}`);
          else if (spec.kind === "list") for (const m of listItemProblems(t, spec.of, `"${v.get}"`)) add("types", at, m);
          if (spec.kind === "enum" && t.enum) for (const e of t.enum) if (!spec.values.includes(String(e))) add("types", at, `"${v.get}" can be "${e}", which this prop doesn't accept`);
        }
        return;
      }
      if (isBind(v)) {
        const t = checkRead(v.bind, at, scope);
        const parts = v.bind.split(".");
        if (parts[0] === "vm") {
          const vm = inputs.viewModels.get(`vm.${parts[1]}`);
          const field = parts.slice(2).join(".");
          if (vm && !vm.setters?.[field]) add("types", at, `"${v.bind}" has no setter command, so it can't be bound`);
        } else if (parts[0] !== "local") add("types", at, `only view-model fields and local state can be bound`);
        if (t && spec?.kind === "boolean" && t.type !== "boolean") add("types", at, `"${v.bind}" isn't a boolean`);
        return;
      }
      if (isExpr(v)) {
        for (const m of checkExpression(v.expr)) add("design", at, m);
        for (const r of readsOf(v.expr)) checkRead(r, at, scope);
        return;
      }
      if (typeof v === "string" && spec && ["message", "text"].includes(spec.kind)) add("types", at, `literal text isn't allowed; use a message key or a read`);
      if (spec?.kind === "command" && typeof v === "string" && !inputs.commands.has(v)) add("references", at, `unknown command ${v}`);
    };

    const checkActions = (actions: Action | Action[], at: string, scope: Record<string, JsonSchema>, payload: Record<string, string> | undefined) => {
      const eventScope: Record<string, JsonSchema> = { ...scope, event: { type: "object", properties: Object.fromEntries(Object.entries(payload ?? {}).map(([k, t]) => [k, { type: t === "text" ? "string" : (t as "boolean" | "number") }])) } };
      for (const [i, a] of (Array.isArray(actions) ? actions : [actions]).entries()) {
        if ("run" in a) {
          if (!inputs.commands.has(a.run)) add("references", `${at}/${i}`, `unknown command ${a.run}`);
          for (const [k, v] of Object.entries(a.args ?? {})) checkValue(v, undefined, `${at}/${i}/args/${k}`, eventScope);
        } else {
          if (!doc.local || !(a.set.slice(6) in doc.local)) add("references", `${at}/${i}`, `"${a.set}" isn't declared in local`);
          checkValue(a.to, undefined, `${at}/${i}/to`, eventScope);
        }
      }
    };

    // A view surface is the view itself, each dialog or layer, and each case of a switch (they never show together).
    const primaries = new Map<string, number>();
    const walk = (node: Node, at: string, scope: Record<string, JsonSchema>, parent?: Contract, surface = "/root") => {
      if ("when" in node && node.when !== undefined) checkValue(node.when as Value, { kind: "boolean" }, `${at}/when`, scope);
      if (isSlot(node)) { add("references", at, "slot outlets are only allowed in fragments"); return; }
      if (isFragment(node)) { if (!(node.use in inputs.fragments)) add("references", at, `unknown fragment ${node.use}`); return; }
      if (isEach(node)) {
        const t = checkRead(node.each.get, `${at}/each`, scope);
        if (t && t.type !== "array") add("types", `${at}/each`, `"${node.each.get}" isn't a list`);
        if (!node.empty) add("accessibility", at, "a repeat needs an empty case");
        walk(node.render, `${at}/render`, { ...scope, [node.as]: t?.items ?? {} }, parent, surface);
        if (node.empty) walk(node.empty, `${at}/empty`, scope, parent, `${at}/empty`);
        return;
      }
      if (isSwitch(node)) {
        const v = node.switch as Value;
        checkValue(v, undefined, `${at}/switch`, scope);
        if (isRead(v)) {
          const t = typeOfRead(v.get, scope);
          if (t && t !== "unknown-scope" && t.enum) for (const e of t.enum) if (!(String(e) in node.cases)) add("accessibility", `${at}/cases`, `no case for "${e}"`);
        }
        for (const [k, n] of Object.entries(node.cases)) walk(n, `${at}/cases/${k}`, scope, parent, `${at}/cases/${k}`);
        return;
      }
      if (!isComponent(node)) return;
      const c = contracts.get(node.type)!;
      if (parent) {
        const slot = parent.slots.default;
        if (slot && slot.accepts !== "any" && !slot.accepts.includes(node.type)) add("design", at, `${parent.type} doesn't accept ${node.type} as a child`);
      }
      if (node.id) {
        if (ids.has(node.id)) add("references", `${at}/id`, `duplicate id "${node.id}"`);
        ids.add(node.id);
      }
      const props = node.props ?? {};
      for (const [k, v] of Object.entries(props)) checkValue(v, c.props[k], `${at}/props/${k}`, scope);
      for (const [k, spec] of Object.entries(c.props)) {
        if (spec.kind === "message" && spec.requiredWhen && props[spec.requiredWhen] !== undefined && props[spec.requiredWhen] !== false && props[k] === undefined)
          add("accessibility", `${at}/props/${k}`, `${k} is required when ${spec.requiredWhen} is set`);
      }
      if (c.a11y.name && c.props[c.a11y.name] && "required" in c.props[c.a11y.name]! && (c.props[c.a11y.name] as { required?: boolean }).required && props[c.a11y.name] === undefined)
        add("accessibility", at, `${node.type} needs an accessible name (${c.a11y.name})`);
      const here = node.type === "Dialog" || node.type === "DialogPanel" || node.type === "Layer" ? at : surface;
      if (node.type === "Button" && props.variant === "primary") primaries.set(here, (primaries.get(here) ?? 0) + 1);
      for (const [e, actions] of Object.entries(node.on ?? {})) checkActions(actions, `${at}/on/${e}`, scope, c.events[e]?.payload);
      const kids = node.children ?? [];
      const slot = c.slots.default;
      if (slot) {
        if (slot.min !== undefined && kids.length < slot.min) add("design", `${at}/children`, `${node.type} needs at least ${slot.min} child`);
        if (slot.max !== undefined && kids.length > slot.max) add("design", `${at}/children`, `${node.type} takes at most ${slot.max} children`);
      }
      kids.forEach((k, i) => walk(k, `${at}/children/${i}`, scope, c, here));
      for (const [name, nodes] of Object.entries(node.slots ?? {})) nodes.forEach((k, i) => walk(k, `${at}/slots/${name}/${i}`, scope, undefined, here));
    };

    walk(doc.root, "/root", {});
    if (doc.overlay) {
      // A view hosted beside the main one adds only dialogs and side sheets: no second app root, nothing on the canvas.
      if (!isComponent(doc.root) || doc.root.type !== "Stack" || (doc.root.children ?? []).some((c) => !isComponent(c) || (c.type !== "Dialog" && c.type !== "Sheet"))) add("design", "/root", "an overlay view's root is a Stack of Dialogs and Sheets");
    } else if (doc.ia === "IA-VIEW-PUBLIC") {
      // A published page (WP-5.1) is a document of its own, without the app: its root is ReaderPage.
      if (!isComponent(doc.root) || doc.root.type !== "ReaderPage") add("design", "/root", "a published page's root is ReaderPage");
    } else if (doc.ia === "IA-VIEW-SITE" || doc.ia === "IA-VIEW-HELP") {
      // A page of the product site (WP-10.1), rendered at build time like a published page: its root is SitePage.
      if (!isComponent(doc.root) || doc.root.type !== "SitePage") add("design", "/root", "a site page's root is SitePage");
    } else if (!isComponent(doc.root) || doc.root.type !== "AppRoot") add("design", "/root", "a view's root is AppRoot");
    if (!doc.focus) add("accessibility", "/focus", "every view says where focus goes when it opens");
    else if (!ids.has(doc.focus)) add("references", "/focus", `focus target "${doc.focus}" isn't an id in this view`);
    for (const [where, n] of primaries) if (n > 1) add("design", where, "at most one primary button per view surface");
  }
  return problems;
}

/**
 * What's wrong with a list read's items for a list kind (DS-A04, D-198): every required field of
 * the kind's item is declared, every declared field the kind knows has its kind, and nested lists
 * (a menu section's items) hold their own kind's items. `where` names the field in messages.
 */
export function listItemProblems(list: JsonSchema, of: ListOf, where: string): string[] {
  const items = list.items as JsonSchema | undefined;
  if (!items || typeof items !== "object") return [`${where} doesn't say what its items are, but ${of} needs them declared`];
  const shape = ITEM_SHAPES[of];
  if (shape === STRING_ITEMS) return items.type && items.type !== "string" ? [`${where} holds ${items.type} items, but ${of} needs strings`] : [];
  if (items.type && items.type !== "object") return [`${where} holds ${items.type} items, but ${of} needs objects`];
  const props = (items.properties ?? {}) as Record<string, JsonSchema>;
  const out: string[] = [];
  for (const [field, k] of Object.entries(shape.fields)) {
    const kind = k.replace("?", "");
    const p = props[field];
    if (!p) { if (!k.endsWith("?")) out.push(`${where} items have no "${field}", which ${of} needs`); continue; }
    if (p.type && p.type !== kind && !(kind === "number" && p.type === "integer")) { out.push(`${where} items' "${field}" is ${p.type}, but ${of} needs ${kind}`); continue; }
    const nested = shape.lists?.[field];
    if (nested) out.push(...listItemProblems(p, nested, `${where} items' "${field}"`));
  }
  return out;
}

export interface CoverageOptions {
  /** Whether a repository-relative file exists; journeys and host declarations are checked with it. */
  exists?: (repoPath: string) => boolean;
}

/**
 * Every enum value of every contract appears in at least one fixture (DSY-09), and every declared
 * state is rendered by a fixture, reached by a named journey, or listed as uncovered with a reason
 * (DS-A02, D-198). Hosts have no fixtures; they name the journeys that exercise them.
 */
export function checkFixtureCoverage(contracts: readonly Contract[], options: CoverageOptions = {}): string[] {
  const out: string[] = [];
  for (const c of contracts) {
    const states = new Set(c.states);
    const reached = new Set<string>();
    for (const f of c.fixtures) {
      if (!f.covers) { if (states.has("rest")) reached.add("rest"); continue; }
      for (const s of f.covers) {
        if (!states.has(s)) out.push(`${c.type}: fixture "${f.name}" covers "${s}", which isn't a declared state`);
        reached.add(s);
      }
    }
    for (const j of c.journeys ?? []) {
      if (options.exists && !options.exists(j.spec)) out.push(`${c.type}: journey ${j.spec} doesn't exist`);
      if (j.covers.length === 0) out.push(`${c.type}: journey ${j.spec} covers no state`);
      for (const s of j.covers) {
        if (!states.has(s)) out.push(`${c.type}: journey ${j.spec} covers "${s}", which isn't a declared state`);
        reached.add(s);
      }
    }
    for (const [s, reason] of Object.entries(c.uncovered ?? {})) {
      if (!states.has(s)) out.push(`${c.type}: uncovered "${s}" isn't a declared state`);
      else if (reached.has(s)) out.push(`${c.type}: "${s}" is listed as uncovered, but a fixture or journey covers it`);
      if (!reason.trim()) out.push(`${c.type}: uncovered "${s}" needs a reason`);
    }
    for (const s of c.states) if (!reached.has(s) && !(s in (c.uncovered ?? {}))) out.push(`${c.type}: state "${s}" has no fixture or journey, and no reason it's uncovered`);
    if (c.tier === "host") {
      if (!c.journeys?.length) out.push(`${c.type}: a host names the journeys that exercise it`);
      continue;
    }
    for (const [prop, spec] of Object.entries(c.props)) {
      if (spec.kind !== "enum" && spec.kind !== "token") continue;
      const values = spec.kind === "enum" ? spec.values : [];
      for (const v of values) if (!c.fixtures.some((f) => (f.props?.[prop] ?? (spec as { default?: string }).default) === v)) out.push(`${c.type}: no fixture for ${prop}="${v}"`);
    }
    if (c.fixtures.length === 0) out.push(`${c.type}: no fixtures`);
  }
  return out;
}
