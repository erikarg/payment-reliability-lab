import { describe, expect, it } from 'vitest'
import { type CreateEventInput, createEvent } from '@/domain/events/event'
import { applyEvent, genesis, reduce } from '@/domain/payment/reducer'

const TX = 'txn_test'

let sequence = 0

function event(input: Partial<CreateEventInput> & Pick<CreateEventInput, 'type'>) {
  sequence += 1
  return createEvent({
    id: input.id ?? `evt_${sequence}`,
    sequence: input.sequence ?? sequence,
    transactionId: input.transactionId ?? TX,
    occurredAt: input.occurredAt ?? 1_000 + sequence,
    source: input.source ?? 'orchestrator',
    ...input,
  })
}

function created(data: Record<string, unknown> = {}) {
  return event({
    type: 'PAYMENT_CREATED',
    data: { amountCents: 24_900, currency: 'BRL', provider: 'AcquirerA', idempotencyKey: 'idk_1', ...data },
  })
}

describe('payment reducer', () => {
  it('derives the payment from its log rather than from a stored status', () => {
    const { aggregate, rejected } = reduce([
      created(),
      event({ type: 'AUTHORIZATION_REQUESTED', transitionsTo: 'PROCESSING' }),
      event({ type: 'PAYMENT_AUTHORIZED', transitionsTo: 'AUTHORIZED', data: { authorizationId: 'auth_1', attempt: 1 } }),
      event({ type: 'PAYMENT_CAPTURED', transitionsTo: 'CAPTURED', data: { captureId: 'cap_1' } }),
      event({ type: 'PAYMENT_COMPLETED', transitionsTo: 'COMPLETED' }),
    ])

    expect(rejected).toHaveLength(0)
    expect(aggregate?.state).toBe('COMPLETED')
    expect(aggregate?.authorizationId).toBe('auth_1')
    expect(aggregate?.captureId).toBe('cap_1')
    expect(aggregate?.amountCents).toBe(24_900)
  })

  it('reconstructs the same payment from a persisted log, in any stored order', () => {
    const log = [
      created(),
      event({ type: 'AUTHORIZATION_REQUESTED', transitionsTo: 'PROCESSING' }),
      event({ type: 'PAYMENT_AUTHORIZED', transitionsTo: 'AUTHORIZED', data: { authorizationId: 'auth_1' } }),
      event({ type: 'PAYMENT_CAPTURED', transitionsTo: 'CAPTURED', data: { captureId: 'cap_1' } }),
    ]

    const reloaded = reduce([...log].reverse())

    expect(reloaded.aggregate).toEqual(reduce(log).aggregate)
    expect(reloaded.aggregate?.state).toBe('CAPTURED')
  })

  it('counts retries, failovers and duplicate webhooks off the log', () => {
    const { aggregate } = reduce([
      created(),
      event({ type: 'AUTHORIZATION_REQUESTED', transitionsTo: 'PROCESSING' }),
      event({ type: 'PROVIDER_TIMEOUT', source: 'acquirer', data: { attempt: 1 } }),
      event({ type: 'RETRY_SCHEDULED', data: { nextAttempt: 2 } }),
      event({ type: 'PROVIDER_UNAVAILABLE', source: 'acquirer', data: { attempt: 2 } }),
      event({ type: 'FALLBACK_PROVIDER_SELECTED', data: { provider: 'AcquirerB' } }),
      event({ type: 'PAYMENT_AUTHORIZED', transitionsTo: 'AUTHORIZED', data: { attempt: 3, authorizationId: 'auth_2' } }),
    ])

    expect(aggregate?.retries).toBe(1)
    expect(aggregate?.fallbacks).toBe(1)
    expect(aggregate?.attempts).toBe(3)
    expect(aggregate?.provider).toBe('AcquirerB')
    expect(aggregate?.primaryProvider).toBe('AcquirerA')
  })

  it('rejects a transition the table forbids instead of applying it', () => {
    const base = reduce([created(), event({ type: 'AUTHORIZATION_REQUESTED', transitionsTo: 'PROCESSING' })])
    const result = applyEvent(base.aggregate!, event({ type: 'PAYMENT_COMPLETED', transitionsTo: 'COMPLETED' }))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.verdict.outcome).toBe('invalid')
  })

  it('refuses a late event that would move a finished payment backwards', () => {
    const settled = reduce([
      created(),
      event({ type: 'AUTHORIZATION_REQUESTED', transitionsTo: 'PROCESSING' }),
      event({ type: 'PAYMENT_AUTHORIZED', transitionsTo: 'AUTHORIZED' }),
      event({ type: 'PAYMENT_CAPTURED', transitionsTo: 'CAPTURED' }),
      event({ type: 'PAYMENT_COMPLETED', transitionsTo: 'COMPLETED' }),
    ])

    const late = applyEvent(settled.aggregate!, event({ type: 'PAYMENT_AUTHORIZED', transitionsTo: 'AUTHORIZED' }))

    expect(late.ok).toBe(false)
    if (!late.ok) expect(late.verdict.outcome).toBe('out-of-order')
    expect(settled.aggregate?.state).toBe('COMPLETED')
  })

  it('survives a corrupted log by dropping only what it cannot apply', () => {
    const { aggregate, rejected } = reduce([
      created(),
      event({ type: 'AUTHORIZATION_REQUESTED', transitionsTo: 'PROCESSING' }),
      event({ type: 'PAYMENT_COMPLETED', transitionsTo: 'COMPLETED' }),
      event({ type: 'PAYMENT_AUTHORIZED', transitionsTo: 'AUTHORIZED', data: { authorizationId: 'auth_9' } }),
    ])

    expect(rejected).toHaveLength(1)
    expect(aggregate?.state).toBe('AUTHORIZED')
  })

  it('needs a genesis event before anything else counts', () => {
    const { aggregate, rejected } = reduce([event({ type: 'PAYMENT_AUTHORIZED', transitionsTo: 'AUTHORIZED' })])

    expect(aggregate).toBeNull()
    expect(rejected).toHaveLength(1)
    expect(genesis(event({ type: 'AUTHORIZATION_REQUESTED' }))).toBeNull()
  })

  it('rebuilds the set of processed webhook ids so dedup survives a reload', () => {
    const { aggregate } = reduce([
      created(),
      event({ type: 'AUTHORIZATION_REQUESTED', transitionsTo: 'PROCESSING' }),
      event({ type: 'PAYMENT_AUTHORIZED', transitionsTo: 'AUTHORIZED' }),
      event({ type: 'PAYMENT_CAPTURED', transitionsTo: 'CAPTURED' }),
      event({ type: 'WEBHOOK_RECEIVED', source: 'webhook-gateway', data: { providerEventId: 'whk_1' } }),
      event({ type: 'PAYMENT_COMPLETED', transitionsTo: 'COMPLETED' }),
    ])

    expect(aggregate?.processedWebhookIds).toEqual(['whk_1'])
  })
})
