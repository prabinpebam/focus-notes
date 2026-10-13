import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

export default defineConfig({
  root: "src/gallery",
  base: "./",
  plugins: [react(), vanillaExtractPlugin()],
  build: { outDir: "../../out/gallery", emptyOutDir: true },
  server: { port: 5199, strictPort: true, host: "127.0.0.1" },
});