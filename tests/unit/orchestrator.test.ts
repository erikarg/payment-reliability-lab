import { describe, expect, it } from 'vitest'
import { RISK_LIMIT_CENTS } from '@/application/config'
import { createHarness } from './harness'

const PAYMENT = { amountCents: 24_900, currency: 'BRL', primaryProvider: 'AcquirerA' } as const

describe('payment orchestration', () => {
  it('walks the full lifecycle when nothing goes wrong', async () => {
    const harness = createHarness()
    const tx = await harness.orchestrator.run(PAYMENT)

    expect(harness.types(tx)).toEqual([
      'PAYMENT_CREATED',
      'AUTHORIZATION_REQUESTED',
      'AUTHORIZATION_ATTEMPTED',
      'PAYMENT_AUTHORIZED',
      'CAPTURE_REQUESTED',
      'PAYMENT_CAPTURED',
      'WEBHOOK_RECEIVED',
      'PAYMENT_COMPLETED',
    ])

    const aggregate = harness.aggregate(tx)
    expect(aggregate.state).toBe('COMPLETED')
    expect(aggregate.retries).toBe(0)
    expect(aggregate.fallbacks).toBe(0)
    expect(aggregate.authorizationId).toBeTruthy()
  })

  it('declines above the risk limit without spending a single retry', async () => {
    const harness = createHarness()
    const tx = await harness.orchestrator.run({ ...PAYMENT, amountCents: RISK_LIMIT_CENTS })

    const aggregate = harness.aggregate(tx)
    expect(aggregate.state).toBe('DECLINED')
    expect(aggregate.retries).toBe(0)
    expect(harness.types(tx)).not.toContain('RETRY_SCHEDULED')
    expect(harness.find(tx, 'PAYMENT_DECLINED')?.data.retryable).toBe(false)
  })

  describe('provider timeout', () => {
    it('retries, replays the original decision, and recovers', async () => {
      const harness = createHarness({
        chaos: { providerTimeout: { enabled: true, persistence: 'transient' } },
      })
      const tx = await harness.orchestrator.run(PAYMENT)
      const types = harness.types(tx)

      expect(types.filter((type) => type === 'AUTHORIZATION_ATTEMPTED')).toHaveLength(3)
      expect(types.filter((type) => type === 'PROVIDER_TIMEOUT')).toHaveLength(2)
      expect(types.filter((type) => type === 'RETRY_SCHEDULED')).toHaveLength(2)

      // The acquirer decided on the very first attempt; the answer was what got
      // lost. Retrying under the same key returns that decision rather than
      // authorizing a second time.
      expect(types).toContain('IDEMPOTENT_REPLAY_DETECTED')
      expect(harness.aggregate(tx).state).toBe('COMPLETED')
    })

    it('backs off further on each attempt', async () => {
      const harness = createHarness({
        chaos: { providerTimeout: { enabled: true, persistence: 'transient' } },
      })
      const tx = await harness.orchestrator.run(PAYMENT)

      const delays = harness
        .events(tx)
        .filter((event) => event.type === 'RETRY_SCHEDULED')
        .map((event) => event.data.delayMs as number)

      expect(delays).toHaveLength(2)
      expect(delays[1]).toBeGreaterThan(delays[0])
    })

    it('fails on infrastructure grounds once the attempts run out', async () => {
      const harness = createHarness({
        chaos: { providerTimeout: { enabled: true, persistence: 'persistent' } },
      })
      const tx = await harness.orchestrator.run(PAYMENT)

      const aggregate = harness.aggregate(tx)
      expect(aggregate.state).toBe('FAILED')
      expect(aggregate.state).not.toBe('DECLINED')
      expect(aggregate.retries).toBe(2)
      expect(harness.types(tx)).toContain('ALL_PROVIDERS_EXHAUSTED')
    })
  })

  describe('provider 5xx', () => {
    it('retries without replaying, because nothing was processed', async () => {
      const harness = createHarness({
        chaos: { providerServerError: { enabled: true, persistence: 'transient' } },
      })
      const tx = await harness.orchestrator.run(PAYMENT)
      const types = harness.types(tx)

      expect(types.filter((type) => type === 'PROVIDER_ERROR')).toHaveLength(2)
      expect(types).not.toContain('IDEMPOTENT_REPLAY_DETECTED')
      expect(harness.aggregate(tx).state).toBe('COMPLETED')
      expect(harness.find(tx, 'PROVIDER_ERROR')?.data.httpStatus).toBe(502)
      expect(harness.find(tx, 'PROVIDER_ERROR')?.data.indeterminate).toBe(false)
    })
  })

  describe('provider unavailable', () => {
    it('fails over instead of retrying a provider that is down', async () => {
      const harness = createHarness({
        chaos: { providerUnavailable: { enabled: true, persistence: 'transient' } },
      })
      const tx = await harness.orchestrator.run(PAYMENT)
      const types = harness.types(tx)

      expect(types).toContain('PROVIDER_UNAVAILABLE')
      expect(types).toContain('FALLBACK_PROVIDER_SELECTED')
      // Retrying an acquirer that is down buys nothing, so no retry is scheduled.
      expect(types).not.toContain('RETRY_SCHEDULED')

      const aggregate = harness.aggregate(tx)
      expect(aggregate.state).toBe('COMPLETED')
      expect(aggregate.provider).toBe('AcquirerB')
      expect(aggregate.primaryProvider).toBe('AcquirerA')
      expect(aggregate.fallbacks).toBe(1)
    })

    it('honours the chosen primary when failing over the other way', async () => {
      const harness = createHarness({
        primaryProvider: 'AcquirerB',
        chaos: { providerUnavailable: { enabled: true, persistence: 'transient' } },
      })
      const tx = await harness.orchestrator.run({ ...PAYMENT, primaryProvider: 'AcquirerB' })

      expect(harness.aggregate(tx).provider).toBe('AcquirerA')
    })

    it('gives up once there is nowhere left to fail over to', async () => {
      const harness = createHarness({
        chaos: { providerUnavailable: { enabled: true, persistence: 'persistent' } },
      })
      const tx = await harness.orchestrator.run(PAYMENT)

      expect(harness.aggregate(tx).state).toBe('FAILED')
      expect(harness.aggregate(tx).fallbacks).toBe(1)
      expect(harness.find(tx, 'ALL_PROVIDERS_EXHAUSTED')?.data.failedOver).toBe(true)
    })
  })

  describe('indeterminate capture', () => {
    it('holds the payment pending rather than calling it failed', async () => {
      const harness = createHarness({ chaos: { indeterminateCapture: true } })
      const tx = await harness.orchestrator.run(PAYMENT)

      const aggregate = harness.aggregate(tx)
      expect(aggregate.state).toBe('CAPTURE_PENDING')
      expect(aggregate.state).not.toBe('FAILED')
      expect(harness.types(tx)).toContain('CAPTURE_MARKED_PENDING')
      // Nothing settles a payment nobody can account for.
      expect(harness.types(tx)).not.toContain('PAYMENT_COMPLETED')
    })
  })

  it('produces the same run twice for the same seed and faults', async () => {
    const run = async () => {
      const harness = createHarness({
        seed: 4242,
        chaos: { providerTimeout: { enabled: true, persistence: 'transient' } },
      })
      const tx = await harness.orchestrator.run(PAYMENT)
      return {
        types: harness.types(tx),
        delays: harness
          .events(tx)
          .filter((event) => event.type === 'RETRY_SCHEDULED')
          .map((event) => event.data.delayMs),
      }
    }

    expect(await run()).toEqual(await run())
  })
})
