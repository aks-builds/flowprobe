// packages/assertions/src/timing.ts
// Timing utilities for assertion evaluation — reserved for future latency assertions
export type TimingResult = {
  startMs: number
  endMs: number
  durationMs: number
}

export function startTimer(): number {
  return Date.now()
}

export function stopTimer(startMs: number): TimingResult {
  const endMs = Date.now()
  return { startMs, endMs, durationMs: endMs - startMs }
}
