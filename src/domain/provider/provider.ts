/**
 * The contract every acquirer adapter implements. The orchestration layer only
 * ever sees this — it has no idea which acquirer it is talking to, and no
 * knowledge of how failures are being simulated.
 */

export const PROVIDER_IDS = ['AcquirerA', 'AcquirerB'] as const

export type ProviderId = (typeof PROVIDER_IDS)[number]

export interface AuthorizationRequest {
  readonly transactionId: string
  readonly amountCents: number
  readonly currency: string
  /**
   * Sent on every attempt, including retries. A timeout means the response was
   * lost, not that the request was never processed — so the only safe way to
   * retry an authorization is to let the acquirer recognise the key and return
   * the decision it already made.
   */
  readonly idempotencyKey: string
  readonly attempt: number
  readonly isFinalAttempt: boolean
}

export interface CaptureRequest {
  readonly transactionId: string
  readonly authorizationId: string
  readonly amountCents: number
  readonly idempotencyKey: string
  readonly attempt: number
  readonly isFinalAttempt: boolean
}

export interface StatusRequest {
  readonly transactionId: string
  readonly idempotencyKey: string
  readonly attempt: number
}

/** Why an acquirer refused. A code, so the interface can say it in any language. */
export type DeclineReason = 'risk-limit'

export interface AuthorizationOutcome {
  readonly decision: 'approved' | 'declined'
  readonly authorizationId: string | null
  readonly declineReason: DeclineReason | null
  /** True when the acquirer served a decision it had already made for this key. */
  readonly replayed: boolean
}

export interface CaptureOutcome {
  readonly captureId: string
}

export interface StatusOutcome {
  readonly status: 'captured' | 'not-captured' | 'unknown'
  readonly captureId: string | null
}

/**
 * How a call came back. The three failure kinds are not interchangeable and the
 * retry policy treats each differently — see `domain/provider/failure.ts`.
 */
export type ProviderResult<T> =
  | { readonly kind: 'ok'; readonly value: T; readonly latencyMs: number }
  | { readonly kind: 'timeout'; readonly latencyMs: number }
  | { readonly kind: 'server-error'; readonly status: number; readonly latencyMs: number }
  | { readonly kind: 'unavailable'; readonly latencyMs: number }

export type ProviderFailureKind = Exclude<ProviderResult<unknown>['kind'], 'ok'>

/**
 * One outbound webhook delivery the acquirer intends to make. Duplicates are
 * expressed as two entries sharing a `providerEventId` — which is exactly what
 * at-least-once delivery looks like from the receiving end.
 */
export interface PlannedWebhook {
  readonly providerEventId: string
  readonly delayMs: number
}

export interface WebhookPlanRequest {
  readonly kind: 'authorization.succeeded' | 'payment.settled'
  readonly transactionId: string
}

export interface PaymentProvider {
  readonly id: ProviderId
  authorize(request: AuthorizationRequest): Promise<ProviderResult<AuthorizationOutcome>>
  capture(request: CaptureRequest): Promise<ProviderResult<CaptureOutcome>>
  getStatus(request: StatusRequest): Promise<ProviderResult<StatusOutcome>>
  /**
   * What this acquirer's webhook system will attempt for a given event. The
   * orchestrator simply delivers whatever comes back, which keeps every
   * decision about late or repeated delivery inside the adapter.
   */
  planWebhooks(request: WebhookPlanRequest): readonly PlannedWebhook[]
}
