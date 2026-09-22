/**
 * Webhook signing, the way acquirers actually do it: HMAC-SHA256 over the exact
 * bytes that were sent, compared against a header.
 *
 * The secret is a public constant because the lab has no environment variables
 * and both the sender and the receiver are this same application. It proves the
 * shape of the check, not the secrecy of the key.
 */
export const WEBHOOK_SECRET = 'prl_demo_webhook_secret'
export const SIGNATURE_HEADER = 'x-prl-signature'

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

export async function signPayload(rawBody: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(), new TextEncoder().encode(rawBody))
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifySignature(rawBody: string, provided: string): Promise<boolean> {
  const expected = await signPayload(rawBody)
  if (expected.length !== provided.length) return false

  // Compared without short-circuiting, so the time taken says nothing about how
  // much of the signature was right.
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i)
  }
  return diff === 0
}
