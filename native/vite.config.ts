import { spawn } from 'child_process'
import path from 'path'
import { defineConfig } from 'vite'
import { sdlTsxTransform } from '../web/vite-plugin-sdl-tsx'

function runSdl3jsPlugin() {
  let child: ReturnType<typeof spawn> | null = null
  let isWatch = false

  const killChild = () => {
    if (child) {
      child.kill()
      child = null
    }
  }

  process.on('exit', killChild)
  process.on('SIGINT', () => {
    killChild()
    process.exit()
  })
  process.on('SIGTERM', () => {
    killChild()
    process.exit()
  })

  return {
    name: 'run-sdl3js',
    configResolved(config: any) {
      isWatch = !!config.build.watch
    },
    writeBundle() {
      if (!isWatch) return

      if (child) {
        console.log('[run-sdl3js] Stopping previous sdl3js process...')
        killChild()
      }

      console.log('[run-sdl3js] Starting ./build/sdl3js...')
      child = spawn('./build/sdl3js', [], { stdio: 'inherit' })

      child.on('error', (err) => {
        console.error('[run-sdl3js] Failed to start sdl3js:', err)
      })
    },
  }
}

// Vite lib-mode produces a single ESM bundle compatible with QuickJS-NG.
// Native modules are external — resolved at runtime by the C host.
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, '../src/main.ts'),
      formats: ['es'],
      fileName: () => 'main.js',
    },
    outDir: 'dist',
    target: 'esnext',
    minify: false,
    rollupOptions: {
      external: ['sdl3', 'box2d'],
    },
  },
  plugins: [sdlTsxTransform(), runSdl3jsPlugin()],
})
