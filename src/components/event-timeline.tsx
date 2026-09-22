'use client'

import { useEffect, useRef } from 'react'
import type { PaymentEvent, PaymentEventType } from '@/domain/events/event'
import type { Dictionary, Locale } from '@/i18n'
import { describeEvent } from '@/i18n/describe-event'
import { useTranslation } from '@/i18n/use-translation'

/** Reading a log is pattern-matching. Colour carries the category, not the mood. */
const TONE: Partial<Record<PaymentEventType, string>> = {
  PROVIDER_TIMEOUT: 'text-state-failed',
  PROVIDER_ERROR: 'text-state-failed',
  PROVIDER_UNAVAILABLE: 'text-state-failed',
  ALL_PROVIDERS_EXHAUSTED: 'text-state-failed',
  PAYMENT_DECLINED: 'text-state-declined',
  WEBHOOK_SIGNATURE_REJECTED: 'text-state-failed',
  RETRY_SCHEDULED: 'text-state-pending',
  FALLBACK_PROVIDER_SELECTED: 'text-state-pending',
  IDEMPOTENT_REPLAY_DETECTED: 'text-state-authorized',
  CAPTURE_MARKED_PENDING: 'text-state-pending',
  RECONCILIATION_STARTED: 'text-state-pending',
  RECONCILIATION_INCONCLUSIVE: 'text-state-pending',
  RECONCILIATION_RESOLVED: 'text-state-captured',
  PAYMENT_AUTHORIZED: 'text-state-authorized',
  PAYMENT_CAPTURED: 'text-state-captured',
  PAYMENT_COMPLETED: 'text-state-completed',
  WEBHOOK_RECEIVED: 'text-state-processing',
  WEBHOOK_DUPLICATE_IGNORED: 'text-state-pending',
  WEBHOOK_IGNORED: 'text-state-pending',
}

function offset(event: PaymentEvent, startedAt: number): string {
  const delta = event.occurredAt - startedAt
  return delta < 1000 ? `+${delta}ms` : `+${(delta / 1000).toFixed(2)}s`
}

function EventRow({
  event,
  startedAt,
  d,
  locale,
  selected,
  onSelect,
}: {
  event: PaymentEvent
  startedAt: number
  d: Dictionary
  locale: Locale
  selected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(event.id)}
        data-event-type={event.type}
        data-selected={selected || undefined}
        className={`flex w-full items-baseline gap-3 px-5 py-2.5 text-left transition-colors hover:bg-raised ${
          selected ? 'bg-raised' : ''
        }`}
      >
        <span className="w-16 shrink-0 text-right font-mono text-[10px] text-faint">
          {offset(event, startedAt)}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`font-mono text-[11px] font-medium ${TONE[event.type] ?? 'text-muted'}`}>
            {event.type}
          </span>
          {event.transitionsTo && (
            <span className="ml-2 font-mono text-[10px] text-faint">
              &rarr; {event.transitionsTo}
            </span>
          )}
          <span className="mt-1 block truncate text-[12px] text-muted">
            {describeEvent(event, d, locale)}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[10px] text-faint">{event.source}</span>
      </button>
    </li>
  )
}

export function EventTimeline({
  events,
  selectedEventId,
  onSelect,
}: {
  events: readonly PaymentEvent[]
  selectedEventId: string | null
  onSelect: (id: string) => void
}) {
  const { d, locale } = useTranslation()
  const endRef = useRef<HTMLDivElement>(null)
  const count = events.length

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [count])

  if (count === 0) {
    return (
      <p className="px-5 py-10 text-center text-[13px] text-faint">{d.views.emptyLog}</p>
    )
  }

  const startedAt = events[0].occurredAt

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
      <ul>
        {events.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            startedAt={startedAt}
            d={d}
            locale={locale}
            selected={event.id === selectedEventId}
            onSelect={onSelect}
          />
        ))}
      </ul>
      <div ref={endRef} />
    </div>
  )
}
