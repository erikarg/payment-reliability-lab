import type { PaymentState } from '../payment/states'

/**
 * Everything the system does is recorded as one of these. The event log is the
 * source of truth: the payment's state is always `reduce(events)`, never a
 * field someone remembered to update.
 */
export const PAYMENT_EVENT_TYPES = [
  'PAYMENT_CREATED',
  'AUTHORIZATION_REQUESTED',
  'AUTHORIZATION_ATTEMPTED',
  'PROVIDER_TIMEOUT',
  'PROVIDER_ERROR',
  'PROVIDER_UNAVAILABLE',
  'RETRY_SCHEDULED',
  'FALLBACK_PROVIDER_SELECTED',
  'IDEMPOTENT_REPLAY_DETECTED',
  'PAYMENT_AUTHORIZED',
  'PAYMENT_DECLINED',
  'ALL_PROVIDERS_EXHAUSTED',
  'CAPTURE_REQUESTED',
  'PAYMENT_CAPTURED',
  'CAPTURE_MARKED_PENDING',
  'WEBHOOK_RECEIVED',
  'WEBHOOK_DUPLICATE_IGNORED',
  'WEBHOOK_IGNORED',
  'WEBHOOK_SIGNATURE_REJECTED',
  'PAYMENT_COMPLETED',
  'RECONCILIATION_STARTED',
  'RECONCILIATION_INCONCLUSIVE',
  'RECONCILIATION_RESOLVED',
] as const

export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number]

export type EventSource =
  | 'orchestrator'
  | 'acquirer'
  | 'webhook-gateway'
  | 'reconciliation'

/**
 * One uniform shape rather than a discriminated union per type. The reducer is
 * generic over events — only `transitionsTo` affects state — and the UI renders
 * `data` as opaque JSON, so twenty near-identical union members would be
 * ceremony with no reader to serve.
 */
export interface PaymentEvent {
  /** Unique per event. Also what the log is deduplicated on when replayed. */
  readonly id: string
  /** Monotonic within a transaction. Gives the timeline a stable order. */
  readonly sequence: number
  readonly type: PaymentEventType
  readonly transactionId: string
  readonly occurredAt: number
  readonly source: EventSource
  /** Present only on events that move the payment. */
  readonly transitionsTo?: PaymentState
  /**
   * Everything the event knows. There is deliberately no prose field: wording
   * is presentation, it belongs to whoever is rendering and in whichever
   * language they asked for, and a domain that writes English sentences cannot
   * be translated without being rewritten.
   */
  readonly data: Readonly<Record<string, unknown>>
}

export interface CreateEventInput {
  id: string
  sequence: number
  type: PaymentEventType
  transactionId: string
  occurredAt: number
  source: EventSource
  transitionsTo?: PaymentState
  data?: Record<string, unknown>
}

export function createEvent(input: CreateEventInput): PaymentEvent {
  const event: PaymentEvent = {
    id: input.id,
    sequence: input.sequence,
    type: input.type,
    transactionId: input.transactionId,
    occurredAt: input.occurredAt,
    source: input.source,
    data: Object.freeze({ ...(input.data ?? {}) }),
    ...(input.transitionsTo ? { transitionsTo: input.transitionsTo } : {}),
  }
  return Object.freeze(event)
}

/** Events that carry weight in the session dashboard. */
export const COUNTED_EVENTS = {
  retry: 'RETRY_SCHEDULED',
  fallback: 'FALLBACK_PROVIDER_SELECTED',
  duplicateWebhook: 'WEBHOOK_DUPLICATE_IGNORED',
} as const
