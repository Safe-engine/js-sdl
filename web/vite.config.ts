import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(__dirname, "../res"),
  resolve: {
    alias: {
      "#engine/physics": path.resolve(__dirname, "../src/engine/physics/Planck.ts"),
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
