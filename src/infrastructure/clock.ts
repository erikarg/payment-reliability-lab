import type { Clock } from '@/application/ports'

/**
 * Real time, divided. The simulation computes honest delays — a 200ms backoff
 * is written as 200ms — and the speed setting decides how much of that a human
 * actually sits through. Nothing lies about its own timings.
 */
export function createClock(divisor: number): Clock {
  return {
    now: () => Date.now(),
    sleep: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, Math.max(0, ms / divisor))
      }),
  }
}
