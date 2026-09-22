import type { ReactNode } from 'react'
import type { PaymentState } from '@/domain/payment/states'

/**
 * Tailwind needs whole class names at build time, so state colours are looked
 * up rather than interpolated. Chips are filled, never outlined — the palette
 * carries the meaning and a border would only add a line to count.
 */
export const STATE_STYLES: Record<PaymentState, { text: string; bg: string; dot: string }> = {
  CREATED: { text: 'text-state-created', bg: 'bg-state-created/15', dot: 'bg-state-created' },
  PROCESSING: { text: 'text-state-processing', bg: 'bg-state-processing/15', dot: 'bg-state-processing' },
  AUTHORIZED: { text: 'text-state-authorized', bg: 'bg-state-authorized/15', dot: 'bg-state-authorized' },
  CAPTURE_PENDING: { text: 'text-state-pending', bg: 'bg-state-pending/15', dot: 'bg-state-pending' },
  CAPTURED: { text: 'text-state-captured', bg: 'bg-state-captured/15', dot: 'bg-state-captured' },
  COMPLETED: { text: 'text-state-completed', bg: 'bg-state-completed/15', dot: 'bg-state-completed' },
  DECLINED: { text: 'text-state-declined', bg: 'bg-state-declined/15', dot: 'bg-state-declined' },
  FAILED: { text: 'text-state-failed', bg: 'bg-state-failed/15', dot: 'bg-state-failed' },
}

/** The same palette as STATE_STYLES, in a form SVG can consume. */
export const STATE_VAR: Record<PaymentState, string> = {
  CREATED: 'var(--color-state-created)',
  PROCESSING: 'var(--color-state-processing)',
  AUTHORIZED: 'var(--color-state-authorized)',
  CAPTURE_PENDING: 'var(--color-state-pending)',
  CAPTURED: 'var(--color-state-captured)',
  COMPLETED: 'var(--color-state-completed)',
  DECLINED: 'var(--color-state-declined)',
  FAILED: 'var(--color-state-failed)',
}

/** A titled region of the rail. No box — a label, then its contents. */
export function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="label">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

export function StateBadge({ state, size = 'md' }: { state: PaymentState; size?: 'sm' | 'md' }) {
  const style = STATE_STYLES[state]
  const scale = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1.5 text-xs'

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full font-mono font-medium tracking-wide ${scale} ${style.bg} ${style.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden />
      {state}
    </span>
  )
}

/**
 * A number with a name above it. No box: the grid's own spacing separates one
 * figure from the next, which is what spacing is for.
 */
export function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'good' | 'warn' | 'bad'
}) {
  const tones = {
    default: 'text-ink',
    good: 'text-state-completed',
    warn: 'text-state-pending',
    bad: 'text-state-failed',
  }

  return (
    <div className="min-w-0">
      <div className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
        {label}
      </div>
      <div className={`mt-1 font-mono text-[15px] leading-none ${tones[tone]}`}>{value}</div>
    </div>
  )
}
