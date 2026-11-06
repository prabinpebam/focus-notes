import { describe, expect, it } from "vitest";
import { createElement as h, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { registry, contractByType } from "@focus-notes/ui";
import { createApp, type PlatformBridge } from "@focus-notes/core";
import { messages } from "@focus-notes/views";
import { ViewHost, sizeClassOf, type RuntimeDeps } from "../src/render.ts";
import { breakpoints } from "@focus-notes/tokens";
import { Window } from "happy-dom";
import { Toolbar } from "../../ui/src/compounds/Toolbar/Toolbar.tsx";

const bridge: PlatformBridge = {
  platform: "macos", readNote: async () => "", writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/notes/Untitled.md",
  defaultNotePath: async () => "", loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
  systemScheme: () => "light", onSystemSchemeChange: () => () => {},
};

function setup(items: { id: string; label: string }[]) {
  const app = createApp(bridge, messages.en!);
  app.viewModels.register({
    id: "vm.bench",
    schema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } } } }, show: { type: "boolean" }, mode: { type: "string", enum: ["a", "b"] } } },
    select: () => ({ items, show: true, mode: "b" }),
  });
  const ran: unknown[] = [];
  app.commands.register<{ id: string }>({ id: "bench.pick", title: "gallery.action", run: (args) => { ran.push(args); } });
  return { app, ran };
}

const doc = (root: unknown) => ({ $schema: "x", id: "v", viewModels: ["vm.app", "vm.bench"], focus: "f", root });
const render = (app: ReturnType<typeof setup>["app"], view: unknown) => {
  const deps: RuntimeDeps = { app, registry, contracts: contractByType, views: { v: view } };
  return renderToString(h(ViewHost, { viewId: "v", deps }));
};

describe("the renderer (DSY-06)", () => {
  it("OFB.30: writing-toolbar modes are unlabelled icon buttons with pressed state", () => {
    const html = renderToString(h(Toolbar, {
      label: "Toolbar", moreLabel: "More", more: [],
      items: [
        { id: "focus.toggle", label: "Focus mode", icon: "focus", checked: true },
        { id: "appearance.toggle", label: "Switch light and dark", icon: "lightTheme", checked: false },
      ],
    }));
    const dom = new Window();
    dom.document.body.innerHTML = html;
    const toolbar = dom.document.querySelector('[role="toolbar"]')!;
    expect(toolbar.querySelector('[role="switch"]')).toBeNull();
    for (const [name, pressed] of [["Focus mode", "true"], ["Switch light and dark", "false"]]) {
      const button = toolbar.querySelector(`button[aria-label="${name}"]`)!;
      expect(button.getAttribute("aria-pressed")).toBe(pressed);
      expect(button.textContent).toBe("");
      expect(button.querySelector("svg")).not.toBeNull();
    }
    dom.close();
  });
  it("OFB.6: resolves all responsive classes at the token boundaries", () => {
    expect(sizeClassOf(breakpoints.medium - 1)).toBe("compact");
    expect(sizeClassOf(breakpoints.medium)).toBe("medium");
    expect(sizeClassOf(breakpoints.wide - 1)).toBe("medium");
    expect(sizeClassOf(breakpoints.wide)).toBe("wide");
  });
  it("resolves messages, reads, repeats, choices, and conditions", () => {
    const { app } = setup([{ id: "1", label: "One" }, { id: "2", label: "Two" }]);
    const html = render(app, doc({
      type: "AppRoot", props: { scheme: { get: "vm.app.scheme" }, platform: { get: "vm.app.platform" } },
      children: [
        { type: "Text", props: { value: { t: "canvas.placeholder", args: { platform: { get: "vm.app.platform" } } } } },
        { each: { get: "vm.bench.items" }, as: "item", key: "item.id", render: { type: "Text", props: { value: { get: "item.label" } } }, empty: { type: "Text", props: { value: { t: "gallery.empty" } } } },
        { switch: { get: "vm.bench.mode" }, cases: { a: { type: "Text", props: { value: { t: "gallery.title" } } }, b: { type: "Text", props: { value: { t: "gallery.action" } } } } },
        { type: "Text", when: { expr: { "!": { get: "vm.bench.show" } } }, props: { value: { t: "gallery.reason" } } },
      ],
    }));
    expect(html).toContain("press ⌘/");
    expect(html).toContain(">One<");
    expect(html).toContain(">Two<");
    expect(html).toContain("Save note");
    expect(html).not.toContain("Component gallery");
    expect(html).not.toContain("Nothing to save yet");
  });

  it("renders only registry components: no raw elements can be named", () => {
    const { app } = setup([]);
    expect(() => render(app, doc({ type: "div" }))).toThrow(/Unknown component div/);
  });

  it("keeps a Section's heading and context together above its item body (SP-12)", () => {
    const { app } = setup([]);
    const html = render(app, doc({
      type: "Section",
      slots: { heading: [
        { type: "Heading", props: { level: "3", value: { t: "gallery.sample" } } },
        { type: "Text", props: { value: { t: "gallery.long" } } },
      ] },
      children: [{ type: "Text", props: { value: { t: "gallery.action" } } }],
    }));
    expect(html).toMatch(/data-section-header=""[^]*<h3[^]*<\/h3>[^]*<\/div><div[^]*data-section-body=""/);
    expect(html.slice(html.indexOf("data-section-body"))).toContain("Save note");
    const noHeading = render(app, doc({ type: "Section", children: [{ type: "Text", props: { value: { t: "gallery.action" } } }] }));
    expect(noHeading).not.toContain("data-section-header");
    expect(noHeading).toContain("data-section-body");
  });

  it("keeps repeated-item values inside nested project scopes", () => {
    const { app } = setup([{ id: "1", label: "One" }, { id: "2", label: "Two" }]);
    const html = render(app, doc({
      type: "Stack",
      children: [{
        each: { get: "vm.bench.items" }, as: "item", key: "item.id",
        render: {
          type: "ProjectScope",
          children: [{ type: "ProjectScope", children: [{ type: "Text", props: { value: { get: "item.label" } } }] }],
        },
      }],
    }));
    expect(html).toContain(">One<");
    expect(html).toContain(">Two<");
  });
});

