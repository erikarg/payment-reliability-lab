'use client'

import type { PaymentEvent } from '@/domain/events/event'
import type { PaymentAggregate } from '@/domain/payment/reducer'
import { PAYMENT_STATES, type PaymentState } from '@/domain/payment/states'
import { formatMoney } from '@/i18n'
import { describeEvent } from '@/i18n/describe-event'
import { useTranslation } from '@/i18n/use-translation'
import { labStore, type SessionState } from '@/infrastructure/store'
import type { TransactionRecord } from '@/infrastructure/storage'
import { type Refusal, StateMachineView } from './state-machine-view'
import { StateBadge } from './ui'

function refusalOf(events: readonly PaymentEvent[]): PaymentEvent | null {
  const last = events.at(-1)
  if (!last) return null
  return last.type === 'WEBHOOK_IGNORED' || last.type === 'WEBHOOK_DUPLICATE_IGNORED' ? last : null
}

function claimedState(event: PaymentEvent): PaymentState | null {
  if (event.type !== 'WEBHOOK_IGNORED') return null
  const reported = event.data.reportedState
  return PAYMENT_STATES.includes(reported as PaymentState) ? (reported as PaymentState) : null
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div
        data-field={label.toLowerCase().replace(/\s+/g, '-')}
        className="mt-1 truncate font-mono text-[12px] text-ink"
        title={value}
      >
        {value}
      </div>
      {hint && <div className="truncate font-mono text-[10px] text-state-pending">{hint}</div>}
    </div>
  )
}

/**
 * The run, across the top: what it is, where it got to, and the machine it is
 * moving through — read left to right, the same direction as the flow itself.
 */
export function RunHeader({
  session,
  record,
  aggregate,
}: {
  session: SessionState
  record: TransactionRecord | null
  aggregate: PaymentAggregate | null
}) {
  const { d, locale } = useTranslation()

  if (!record || !aggregate) {
    return (
      <div className="shrink-0 border-b border-hairline px-5 py-5">
        <StateMachineView current={null} />
        <p className="mt-4 text-[13px] text-faint">{d.transaction.empty}</p>
      </div>
    )
  }

  const refusalEvent = refusalOf(record.events)
  const refusal: Refusal | null = refusalEvent
    ? { state: claimedState(refusalEvent), reason: describeEvent(refusalEvent, d, locale) }
    : null

  const failure = aggregate.lastFailureEventId
    ? record.events.find((event) => event.id === aggregate.lastFailureEventId)
    : undefined

  const f = d.transaction.fields
  const failedOver = aggregate.provider !== aggregate.primaryProvider

  return (
    <div className="shrink-0 border-b border-hairline">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 pt-4">
        <StateBadge state={aggregate.state} />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Field
            label={f.amount}
            value={formatMoney(aggregate.amountCents, aggregate.currency, locale)}
          />
          <Field
            label={f.provider}
            value={aggregate.provider ?? '—'}
            hint={
              failedOver && aggregate.primaryProvider
                ? d.transaction.failedOverFrom(aggregate.primaryProvider)
                : undefined
            }
          />
          <Field label={f.attempts} value={String(aggregate.attempts)} />
          <Field label={f.retries} value={String(aggregate.retries)} />
          <Field
            label={f.elapsed}
            value={`${((aggregate.updatedAt - aggregate.createdAt) / 1000).toFixed(2)}s`}
          />
          <Field label={f.idempotencyKey} value={aggregate.idempotencyKey} />
          <Field label={f.transaction} value={aggregate.transactionId} />
        </div>
      </div>

      <div className="px-5 pt-4">
        <StateMachineView current={aggregate.state} refusal={refusal} />
      </div>

      {failure && aggregate.state !== 'COMPLETED' && (
        <p className="mx-5 mb-4 rounded-lg bg-state-failed/10 px-3.5 py-2.5 text-[12px] text-state-failed">
          {describeEvent(failure, d, locale)}
        </p>
      )}

      {aggregate.state === 'CAPTURE_PENDING' && (
        <div className="mx-5 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-state-pending/10 px-4 py-3">
          <p className="min-w-[16rem] flex-1 text-[12px] leading-relaxed text-state-pending">
            {d.transaction.pending.explanation}
          </p>
          <button
            type="button"
            onClick={() => void labStore.reconcile(aggregate.transactionId)}
            disabled={session.running}
            className="rounded-lg bg-state-pending px-3.5 py-2 font-mono text-xs font-semibold text-canvas transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {session.running ? d.transaction.pending.running : d.transaction.pending.run}
          </button>
          {aggregate.reconciliationAttempts > 0 && (
            <span className="font-mono text-[11px] text-faint">
              {d.transaction.pending.attempts(aggregate.reconciliationAttempts)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
