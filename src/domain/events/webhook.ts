import type { PaymentState } from '../payment/states'
import type { ProviderId } from '../provider/provider'

/**
 * Acquirers each invent their own webhook format. Once a payload has been
 * verified and translated, the rest of the system only ever sees this shape.
 */
export const WEBHOOK_KINDS = ['authorization.succeeded', 'payment.settled'] as const

export type WebhookKind = (typeof WEBHOOK_KINDS)[number]

/** Which stage each webhook is claiming the payment has reached. */
export const WEBHOOK_TARGET_STATE: Record<WebhookKind, PaymentState> = {
  'authorization.succeeded': 'AUTHORIZED',
  'payment.settled': 'COMPLETED',
}

export interface NormalizedWebhook {
  /** The acquirer's own id for this delivery. The idempotency key for webhooks. */
  readonly providerEventId: string
  readonly provider: ProviderId
  readonly transactionId: string
  readonly kind: WebhookKind
  readonly occurredAt: number
}

export function isWebhookKind(value: unknown): value is WebhookKind {
  return typeof value === 'string' && (WEBHOOK_KINDS as readonly string[]).includes(value)
}
