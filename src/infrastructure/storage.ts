import type { LabConfig } from '@/application/config'
import type { PaymentEvent } from '@/domain/events/event'
import type { ChaosConfig } from '@/application/config'
import type { ProviderId } from '@/domain/provider/provider'

/**
 * A transaction as it is stored: its immutable run configuration plus its event
 * log. There is no state field — the state is whatever the reducer says the log
 * adds up to, which is why a reload reconstructs it exactly.
 */
export interface TransactionRecord {
  readonly id: string
  readonly seed: number
  readonly chaos: ChaosConfig
  readonly primaryProvider: ProviderId
  readonly events: readonly PaymentEvent[]
}

export interface PersistedSession {
  readonly version: 1
  readonly config: LabConfig
  readonly transactions: readonly TransactionRecord[]
}

const STORAGE_KEY = 'prl:v1:session'

/** Old sessions are dropped rather than migrated. Nothing here is worth keeping. */
const VERSION = 1

/** localStorage is a few megabytes and an event log is not small. Keep the recent ones. */
export const MAX_PERSISTED_TRANSACTIONS = 25

export function loadSession(): PersistedSession | null {
  // Private windows, blocked site data and thumbnail capture all make this
  // throw or come back empty. Every caller has to survive that.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<PersistedSession>
    if (parsed.version !== VERSION || !parsed.config || !Array.isArray(parsed.transactions)) {
      return null
    }

    return parsed as PersistedSession
  } catch {
    return null
  }
}

export function saveSession(session: Omit<PersistedSession, 'version'>): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: VERSION,
        config: session.config,
        transactions: session.transactions.slice(-MAX_PERSISTED_TRANSACTIONS),
      }),
    )
  } catch {
    // Over quota or storage denied. The session keeps working in memory; only
    // surviving a reload is lost, and that is not worth interrupting a run for.
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do — see above.
  }
}
