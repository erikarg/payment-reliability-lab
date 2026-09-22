'use client'

import { useTranslation } from '@/i18n/use-translation'


export function WhatThisDemonstrates() {
  const { d } = useTranslation()

  return (
    <section className="border-t border-hairline px-5 py-8">
      <h2 className="label">{d.concepts.title}</h2>
      <div className="mt-6 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        {d.concepts.items.map((concept) => (
          <div key={concept.title}>
            <h3 className="text-[15px] font-medium tracking-tight text-ink">{concept.title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{concept.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
