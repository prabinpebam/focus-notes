import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

export default defineConfig({
  root: "src/gallery",
  base: "./",
  html: { cspNonce: "gallery-local-development" },
  plugins: [
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
});