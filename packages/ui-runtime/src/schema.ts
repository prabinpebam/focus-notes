/**
 * Generates the UI schema (JSON Schema 2020-12) from the component contracts (DSY-05, DSY-13).
 * Views and fragments are validated against it by ui:check, and it's published for agents.
 */
import type { Contract, PropSpec } from "@focus-notes/ui/contracts";

export interface SchemaInputs {
  contracts: readonly Contract[];
  icons: readonly string[];
  tokenGroups: Record<string, readonly string[]>;
}

const ref = (name: string) => ({ $ref: `#/$defs/${name}` });

export function buildUiSchema({ contracts, icons, tokenGroups }: SchemaInputs): Record<string, unknown> {
  const valueFor = (spec: PropSpec): unknown => {
    switch (spec.kind) {
      case "message": return { anyOf: [ref("message"), ref("read"), ref("expr")] };
      case "enum": return { anyOf: [{ enum: [...spec.values] }, ref("read"), ref("expr")] };
      case "token": return { anyOf: [{ enum: [...(tokenGroups[spec.group] ?? [])] }, ref("read")] };
      case "icon": return { anyOf: [{ enum: [...icons] }, ref("read")] };
      case "command": return { type: "string", pattern: "^[a-z][A-Za-z]*(\\.[a-z][A-Za-z]*)+$" };
      case "boolean": return { anyOf: [{ type: "boolean" }, ref("read"), ref("expr"), ...(spec.bindable ? [ref("bind")] : [])] };
      case "number": return { anyOf: [{ type: "number", ...(spec.min !== undefined ? { minimum: spec.min } : {}), ...(spec.max !== undefined ? { maximum: spec.max } : {}) }, ref("read")] };
      case "text": return { anyOf: [ref("read"), ...(spec.bindable ? [ref("bind")] : [])] };
      case "ref": return { type: "string", pattern: "^[a-z][A-Za-z0-9-]*$" };
      case "list": return ref("read");
    }
  };
  const componentDef = (c: Contract) => {
    const props = Object.fromEntries(Object.entries(c.props).map(([k, s]) => [k, valueFor(s)]));
    const required = Object.entries(c.props).filter(([, s]) => "required" in s && s.required).map(([k]) => k);
    const hasDefault = "default" in c.slots;
    const named = Object.keys(c.slots).filter((k) => k !== "default");
    return {
      type: "object",
      description: c.description,
      required: ["type", ...(required.length ? ["props"] : [])],
      additionalProperties: false,
      properties: {
        type: { const: c.type },
        id: { type: "string", pattern: "^[a-z][A-Za-z0-9-]*$" },
        when: { anyOf: [ref("expr"), ref("read"), { type: "boolean" }] },
        props: { type: "object", additionalProperties: false, properties: props, required },
        on: { type: "object", additionalProperties: false, properties: Object.fromEntries(Object.keys(c.events).map((e) => [e, ref("actions")])) },
        ...(hasDefault ? { children: { type: "array", items: ref("node") } } : {}),
        ...(named.length ? { slots: { type: "object", additionalProperties: false, properties: Object.fromEntries(named.map((n) => [n, { type: "array", items: ref("node") }])) } } : {}),
      },
    };
  };
  const defs: Record<string, unknown> = {
    message: {
      type: "object", required: ["t"], additionalProperties: false,
      properties: { t: { type: "string", pattern: "^[a-z][A-Za-z0-9]*(\\.[a-zA-Z0-9]+)+$" }, args: { type: "object", additionalProperties: ref("value") } },
    },
    read: { type: "object", required: ["get"], additionalProperties: false, properties: { get: ref("path") } },
    bind: { type: "object", required: ["bind"], additionalProperties: false, properties: { bind: ref("path") } },
    expr: { type: "object", required: ["expr"], additionalProperties: false, properties: { expr: {} } },
    path: { type: "string", pattern: "^(vm\\.[a-z][A-Za-z0-9]*|local|env|event|params|[a-z][A-Za-z0-9]*)(\\.[A-Za-z0-9]+)*$" },
    value: { anyOf: [{ type: ["string", "number", "boolean", "null"] }, ref("message"), ref("read"), ref("bind"), ref("expr")] },
    action: {
      oneOf: [
        { type: "object", required: ["run"], additionalProperties: false, properties: { run: { type: "string" }, args: { type: "object", additionalProperties: ref("value") } } },
        { type: "object", required: ["set", "to"], additionalProperties: false, properties: { set: { type: "string", pattern: "^local\\." }, to: ref("value") } },
      ],
    },
    actions: { anyOf: [ref("action"), { type: "array", items: ref("action"), minItems: 1 }] },
    component: { type: "object", required: ["type"], discriminator: { propertyName: "type" }, oneOf: contracts.map((c) => ref(`c_${c.type}`)) },
    fragmentNode: {
      type: "object", required: ["use"], additionalProperties: false,
      properties: { use: { type: "string" }, params: { type: "object", additionalProperties: ref("value") }, slots: { type: "object", additionalProperties: { type: "array", items: ref("node") } }, when: {} },
    },
    eachNode: {
      type: "object", required: ["each", "as", "key", "render"], additionalProperties: false,
      properties: { each: ref("read"), as: { type: "string" }, key: { type: "string" }, render: ref("node"), empty: ref("node"), when: {} },
    },
    switchNode: {
      type: "object", required: ["switch", "cases"], additionalProperties: false,
      properties: { switch: {}, cases: { type: "object", additionalProperties: ref("node") }, when: {} },
    },
    slotOutlet: { type: "object", required: ["slot"], additionalProperties: false, properties: { slot: { type: "string" } } },
    node: {
      if: { type: "object", required: ["type"] },
      then: ref("component"),
      else: { anyOf: [ref("fragmentNode"), ref("eachNode"), ref("switchNode"), ref("slotOutlet")] },
    },
    ...Object.fromEntries(contracts.map((c) => [`c_${c.type}`, componentDef(c)])),
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://prabinpebam.github.io/focus-notes/schemas/ui/view.v1.json",
    title: "Focus Notes view document",
    type: "object",
    required: ["$schema", "id", "viewModels", "root"],
    additionalProperties: false,
    properties: {
      $schema: { type: "string" },
      id: { type: "string", pattern: "^[a-z][A-Za-z0-9.]*$" },
      ia: { type: "string", pattern: "^IA-(VIEW|CMP)-[A-Z]+$" },
      viewModels: { type: "array", items: { type: "string", pattern: "^vm\\.[a-z][A-Za-z0-9]*$" } },
      focus: { type: "string" },
      overlay: { type: "boolean", description: "Hosted beside the app's main view: its root is a Stack of dialogs that show only when their view models open them (Settings)." },
      local: { type: "object", additionalProperties: { type: ["string", "number", "boolean", "null"] } },
      root: ref("node"),
    },
    $defs: defs,
  };
}
