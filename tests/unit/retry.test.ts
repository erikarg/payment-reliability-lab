import { describe, expect, it } from 'vitest'
import { RETRY_POLICY, backoffDelayMs } from '@/application/retry'
import { createRng } from '@/infrastructure/rng'
import { scriptedRng } from './harness'

describe('retry backoff', () => {
  it('doubles the window on each attempt', () => {
    // The top of the jitter range is the full window, the bottom is half of it.
    const lowest = scriptedRng([0])
    const highest = scriptedRng([1])

    expect(backoffDelayMs(1, lowest)).toBe(50)
    expect(backoffDelayMs(1, highest)).toBe(100)
    expect(backoffDelayMs(2, lowest)).toBe(100)
    expect(backoffDelayMs(2, highest)).toBe(200)
    expect(backoffDelayMs(3, lowest)).toBe(200)
  })

  it('never returns the bare window, so clients do not retry in lockstep', () => {
    const rng = createRng(99)
    const delays = new Set(Array.from({ length: 50 }, () => backoffDelayMs(2, rng)))

    expect(delays.size).toBeGreaterThan(1)
  })

  it('produces the same delays for the same seed', () => {
    const first = Array.from({ length: 10 }, (_, i) => backoffDelayMs((i % 3) + 1, createRng(7)))
    const second = Array.from({ length: 10 }, (_, i) => backoffDelayMs((i % 3) + 1, createRng(7)))

    expect(first).toEqual(second)
  })

  it('keeps the budget small enough that a caller is not left waiting', () => {
    expect(RETRY_POLICY.maxAttempts).toBe(3)
  })
})
