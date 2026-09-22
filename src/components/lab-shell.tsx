'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/i18n/use-translation'
import { aggregateOf, selectMetrics, selectTransaction } from '@/infrastructure/store'
import { Inspector } from './inspector'
import { MetricsStrip } from './metrics-strip'
import { Rail } from './rail'
import { RunHeader } from './run-header'
import { TopBar } from './top-bar'
import { useLabSession } from './use-lab-session'
import { WhatThisDemonstrates } from './what-this-demonstrates'
import { Workspace } from './workspace'

/**
 * A run inspector, not a dashboard: controls in a rail, the run across the top,
 * and the widest thing on screen is the thing you are here to read. Detail
 * arrives in a drawer when you ask for it.
 */
export function LabShell() {
  const session = useLabSession()
  const { d, locale } = useTranslation()
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  // The server cannot know which language was stored, so it renders the default
  // and the document is corrected here once the client knows better.
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const record = selectTransaction(session)
  const aggregate = record ? aggregateOf(record) : null
  const metrics = selectMetrics(session)

  const selectedEvent = record?.events.find((event) => event.id === selectedEventId) ?? null

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar session={session} />

      <div className="flex flex-col lg:h-[calc(100vh-3.5rem)]">
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <Rail session={session} />

          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <RunHeader session={session} record={record} aggregate={aggregate} />
            <Workspace
              events={record?.events ?? []}
              selectedEventId={selectedEventId}
              onSelect={(id) => setSelectedEventId((current) => (current === id ? null : id))}
            />
          </main>

          <Inspector event={selectedEvent} onClose={() => setSelectedEventId(null)} />
        </div>

        <MetricsStrip metrics={metrics} />
      </div>

      <WhatThisDemonstrates />

      <footer className="px-5 py-6 text-[12px] leading-relaxed text-faint">
        {d.app.disclaimer}
      </footer>
    </div>
  )
}
