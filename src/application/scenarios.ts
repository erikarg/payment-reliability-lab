import { DEFAULT_CHAOS, RISK_LIMIT_CENTS, type ChaosConfig } from './config'

/**
 * Preset fault combinations. Without these, the interesting behaviour is
 * reachable only by someone who already knows which switches to flip — which
 * defeats the point of a demonstration.
 */
export const SCENARIO_GROUPS = ['baseline', 'provider', 'webhook', 'unresolved'] as const

export type ScenarioGroup = (typeof SCENARIO_GROUPS)[number]

export interface Scenario {
  readonly id: string
  readonly group: ScenarioGroup
  readonly chaos: ChaosConfig
  readonly amountCents?: number
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'happy-path',
    group: 'baseline',
    chaos: DEFAULT_CHAOS,
  },
  {
    id: 'timeout-retry',
    group: 'provider',
    chaos: { ...DEFAULT_CHAOS, providerTimeout: { enabled: true, persistence: 'transient' } },
  },
  {
    id: 'provider-failover',
    group: 'provider',
    chaos: { ...DEFAULT_CHAOS, providerUnavailable: { enabled: true, persistence: 'transient' } },
  },
  {
    id: 'total-outage',
    group: 'provider',
    chaos: { ...DEFAULT_CHAOS, providerUnavailable: { enabled: true, persistence: 'persistent' } },
  },
  {
    id: 'server-errors',
    group: 'provider',
    chaos: { ...DEFAULT_CHAOS, providerServerError: { enabled: true, persistence: 'transient' } },
  },
  {
    id: 'duplicate-webhook',
    group: 'webhook',
    chaos: { ...DEFAULT_CHAOS, duplicateWebhook: true },
  },
  {
    id: 'delayed-webhook',
    group: 'webhook',
    chaos: { ...DEFAULT_CHAOS, delayedWebhook: true },
  },
  {
    id: 'indeterminate-capture',
    group: 'unresolved',
    chaos: { ...DEFAULT_CHAOS, indeterminateCapture: true },
  },
  {
    id: 'risk-decline',
    group: 'baseline',
    chaos: DEFAULT_CHAOS,
    amountCents: RISK_LIMIT_CENTS + 50_000,
  },
]

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id)
}
