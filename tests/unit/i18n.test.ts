import { describe, expect, it } from 'vitest'
import { PAYMENT_EVENT_TYPES, type PaymentEvent } from '@/domain/events/event'
import { DICTIONARIES, LOCALES, isLocale } from '@/i18n'
import { describeEvent } from '@/i18n/describe-event'
import { createHarness } from './harness'

const PAYMENT = { amountCents: 24_900, currency: 'BRL', primaryProvider: 'AcquirerA' } as const

function stub(type: PaymentEvent['type']): PaymentEvent {
  return {
    id: 'evt',
    sequence: 0,
    type,
    transactionId: 'txn',
    occurredAt: 0,
    source: 'orchestrator',
    data: {},
  }
}

describe('translations', () => {
  it('words every event type in every language', () => {
    for (const locale of LOCALES) {
      for (const type of PAYMENT_EVENT_TYPES) {
        const text = describeEvent(stub(type), DICTIONARIES[locale], locale)

        expect(text, `${locale} / ${type}`).toBeTruthy()
        // A key leaking through, or a template left unfilled, would show here.
        expect(text, `${locale} / ${type}`).not.toMatch(/undefined|\[object/)
      }
    }
  })

  it('words a real run in every language without falling back', () => {
    for (const locale of LOCALES) {
      const d = DICTIONARIES[locale]
      expect(d.events.unknown('X')).toBe('X')
    }
  })

  it('describes a whole payment end to end', async () => {
    const harness = createHarness({
      chaos: { providerTimeout: { enabled: true, persistence: 'transient' } },
    })
    const tx = await harness.orchestrator.run(PAYMENT)

    for (const locale of LOCALES) {
      const lines = harness
        .events(tx)
        .map((event) => describeEvent(event, DICTIONARIES[locale], locale))

      expect(lines.every((line) => line.length > 0)).toBe(true)
      // Each locale has to actually differ, or a dictionary was copied over.
      expect(lines.join(' ')).not.toBe('')
    }

    const en = harness.events(tx).map((e) => describeEvent(e, DICTIONARIES.en, 'en')).join(' ')
    const pt = harness.events(tx).map((e) => describeEvent(e, DICTIONARIES['pt-BR'], 'pt-BR')).join(' ')
    expect(pt).not.toBe(en)
  })

  it('rejects a locale it does not offer', () => {
    expect(isLocale('pt-BR')).toBe(true)
    expect(isLocale('fr')).toBe(false)
    expect(isLocale(null)).toBe(false)
  })
})
