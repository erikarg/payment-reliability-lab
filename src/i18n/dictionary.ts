import type { en } from './en'

/**
 * English is the reference: every other locale has to match its shape exactly,
 * checked by the compiler. A key that is missing, misspelled or left over from
 * a rename fails the build instead of showing up blank on someone's screen.
 */
export type Dictionary = typeof en
