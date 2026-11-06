import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

export default defineConfig(({ command }) => ({
  root: "src/gallery",
  base: "./",
  ...(command === "serve" ? { html: { cspNonce: "gallery-local-development" } } : {}),
  plugins: [
    {
      name: "gallery-headless-icons",
      enforce: "pre",
      transform(code, id) {
        if (!id.replaceAll("\\", "/").endsWith("/packages/ui/src/icons.ts")) return;
        // Use Fluent's documented atomic headless imports, keeping its CSS external under the CSP.
        return code.replace(/import\s*\{([^}]+)\}\s*from\s*"@fluentui\/react-icons";/, (_, names: string) => {
          const imports = names.split(",").map(name => name.trim()).filter(Boolean).map(name => {
            const match = /^(.+?)(\d+)(Regular|Filled|Light|Color)$/.exec(name);
            if (!match) throw new Error(`Unsupported gallery icon import: ${name}`);
            const group = match[1]!.replace(/[a-z\d](?=[A-Z])|[a-zA-Z](?=\d)|[A-Z](?=[A-Z][a-z])/g, "$&-").toLowerCase();
            return `import { ${name} } from "@fluentui/react-icons/headless/svg/${group}";`;
          });
          return `import "@fluentui/react-icons/headless/styles.css";\n${imports.join("\n")}`;
        });
      },
    },
    react(), vanillaExtractPlugin(),
    {
      name: "gallery-development-csp",
      apply: "serve",
      transformIndexHtml: {
        order: "pre",
        handler: (html) => html.replace("script-src 'self'", "script-src 'self' 'nonce-gallery-local-development'").replace("style-src 'self'", "style-src 'self' 'nonce-gallery-local-development'"),
      },
    },
  ],
  build: { outDir: "../../out/gallery", emptyOutDir: true },
  server: { port: 5199, strictPort: true, host: "127.0.0.1" },
}));