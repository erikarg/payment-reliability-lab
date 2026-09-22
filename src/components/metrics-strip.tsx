'use client'

import type { SessionMetrics } from '@/application/metrics'
import { useTranslation } from '@/i18n/use-translation'

/**
 * The session, as a strip. These are numbers you glance at between runs, not
 * numbers you study — giving them a whole column said the opposite.
 */
export function MetricsStrip({ metrics }: { metrics: SessionMetrics }) {
  const { d } = useTranslation()

  const settled = metrics.completed + metrics.failed + metrics.declined
  const share = (count: number) => (settled === 0 ? 0 : (count / settled) * 100)
  const rate = metrics.successRate === null ? '—' : `${Math.round(metrics.successRate * 100)}%`
  const tone =
    metrics.successRate === null
      ? 'text-faint'
      : metrics.successRate >= 0.8
        ? 'text-state-completed'
        : 'text-state-pending'

  const counters: { label: string; value: number; tone?: string }[] = [
    { label: d.metrics.transactions, value: metrics.total },
    { label: d.metrics.completed, value: metrics.completed, tone: 'text-state-completed' },
    { label: d.metrics.failed, value: metrics.failed, tone: 'text-state-failed' },
    { label: d.metrics.declined, value: metrics.declined, tone: 'text-state-declined' },
    {
      label: d.metrics.pendingReconciliation,
      value: metrics.pendingReconciliation,
      tone: 'text-state-pending',
    },
    { label: d.metrics.retries, value: metrics.retries },
    { label: d.metrics.fallbacks, value: metrics.fallbacks },
    { label: d.metrics.duplicateWebhooks, value: metrics.duplicateWebhooks },
    { label: d.metrics.inFlight, value: metrics.inFlight },
  ]

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-8 gap-y-4 border-t border-hairline px-5 py-3">
      <div className="flex items-center gap-3">
        <span className={`font-mono text-[26px] leading-none tracking-tight ${tone}`}>{rate}</span>
        <div className="min-w-[110px]">
          <div className="label">{d.metrics.successRate}</div>
          <div className="mt-1.5 flex h-1 overflow-hidden rounded-full bg-hairline">
            <div className="bg-state-completed" style={{ width: `${share(metrics.completed)}%` }} />
            <div className="bg-state-failed" style={{ width: `${share(metrics.failed)}%` }} />
            <div className="bg-state-declined" style={{ width: `${share(metrics.declined)}%` }} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        {counters.map((counter) => (
          <div key={counter.label} className="flex items-baseline gap-1.5">
            <span
              className={`font-mono text-[15px] leading-none ${counter.value > 0 && counter.tone ? counter.tone : 'text-ink'}`}
            >
              {counter.value}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
              {counter.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
