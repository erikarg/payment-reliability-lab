import type { StatusOutcome } from '../provider/provider'

/**
 * Reconciliation exists because "we don't know" is a real answer. A capture
 * that timed out has not failed — treating it as failed is how you refund money
 * you did in fact take, or take money you told the customer you didn't.
 *
 * So the payment waits in CAPTURE_PENDING until the provider is willing to say
 * what actually happened, and an inconclusive answer leaves it waiting.
 */
export type ReconciliationDecision =
  | { readonly kind: 'resolved'; readonly targetState: 'CAPTURED'; readonly captureId: string | null }
  | { readonly kind: 'resolved'; readonly targetState: 'FAILED'; readonly captureId: null }
  | { readonly kind: 'inconclusive' }

export function decide(outcome: StatusOutcome): ReconciliationDecision {
  switch (outcome.status) {
    case 'captured':
      return { kind: 'resolved', targetState: 'CAPTURED', captureId: outcome.captureId }
    case 'not-captured':
      return { kind: 'resolved', targetState: 'FAILED', captureId: null }
    case 'unknown':
      return { kind: 'inconclusive' }
  }
}
