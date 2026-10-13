/**
 * The gallery (DSY-09): every component fixture as its own view document, rendered through the
 * same runtime as the app. Each fixture has a stable ID for visual and accessibility tests.
 */
import type { App } from "@focus-notes/core";
import type { Contract } from "@focus-notes/ui/contracts";

export interface GalleryFixture { id: string; type: string; label: string }

export function galleryFixtures(contracts: readonly Contract[]): GalleryFixture[] {
  return contracts.flatMap((c) => c.fixtures.map((f, i) => ({ id: `${c.type}.${i}`, type: c.type, label: `${c.type}: ${f.name}` })));
}

export function galleryViews(contracts: readonly Contract[], scheme: "light" | "dark" = "light"): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of contracts) {
    c.fixtures.forEach((f, i) => {
      const node = { type: c.type, ...(f.props ? { props: f.props } : {}), ...(f.children ? { children: f.children } : {}), ...(f.slots ? { slots: f.slots } : {}) };
      const wrapped = c.type === "AppRoot"
        ? { ...node, id: "fixture" }
        : {
            type: "AppRoot",
            props: { scheme, platform: { get: "vm.app.platform" } },
            children: [{ type: "Center", props: { maxWidth: "wideContent" }, children: [{ type: "Stack", id: "fixture", props: { padding: "xl", align: "start" }, children: [node] }] }],
          };
      out[`gallery.${c.type}.${i}`] = { $schema: "https://prabinpebam.github.io/focus-notes/schemas/ui/view.v1.json", id: `gallery.${c.type}.${i}`, viewModels: ["vm.app", "vm.gallery"], focus: "fixture", root: wrapped };
    });
  }
  out["gallery.index"] = {
    $schema: "https://prabinpebam.github.io/focus-notes/schemas/ui/view.v1.json",
    id: "gallery.index",
    viewModels: ["vm.app", "vm.gallery"],
    focus: "gallery",
    root: {
      type: "AppRoot",
      props: { scheme, platform: { get: "vm.app.platform" } },
      children: [{
        type: "Center", props: { maxWidth: "dialogL" },
        children: [{
          type: "Stack", id: "gallery", props: { gap: "s", padding: "xl" },
          children: [
            { type: "Heading", props: { level: "1", value: { t: "gallery.title" } } },
            {
              each: { get: "vm.gallery.fixtures" }, as: "item", key: "item.id",
              render: { type: "Button", props: { label: { get: "item.label" }, variant: "subtle" }, on: { press: { run: "gallery.open", args: { id: { get: "item.id" } } } } },
              empty: { type: "Text", props: { value: { t: "gallery.empty" } } },
            },
          ],
        }],
      }],
    },
  };
  return out;
}

/** Registers the gallery's view model and its navigation command on an app. */
export function registerGallery(app: App, contracts: readonly Contract[], navigate: (id: string) => void): void {
  const fixtures = galleryFixtures(contracts);
  app.viewModels.register({
    id: "vm.gallery",
    schema: {
      type: "object",
      properties: { fixtures: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } } } } },
    },
    select: () => ({ fixtures }),
  });
  app.commands.register<{ id: string }>({ id: "gallery.open", title: "gallery.title", run: ({ id }) => navigate(String(id)) });
}
