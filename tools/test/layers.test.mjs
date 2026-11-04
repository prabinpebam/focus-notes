/**
 * D-207: one stacking order for the whole interface. The semantic layers stay in their order, and each
 * component's layer token points at the layer its role belongs to, so a menu or popover never opens
 * under a side panel or a dialog's scrim, and a surface pinned to the selection never opens under a panel.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const src = join(import.meta.dirname, "..", "..", "packages", "tokens", "src");
const json = (p) => JSON.parse(readFileSync(join(src, p), "utf8"));
const layers = json("semantic/structure.json").layer;
const ORDER = ["underlay", "canvas", "mask", "contextual", "trigger", "docked", "panel", "anchored", "dialog", "popover", "tooltip", "toast"];
const ui = join(import.meta.dirname, "..", "..", "packages", "ui", "src");
const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
function rawIndices(source) {
  const found = [];
  const visit = node => {
    if (ts.isPropertyAssignment(node) && (node.name.getText() === "zIndex" || node.name.getText() === '"z-index"')) {
      if (/^[+-]?\d|^["'`]/.test(node.initializer.getText())) found.push(node.getText());
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile("probe.ts", source, ts.ScriptTarget.Latest, true));
  return found;
}

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
  it("semantic layers put docked panels below floating panels, overlays below menus/tooltips, and notifications last", () => {
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

    it("rejects raw z-index declarations, including local exceptions", () => {
      expect(rawIndices('const style = { zIndex: 900 };')).toHaveLength(1);
      expect(rawIndices('const style = { zIndex: "999" };')).toHaveLength(1);
      expect(rawIndices('const style = { zIndex: tokens.layer.dialog };')).toEqual([]);
      for (const file of walk(ui).filter(f => /\.tsx?$/.test(f))) expect(rawIndices(readFileSync(file, "utf8")), file).toEqual([]);
      expect(json("component/sheet.json").cmp.sheet.dock.layer.$value).toBe("{layer.docked}");
    });

    it("full-app layers escape local stacking contexts through one AppRoot host; modal and transient portals have distinct destinations", () => {
      const root = readFileSync(join(ui, "layouts/AppRoot/AppRoot.tsx"), "utf8");
      const layer = readFileSync(join(ui, "layouts/Layer/Layer.tsx"), "utf8");
      const modal = readFileSync(join(ui, "primitives/DialogPanel/DialogPanel.tsx"), "utf8");
      const portal = readFileSync(join(ui, "layouts/AppRoot/in-window.tsx"), "utf8");
      expect(root.match(/data-full-app-overlays/g)).toHaveLength(1);
      expect(layer).toContain('layer === "dialog" || position === "window" || position === "fill" ? <FullAppOverlay>');
      expect(portal).toContain("createPortal(children, overlays)");
      expect(modal).toContain("containers.overlays ?? containers.window ?? document.body");
      expect(modal).toContain("getContainer={() => containers.window ?? document.body}");
    });
  it("D-207: menus and popovers sit above panels and dialogs; anchored surfaces above panels, below dialogs", () => {
    const v = (k) => layers[k].$value;
    expect(v("popover")).toBeGreaterThan(v("dialog"));
    expect(v("popover")).toBeGreaterThan(v("panel"));
    expect(v("anchored")).toBeGreaterThan(v("panel"));
    expect(v("anchored")).toBeLessThan(v("dialog"));
  });
});
