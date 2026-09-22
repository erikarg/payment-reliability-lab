'use client'

import { SCENARIOS, SCENARIO_GROUPS, type ScenarioGroup } from '@/application/scenarios'
import type { Dictionary } from '@/i18n'
import { useTranslation } from '@/i18n/use-translation'
import { labStore } from '@/infrastructure/store'
import { Section } from './ui'

type ScenarioId = keyof Dictionary['scenarios']['items']

/**
 * Nine buttons in a column read as a list to get through. Grouped by what kind
 * of thing goes wrong, they read as four ideas with examples.
 */
export function ScenarioBar() {
  const { d } = useTranslation()

  return (
    <Section title={d.scenarios.title}>
      <div className="space-y-4">
        {SCENARIO_GROUPS.map((group: ScenarioGroup) => (
          <div key={group}>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              {d.scenarios.groups[group]}
            </div>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
              {SCENARIOS.filter((scenario) => scenario.group === group).map((scenario) => {
                const copy = d.scenarios.items[scenario.id as ScenarioId]
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => labStore.applyScenario(scenario.id)}
                    title={copy.description}
                    className="btn px-3 py-2 text-left text-[12px] hover:text-accent"
                  >
                    {copy.name}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}
