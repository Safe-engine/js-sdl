/**
 * Helpers for coarse performance regression tests.
 *
 * Budgets are deliberately generous (several times the measured time on a
 * laptop) so the suite catches algorithmic regressions (accidental O(n²),
 * per-frame allocation storms) without flaking on slow CI machines. Set
 * PERF_BUDGET_SCALE to loosen or tighten every budget at once, and PERF_LOG=1
 * to print the measured medians.
 */
const budgetScale = Number(process.env.PERF_BUDGET_SCALE ?? 1) || 1

/** Median wall time in milliseconds of `run`, after `warmup` untimed calls. */
export function measure(run: () => void, { warmup = 3, samples = 7 } = {}): number {
  for (let i = 0; i < warmup; i++) run()
  const times: number[] = []
  for (let i = 0; i < samples; i++) {
    const start = performance.now()
    run()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return times[times.length >> 1]
}

/** The budget in milliseconds, scaled by PERF_BUDGET_SCALE. */
export function budget(ms: number): number {
  return ms * budgetScale
}

export function report(label: string, ms: number): void {
  if (process.env.PERF_LOG) console.log(`[perf] ${label}: ${ms.toFixed(3)} ms`)
}

/** Deterministic PRNG so workloads are identical between runs. */
export function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}
