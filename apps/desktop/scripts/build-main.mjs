// Builds the main process (ESM) and the sandboxed preload (CommonJS, as sandboxing requires).
import { build } from "vite";
import { builtinModules } from "node:module";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const external = ["electron", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)];
const one = (entry, format, file, empty) =>
  build({
    root,
    configFile: false,
    logLevel: "warn",
    build: {
      outDir: "out/main",
      emptyOutDir: empty,
      target: "node22",
      minify: false,
      sourcemap: true,
      ssr: true,
      rollupOptions: { external, input: join(root, entry), output: { format, entryFileNames: file } },
    },
  });
await one("src/main/main.ts", "es", "main.mjs", true);
await one("src/main/preload.ts", "cjs", "preload.cjs", false);
console.log("Main and preload built.");