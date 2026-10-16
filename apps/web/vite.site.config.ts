import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

// The product site's renderer (WP-10.1): one self-contained Node module, dist-site/render.mjs, and the
// site's stylesheet and fonts in dist-site/assets/, the way vite.reader.config.ts builds the public pages'.
export default defineConfig({
  base: "./",
  plugins: [react(), vanillaExtractPlugin()],
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: "site/render.ts",
    outDir: "dist-site",
    emptyOutDir: true,
    ssrEmitAssets: true,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    target: "node22",
    rollupOptions: { output: { entryFileNames: "render.mjs" } },
  },
});
