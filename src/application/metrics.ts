import type { PaymentAggregate } from '@/domain/payment/reducer'
import { isInFlight, isTerminal } from '@/domain/payment/states'

export interface SessionMetrics {
  readonly total: number
  readonly completed: number
  readonly failed: number
  readonly declined: number
  readonly pendingReconciliation: number
  readonly inFlight: number
  /**
   * Measured over settled payments only. A payment still in flight is not a
   * failure yet, and counting it as one would make the rate drift while the
   * screen is being watched.
   */
  readonly successRate: number | null
  readonly retries: number
  readonly fallbacks: number
  readonly duplicateWebhooks: number
}

export const EMPTY_METRICS: SessionMetrics = {
  total: 0,
  completed: 0,
  failed: 0,
  declined: 0,
  pendingReconciliation: 0,
  inFlight: 0,
  successRate: null,
  retries: 0,
  fallbacks: 0,
  duplicateWebhooks: 0,
}

export function computeMetrics(aggregates: readonly PaymentAggregate[]): SessionMetrics {
  let completed = 0
  let failed = 0
  let declined = 0
  let pendingReconciliation = 0
  let inFlight = 0
  let settled = 0
  let retries = 0
  let fallbacks = 0
  let duplicateWebhooks = 0

  for (const aggregate of aggregates) {
    if (aggregate.state === 'COMPLETED') completed += 1
    if (aggregate.state === 'FAILED') failed += 1
    if (aggregate.state === 'DECLINED') declined += 1
    if (aggregate.state === 'CAPTURE_PENDING') pendingReconciliation += 1
    if (isInFlight(aggregate.state)) inFlight += 1
    if (isTerminal(aggregate.state)) settled += 1

    retries += aggregate.retries
    fallbacks += aggregate.fallbacks
    duplicateWebhooks += aggregate.duplicateWebhooks
  }

  return {
    total: aggregates.length,
    completed,
    failed,
    declined,
    pendingReconciliation,
    inFlight,
    successRate: settled === 0 ? null : completed / settled,
    retries,
    fallbacks,
    duplicateWebhooks,
  }
}
