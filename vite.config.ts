import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(__dirname, 'res'),
  resolve: {
    alias: {
      box2d: path.resolve(__dirname, './engine/physics/box2d.ts'),
      sdl3: path.resolve(__dirname, './engine/sdl3.ts'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../dist'),
    emptyOutDir: true,
    target: 'es2020',
  },
  server: { port: 6428 },
})
