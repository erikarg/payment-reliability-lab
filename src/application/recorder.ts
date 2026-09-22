import { type PaymentEventType, type EventSource, createEvent } from '@/domain/events/event'
import type { PaymentState } from '@/domain/payment/states'
import type { Clock, IdGenerator, TransactionLog } from './ports'

export interface RecordInput {
  type: PaymentEventType
  source: EventSource
  transitionsTo?: PaymentState
  data?: Record<string, unknown>
}

/**
 * The only way events enter the log. It owns sequencing and timestamping so no
 * caller has to remember either, and so both come from injected dependencies
 * rather than from ambient state.
 */
export class EventRecorder {
  constructor(
    private readonly log: TransactionLog,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  record(transactionId: string, input: RecordInput): void {
    const existing = this.log.events(transactionId)
    const sequence = existing.length === 0 ? 0 : Math.max(...existing.map((e) => e.sequence)) + 1

    this.log.append(
      createEvent({
        id: this.ids.next('evt'),
        sequence,
        type: input.type,
        transactionId,
        occurredAt: this.clock.now(),
        source: input.source,
        data: input.data,
        ...(input.transitionsTo ? { transitionsTo: input.transitionsTo } : {}),
      }),
    )
  }
}
