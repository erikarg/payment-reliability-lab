import { describe, expect, it } from 'vitest'
import { WEBHOOK_TARGET_STATE } from '@/domain/events/webhook'
import {
  buildProviderPayload,
  isProviderId,
  normalizeProviderPayload,
} from '@/infrastructure/webhooks/payloads'
import { signPayload, verifySignature } from '@/infrastructure/webhooks/signature'
import { createHarness } from './harness'

const PAYMENT = { amountCents: 24_900, currency: 'BRL', primaryProvider: 'AcquirerA' } as const

const emission = {
  provider: 'AcquirerA',
  kind: 'payment.settled',
  transactionId: 'txn_1',
  providerEventId: 'whk_1',
  amountCents: 24_900,
  occurredAt: 1_700_000_000_000,
} as const

describe('webhook signatures', () => {
  it('accepts a payload signed with the shared secret', async () => {
    const body = buildProviderPayload(emission)
    expect(await verifySignature(body, await signPayload(body))).toBe(true)
  })

  it('rejects a payload whose body was altered after signing', async () => {
    const body = buildProviderPayload(emission)
    const signature = await signPayload(body)
    const tampered = body.replace('24900', '1')

    expect(await verifySignature(tampered, signature)).toBe(false)
  })

  it('rejects a signature of the wrong length without comparing it', async () => {
    expect(await verifySignature(buildProviderPayload(emission), 'abc')).toBe(false)
  })
})

describe('webhook normalisation', () => {
  it('reads the format AcquirerA sends', () => {
    const body = JSON.parse(buildProviderPayload(emission))
    expect(body).toHaveProperty('event_type', 'payment.settled')

    expect(normalizeProviderPayload('AcquirerA', body)).toMatchObject({
      providerEventId: 'whk_1',
      transactionId: 'txn_1',
      kind: 'payment.settled',
    })
  })

  it('reads the entirely different format AcquirerB sends', () => {
    const body = JSON.parse(buildProviderPayload({ ...emission, provider: 'AcquirerB' }))
    expect(body).toHaveProperty('kind', 'SETTLED')
    expect(body).not.toHaveProperty('event_type')

    expect(normalizeProviderPayload('AcquirerB', body)).toMatchObject({
      providerEventId: 'whk_1',
      transactionId: 'txn_1',
      kind: 'payment.settled',
    })
  })

  it('refuses anything it cannot recognise', () => {
    expect(normalizeProviderPayload('AcquirerA', { event_type: 'nonsense' })).toBeNull()
    expect(normalizeProviderPayload('AcquirerA', null)).toBeNull()
    expect(normalizeProviderPayload('AcquirerB', { id: 1, kind: 'SETTLED' })).toBeNull()
    expect(isProviderId('AcquirerC')).toBe(false)
  })

  it('maps each webhook kind to the stage it claims', () => {
    expect(WEBHOOK_TARGET_STATE['payment.settled']).toBe('COMPLETED')
    expect(WEBHOOK_TARGET_STATE['authorization.succeeded']).toBe('AUTHORIZED')
  })
})

describe('duplicate delivery', () => {
  it('processes the first delivery and ignores the redelivery', async () => {
    const harness = createHarness({ chaos: { duplicateWebhook: true } })
    const tx = await harness.orchestrator.run(PAYMENT)
    const types = harness.types(tx)

    // Both arrivals are logged — pretending the second never happened would
    // hide the very thing idempotency is there to handle.
    expect(types.filter((type) => type === 'WEBHOOK_RECEIVED')).toHaveLength(2)
    expect(types.filter((type) => type === 'PAYMENT_COMPLETED')).toHaveLength(1)
    expect(types.filter((type) => type === 'WEBHOOK_DUPLICATE_IGNORED')).toHaveLength(1)

    const aggregate = harness.aggregate(tx)
    expect(aggregate.state).toBe('COMPLETED')
    expect(aggregate.duplicateWebhooks).toBe(1)
    expect(aggregate.processedWebhookIds).toHaveLength(1)
  })

  it('recognises the redelivery by its event id', async () => {
    const harness = createHarness({ chaos: { duplicateWebhook: true } })
    const tx = await harness.orchestrator.run(PAYMENT)

    const received = harness.events(tx).filter((event) => event.type === 'WEBHOOK_RECEIVED')
    expect(received[0].data.providerEventId).toBe(received[1].data.providerEventId)
  })
})

describe('out-of-order delivery', () => {
  it('ignores a late webhook that would move a settled payment backwards', async () => {
    const harness = createHarness({ chaos: { delayedWebhook: true } })
    const tx = await harness.orchestrator.run(PAYMENT)
    const events = harness.events(tx)

    const completedAt = events.findIndex((event) => event.type === 'PAYMENT_COMPLETED')
    const ignoredAt = events.findIndex((event) => event.type === 'WEBHOOK_IGNORED')

    expect(completedAt).toBeGreaterThan(-1)
    // The late authorization webhook has to arrive *after* settlement for this
    // to be testing anything at all.
    expect(ignoredAt).toBeGreaterThan(completedAt)

    const ignored = events[ignoredAt]
    expect(ignored.data.reason).toBe('out-of-order')
    expect(ignored.data.reportedState).toBe('AUTHORIZED')
    expect(ignored.data.currentState).toBe('COMPLETED')

    expect(harness.aggregate(tx).state).toBe('COMPLETED')
  })

  it('keeps the local state correct while the late event is still in flight', async () => {
    const harness = createHarness({ chaos: { delayedWebhook: true } })
    const tx = await harness.orchestrator.run(PAYMENT)

    // Settlement still happened on time; lateness cost the payment nothing.
    expect(harness.types(tx).filter((type) => type === 'PAYMENT_COMPLETED')).toHaveLength(1)
    expect(harness.aggregate(tx).state).toBe('COMPLETED')
  })
})
