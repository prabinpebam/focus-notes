import { defineConfig } from "vite";

// The publisher's command line for the released web app bundle (WP-5.5, D-98): packages/seal's
// cli.ts as one self-contained Node module, dist-publish/cli.mjs. The release puts it in the
// bundle's publish/ folder beside the page renderer (vite.reader.config.ts), so a template
// instance's Deploy app workflow runs it with nothing to install.
export default defineConfig({
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: "../../packages/seal/src/cli.ts",
    outDir: "dist-publish",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: { output: { entryFileNames: "cli.mjs" } },
  },
});
