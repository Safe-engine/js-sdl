import path from "node:path";
import { defineConfig } from "vite";
import { safexTransform } from 'vite-plugin-safex-transform';

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
  plugins: [safexTransform()],
});
