import { describe, expect, it } from 'vitest'
import { computeMetrics } from '@/application/metrics'
import type { PaymentAggregate } from '@/domain/payment/reducer'
import type { PaymentState } from '@/domain/payment/states'

function aggregate(state: PaymentState, extra: Partial<PaymentAggregate> = {}): PaymentAggregate {
  return {
    transactionId: 'txn',
    state,
    amountCents: 1000,
    currency: 'BRL',
    primaryProvider: 'AcquirerA',
    provider: 'AcquirerA',
    authorizationId: null,
    captureId: null,
    idempotencyKey: 'idk',
    attempts: 1,
    retries: 0,
    fallbacks: 0,
    duplicateWebhooks: 0,
    reconciliationAttempts: 0,
    processedWebhookIds: [],
    lastFailureEventId: null,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  }
}

describe('session metrics', () => {
  it('has no success rate before anything has settled', () => {
    expect(computeMetrics([]).successRate).toBeNull()
    expect(computeMetrics([aggregate('PROCESSING')]).successRate).toBeNull()
  })

  it('measures the success rate over settled payments only', () => {
    const metrics = computeMetrics([
      aggregate('COMPLETED'),
      aggregate('FAILED'),
      // Neither of these has settled, so neither should drag the rate down.
      aggregate('PROCESSING'),
      aggregate('CAPTURE_PENDING'),
    ])

    expect(metrics.successRate).toBe(0.5)
    expect(metrics.total).toBe(4)
    expect(metrics.inFlight).toBe(1)
    expect(metrics.pendingReconciliation).toBe(1)
  })

  it('counts a decline separately from an infrastructure failure', () => {
    const metrics = computeMetrics([aggregate('DECLINED'), aggregate('FAILED')])

    expect(metrics.declined).toBe(1)
    expect(metrics.failed).toBe(1)
    expect(metrics.successRate).toBe(0)
  })

  it('totals reliability counters across the session', () => {
    const metrics = computeMetrics([
      aggregate('COMPLETED', { retries: 2, fallbacks: 1, duplicateWebhooks: 1 }),
      aggregate('COMPLETED', { retries: 1, duplicateWebhooks: 2 }),
    ])

    expect(metrics.retries).toBe(3)
    expect(metrics.fallbacks).toBe(1)
    expect(metrics.duplicateWebhooks).toBe(3)
  })
})
