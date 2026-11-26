import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

// The publisher's page renderer (WP-5.1): one self-contained Node module, dist-reader/render.mjs, and
// the published pages' stylesheet and fonts in dist-reader/assets/. A template instance gets it in
// the released bundle's publish/ folder (WP-5.5), so nothing is external.
export default defineConfig({
  base: "./",
  plugins: [react(), vanillaExtractPlugin(), {
    // An SSR build ignores base "./" for the stylesheet's fonts (url(/assets/…)), which 404 on a project's Pages site
    // (/<repository>/). The stylesheet sits beside them in assets/, so they're relative to it (D-430).
    name: "reader-relative-font-urls",
    enforce: "post",
    writeBundle(options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== "asset" || !file.fileName.endsWith(".css")) continue;
        const path = join(options.dir!, file.fileName);
        writeFileSync(path, readFileSync(path, "utf8").replaceAll("url(/assets/", "url(./"));
      }
    },
  }],
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
