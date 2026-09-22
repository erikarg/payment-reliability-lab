import { DEFAULT_CHAOS, type ChaosConfig } from '@/application/config'
import { PaymentOrchestrator } from '@/application/orchestrator'
import type { ProviderRegistry, Rng, TransactionLog } from '@/application/ports'
import type { PaymentEvent, PaymentEventType } from '@/domain/events/event'
import { type PaymentAggregate, reduce } from '@/domain/payment/reducer'
import type { ProviderId } from '@/domain/provider/provider'
import { createClock } from '@/infrastructure/clock'
import { createIdGenerator } from '@/infrastructure/ids'
import { createProviderRegistry } from '@/infrastructure/providers/acquirer'
import { createRng } from '@/infrastructure/rng'
import { createInProcessWebhookChannel } from '@/infrastructure/webhooks/channel'

/**
 * Real timers, scaled down. Fake timers would be faster still, but the
 * orchestrator's correctness depends on the *relative* order of delays — a late
 * webhook has to actually be late — and collapsing every delay to zero is the
 * one thing that would hide a real bug.
 */
const TEST_SPEED_DIVISOR = 20

export interface Harness {
  readonly orchestrator: PaymentOrchestrator
  events(transactionId?: string): readonly PaymentEvent[]
  types(transactionId?: string): readonly PaymentEventType[]
  aggregate(transactionId: string): PaymentAggregate
  find(transactionId: string, type: PaymentEventType): PaymentEvent | undefined
}

export interface HarnessOptions {
  chaos?: Partial<ChaosConfig>
  primaryProvider?: ProviderId
  seed?: number
  registry?: ProviderRegistry
}

export function createHarness(options: HarnessOptions = {}): Harness {
  const chaos: ChaosConfig = { ...DEFAULT_CHAOS, ...options.chaos }
  const primary = options.primaryProvider ?? 'AcquirerA'
  const clock = createClock(TEST_SPEED_DIVISOR)
  const rng = createRng(options.seed ?? 1234)
  const ids = createIdGenerator()

  const stored: PaymentEvent[] = []
  const eventsFor = (transactionId: string) =>
    stored.filter((event) => event.transactionId === transactionId)

  const log: TransactionLog = {
    events: eventsFor,
    aggregate: (transactionId) => reduce(eventsFor(transactionId)).aggregate,
    append: (event) => {
      stored.push(event)

      // Every orchestrator test carries this assertion for free: if the
      // orchestrator ever emits a transition the table forbids, the test that
      // provoked it fails here rather than silently producing a stuck payment.
      const { rejected } = reduce(eventsFor(event.transactionId))
      if (rejected.length > 0) {
        throw new Error(
          `orchestrator emitted an invalid event: ${rejected[0].event.type} (${JSON.stringify(rejected[0].verdict)})`,
        )
      }
    },
  }

  const orchestrator = new PaymentOrchestrator({
    log,
    clock,
    rng,
    ids,
    registry:
      options.registry ?? createProviderRegistry({ primary, chaos, clock, rng, ids }),
    webhooks: createInProcessWebhookChannel(),
  })

  return {
    orchestrator,
    events: (transactionId) => (transactionId ? eventsFor(transactionId) : stored),
    types: (transactionId) =>
      (transactionId ? eventsFor(transactionId) : stored).map((event) => event.type),
    aggregate: (transactionId) => {
      const aggregate = reduce(eventsFor(transactionId)).aggregate
      if (!aggregate) throw new Error(`no aggregate for ${transactionId}`)
      return aggregate
    },
    find: (transactionId, type) => eventsFor(transactionId).find((event) => event.type === type),
  }
}

/** An RNG that hands back exactly the numbers a test wants, in order. */
export function scriptedRng(values: readonly number[]): Rng {
  let index = 0
  const next = () => values[Math.min(index++, values.length - 1)] ?? 0.5
  return { next, between: (min, max) => min + Math.floor(next() * (max - min + 1)) }
}
