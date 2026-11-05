import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ItemCard } from "../src/primitives/ItemCard/ItemCard.tsx";
import { SegmentedControl } from "../src/primitives/SegmentedControl/SegmentedControl.tsx";
import { ProjectScope } from "../src/layouts/ProjectScope/ProjectScope.tsx";

const options = [
  { id: "light", label: "Light", icon: "lightTheme" },
  { id: "dark", label: "Dark", icon: "darkTheme" },
  { id: "system", label: "System", icon: "systemTheme" },
];

describe("published-site controls and preview", () => {
  it("keeps article chevrons opt-in without changing other cards", () => {
    const article = renderToStaticMarkup(<ItemCard title="On focus" chevron={false} reading onPress={() => {}} />);
    const ordinary = renderToStaticMarkup(<ItemCard title="Workspace" onPress={() => {}} />);
    expect(article).not.toContain("<svg");
    expect(ordinary).toContain("<svg");
    expect(article).toContain('data-reading=""');
  });

  it("renders script-free icon choices with names, native tooltips and one selected radio", () => {
    const html = renderToStaticMarkup(<SegmentedControl label="Theme" options={options} value="system" iconsOnly />);
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    for (const option of options) {
      expect(html).toContain(`aria-label="${option.label}"`);
      expect(html).toContain(`title="${option.label}"`);
      expect(html).not.toContain(`>${option.label}<`);
    }
    expect(html).not.toContain("<script");
    expect(html).not.toContain('style="');
  });

  it("rebinds nested content-size aliases, not just the semantic size", () => {
    const html = renderToStaticMarkup(<ProjectScope font="serif" contentSize={24}><span>Note</span></ProjectScope>);
    expect(html).toContain('data-content-size=""');
    expect(html).toContain("--fn-font-size:24px");
    const css = readFileSync(fileURLToPath(new URL("../../tokens/dist/tokens.css", import.meta.url)), "utf8");
    const scope = css.match(/\[data-content-size\] \{([^}]+)\}/)?.[1];
    expect(scope).toContain("--fn-cmp-note-content-font-size: var(--fn-font-size)");
    expect(scope).toContain("--fn-cmp-item-card-reading-size: var(--fn-font-size)");
  });
});
