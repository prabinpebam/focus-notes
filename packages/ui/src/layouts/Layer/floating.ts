import { createContext } from "react";

/** True inside a floating Layer, where frost is allowed. */
export const FloatingContext = createContext(false);

/** The layer a Layer puts its content on, for the surface directly in it: on the dialog layer it's a dialog (D-111). */
export const LayerContext = createContext<string>("");
