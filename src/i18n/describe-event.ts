import type { PaymentEvent } from '@/domain/events/event'
import type { Dictionary } from './dictionary'
import { type Locale, formatDuration, formatMoney } from './index'

/**
 * Turns a recorded fact into a sentence, in whichever language was asked for.
 *
 * This is the only place in the codebase that knows how an event reads. The
 * events themselves carry structured data; every `unknown` in that data is
 * narrowed here and nowhere else.
 */

function str(data: Readonly<Record<string, unknown>>, key: string): string {
  const value = data[key]
  return typeof value === 'string' ? value : '—'
}

function num(data: Readonly<Record<string, unknown>>, key: string): number {
  const value = data[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function bool(data: Readonly<Record<string, unknown>>, key: string): boolean {
  return data[key] === true
}

function declineReason(data: Readonly<Record<string, unknown>>, d: Dictionary): string {
  const reason = data.declineReason
  return reason === 'risk-limit' ? d.declineReasons['risk-limit'] : str(data, 'declineReason')
}

export function describeEvent(event: PaymentEvent, d: Dictionary, locale: Locale): string {
  const data = event.data
  const provider = str(data, 'provider')
  const e = d.events

  switch (event.type) {
    case 'PAYMENT_CREATED':
      return e.created(formatMoney(num(data, 'amountCents'), str(data, 'currency'), locale))

    case 'AUTHORIZATION_REQUESTED':
      return e.authorizationRequested(provider)

    case 'AUTHORIZATION_ATTEMPTED':
      return e.authorizationAttempted(provider, num(data, 'attempt'), num(data, 'maxAttempts'))

    case 'PROVIDER_TIMEOUT':
      return e.providerTimeout(provider)

    case 'PROVIDER_ERROR':
      return e.providerError(provider, num(data, 'httpStatus'))

    case 'PROVIDER_UNAVAILABLE':
      return e.providerUnavailable(provider)

    case 'RETRY_SCHEDULED':
      return e.retryScheduled(
        formatDuration(num(data, 'delayMs')),
        num(data, 'nextAttempt'),
        num(data, 'maxAttempts'),
      )

    case 'FALLBACK_PROVIDER_SELECTED':
      return e.fallbackSelected(str(data, 'previousProvider'), provider)

    case 'IDEMPOTENT_REPLAY_DETECTED':
      return e.idempotentReplay(provider)

    case 'PAYMENT_AUTHORIZED':
      return event.source === 'webhook-gateway'
        ? e.authorizedByWebhook(provider)
        : e.authorized(provider)

    case 'PAYMENT_DECLINED':
      return e.declined(provider, declineReason(data, d))

    case 'ALL_PROVIDERS_EXHAUSTED':
      return e.exhausted(bool(data, 'failedOver'))

    case 'CAPTURE_REQUESTED':
      return e.captureRequested(provider)

    case 'PAYMENT_CAPTURED':
      return e.captured(provider)

    case 'CAPTURE_MARKED_PENDING':
      return e.capturePending

    case 'WEBHOOK_RECEIVED':
      return e.webhookReceived(str(data, 'kind'), provider)

    case 'WEBHOOK_DUPLICATE_IGNORED':
      return e.webhookDuplicate(str(data, 'providerEventId'))

    case 'WEBHOOK_IGNORED':
      return data.reason === 'out-of-order'
        ? e.webhookBackwards(str(data, 'kind'), str(data, 'reportedState'))
        : e.webhookNotApplicable(str(data, 'reportedState'), str(data, 'currentState'))

    case 'WEBHOOK_SIGNATURE_REJECTED':
      return e.webhookSignatureRejected

    case 'PAYMENT_COMPLETED':
      return e.completed

    case 'RECONCILIATION_STARTED':
      return e.reconciliationStarted(provider)

    case 'RECONCILIATION_INCONCLUSIVE':
      return e.reconciliationInconclusive

    case 'RECONCILIATION_RESOLVED':
      return e.reconciliationResolved(data.resolvedTo === 'CAPTURED')

    default:
      return e.unknown(event.type)
  }
}
