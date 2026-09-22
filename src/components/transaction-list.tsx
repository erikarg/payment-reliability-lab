'use client'

import { formatMoney } from '@/i18n'
import { useTranslation } from '@/i18n/use-translation'
import { aggregateOf, labStore, type SessionState } from '@/infrastructure/store'
import { Section, StateBadge } from './ui'

export function TransactionList({ session }: { session: SessionState }) {
  const { d, locale } = useTranslation()
  const transactions = [...session.transactions].reverse()

  return (
    <Section
      title={d.history.title}
      action={
        transactions.length > 0 ? (
          <button
            type="button"
            onClick={() => labStore.reset()}
            className="font-mono text-[11px] text-faint transition-colors hover:text-state-failed"
          >
            {d.history.clear}
          </button>
        ) : undefined
      }
    >
      {transactions.length === 0 ? (
        <p className="text-[12px] text-faint">{d.history.empty}</p>
      ) : (
        <ul className="scroll-thin -mx-2 max-h-64 overflow-y-auto">
          {transactions.map((record) => {
            const aggregate = aggregateOf(record)
            if (!aggregate) return null
            const selected = record.id === session.selectedId

            return (
              <li key={record.id}>
                <button
                  type="button"
                  onClick={() => labStore.select(record.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-raised ${
                    selected ? 'bg-raised' : ''
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[12px] text-ink">
                      {formatMoney(aggregate.amountCents, aggregate.currency, locale)}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-faint">
                      {aggregate.provider} · {d.history.events(record.events.length)}
                    </span>
                  </span>
                  <StateBadge state={aggregate.state} size="sm" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}
