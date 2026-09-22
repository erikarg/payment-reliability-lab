import { type NormalizedWebhook, type WebhookKind, isWebhookKind } from '@/domain/events/webhook'
import { PROVIDER_IDS, type ProviderId } from '@/domain/provider/provider'
import type { WebhookEmission } from '@/application/ports'

/**
 * Real acquirers do not agree on anything, least of all webhook shapes. Keeping
 * two genuinely different formats here is what gives the receiving endpoint a
 * job worth doing: everything downstream only ever sees `NormalizedWebhook`.
 */

const ACQUIRER_B_KIND: Record<WebhookKind, string> = {
  'authorization.succeeded': 'AUTH_OK',
  'payment.settled': 'SETTLED',
}

export function buildProviderPayload(emission: WebhookEmission): string {
  if (emission.provider === 'AcquirerA') {
    return JSON.stringify({
      event_id: emission.providerEventId,
      event_type: emission.kind,
      created_at: new Date(emission.occurredAt).toISOString(),
      object: {
        reference: emission.transactionId,
        amount_cents: emission.amountCents,
      },
    })
  }

  return JSON.stringify({
    id: emission.providerEventId,
    kind: ACQUIRER_B_KIND[emission.kind],
    ts: emission.occurredAt,
    data: {
      txn: emission.transactionId,
      value_in_cents: emission.amountCents,
    },
  })
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value)
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

/** Translates a provider's payload into the one shape the system understands. */
export function normalizeProviderPayload(
  provider: ProviderId,
  body: unknown,
): NormalizedWebhook | null {
  const payload = record(body)
  if (!payload) return null

  if (provider === 'AcquirerA') {
    const object = record(payload.object)
    const kind = payload.event_type
    const id = payload.event_id
    const reference = object?.reference
    const createdAt = payload.created_at

    if (typeof id !== 'string' || typeof reference !== 'string' || !isWebhookKind(kind)) return null

    const occurredAt = typeof createdAt === 'string' ? Date.parse(createdAt) : NaN

    return {
      providerEventId: id,
      provider,
      transactionId: reference,
      kind,
      occurredAt: Number.isNaN(occurredAt) ? Date.now() : occurredAt,
    }
  }

  const data = record(payload.data)
  const id = payload.id
  const txn = data?.txn
  const kind = Object.entries(ACQUIRER_B_KIND).find(([, wire]) => wire === payload.kind)?.[0]

  if (typeof id !== 'string' || typeof txn !== 'string' || !isWebhookKind(kind)) return null

  return {
    providerEventId: id,
    provider,
    transactionId: txn,
    kind,
    occurredAt: typeof payload.ts === 'number' ? payload.ts : Date.now(),
  }
}
