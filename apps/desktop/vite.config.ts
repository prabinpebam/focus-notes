import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

// The renderer: the same web build every shell runs.
export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react(), vanillaExtractPlugin()],
  build: { outDir: "../../out/renderer", emptyOutDir: true, target: "chrome140", sourcemap: true },
});