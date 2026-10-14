/**
 * Static rendering (DSY-06, WP-5.1): a view document rendered to HTML once, at build time, from
 * fixed view model data, through the same renderer as the app. The published reader page uses it.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageCatalog, type AppState, type Messages } from "@focus-notes/core";
import type { Contract } from "@focus-notes/ui/contracts";
import type { ComponentType } from "react";
import { ViewHost, type RuntimeApp } from "./render.ts";

export interface StaticRenderOptions {
  views: Record<string, unknown>;
  view: string;
  registry: Readonly<Record<string, ComponentType<any>>>;
  contracts: ReadonlyMap<string, Contract>;
  messages: Messages | MessageCatalog;
  /** Each view model's value by ID ("vm.reader"). */
  data: Readonly<Record<string, Record<string, unknown>>>;
  locale?: string;
}

// A page has no app state: it reads only its view models. The scheme follows the reader (CSS).
const STATIC_STATE = { appearance: { mode: "system", system: "light" } } as AppState;

export function renderStaticView(o: StaticRenderOptions): string {
  const messages = o.messages instanceof MessageCatalog ? o.messages : new MessageCatalog(o.locale ?? "en", o.messages);
  const app: RuntimeApp = {
    store: { state: STATIC_STATE, subscribe: () => () => {} },
    viewModels: {
      select: (id) => {
        const v = o.data[id];
        if (!v) throw new Error(`Unknown view model ${id}`);
        return v;
      },
      get: () => undefined,
    },
    messages,
    commands: { has: () => false, run: async () => {}, describe: (id) => { throw new Error(`No commands on a static page (${id})`); } },
    bridge: { platform: "web" },
  };
  return renderToStaticMarkup(createElement(ViewHost, { viewId: o.view, deps: { app, registry: o.registry, contracts: o.contracts, views: o.views } }));
}
