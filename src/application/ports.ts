import type { PaymentEvent } from '@/domain/events/event'
import type { NormalizedWebhook, WebhookKind } from '@/domain/events/webhook'
import type { PaymentAggregate } from '@/domain/payment/reducer'
import type { PaymentProvider, ProviderId } from '@/domain/provider/provider'

/**
 * Time is injected rather than read from the wall clock, so the same run can be
 * played at real speed for a human, instantly for a test, and reproducibly in
 * both. Anything that waits must wait through here.
 */
export interface Clock {
  now(): number
  sleep(ms: number): Promise<void>
}

/** A seeded stream. Same seed and same code path means the same numbers. */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  /** Integer in [min, max]. */
  between(min: number, max: number): number
}

export interface IdGenerator {
  next(prefix: string): string
}

/**
 * The event log for one session. The orchestrator never holds payment state of
 * its own — it reads the aggregate back through here after every append, so
 * what it sees is always what the reducer says.
 */
export interface TransactionLog {
  events(transactionId: string): readonly PaymentEvent[]
  aggregate(transactionId: string): PaymentAggregate | null
  append(event: PaymentEvent): void
}

export type WebhookDeliveryResult =
  | { readonly ok: true; readonly webhook: NormalizedWebhook; readonly rawBody: string }
  | { readonly ok: false; readonly reason: 'invalid-signature' | 'malformed' | 'unreachable' }

export interface WebhookEmission {
  readonly provider: ProviderId
  readonly kind: WebhookKind
  readonly transactionId: string
  readonly providerEventId: string
  readonly amountCents: number
  readonly occurredAt: number
}

/**
 * Stands in for the acquirer's outbound webhook system plus our own receiving
 * endpoint: it builds the provider-shaped payload, signs it, and hands it to
 * whatever verifies and normalises it. Over HTTP in the browser, in-process in
 * unit tests — the orchestrator cannot tell the difference.
 */
export interface WebhookChannel {
  send(emission: WebhookEmission): Promise<WebhookDeliveryResult>
}

export interface ProviderRegistry {
  get(id: ProviderId): PaymentProvider
  /** The other acquirer, or null when there is nowhere left to fail over to. */
  fallbackFor(id: ProviderId): PaymentProvider | null
}
