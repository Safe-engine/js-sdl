import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(__dirname, "../res"),
  esbuild: {
    jsxFactory: "jsx",
  },
  resolve: {
    alias: {
      sdl3: path.resolve(__dirname, "../web/sdl3.ts"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../dist-web"),
    emptyOutDir: true,
    target: "es2020",
  },
});
