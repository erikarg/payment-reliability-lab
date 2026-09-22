'use client'

import type { SpeedSetting } from '@/application/config'
import { useTranslation } from '@/i18n/use-translation'
import { labStore, type SessionState } from '@/infrastructure/store'
import { LocaleSwitcher } from './locale-switcher'
import { Wordmark } from './wordmark'

const SPEEDS: { value: SpeedSetting; label: string }[] = [
  { value: 'realtime', label: '1x' },
  { value: 'fast', label: '10x' },
  { value: 'instant', label: '100x' },
]

function exportSession(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * Identity on the left, session-wide settings on the right. Seed and speed live
 * here rather than in the rail because they govern every run, not the next one.
 */
export function TopBar({ session }: { session: SessionState }) {
  const { d } = useTranslation()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-hairline px-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <Wordmark size={26} />
        <h1 className="truncate text-[15px] font-semibold tracking-tight text-ink">{d.app.title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-1.5 sm:flex">
          <label htmlFor="seed" className="label">
            {d.simulator.seed}
          </label>
          <input
            id="seed"
            type="number"
            value={session.config.seed}
            onChange={(event) =>
              labStore.setConfig({ seed: Number.parseInt(event.target.value, 10) || 0 })
            }
            className="field w-[104px] px-2.5 py-1.5 font-mono text-[11px] text-ink outline-none"
          />
          <button
            type="button"
            onClick={() => labStore.randomizeSeed()}
            title={d.simulator.newSeed}
            className="btn px-2 py-1.5"
          >
            &#8635;
          </button>
        </div>

        <div className="inset hidden gap-0.5 p-1 sm:flex">
          {SPEEDS.map((speed) => (
            <button
              key={speed.value}
              type="button"
              aria-pressed={session.config.speed === speed.value}
              onClick={() => labStore.setConfig({ speed: speed.value })}
              className={`rounded-md px-2 py-1 font-mono text-[11px] transition-colors ${
                session.config.speed === speed.value
                  ? 'bg-accent/16 text-accent'
                  : 'text-faint hover:text-ink'
              }`}
            >
              {speed.label}
            </button>
          ))}
        </div>

        <LocaleSwitcher />

        <button
          type="button"
          onClick={() =>
            exportSession(`payment-lab-session-${Date.now()}.json`, {
              config: session.config,
              transactions: session.transactions,
            })
          }
          disabled={session.transactions.length === 0}
          className="btn hidden px-3 py-1.5 text-[11px] md:block"
        >
          {d.app.exportSession}
        </button>
      </div>
    </header>
  )
}
