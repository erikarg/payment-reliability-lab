import { NextResponse } from 'next/server'
import {
  isProviderId,
  normalizeProviderPayload,
} from '@/infrastructure/webhooks/payloads'
import { SIGNATURE_HEADER, verifySignature } from '@/infrastructure/webhooks/signature'

/**
 * The acquirer-facing webhook endpoint.
 *
 * It holds no state, which is not a limitation of the Hobby plan so much as an
 * honest reflection of what this endpoint is for: verify the signature, reject
 * anything malformed, translate the acquirer's format into ours, and hand it
 * back. Deciding what the payment does with it belongs to the state machine,
 * not to an HTTP handler that may be running on a different instance each time.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await context.params

  if (!isProviderId(provider)) {
    return NextResponse.json({ error: 'unknown provider' }, { status: 404 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get(SIGNATURE_HEADER)

  if (!signature || !(await verifySignature(rawBody, signature))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'malformed payload' }, { status: 400 })
  }

  const normalized = normalizeProviderPayload(provider, parsed)
  if (!normalized) {
    return NextResponse.json({ error: 'unrecognised event' }, { status: 400 })
  }

  return NextResponse.json(normalized)
}
