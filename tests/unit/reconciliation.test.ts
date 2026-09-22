import { describe, expect, it } from 'vitest'
import type { ProviderRegistry } from '@/application/ports'
import { decide } from '@/domain/reconciliation/policy'
import type { PaymentProvider, StatusOutcome } from '@/domain/provider/provider'
import { createHarness } from './harness'

const PAYMENT = { amountCents: 24_900, currency: 'BRL', primaryProvider: 'AcquirerA' } as const

/**
 * A provider whose answers the test dictates. The real acquirers are exercised
 * elsewhere; here the point is what the orchestrator does with each answer, and
 * scripting a seeded RNG to produce them would obscure rather than clarify.
 */
function scriptedProvider(statuses: readonly StatusOutcome['status'][]): PaymentProvider {
  let queried = 0

  return {
    id: 'AcquirerA',
    authorize: async () => ({
      kind: 'ok',
      value: { decision: 'approved', authorizationId: 'auth_stub', declineReason: null, replayed: false },
      latencyMs: 1,
    }),
    // Always indeterminate, so every run lands in CAPTURE_PENDING.
    capture: async () => ({ kind: 'timeout', latencyMs: 1 }),
    getStatus: async () => {
      const status = statuses[Math.min(queried++, statuses.length - 1)]
      return {
        kind: 'ok',
        value: { status, captureId: status === 'captured' ? 'cap_stub' : null },
        latencyMs: 1,
      }
    },
    planWebhooks: ({ kind }) =>
      kind === 'payment.settled' ? [{ providerEventId: 'whk_stub', delayMs: 1 }] : [],
  }
}

function registryOf(provider: PaymentProvider): ProviderRegistry {
  return { get: () => provider, fallbackFor: () => null }
}

describe('reconciliation policy', () => {
  it('maps each provider answer to one decision', () => {
    expect(decide({ status: 'captured', captureId: 'cap_1' })).toEqual({
      kind: 'resolved',
      targetState: 'CAPTURED',
      captureId: 'cap_1',
    })
    expect(decide({ status: 'not-captured', captureId: null })).toEqual({
      kind: 'resolved',
      targetState: 'FAILED',
      captureId: null,
    })
    expect(decide({ status: 'unknown', captureId: null })).toEqual({ kind: 'inconclusive' })
  })

})

describe('running reconciliation', () => {
  it('recovers a payment the provider confirms it captured', async () => {
    const harness = createHarness({ registry: registryOf(scriptedProvider(['captured'])) })
    const tx = await harness.orchestrator.run(PAYMENT)
    expect(harness.aggregate(tx).state).toBe('CAPTURE_PENDING')

    await harness.orchestrator.reconcile(tx)

    const types = harness.types(tx)
    expect(types).toContain('RECONCILIATION_STARTED')
    expect(types).toContain('RECONCILIATION_RESOLVED')
    // Settlement still arrives by webhook, exactly as it would have.
    expect(types).toContain('PAYMENT_COMPLETED')
    expect(harness.aggregate(tx).state).toBe('COMPLETED')
  })

  it('fails a payment the provider confirms it never captured', async () => {
    const harness = createHarness({ registry: registryOf(scriptedProvider(['not-captured'])) })
    const tx = await harness.orchestrator.run(PAYMENT)

    await harness.orchestrator.reconcile(tx)

    expect(harness.aggregate(tx).state).toBe('FAILED')
    expect(harness.find(tx, 'RECONCILIATION_RESOLVED')?.data.resolvedTo).toBe('FAILED')
  })

  it('leaves the payment pending when the provider still does not know', async () => {
    const harness = createHarness({
      registry: registryOf(scriptedProvider(['unknown', 'unknown', 'captured'])),
    })
    const tx = await harness.orchestrator.run(PAYMENT)

    await harness.orchestrator.reconcile(tx)
    expect(harness.aggregate(tx).state).toBe('CAPTURE_PENDING')
    expect(harness.aggregate(tx).reconciliationAttempts).toBe(1)

    await harness.orchestrator.reconcile(tx)
    expect(harness.aggregate(tx).state).toBe('CAPTURE_PENDING')
    expect(harness.aggregate(tx).reconciliationAttempts).toBe(2)

    // Asking again is always allowed, and eventually the provider answers.
    await harness.orchestrator.reconcile(tx)
    expect(harness.aggregate(tx).state).toBe('COMPLETED')
  })

  it('treats a failed status query as inconclusive, never as a failure', async () => {
    const provider: PaymentProvider = {
      ...scriptedProvider(['unknown']),
      getStatus: async () => ({ kind: 'timeout', latencyMs: 1 }),
    }
    const harness = createHarness({ registry: registryOf(provider) })
    const tx = await harness.orchestrator.run(PAYMENT)

    await harness.orchestrator.reconcile(tx)

    expect(harness.aggregate(tx).state).toBe('CAPTURE_PENDING')
    expect(harness.types(tx)).toContain('RECONCILIATION_INCONCLUSIVE')
  })

  it('does nothing to a payment that is not pending', async () => {
    const harness = createHarness()
    const tx = await harness.orchestrator.run(PAYMENT)
    const before = harness.events(tx).length

    await harness.orchestrator.reconcile(tx)

    expect(harness.events(tx)).toHaveLength(before)
    expect(harness.aggregate(tx).state).toBe('COMPLETED')
  })
})
