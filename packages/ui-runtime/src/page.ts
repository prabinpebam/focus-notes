/**
 * Mounting one page's view without the app (WP-5.4): the share reader at s/ renders its view document
 * in the browser with its own small registry and view model, and loads nothing else (PRF-05).
 */
import { createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ViewHost, type RuntimeDeps } from "./render.ts";

export type { RuntimeApp, RuntimeDeps } from "./render.ts";

export function mountPage(el: Element, viewId: string, deps: RuntimeDeps): Root {
  const root = createRoot(el);
  root.render(createElement(StrictMode, null, createElement(ViewHost, { viewId, deps })));
  return root;
}
