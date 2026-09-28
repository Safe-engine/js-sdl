/**
 * Helpers for coarse performance regression tests.
 *
 * Budgets are deliberately generous (several times the measured time on a
 * laptop) so the suite catches algorithmic regressions (accidental O(n²),
 * per-frame allocation storms) without flaking on slow CI machines. Set
 * PERF_BUDGET_SCALE to loosen or tighten every budget at once, and PERF_LOG=1
 * to print the measured medians.
 */
// `process` is absent when this runs under QuickJS on a device (device-bench.ts).
const env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env
const budgetScale = Number(env.PERF_BUDGET_SCALE ?? 1) || 1
const now = typeof performance === 'undefined' ? () => Date.now() : () => performance.now()

/** Median wall time in milliseconds of `run`, after `warmup` untimed calls. */
export function measure(run: () => void, { warmup = 3, samples = 7 } = {}): number {
  for (let i = 0; i < warmup; i++) run()
  const times: number[] = []
  for (let i = 0; i < samples; i++) {
    const start = now()
    run()
    times.push(now() - start)
  }
  times.sort((a, b) => a - b)
  return times[times.length >> 1]
}

/** The budget in milliseconds, scaled by PERF_BUDGET_SCALE. */
export function budget(ms: number): number {
  return ms * budgetScale
}

export function report(label: string, ms: number): void {
  if (env.PERF_LOG) console.log(`[perf] ${label}: ${ms.toFixed(3)} ms`)
}

/** Deterministic PRNG so workloads are identical between runs. */
export function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}
