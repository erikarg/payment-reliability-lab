'use client'

import type { ChaosConfig, FaultPersistence } from '@/application/config'
import type { Dictionary } from '@/i18n'
import { useTranslation } from '@/i18n/use-translation'
import { labStore, type SessionState } from '@/infrastructure/store'
import { Section } from './ui'

type TransportFault = 'providerTimeout' | 'providerServerError' | 'providerUnavailable'
type SimpleFault = 'indeterminateCapture' | 'duplicateWebhook' | 'delayedWebhook'

const TRANSPORT_FAULTS: TransportFault[] = [
  'providerTimeout',
  'providerServerError',
  'providerUnavailable',
]

const SIMPLE_FAULTS: SimpleFault[] = ['indeterminateCapture', 'duplicateWebhook', 'delayedWebhook']

function Toggle({
  id,
  checked,
  onChange,
  label,
  detail,
}: {
  id: string
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  detail: string
}) {
  return (
    <div>
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className={`text-[13px] ${checked ? 'text-ink' : 'text-muted'}`}>{label}</span>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={`${id}-detail`}
          className="sr-only"
        />
        <span className="switch" aria-hidden />
      </label>
      <p id={`${id}-detail`} className="mt-1 max-w-[30ch] text-[12px] leading-snug text-faint">
        {detail}
      </p>
    </div>
  )
}

export function ChaosPanel({ session }: { session: SessionState }) {
  const { d } = useTranslation()
  const { chaos } = session.config

  const active = Object.values(chaos).filter((value) =>
    typeof value === 'boolean' ? value : value.enabled,
  ).length

  const copy = (key: TransportFault | SimpleFault) =>
    d.chaos.faults[key] as Dictionary['chaos']['faults']['providerTimeout']

  const setPersistence = (key: TransportFault, persistence: FaultPersistence) => {
    labStore.setChaos({ [key]: { ...chaos[key], persistence } } as Partial<ChaosConfig>)
  }

  return (
    <Section
      title={d.chaos.title}
      action={
        <span
          className={`font-mono text-[10px] ${active === 0 ? 'text-faint' : 'text-state-failed'}`}
        >
          {active === 0 ? d.chaos.none : d.chaos.active(active)}
        </span>
      }
    >
      <div className="space-y-4">
        {TRANSPORT_FAULTS.map((key) => (
          <div key={key}>
            <Toggle
              id={`chaos-${key}`}
              checked={chaos[key].enabled}
              onChange={(enabled) =>
                labStore.setChaos({ [key]: { ...chaos[key], enabled } } as Partial<ChaosConfig>)
              }
              label={copy(key).label}
              detail={copy(key).detail}
            />
            {chaos[key].enabled && (
              <div
                role="group"
                aria-label={d.chaos.persistence(copy(key).label)}
                className="inset mt-2.5 grid grid-cols-2 gap-1 p-1"
              >
                {(['transient', 'persistent'] as const).map((persistence) => (
                  <button
                    key={persistence}
                    type="button"
                    aria-pressed={chaos[key].persistence === persistence}
                    onClick={() => setPersistence(key, persistence)}
                    className={`rounded-lg py-1.5 font-mono text-[11px] transition-colors ${
                      chaos[key].persistence === persistence
                        ? 'bg-state-failed/20 text-state-failed'
                        : 'text-faint hover:text-ink'
                    }`}
                  >
                    {copy(key)[persistence]}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="rule" />

        <div className="space-y-4">
          {SIMPLE_FAULTS.map((key) => (
            <Toggle
              key={key}
              id={`chaos-${key}`}
              checked={chaos[key]}
              onChange={(enabled) => labStore.setChaos({ [key]: enabled })}
              label={copy(key).label}
              detail={copy(key).detail}
            />
          ))}
        </div>

        <p className="text-[11px] leading-relaxed text-faint">{d.chaos.footnote}</p>
      </div>
    </Section>
  )
}
