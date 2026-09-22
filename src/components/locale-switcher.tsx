'use client'

import { LOCALES, dictionaryFor } from '@/i18n'
import { useTranslation } from '@/i18n/use-translation'
import { labStore } from '@/infrastructure/store'

export function LocaleSwitcher() {
  const { d, locale } = useTranslation()

  return (
    <div
      role="group"
      aria-label={d.app.language}
      className="inset flex gap-0.5 p-1"
    >
      {LOCALES.map((candidate) => (
        <button
          key={candidate}
          type="button"
          lang={candidate}
          aria-pressed={locale === candidate}
          title={dictionaryFor(candidate).locale.name}
          onClick={() => labStore.setLocale(candidate)}
          className={`rounded-md px-2 py-1 font-mono text-[11px] transition-colors ${
            locale === candidate ? 'bg-accent/20 text-accent' : 'text-faint hover:text-ink'
          }`}
        >
          {dictionaryFor(candidate).locale.short}
        </button>
      ))}
    </div>
  )
}
