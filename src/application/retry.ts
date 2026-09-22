import type { Rng } from './ports'

export const RETRY_POLICY = {
  /** Attempts per provider, the first one included. */
  maxAttempts: 3,
  baseDelayMs: 100,
  factor: 2,
} as const

/**
 * Exponential backoff with equal jitter: half the window is fixed, half is
 * random. Full jitter would be a better citizen under real load, but it
 * regularly produces near-zero waits, and a backoff nobody can see teaches
 * nobody anything.
 *
 * Jitter is drawn from the seeded stream, so a seed reproduces the exact delays.
 */
export function backoffDelayMs(attempt: number, rng: Rng): number {
  const window = RETRY_POLICY.baseDelayMs * Math.pow(RETRY_POLICY.factor, attempt - 1)
  return Math.round(window / 2 + rng.next() * (window / 2))
}
