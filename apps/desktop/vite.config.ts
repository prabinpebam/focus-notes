import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

// The renderer: the same web build every shell runs.
export default defineConfig({
  root: "src/renderer",
  base: "./",
  // FOCUS_NOTES_DEBUG_CLASSES=1 keeps readable class names (Button_base__…), so an audit finding names its component.
  plugins: [react(), vanillaExtractPlugin(process.env.FOCUS_NOTES_DEBUG_CLASSES === "1" ? { identifiers: "debug" } : {})],
  build: { outDir: "../../out/renderer", emptyOutDir: true, target: "chrome140", sourcemap: true },
  // The search index's worker (WP-4.1) is a module, loaded from the app's own files.
  worker: { format: "es" },
});