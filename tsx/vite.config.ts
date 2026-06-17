import { defineConfig } from "vite";
import { sdlTsxTransform } from "./vite-plugin-sdl-tsx";

const root = new URL(".", import.meta.url).pathname;

export default defineConfig({
  root,
  publicDir: new URL("../res", import.meta.url).pathname,
  plugins: [sdlTsxTransform()],
  resolve: {
    alias: {
      "#engine/physics": new URL("../src/engine/physics/Planck.ts", import.meta.url).pathname,
      box2d: new URL("../web/box2d.ts", import.meta.url).pathname,
      sdl3: new URL("../web/sdl3.ts", import.meta.url).pathname,
    },
  },
  build: {
    outDir: new URL("../dist-web", import.meta.url).pathname,
    emptyOutDir: true,
    target: "es2020",
    minify: false,
  },
});
