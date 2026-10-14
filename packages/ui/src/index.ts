export { registry } from "./registry.ts";
export { contracts, contractByType, ICON_NAMES } from "./contracts.ts";
export type * from "./contract.ts";
export { FLUSH_EVENT, REFOCUS_EVENT, EDITOR_ACTION_EVENT } from "./host/EditorSurface/EditorSurface.tsx";
/** Mounting needs these from the editor: the Trusted Types policy and the slash menu's entries. */
export { installTrustedTypes, slashCatalog } from "@focus-notes/editor";
/** The code of the views people open first, loaded by the warm-up after start (PRF-10). */
export { preloadFileTree as preloadViews } from "./primitives/FileTree/lazy.tsx";
