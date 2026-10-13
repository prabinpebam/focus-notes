import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

// The web app (D-80): relative paths, so it works at any GitHub Pages address
// (https://<you>.github.io/<repository>/) without knowing the repository's name.
export default defineConfig({
  root: "src",
  base: "./",
  plugins: [react(), vanillaExtractPlugin()],
  // Fonts and icons stay files (font-src 'self'), never inlined as data URIs.
  build: { outDir: "../dist", emptyOutDir: true, target: "es2022", sourcemap: false, assetsInlineLimit: 0 },
});
