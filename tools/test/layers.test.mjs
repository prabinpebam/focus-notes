/**
 * D-207: one stacking order for the whole interface. The semantic layers stay in their order, and each
 * component's layer token points at the layer its role belongs to, so a menu or popover never opens
 * under a side panel or a dialog's scrim, and a surface pinned to the selection never opens under a panel.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = join(import.meta.dirname, "..", "..", "packages", "tokens", "src");
const json = (p) => JSON.parse(readFileSync(join(src, p), "utf8"));
const layers = json("semantic/structure.json").layer;
const ORDER = ["canvas", "mask", "contextual", "trigger", "panel", "anchored", "dialog", "popover", "toast", "tooltip"];

/** Every component token that sets a z-index, as `cmp.<name>.<key>` → the layer it aliases. */
const componentLayers = () => {
  const out = {};
  for (const f of readdirSync(join(src, "component"))) {
    for (const [name, group] of Object.entries(json(`component/${f}`).cmp ?? {})) {
      for (const [key, tok] of Object.entries(group)) {
        if (!/^(layer|.*Layer)$/.test(key)) continue;
        const m = /^\{layer\.(\w+)\}$/.exec(String(tok?.$value));
        out[`${name}.${key}`] = m ? m[1] : tok?.$value;
      }
    }
  }
  return out;
};

describe("layer order (D-207)", () => {
  it("D-207: the semantic layers run canvas < mask < contextual < trigger < panel < anchored < dialog < popover < toast < tooltip", () => {
    expect(Object.keys(layers).filter((k) => !k.startsWith("$"))).toEqual(ORDER);
    const values = ORDER.map((k) => layers[k].$value);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
    for (const k of ORDER) expect(layers[k].$description, k).toBeTruthy();
  });

  it("D-207: each component's layer matches its role", () => {
    const got = componentLayers();
    expect(got).toMatchObject({
      "positioner.layer": "anchored",
      "menuButton.layer": "popover",
      "popoverPanel.layer": "popover",
      "datePicker.layer": "popover",
      "windowControls.layer": "popover",
      "sheet.layer": "panel",
      "dialogPanel.layer": "dialog",
      "tooltip.layer": "tooltip",
      "windowFrame.layer": "tooltip",
      "triggerButton.layer": "trigger",
      "blockHandle.layer": "contextual",
      "tableControls.layer": "contextual",
    });
    // Every layer token aliases a named layer; none is a raw number.
    for (const [k, v] of Object.entries(got)) expect(ORDER, k).toContain(v);
  });

  it("D-207: menus and popovers sit above panels and dialogs; anchored surfaces above panels, below dialogs", () => {
    const v = (k) => layers[k].$value;
    expect(v("popover")).toBeGreaterThan(v("dialog"));
    expect(v("popover")).toBeGreaterThan(v("panel"));
    expect(v("anchored")).toBeGreaterThan(v("panel"));
    expect(v("anchored")).toBeLessThan(v("dialog"));
  });
});
