'use client'

import { useState } from 'react'
import type { PaymentEvent } from '@/domain/events/event'
import { useTranslation } from '@/i18n/use-translation'
import { EventTimeline } from './event-timeline'
import { SequenceDiagram } from './sequence-diagram'

const VIEWS = ['sequence', 'log'] as const

type ViewId = (typeof VIEWS)[number]

/**
 * The reading surface, and the widest thing on screen. The diagram is the
 * default because it shows the mechanism; the log is one click away because
 * sooner or later you want the exact ordering.
 */
export function Workspace({
  events,
  selectedEventId,
  onSelect,
}: {
  events: readonly PaymentEvent[]
  selectedEventId: string | null
  onSelect: (id: string) => void
}) {
  const { d } = useTranslation()
  const [view, setView] = useState<ViewId>('sequence')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3">
        <div role="tablist" aria-label={d.views.sequence} className="inset flex gap-0.5 p-1">
          {VIEWS.map((id) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${
                view === id ? 'bg-accent/16 text-accent' : 'text-faint hover:text-ink'
              }`}
            >
              {d.views[id]}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] text-faint">{d.views.events(events.length)}</span>
      </div>

      {view === 'sequence' ? (
        <SequenceDiagram events={events} selectedEventId={selectedEventId} onSelect={onSelect} />
      ) : (
        <EventTimeline events={events} selectedEventId={selectedEventId} onSelect={onSelect} />
      )}
    </div>
  )
}
