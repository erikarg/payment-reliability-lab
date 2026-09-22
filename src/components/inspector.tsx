'use client'

import type { PaymentEvent } from '@/domain/events/event'
import { describeEvent } from '@/i18n/describe-event'
import { useTranslation } from '@/i18n/use-translation'

/**
 * Detail on demand. The log used to expand a row inline, which pushed
 * everything below it and made a list you were reading jump. Here the payload
 * gets its own column and the list stays where it was.
 */
export function Inspector({
  event,
  onClose,
}: {
  event: PaymentEvent | null
  onClose: () => void
}) {
  const { d, locale } = useTranslation()

  if (!event) return null

  return (
    <aside className="drawer-in surface flex w-full shrink-0 flex-col border-l border-hairline lg:w-[360px]">
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <span className="label">{d.inspector.title}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={d.inspector.close}
          className="btn px-2 py-1 text-[11px]"
        >
          &#10005;
        </button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="font-mono text-[12px] text-ink">{event.type}</div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {describeEvent(event, d, locale)}
        </p>

        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 font-mono text-[11px]">
          <dt className="text-faint">source</dt>
          <dd className="truncate text-muted">{event.source}</dd>
          <dt className="text-faint">sequence</dt>
          <dd className="text-muted">{event.sequence}</dd>
          <dt className="text-faint">at</dt>
          <dd className="truncate text-muted">{new Date(event.occurredAt).toISOString()}</dd>
          {event.transitionsTo && (
            <>
              <dt className="text-faint">transitions to</dt>
              <dd className="text-accent">{event.transitionsTo}</dd>
            </>
          )}
        </dl>

        <div className="mt-5">
          <span className="label">{d.inspector.payload}</span>
          <pre className="scroll-thin mt-2 overflow-x-auto rounded-lg bg-canvas px-3 py-3 font-mono text-[11px] leading-relaxed text-muted">
            {JSON.stringify(event.data, null, 2)}
          </pre>
        </div>
      </div>
    </aside>
  )
}
