'use client'

import { useLabSession } from '@/components/use-lab-session'
import type { Dictionary } from './dictionary'
import { type Locale, dictionaryFor } from './index'

/**
 * Reads the active locale from the same store everything else reads. It follows
 * the store's hydration rules for free: the server renders the default locale,
 * and the stored preference is applied once the client takes over.
 */
export function useTranslation(): { d: Dictionary; locale: Locale } {
  const { config } = useLabSession()
  return { d: dictionaryFor(config.locale), locale: config.locale }
}
