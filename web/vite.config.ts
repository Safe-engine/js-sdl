import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(__dirname, "../res"),
  resolve: {
    alias: {
      box2d: path.resolve(__dirname, "./box2d.ts"),
      sdl3: path.resolve(__dirname, "./sdl3.ts"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../dist-web"),
    emptyOutDir: true,
    target: "es2020",
  },
});
