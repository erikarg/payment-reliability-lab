import { DEFAULT_LOCALE, type Locale } from '@/i18n'
import type { ProviderId } from '@/domain/provider/provider'

/**
 * Whether an injected fault clears on its own or not. This is the distinction
 * retries exist for: a transient fault is the case a retry can fix, a
 * persistent one is the case where retrying only delays the bad news.
 */
export type FaultPersistence = 'transient' | 'persistent'

export interface InjectedFault {
  readonly enabled: boolean
  readonly persistence: FaultPersistence
}

/**
 * Faults are declared here and read only by the acquirer adapters. The
 * orchestration logic never inspects this object — it reacts to what the
 * provider interface returns, exactly as it would against a real acquirer.
 */
export interface ChaosConfig {
  /** Authorization call never answers. The request may still have been processed. */
  readonly providerTimeout: InjectedFault
  /** Authorization call answers 5xx. Safe to retry: nothing happened. */
  readonly providerServerError: InjectedFault
  /** Acquirer is down. Retrying is pointless; fail over instead. */
  readonly providerUnavailable: InjectedFault
  /** Capture times out, leaving the outcome genuinely unknown. */
  readonly indeterminateCapture: boolean
  /** The settlement webhook is delivered twice with the same event id. */
  readonly duplicateWebhook: boolean
  /** Webhooks arrive late and out of order. */
  readonly delayedWebhook: boolean
}

export const DEFAULT_CHAOS: ChaosConfig = {
  providerTimeout: { enabled: false, persistence: 'transient' },
  providerServerError: { enabled: false, persistence: 'transient' },
  providerUnavailable: { enabled: false, persistence: 'transient' },
  indeterminateCapture: false,
  duplicateWebhook: false,
  delayedWebhook: false,
}

export type SpeedSetting = 'realtime' | 'fast' | 'instant'

export const SPEED_DIVISOR: Record<SpeedSetting, number> = {
  realtime: 1,
  fast: 10,
  instant: Number.POSITIVE_INFINITY,
}

export interface LabConfig {
  readonly amountCents: number
  readonly currency: string
  readonly primaryProvider: ProviderId
  readonly chaos: ChaosConfig
  readonly speed: SpeedSetting
  readonly seed: number
  readonly locale: Locale
}

/**
 * Acquirers apply their own risk limits. Anything at or above this is refused
 * outright — a business decision, not a fault, and the one outcome a retry must
 * never be pointed at.
 */
export const RISK_LIMIT_CENTS = 1_000_000

export const DEFAULT_CONFIG: LabConfig = {
  amountCents: 24_900,
  currency: 'BRL',
  primaryProvider: 'AcquirerA',
  chaos: DEFAULT_CHAOS,
  speed: 'realtime',
  seed: 20260921,
  locale: DEFAULT_LOCALE,
}
