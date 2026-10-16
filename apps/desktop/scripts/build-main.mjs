// Builds the main process (ESM) and the sandboxed preload (CommonJS, as sandboxing requires).
import { build } from "vite";
import { copyFileSync } from "node:fs";
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
// The MCP server (WP-7.2, D-159): a Node entry beside the main process, started on stdio.
await one("src/mcp/main.ts", "es", "mcp.mjs", false);
// The command-line tool under Node (WP-7.3, D-165); the packaged app runs it with --cli.
await one("src/cli/main.ts", "es", "cli.mjs", false);
// The window's icon (the taskbar's, on Windows and Linux), beside the main process in the package.
copyFileSync(join(root, "build", "icon.png"), join(root, "out", "main", "icon.png"));
console.log("Main and preload built.");