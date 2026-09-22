import type { ProviderFailureKind } from './provider'

/**
 * What the orchestrator is allowed to conclude from each kind of failure.
 *
 * `indeterminate` is the one that matters most: on a timeout the request may
 * well have been processed, so the work is not known to be undone and a naive
 * "just try again" can double-charge. That is why retrying is only safe behind
 * an idempotency key.
 */
export interface FailurePolicy {
  /** Worth attempting the same provider again. */
  readonly retryable: boolean
  /** The call may have succeeded on the provider's side despite the error. */
  readonly indeterminate: boolean
  /** The provider is considered down; move to the fallback instead of retrying. */
  readonly triggersFallback: boolean
}

export const FAILURE_POLICY: Record<ProviderFailureKind, FailurePolicy> = {
  timeout: {
    retryable: true,
    indeterminate: true,
    triggersFallback: false,
  },
  'server-error': {
    retryable: true,
    indeterminate: false,
    triggersFallback: false,
  },
  unavailable: {
    retryable: false,
    indeterminate: false,
    triggersFallback: true,
  },
}

export function policyFor(kind: ProviderFailureKind): FailurePolicy {
  return FAILURE_POLICY[kind]
}
