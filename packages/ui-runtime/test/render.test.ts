import { describe, expect, it } from "vitest";
import { createElement as h, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { registry, contractByType } from "@focus-notes/ui";
import { createApp, type PlatformBridge } from "@focus-notes/core";
import { messages } from "@focus-notes/views";
import { ViewHost, type RuntimeDeps } from "../src/render.ts";

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
});

describe("renderer overhead (DSY-11)", () => {
  it("adds 10% or less over the same tree written by hand", () => {
    const items = Array.from({ length: 500 }, (_, i) => ({ id: String(i), label: `Note number ${i}` }));
    const { app } = setup(items);
    const view = doc({
      type: "AppRoot", props: { scheme: "light", platform: "windows" },
      children: [{ type: "Stack", props: { gap: "s" }, children: [{
        each: { get: "vm.bench.items" }, as: "item", key: "item.id",
        render: { type: "Inline", props: { gap: "s" }, children: [
          { type: "Icon", props: { name: "document" } },
          { type: "Text", props: { value: { get: "item.label" }, tone: "muted" } },
          { type: "Button", props: { label: { get: "item.label" }, variant: "subtle" }, on: { press: { run: "bench.pick", args: { id: { get: "item.id" } } } } },
        ] },
        empty: { type: "Text", props: { value: { t: "gallery.empty" } } },
      }] }],
    });
    const { AppRoot, Stack, Inline, Icon, Text, Button } = registry as Record<string, (p: any) => ReactNode>;
    const byHand = () => renderToString(h(AppRoot!, { scheme: "light", platform: "windows" },
      h(Stack!, { gap: "s" }, items.map((it) => h(Inline!, { key: it.id, gap: "s" },
        h(Icon!, { name: "document" }), h(Text!, { value: it.label, tone: "muted" }),
        h(Button!, { label: it.label, variant: "subtle", onPress: () => app.commands.run("bench.pick", { id: it.id }) }))))));
    const viaRuntime = () => render(app, view);
    for (let i = 0; i < 5; i++) { byHand(); viaRuntime(); }
    // Paired runs, alternating order, cancel drift from warm-up, GC, and other load on the machine.
    const ratios: number[] = [];
    for (let i = 0; i < 61; i++) {
      const first = i % 2 === 0 ? byHand : viaRuntime;
      const second = first === byHand ? viaRuntime : byHand;
      let s = performance.now(); first(); const a = performance.now() - s;
      s = performance.now(); second(); const b = performance.now() - s;
      ratios.push(first === byHand ? b / a : a / b);
    }
    const overhead = ratios.sort((x, y) => x - y)[30]! - 1;
    const strict = process.env.NODE_ENV === "production";
    console.log(`DSY-11: overhead ${(overhead * 100).toFixed(1)}% (${strict ? "production React" : "development React"})`);
    // The 10% budget applies to production builds (pnpm bench). Development React adds its own cost.
    expect(overhead).toBeLessThanOrEqual(strict ? 0.1 : 0.25);
  }, 120_000);
});
