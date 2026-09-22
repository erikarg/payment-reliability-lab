import { DEFAULT_CONFIG, SPEED_DIVISOR, type ChaosConfig, type LabConfig } from '@/application/config'
import { isLocale, type Locale } from '@/i18n'
import { computeMetrics, type SessionMetrics } from '@/application/metrics'
import { PaymentOrchestrator } from '@/application/orchestrator'
import type { TransactionLog } from '@/application/ports'
import { findScenario } from '@/application/scenarios'
import type { PaymentEvent } from '@/domain/events/event'
import { type PaymentAggregate, type ReduceResult, reduce } from '@/domain/payment/reducer'
import { createClock } from './clock'
import { createIdGenerator } from './ids'
import { createProviderRegistry } from './providers/acquirer'
import { createRng } from './rng'
import {
  MAX_PERSISTED_TRANSACTIONS,
  clearSession,
  loadSession,
  saveSession,
  type TransactionRecord,
} from './storage'
import { createHttpWebhookChannel } from './webhooks/channel'

export interface SessionState {
  readonly config: LabConfig
  readonly transactions: readonly TransactionRecord[]
  readonly selectedId: string | null
  readonly running: boolean
  readonly hydrated: boolean
}

const INITIAL_STATE: SessionState = {
  config: DEFAULT_CONFIG,
  transactions: [],
  selectedId: null,
  running: false,
  hydrated: false,
}

/**
 * Reducing a log is cheap, but the UI asks for the same aggregates on every
 * render. Keying the result off the events array — which is only ever replaced,
 * never mutated — keeps that free.
 */
const aggregateCache = new WeakMap<readonly PaymentEvent[], ReduceResult>()

export function aggregateOf(record: TransactionRecord): PaymentAggregate | null {
  const cached = aggregateCache.get(record.events)
  if (cached) return cached.aggregate

  const result = reduce(record.events)
  aggregateCache.set(record.events, result)
  return result.aggregate
}

let state: SessionState = INITIAL_STATE
const listeners = new Set<() => void>()
let persistTimer: ReturnType<typeof setTimeout> | null = null

/**
 * `flush` is for changes a person made on purpose. The coalescing window exists
 * for the burst of events a run produces; a preference someone just set should
 * survive them closing the tab a moment later.
 */
function emit(next: SessionState, flush = false): void {
  state = next
  for (const listener of listeners) listener()

  if (flush) persistNow()
  else schedulePersist()
}

function persistNow(): void {
  if (typeof window === 'undefined' || !state.hydrated) return

  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }

  saveSession({ config: state.config, transactions: state.transactions })
}

/**
 * Writes are coalesced: a single run appends twenty or more events, and
 * serialising the whole session for each of them would be the only expensive
 * thing in the loop.
 *
 * The window is not restarted by later changes. A debounce that keeps sliding
 * would never write at all during a busy run, and a tab closed the moment a
 * payment finishes would take the whole thing with it.
 */
function schedulePersist(): void {
  if (typeof window === 'undefined' || !state.hydrated || persistTimer) return

  persistTimer = setTimeout(() => {
    persistTimer = null
    saveSession({ config: state.config, transactions: state.transactions })
  }, 120)
}

function replaceTransaction(id: string, update: (record: TransactionRecord) => TransactionRecord): void {
  emit({
    ...state,
    transactions: state.transactions.map((record) => (record.id === id ? update(record) : record)),
  })
}

/**
 * The event log the orchestrator writes through. Appending notifies the UI, so
 * the timeline fills in as the payment actually progresses rather than all at
 * once when it finishes.
 */
function createLog(): TransactionLog {
  return {
    events: (transactionId) =>
      state.transactions.find((record) => record.id === transactionId)?.events ?? [],

    aggregate: (transactionId) => {
      const record = state.transactions.find((item) => item.id === transactionId)
      return record ? aggregateOf(record) : null
    },

    append: (event) => {
      const existing = state.transactions.find((record) => record.id === event.transactionId)

      if (!existing) {
        const created: TransactionRecord = {
          id: event.transactionId,
          seed: state.config.seed,
          chaos: state.config.chaos,
          primaryProvider: state.config.primaryProvider,
          events: [event],
        }

        emit({
          ...state,
          transactions: [...state.transactions, created].slice(-MAX_PERSISTED_TRANSACTIONS),
          selectedId: event.transactionId,
        })
        return
      }

      replaceTransaction(event.transactionId, (record) => ({
        ...record,
        events: [...record.events, event],
      }))
    },
  }
}