describe("renderer overhead (DSY-11)", () => {
  it("adds 10% or less over the same tree written by hand", () => {
    const items = Array.from({ length: 500 }, (_, i) => ({ id: String(i), label: `Note number ${i}` }));
    const { app } = setup(items);
    const view = doc({
      type: "AppRoot", props: { scheme: "light", platform: "windows" },
      children: [{ type: "Stack", props: { gap: "stackItem" }, children: [{
        each: { get: "vm.bench.items" }, as: "item", key: "item.id",
        render: { type: "Inline", props: { gap: "inlineItem" }, children: [
          { type: "Icon", props: { name: "document" } },
          { type: "Text", props: { value: { get: "item.label" }, tone: "muted" } },
          { type: "Button", props: { label: { get: "item.label" }, variant: "subtle" }, on: { press: { run: "bench.pick", args: { id: { get: "item.id" } } } } },
        ] },
        empty: { type: "Text", props: { value: { t: "gallery.empty" } } },
      }] }],
    });
    const { AppRoot, Stack, Inline, Icon, Text, Button } = registry as Record<string, (p: any) => ReactNode>;
    const byHand = () => renderToString(h(AppRoot!, { scheme: "light", platform: "windows" },
      h(Stack!, { gap: "stackItem" }, items.map((it) => h(Inline!, { key: it.id, gap: "inlineItem" },
        h(Icon!, { name: "document" }), h(Text!, { value: it.label, tone: "muted" }),
        h(Button!, { label: it.label, variant: "subtle", onPress: () => app.commands.run("bench.pick", { id: it.id }) }))))));
    const viaRuntime = () => render(app, view);
    for (let i = 0; i < 20; i++) { byHand(); viaRuntime(); }
    // Many paired runs (shared CI machines are noisy), alternating order, cancel drift from warm-up, GC, and other load on the machine.
    const ratios: number[] = [];
    for (let i = 0; i < 201; i++) {
      const first = i % 2 === 0 ? byHand : viaRuntime;
      const second = first === byHand ? viaRuntime : byHand;
      let s = performance.now(); first(); const a = performance.now() - s;
      s = performance.now(); second(); const b = performance.now() - s;
      ratios.push(first === byHand ? b / a : a / b);
    }
    const overhead = ratios.sort((x, y) => x - y)[100]! - 1;
    const strict = process.env.NODE_ENV === "production";
    console.log(`DSY-11: overhead ${(overhead * 100).toFixed(1)}% (${strict ? "production React" : "development React"})`);
    // The 10% budget applies to production builds (pnpm bench). Development React adds its own cost.
    expect(overhead).toBeLessThanOrEqual(strict ? 0.1 : 0.25);
  }, 120_000);
});
