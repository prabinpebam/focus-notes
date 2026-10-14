import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

// The publisher's page renderer (WP-5.1): one self-contained Node module, dist-reader/render.mjs, and
// the published pages' stylesheet and fonts in dist-reader/assets/. A template instance gets it in
// the released bundle's publish/ folder (WP-5.5), so nothing is external.
export default defineConfig({
  base: "./",
  plugins: [react(), vanillaExtractPlugin()],
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: "reader/render.ts",
    outDir: "dist-reader",
    emptyOutDir: true,
    ssrEmitAssets: true,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    target: "node22",
    rollupOptions: { output: { entryFileNames: "render.mjs" } },
  },
});
