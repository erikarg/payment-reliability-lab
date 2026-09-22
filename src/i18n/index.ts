import type { Dictionary } from './dictionary'
import { en } from './en'
import { es } from './es'
import { ptBR } from './pt-BR'

export type { Dictionary }

export const LOCALES = ['en', 'pt-BR', 'es'] as const

export type Locale = (typeof LOCALES)[number]

export const DICTIONARIES: Record<Locale, Dictionary> = {
  en,
  'pt-BR': ptBR,
  es,
}

/** What `Intl` should be handed for each locale we offer. */
const INTL_LOCALE: Record<Locale, string> = {
  en: 'en-US',
  'pt-BR': 'pt-BR',
  es: 'es-419',
}

export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale]
}

export function formatMoney(amountCents: number, currency: string, locale: Locale): string {
  // `Intl` throws on a currency code it does not recognise, and the code comes
  // out of an event log that lives in editable browser storage. A malformed
  // amount should read oddly, not take the page down.
  try {
    return new Intl.NumberFormat(INTL_LOCALE[locale], { style: 'currency', currency }).format(
      amountCents / 100,
    )
  } catch {
    return `${currency} ${(amountCents / 100).toFixed(2)}`
  }
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`
}
