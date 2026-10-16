import { join } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

// The web app (D-80): relative paths, so it works at any GitHub Pages address
// (https://<you>.github.io/<repository>/) without knowing the repository's name.
//
// Where the instance's notes and sealed files are, from the app's page: beside it in dist/ (a template
// instance, where the app is the site), or the folder above in dist-app/, built with `--mode app` for
// this repository's own site, where the app is at /app/ and the product site at the root (D-167).
export default defineConfig(({ mode }) => {
  const app = mode === "app";
  // The demo (WP-10.6, D-177): the same app on sample notes kept in the browser, built to dist-demo/
  // and placed at /demo/ by tools/site/build.mjs. It reads nothing from the site.
  const demo = mode === "demo";
  return {
    root: "src",
    base: "./",
    define: { "import.meta.env.FOCUS_NOTES_SITE_ROOT": JSON.stringify(app ? "../" : "./"), "import.meta.env.FOCUS_NOTES_DEMO": JSON.stringify(demo) },
    plugins: [react(), vanillaExtractPlugin()],
    // Fonts and icons stay files (font-src 'self'), never inlined as data URIs.
    // Two pages: the app, and the share reader at s/ (WP-5.4), which loads only what it uses (PRF-05).
    build: {
      outDir: app ? "../dist-app" : demo ? "../dist-demo" : "../dist", emptyOutDir: true, target: "es2022", sourcemap: false, assetsInlineLimit: 0,
      rollupOptions: { input: { main: join(import.meta.dirname, "src", "index.html"), share: join(import.meta.dirname, "src", "s", "index.html") } },
    },
    // The search index's worker (WP-4.1) is a module file of the site, never a blob or data URL.
    worker: { format: "es" },
  };
});