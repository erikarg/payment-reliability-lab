import { describe, expect, it } from 'vitest'
import { PAYMENT_STATES, TERMINAL_STATES, isTerminal, progressOf } from '@/domain/payment/states'
import { ALLOWED_TRANSITIONS, canTransition, evaluateTransition } from '@/domain/payment/transitions'

describe('payment transitions', () => {
  it('allows the full successful lifecycle', () => {
    const path = ['CREATED', 'PROCESSING', 'AUTHORIZED', 'CAPTURED', 'COMPLETED'] as const

    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i], path[i + 1])).toBe(true)
    }
  })

  it('refuses to skip authorization', () => {
    expect(canTransition('PROCESSING', 'CAPTURED')).toBe(false)
    expect(canTransition('CREATED', 'COMPLETED')).toBe(false)
  })

  it('treats every terminal state as final', () => {
    for (const terminal of TERMINAL_STATES) {
      expect(ALLOWED_TRANSITIONS[terminal]).toHaveLength(0)

      for (const target of PAYMENT_STATES) {
        if (target === terminal) continue
        expect(canTransition(terminal, target)).toBe(false)
      }
    }
  })

  it('reports a backwards move as out of order rather than as nonsense', () => {
    expect(evaluateTransition('COMPLETED', 'AUTHORIZED')).toEqual({ outcome: 'out-of-order' })
    expect(evaluateTransition('CAPTURED', 'PROCESSING')).toEqual({ outcome: 'out-of-order' })
  })

  it('reports a repeated move as already-in-state, not as a failure', () => {
    expect(evaluateTransition('AUTHORIZED', 'AUTHORIZED')).toEqual({ outcome: 'already-in-state' })
  })

  it('explains why an impossible move was refused', () => {
    const verdict = evaluateTransition('PROCESSING', 'COMPLETED')
    expect(verdict.outcome).toBe('invalid')
    expect(verdict).toHaveProperty('reason')
  })

  it('never allows a transition that moves the payment backwards', () => {
    for (const from of PAYMENT_STATES) {
      for (const to of ALLOWED_TRANSITIONS[from]) {
        expect(progressOf(to)).toBeGreaterThan(progressOf(from))
      }
    }
  })

  it('separates a decline from an infrastructure failure', () => {
    expect(isTerminal('DECLINED')).toBe(true)
    expect(isTerminal('FAILED')).toBe(true)
    expect(canTransition('PROCESSING', 'DECLINED')).toBe(true)
    // A decline is the acquirer's answer about the money, so it can only be
    // reached from the authorization step — never from capture or later.
    expect(canTransition('AUTHORIZED', 'DECLINED')).toBe(false)
    expect(canTransition('CAPTURE_PENDING', 'DECLINED')).toBe(false)
  })
})
