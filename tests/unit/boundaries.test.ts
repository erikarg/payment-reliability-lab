import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

function importsOf(path: string): string[] {
  const source = readFileSync(path, 'utf8')
  return [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
}

/**
 * The layering is only real if something checks it. This is cheaper than a lint
 * plugin and fails for the same reason one would: the domain has started
 * depending on something it should not know exists.
 */
describe('architectural boundaries', () => {
  it('keeps the domain free of frameworks, storage and orchestration', () => {
    const offences: string[] = []

    for (const file of filesUnder('src/domain')) {
      for (const specifier of importsOf(file)) {
        const external = !specifier.startsWith('.')
        const outsideDomain = specifier.startsWith('@/') && !specifier.startsWith('@/domain')

        if (external || outsideDomain) offences.push(`${file} imports ${specifier}`)
      }
    }

    expect(offences).toEqual([])
  })

  it('keeps the application layer off the infrastructure it is given', () => {
    const offences: string[] = []

    for (const file of filesUnder('src/application')) {
      for (const specifier of importsOf(file)) {
        // Everything concrete arrives through a port, so a direct import of an
        // adapter means a dependency was wired the wrong way round.
        if (specifier.startsWith('@/infrastructure') || specifier.startsWith('@/components')) {
          offences.push(`${file} imports ${specifier}`)
        }
      }
    }

    expect(offences).toEqual([])
  })
})
