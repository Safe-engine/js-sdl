/**
 * On-device benchmark entry: bundle this instead of src/main.ts to run the
 * performance workloads under QuickJS on a native build (desktop, Android,
 * iOS). Results are printed with console.log, prefixed with `[bench]`, e.g.
 * `adb logcat | grep '\[bench\]'`.
 */
import { measure } from './perf-utils'
import {
  cameraSceneTree,
  colliders,
  commandBufferGrowth,
  commandBufferSprites,
  matrixMultiply,
  sceneTree,
  tweens,
  type Workload,
} from './workloads'

const suite: Array<() => Workload> = [
  () => commandBufferSprites(),
  () => commandBufferGrowth(),
  () => sceneTree(),
  () => cameraSceneTree(),
  () => colliders(250),
  () => colliders(1000),
  () => tweens(),
  () => matrixMultiply(),
]

console.log('[bench] start')
for (const create of suite) {
  const workload = create()
  try {
    const ms = measure(() => workload.run(), workload)
    const ok = workload.verify() ? '' : ' (VERIFY FAILED)'
    console.log(`[bench] ${workload.name}: ${ms.toFixed(2)} ms${ok}`)
  } catch (error) {
    console.log(`[bench] ${workload.name}: ERROR ${error}`)
  } finally {
    workload.dispose?.()
  }
}
console.log('[bench] done')
