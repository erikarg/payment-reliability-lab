import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { type PaymentEvent, type PaymentEventType, createEvent } from '@/domain/events/event'
import { PAYMENT_STATES, type PaymentState, progressOf } from '@/domain/payment/states'
import { reduce } from '@/domain/payment/reducer'

const TRANSITION_EVENTS: { type: PaymentEventType; to: PaymentState }[] = [
  { type: 'AUTHORIZATION_REQUESTED', to: 'PROCESSING' },
  { type: 'PAYMENT_AUTHORIZED', to: 'AUTHORIZED' },
  { type: 'PAYMENT_DECLINED', to: 'DECLINED' },
  { type: 'PAYMENT_CAPTURED', to: 'CAPTURED' },
  { type: 'CAPTURE_MARKED_PENDING', to: 'CAPTURE_PENDING' },
  { type: 'PAYMENT_COMPLETED', to: 'COMPLETED' },
  { type: 'ALL_PROVIDERS_EXHAUSTED', to: 'FAILED' },
  { type: 'RECONCILIATION_RESOLVED', to: 'CAPTURED' },
]

const INFORMATIONAL: PaymentEventType[] = [
  'PROVIDER_TIMEOUT',
  'RETRY_SCHEDULED',
  'WEBHOOK_RECEIVED',
  'WEBHOOK_DUPLICATE_IGNORED',
  'RECONCILIATION_STARTED',
]

const TX = 'txn_property'

const arbitraryEvent = fc.oneof(
  fc.constantFrom(...TRANSITION_EVENTS).map((entry) => ({ type: entry.type, transitionsTo: entry.to })),
  fc.constantFrom(...INFORMATIONAL).map((type) => ({ type, transitionsTo: undefined })),
)

function build(
  entries: readonly { type: PaymentEventType; transitionsTo: PaymentState | undefined }[],
): PaymentEvent[] {
  const genesisEvent = createEvent({
    id: 'evt_genesis',
    sequence: 0,
    type: 'PAYMENT_CREATED',
    transactionId: TX,
    occurredAt: 0,
    source: 'orchestrator',
    data: { amountCents: 1000, currency: 'BRL', provider: 'AcquirerA', idempotencyKey: 'idk' },
  })

  return [
    genesisEvent,
    ...entries.map((entry, index) =>
      createEvent({
        id: `evt_${index}`,
        sequence: index + 1,
        type: entry.type,
        transactionId: TX,
        occurredAt: index + 1,
        source: 'orchestrator',
        ...(entry.transitionsTo ? { transitionsTo: entry.transitionsTo } : {}),
      }),
    ),
  ]
}

/**
 * The reducer is the only thing standing between a scrambled, duplicated,
 * hostile event stream and a payment in an impossible state. These properties
 * say what it must hold true for *any* such stream, not just the ones the
 * orchestrator happens to produce.
 */
describe('reducer invariants', () => {
  it('never produces a state outside the state machine', () => {
    fc.assert(
      fc.property(fc.array(arbitraryEvent, { maxLength: 40 }), (entries) => {
        const { aggregate } = reduce(build(entries))
        expect(PAYMENT_STATES).toContain(aggregate?.state)
      }),
    )
  })

  it('never moves a payment backwards, whatever order events arrive in', () => {
    fc.assert(
      fc.property(fc.array(arbitraryEvent, { maxLength: 40 }), (entries) => {
        const events = build(entries)
        let previous = -1

        for (let i = 1; i <= events.length; i += 1) {
          const { aggregate } = reduce(events.slice(0, i))
          const current = progressOf(aggregate!.state)
          expect(current).toBeGreaterThanOrEqual(previous)
          previous = current
        }
      }),
    )
  })

  it('ignores repeated events, so redelivery cannot change the outcome', () => {
    fc.assert(
      fc.property(fc.array(arbitraryEvent, { maxLength: 25 }), (entries) => {
        const events = build(entries)
        const duplicated = events.flatMap((event) => [event, event])

        expect(reduce(duplicated).aggregate).toEqual(reduce(events).aggregate)
      }),
    )
  })
})
