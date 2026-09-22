'use client'

import type { PaymentState } from '@/domain/payment/states'
import { ALLOWED_TRANSITIONS } from '@/domain/payment/transitions'
import { useTranslation } from '@/i18n/use-translation'
import { STATE_STYLES } from './ui'

const MAIN_PATH: PaymentState[] = ['CREATED', 'PROCESSING', 'AUTHORIZED', 'CAPTURED', 'COMPLETED']
const BRANCHES: PaymentState[] = ['CAPTURE_PENDING', 'DECLINED', 'FAILED']

export interface Refusal {
  /** The stage the refused message claimed, when it claimed one. */
  readonly state: PaymentState | null
  readonly reason: string
}

function Node({
  state,
  current,
  reachable,
  refused,
}: {
  state: PaymentState
  current: PaymentState | null
  reachable: boolean
  refused: boolean
}) {
  const isCurrent = state === current
  const style = STATE_STYLES[state]

  const classes = refused
    ? 'bg-state-failed/20 text-state-failed line-through'
    : isCurrent
      ? `${style.bg} ${style.text}`
      : reachable
        ? 'bg-raised text-muted'
        : 'bg-transparent text-faint'

  return (
    <span
      data-state-node={state}
      data-current={isCurrent || undefined}
      data-state-refused={refused || undefined}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[11px] tracking-wide transition-colors ${classes}`}
    >
      {state}
    </span>
  )
}

/**
 * The transition table, drawn. What is highlighted is not decoration: the nodes
 * marked reachable are exactly `ALLOWED_TRANSITIONS[current]`, so the picture
 * cannot drift away from the rule it illustrates.
 *
 * A refusal is shown rather than merely logged — the moment the machine turns
 * something down is the moment it is doing its job.
 */
export function StateMachineView({
  current,
  refusal,
}: {
  current: PaymentState | null
  refusal?: Refusal | null
}) {
  const { d } = useTranslation()
  const reachable = current ? ALLOWED_TRANSITIONS[current] : []

  return (
    <div className="space-y-3 pb-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {MAIN_PATH.map((state, index) => (
          <span key={state} className="flex items-center gap-1.5">
            {index > 0 && <span className="font-mono text-[11px] text-faint">&rarr;</span>}
            <Node
              state={state}
              current={current}
              reachable={reachable.includes(state)}
              refused={refusal?.state === state}
            />
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
          {d.transaction.exits}
        </span>
        {BRANCHES.map((state) => (
          <Node
            key={state}
            state={state}
            current={current}
            reachable={reachable.includes(state)}
            refused={refusal?.state === state}
          />
        ))}
      </div>

      {refusal && (
        <p className="refusal-enter flex items-start gap-2 pt-1 text-[12px] leading-snug text-state-failed">
          <span aria-hidden>&#10007;</span>
          <span>{refusal.reason}</span>
        </p>
      )}
    </div>
  )
}
