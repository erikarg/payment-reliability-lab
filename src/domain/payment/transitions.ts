import { type PaymentState, isTerminal, progressOf } from './states'

/**
 * The single source of truth for lifecycle movement. Nothing else in the
 * codebase is allowed to change a payment's state, and every state change has
 * to be expressible as one entry in this table.
 *
 * Note there are no self-transitions. An event that does not move the payment
 * (a scheduled retry, an inconclusive reconciliation) simply carries no target
 * state and is appended to the log as-is.
 */
export const ALLOWED_TRANSITIONS: Record<PaymentState, readonly PaymentState[]> = {
  CREATED: ['PROCESSING'],
  PROCESSING: ['AUTHORIZED', 'DECLINED', 'FAILED'],
  AUTHORIZED: ['CAPTURED', 'CAPTURE_PENDING', 'FAILED'],
  CAPTURE_PENDING: ['CAPTURED', 'FAILED'],
  CAPTURED: ['COMPLETED'],
  COMPLETED: [],
  DECLINED: [],
  FAILED: [],
}

export type TransitionVerdict =
  /** The move is legal and the payment advances. */
  | { outcome: 'allowed' }
  /** Already where the caller wanted it. Safe to acknowledge and do nothing. */
  | { outcome: 'already-in-state' }
  /** A late message aiming at a stage the payment has already passed. */
  | { outcome: 'out-of-order' }
  /** Nonsense for this stage, or the payment is already finished. */
  | { outcome: 'invalid'; reason: 'terminal' | 'not-allowed' }

export function evaluateTransition(from: PaymentState, to: PaymentState): TransitionVerdict {
  if (from === to) return { outcome: 'already-in-state' }

  if (ALLOWED_TRANSITIONS[from].includes(to)) return { outcome: 'allowed' }

  if (progressOf(to) < progressOf(from)) return { outcome: 'out-of-order' }

  if (isTerminal(from)) return { outcome: 'invalid', reason: 'terminal' }

  return { outcome: 'invalid', reason: 'not-allowed' }
}

export function canTransition(from: PaymentState, to: PaymentState): boolean {
  return evaluateTransition(from, to).outcome === 'allowed'
}
