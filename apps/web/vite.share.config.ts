import { join } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

// The share reader page for a project's paired public site (G2/G6): only s/index.html, its assets and the
// icon, built into dist-reader/site/ beside the page renderer, so the desktop app ships it and places it
// on the sealed site, where s/ reads the site's files from the folder above.
export default defineConfig({
  root: "src",
  base: "./",
  define: { "import.meta.env.FOCUS_NOTES_SITE_ROOT": JSON.stringify("./") },
  plugins: [react(), vanillaExtractPlugin()],
  build: {
    outDir: "../dist-reader/site", emptyOutDir: true, target: "es2022", sourcemap: false, assetsInlineLimit: 0,
    rollupOptions: { input: { share: join(import.meta.dirname, "src", "s", "index.html") } },
  },
});
