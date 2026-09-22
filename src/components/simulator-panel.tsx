'use client'

import { RISK_LIMIT_CENTS } from '@/application/config'
import { PROVIDER_IDS, type ProviderId } from '@/domain/provider/provider'
import { formatMoney } from '@/i18n'
import { useTranslation } from '@/i18n/use-translation'
import { labStore, type SessionState } from '@/infrastructure/store'
import { Section } from './ui'

const QUICK_AMOUNTS = [2_490, 24_900, 125_000, RISK_LIMIT_CENTS + 50_000]

export function SimulatorPanel({ session }: { session: SessionState }) {
  const { d, locale } = useTranslation()
  const { config, running } = session

  // The field is uncontrolled and committed on blur, so typing is never fought
  // with reformatting. Scenarios and quick amounts change the amount from
  // outside, and the key remounts the field to pick that up — which is safe
  // precisely because those cannot happen while it is being typed in.
  const commitAmount = (text: string) => {
    const parsed = Number.parseFloat(text.replace(',', '.'))
    if (Number.isFinite(parsed) && parsed >= 0) {
      labStore.setConfig({ amountCents: Math.round(parsed * 100) })
    }
  }

  return (
    <Section title={d.simulator.title}>
      <div className="field flex items-baseline gap-2 px-3.5 py-2.5">
        <span className="font-mono text-xs text-faint">R$</span>
        <label htmlFor="amount" className="sr-only">
          {d.simulator.amount}
        </label>
        <input
          id="amount"
          key={config.amountCents}
          type="text"
          inputMode="decimal"
          defaultValue={(config.amountCents / 100).toFixed(2)}
          onBlur={(event) => commitAmount(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          className="w-full bg-transparent font-mono text-[24px] leading-none tracking-tight text-ink outline-none"
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {QUICK_AMOUNTS.map((cents) => (
          <button
            key={cents}
            type="button"
            aria-pressed={config.amountCents === cents}
            onClick={() => labStore.setConfig({ amountCents: cents })}
            className="btn px-2 py-1.5 text-[11px]"
          >
            {formatMoney(cents, config.currency, locale)}
          </button>
        ))}
      </div>

      {config.amountCents >= RISK_LIMIT_CENTS && (
        <p className="mt-2.5 text-[12px] leading-relaxed text-state-declined">
          {d.simulator.riskWarning(formatMoney(RISK_LIMIT_CENTS, config.currency, locale))}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-1.5">
        {PROVIDER_IDS.map((id: ProviderId) => (
          <button
            key={id}
            type="button"
            aria-pressed={config.primaryProvider === id}
            onClick={() => labStore.setConfig({ primaryProvider: id })}
            className="btn px-2 py-2"
          >
            {id}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void labStore.runPayment()}
        disabled={running}
        className="btn btn-primary mt-3 w-full py-2.5 text-[13px] tracking-wide"
      >
        {running ? d.simulator.running : d.simulator.run}
      </button>

      <p className="mt-2.5 text-[11px] leading-relaxed text-faint">{d.simulator.determinism}</p>
    </Section>
  )
}
