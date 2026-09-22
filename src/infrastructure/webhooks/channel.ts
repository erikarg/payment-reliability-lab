import type { WebhookChannel, WebhookDeliveryResult, WebhookEmission } from '@/application/ports'
import { buildProviderPayload, normalizeProviderPayload } from './payloads'
import { SIGNATURE_HEADER, signPayload, verifySignature } from './signature'

/**
 * Sends the webhook over HTTP to the Route Handler, exactly as an acquirer
 * would. The signing, the wire format and the verification all happen for real
 * — the only thing simulated is which machine is on each end.
 */
export function createHttpWebhookChannel(): WebhookChannel {
  return {
    async send(emission: WebhookEmission): Promise<WebhookDeliveryResult> {
      const rawBody = buildProviderPayload(emission)
      const signature = await signPayload(rawBody)

      try {
        const response = await fetch(`/api/webhooks/${emission.provider}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: signature },
          body: rawBody,
        })

        if (response.status === 401) return { ok: false, reason: 'invalid-signature' }
        if (!response.ok) return { ok: false, reason: 'malformed' }

        const webhook = await response.json()
        return { ok: true, webhook, rawBody }
      } catch {
        return { ok: false, reason: 'unreachable' }
      }
    },
  }
}

/**
 * The same verification and normalisation without the network hop, for unit
 * tests. It deliberately runs the real signing path rather than skipping it.
 */
export function createInProcessWebhookChannel(): WebhookChannel {
  return {
    async send(emission: WebhookEmission): Promise<WebhookDeliveryResult> {
      const rawBody = buildProviderPayload(emission)
      const signature = await signPayload(rawBody)

      if (!(await verifySignature(rawBody, signature))) {
        return { ok: false, reason: 'invalid-signature' }
      }

      const webhook = normalizeProviderPayload(emission.provider, JSON.parse(rawBody))
      return webhook ? { ok: true, webhook, rawBody } : { ok: false, reason: 'malformed' }
    },
  }
}
