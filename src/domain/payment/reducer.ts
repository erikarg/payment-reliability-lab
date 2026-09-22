import type { PaymentEvent } from '../events/event'
import type { ProviderId } from '../provider/provider'
import { type PaymentState, isTerminal } from './states'
import { type TransitionVerdict, evaluateTransition } from './transitions'

/**
 * The payment, as derived from its event log. Nothing here is stored — every
 * field is recomputed from the events, which is why a page reload, an imported
 * session and a live run all produce exactly the same object.
 */
export interface PaymentAggregate {
  readonly transactionId: string
  readonly state: PaymentState
  readonly amountCents: number
  readonly currency: string
  readonly primaryProvider: ProviderId | null
  readonly provider: ProviderId | null
  readonly authorizationId: string | null
  readonly captureId: string | null
  readonly idempotencyKey: string
  readonly attempts: number
  readonly retries: number
  readonly fallbacks: number
  readonly duplicateWebhooks: number
  readonly reconciliationAttempts: number
  /** Provider-side webhook ids already seen. Rebuilt from the log on replay. */
  readonly processedWebhookIds: readonly string[]
  /** The failure still worth showing, by id. The wording is the UI's problem. */
  readonly lastFailureEventId: string | null
  readonly createdAt: number
  readonly updatedAt: number
}

export type ApplyResult =
  | { readonly ok: true; readonly aggregate: PaymentAggregate }
  | { readonly ok: false; readonly verdict: Exclude<TransitionVerdict, { outcome: 'allowed' }> }

function str(data: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = data[key]
  return typeof value === 'string' ? value : null
}

function num(data: Readonly<Record<string, unknown>>, key: string): number | null {
  const value = data[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Builds the aggregate from the genesis event. */
export function genesis(event: PaymentEvent): PaymentAggregate | null {
  if (event.type !== 'PAYMENT_CREATED') return null

  const primary = str(event.data, 'provider') as ProviderId | null

  return {
    transactionId: event.transactionId,
    state: 'CREATED',
    amountCents: num(event.data, 'amountCents') ?? 0,
    currency: str(event.data, 'currency') ?? 'BRL',
    primaryProvider: primary,
    provider: primary,
    authorizationId: null,
    captureId: null,
    idempotencyKey: str(event.data, 'idempotencyKey') ?? '',
    attempts: 0,
    retries: 0,
    fallbacks: 0,
    duplicateWebhooks: 0,
    reconciliationAttempts: 0,
    processedWebhookIds: [],
    lastFailureEventId: null,
    createdAt: event.occurredAt,
    updatedAt: event.occurredAt,
  }
}

/**
 * Applies one event. Refuses anything the transition table does not allow —
 * including a late webhook aiming backwards — so a corrupted or hand-edited log
 * can never produce an impossible payment.
 */
export function applyEvent(aggregate: PaymentAggregate, event: PaymentEvent): ApplyResult {
  if (event.transactionId !== aggregate.transactionId) {
    return { ok: false, verdict: { outcome: 'invalid', reason: 'not-allowed' } }
  }

  let state = aggregate.state

  if (event.transitionsTo) {
    const verdict = evaluateTransition(aggregate.state, event.transitionsTo)
    if (verdict.outcome !== 'allowed') return { ok: false, verdict }
    state = event.transitionsTo
  }

  const next = {
    ...aggregate,
    state,
    updatedAt: event.occurredAt,
    attempts: Math.max(aggregate.attempts, num(event.data, 'attempt') ?? 0),
  }

  switch (event.type) {
    case 'PROVIDER_TIMEOUT':
    case 'PROVIDER_ERROR':
    case 'PROVIDER_UNAVAILABLE':
      next.lastFailureEventId = event.id
      break

    case 'RETRY_SCHEDULED':
      next.retries = aggregate.retries + 1
      break

    case 'FALLBACK_PROVIDER_SELECTED':
      next.fallbacks = aggregate.fallbacks + 1
      next.provider = (str(event.data, 'provider') as ProviderId | null) ?? aggregate.provider
      break

    case 'PAYMENT_AUTHORIZED':
      next.authorizationId = str(event.data, 'authorizationId')
      next.lastFailureEventId = null
      break

    case 'PAYMENT_DECLINED':
      next.lastFailureEventId = event.id
      break

    case 'PAYMENT_CAPTURED':
      next.captureId = str(event.data, 'captureId')
      next.lastFailureEventId = null
      break

    case 'WEBHOOK_RECEIVED': {
      const providerEventId = str(event.data, 'providerEventId')
      if (providerEventId && !aggregate.processedWebhookIds.includes(providerEventId)) {
        next.processedWebhookIds = [...aggregate.processedWebhookIds, providerEventId]
      }
      break
    }

    case 'WEBHOOK_DUPLICATE_IGNORED':
      next.duplicateWebhooks = aggregate.duplicateWebhooks + 1
      break

    case 'RECONCILIATION_STARTED':
      next.reconciliationAttempts = aggregate.reconciliationAttempts + 1
      break

    case 'ALL_PROVIDERS_EXHAUSTED':
      next.lastFailureEventId = event.id
      break

    default:
      break
  }

  return { ok: true, aggregate: next }
}

export interface RejectedEvent {
  readonly event: PaymentEvent
  readonly verdict: Exclude<TransitionVerdict, { outcome: 'allowed' }>
}

export interface ReduceResult {
  readonly aggregate: PaymentAggregate | null
  readonly rejected: readonly RejectedEvent[]
}

/**
 * Folds a log into a payment. Events that cannot be applied are collected
 * rather than thrown, so one bad entry in persisted storage degrades a single
 * transaction instead of taking down the whole session.
 */
export function reduce(events: readonly PaymentEvent[]): ReduceResult {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence)
  const rejected: RejectedEvent[] = []
  const seenEventIds = new Set<string>()

  let aggregate: PaymentAggregate | null = null

  for (const event of ordered) {
    if (seenEventIds.has(event.id)) continue
    seenEventIds.add(event.id)

    if (aggregate === null) {
      aggregate = genesis(event)
      if (aggregate === null) {
        rejected.push({
          event,
          verdict: { outcome: 'invalid', reason: 'not-allowed' },
        })
      }
      continue
    }

    const result = applyEvent(aggregate, event)
    if (result.ok) aggregate = result.aggregate
    else rejected.push({ event, verdict: result.verdict })
  }

  return { aggregate, rejected }
}

export function isSettled(aggregate: PaymentAggregate): boolean {
  return isTerminal(aggregate.state)
}
