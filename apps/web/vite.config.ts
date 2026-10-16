import { join } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

// Where the instance's notes and sealed files are, from the app's page: beside it ("./", a template
// instance, where the app is the site), or the folder above ("../", this repository's site, where the
// app is at /app/ and the product site at the root, D-167). Only these two, always relative.
const siteRoot = process.env.FOCUS_NOTES_SITE_ROOT ?? "./";
if (siteRoot !== "./" && siteRoot !== "../") throw new Error(`FOCUS_NOTES_SITE_ROOT must be "./" or "../", not ${JSON.stringify(siteRoot)}`);

// The web app (D-80): relative paths, so it works at any GitHub Pages address
// (https://<you>.github.io/<repository>/) without knowing the repository's name.
export default defineConfig({
  root: "src",
  base: "./",
  define: { "import.meta.env.FOCUS_NOTES_SITE_ROOT": JSON.stringify(siteRoot) },
  plugins: [react(), vanillaExtractPlugin()],
  // Fonts and icons stay files (font-src 'self'), never inlined as data URIs.
  // Two pages: the app, and the share reader at s/ (WP-5.4), which loads only what it uses (PRF-05).
  build: {
    outDir: "../dist", emptyOutDir: true, target: "es2022", sourcemap: false, assetsInlineLimit: 0,
    rollupOptions: { input: { main: join(import.meta.dirname, "src", "index.html"), share: join(import.meta.dirname, "src", "s", "index.html") } },
  },
  // The search index's worker (WP-4.1) is a module file of the site, never a blob or data URL.
  worker: { format: "es" },
});
