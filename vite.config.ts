import { defineConfig } from "vite";
import path from "path";
import { safexTransform } from 'vite-plugin-safex-transform'

// Vite lib-mode produces a single ESM bundle compatible with QuickJS-NG.
// Native module "sdl3" is external — resolved at runtime by the C host.
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir: "dist",
    target: "esnext",
    minify: false,
    rollupOptions: {
      external: ["sdl3"],
    },
  },
  plugins: [safexTransform()],
});
