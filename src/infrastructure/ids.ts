import type { IdGenerator } from '@/application/ports'

/**
 * Sequential, readable identifiers. They are unique within a session but are
 * deliberately not the source of determinism — behaviour is reproduced by the
 * seeded RNG, so two identical runs behave identically while still being
 * distinguishable in the transaction list.
 */
export function createIdGenerator(): IdGenerator {
  const counters = new Map<string, number>()

  return {
    next(prefix) {
      const n = (counters.get(prefix) ?? 0) + 1
      counters.set(prefix, n)
      return `${prefix}_${n.toString(36).padStart(4, '0')}${Math.random().toString(36).slice(2, 7)}`
    },
  }
}