function buildOrchestrator(chaos: ChaosConfig, seed: number, speed: LabConfig['speed']) {
  const clock = createClock(SPEED_DIVISOR[speed])
  const rng = createRng(seed)
  const ids = createIdGenerator()

  return new PaymentOrchestrator({
    log: createLog(),
    clock,
    rng,
    ids,
    registry: createProviderRegistry({
      primary: state.config.primaryProvider,
      chaos,
      clock,
      rng,
      ids,
    }),
    webhooks: createHttpWebhookChannel(),
  })
}

export const labStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  getSnapshot(): SessionState {
    return state
  },

  /** The server has no session. Rendering empty here is what keeps hydration honest. */
  getServerSnapshot(): SessionState {
    return INITIAL_STATE
  },

  hydrate(): void {
    if (state.hydrated) return
    const stored = loadSession()

    state = stored
      ? {
          config: {
            ...DEFAULT_CONFIG,
            ...stored.config,
            locale: isLocale(stored.config.locale) ? stored.config.locale : DEFAULT_CONFIG.locale,
          },
          transactions: stored.transactions,
          selectedId: stored.transactions.at(-1)?.id ?? null,
          running: false,
          hydrated: true,
        }
      : { ...INITIAL_STATE, hydrated: true }

    for (const listener of listeners) listener()
  },

  setLocale(locale: Locale): void {
    emit({ ...state, config: { ...state.config, locale } }, true)
  },

  setConfig(patch: Partial<LabConfig>): void {
    emit({ ...state, config: { ...state.config, ...patch } }, true)
  },

  setChaos(patch: Partial<ChaosConfig>): void {
    emit({ ...state, config: { ...state.config, chaos: { ...state.config.chaos, ...patch } } }, true)
  },

  applyScenario(scenarioId: string): void {
    const scenario = findScenario(scenarioId)
    if (!scenario) return

    emit(
      {
        ...state,
        config: {
          ...state.config,
          chaos: scenario.chaos,
          ...(scenario.amountCents ? { amountCents: scenario.amountCents } : {}),
        },
      },
      true,
    )
  },

  select(transactionId: string): void {
    emit({ ...state, selectedId: transactionId })
  },

  randomizeSeed(): void {
    emit({ ...state, config: { ...state.config, seed: Math.floor(Math.random() * 1_000_000) } }, true)
  },

  async runPayment(): Promise<void> {
    if (state.running) return
    const { amountCents, currency, primaryProvider, chaos, seed, speed } = state.config

    emit({ ...state, running: true })
    try {
      await buildOrchestrator(chaos, seed, speed).run({ amountCents, currency, primaryProvider })
    } finally {
      emit({ ...state, running: false })
      persistNow()
    }
  },

  async reconcile(transactionId: string): Promise<void> {
    if (state.running) return
    const record = state.transactions.find((item) => item.id === transactionId)
    if (!record) return

    emit({ ...state, running: true })
    try {
      // Replayed with the configuration the transaction originally ran under,
      // not whatever the controls happen to say now.
      await buildOrchestrator(record.chaos, record.seed, state.config.speed).reconcile(transactionId)
    } finally {
      emit({ ...state, running: false })
      persistNow()
    }
  },

  reset(): void {
    clearSession()
    emit({ ...INITIAL_STATE, config: state.config, hydrated: true })
  },
}

export function selectMetrics(session: SessionState): SessionMetrics {
  const aggregates = session.transactions
    .map(aggregateOf)
    .filter((aggregate): aggregate is PaymentAggregate => aggregate !== null)

  return computeMetrics(aggregates)
}

export function selectTransaction(session: SessionState): TransactionRecord | null {
  if (!session.selectedId) return session.transactions.at(-1) ?? null
  return session.transactions.find((record) => record.id === session.selectedId) ?? null
}
