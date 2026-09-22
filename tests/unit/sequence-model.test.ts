import { describe, expect, it } from 'vitest'
import type { Mark } from '@/components/sequence-model'
import { buildSequence } from '@/components/sequence-model'
import { createHarness } from './harness'

const PAYMENT = { amountCents: 24_900, currency: 'BRL', primaryProvider: 'AcquirerA' } as const

function arrows(marks: readonly Mark[]) {
  return marks.filter((mark): mark is Extract<Mark, { kind: 'arrow' }> => mark.kind === 'arrow')
}

function waits(marks: readonly Mark[]) {
  return marks.filter((mark): mark is Extract<Mark, { kind: 'wait' }> => mark.kind === 'wait')
}

/**
 * The diagram is built from the log, so it can be asserted on rather than
 * squinted at. These tests say what each scenario must look like.
 */
describe('sequence diagram', () => {
  it('shows only the parties a payment actually involved', async () => {
    const harness = createHarness()
    const tx = await harness.orchestrator.run(PAYMENT)
    const { lanes } = buildSequence(harness.events(tx))

    expect(lanes.map((lane) => lane.id)).toEqual(['system', 'endpoint', 'AcquirerA'])
    expect(lanes.map((lane) => lane.kind)).toEqual(['system', 'endpoint', 'acquirer'])
  })

  it('draws a timeout as a call with nothing coming back', async () => {
    const harness = createHarness({
      chaos: { providerTimeout: { enabled: true, persistence: 'transient' } },
    })
    const tx = await harness.orchestrator.run(PAYMENT)
    const marks = buildSequence(harness.events(tx)).marks

    // Three requests went out; only the last one was answered.
    const outbound = arrows(marks).filter((mark) => mark.label.key === 'authorize')
    expect(outbound).toHaveLength(3)
    expect(marks.filter((mark) => mark.kind === 'lost')).toHaveLength(2)

    // The same key on every attempt is the reason retrying is safe at all.
    const keys = new Set(outbound.map((mark) => mark.chip))
    expect(keys.size).toBe(1)
    expect([...keys][0]).toMatch(/^idk…/)
  })

  it('draws the replayed decision differently from a fresh one', async () => {
    const harness = createHarness({
      chaos: { providerTimeout: { enabled: true, persistence: 'transient' } },
    })
    const tx = await harness.orchestrator.run(PAYMENT)

    const replay = arrows(buildSequence(harness.events(tx)).marks).find(
      (mark) => mark.style === 'replay',
    )

    expect(replay?.label.key).toBe('replayed')
    expect(replay?.to).toBe('system')
  })

  it('gives each backoff height in proportion to how long it waited', async () => {
    const harness = createHarness({
      chaos: { providerTimeout: { enabled: true, persistence: 'transient' } },
    })
    const tx = await harness.orchestrator.run(PAYMENT)

    const backoffs = waits(buildSequence(harness.events(tx)).marks).filter(
      (mark) => mark.reason === 'backoff',
    )

    expect(backoffs).toHaveLength(2)
    // The second wait is the longer one, and it is drawn taller.
    expect(backoffs[1].delayMs).toBeGreaterThan(backoffs[0].delayMs)
    expect(backoffs[1].height).toBeGreaterThan(backoffs[0].height)
  })

  it('marks a duplicate delivery as refused at the boundary, not applied', async () => {
    const harness = createHarness({ chaos: { duplicateWebhook: true } })
    const tx = await harness.orchestrator.run(PAYMENT)

    const refused = arrows(buildSequence(harness.events(tx)).marks).filter((mark) => mark.refused)

    expect(refused).toHaveLength(1)
    expect(refused[0].refused).toEqual({ key: 'duplicate' })
  })

  it('marks a late webhook with the stage it would have dragged the payment back to', async () => {
    const harness = createHarness({ chaos: { delayedWebhook: true } })
    const tx = await harness.orchestrator.run(PAYMENT)
    const marks = buildSequence(harness.events(tx)).marks

    const refused = arrows(marks).find((mark) => mark.refused)
    expect(refused?.refused).toEqual({ key: 'backwards', state: 'AUTHORIZED' })

    // The lateness itself is drawn, and clamped rather than allowed to run away.
    const late = waits(marks).find((mark) => mark.clamped)
    expect(late).toBeDefined()
  })

  it('routes every webhook through the endpoint that verifies it', async () => {
    const harness = createHarness()
    const tx = await harness.orchestrator.run(PAYMENT)

    const webhook = arrows(buildSequence(harness.events(tx)).marks).find((mark) => mark.via)

    expect(webhook?.from).toBe('AcquirerA')
    expect(webhook?.to).toBe('system')
    expect(webhook?.via).toBe('endpoint')

    // The endpoint has to sit between them, or the arrow never crosses it.
    const order = buildSequence(harness.events(tx)).lanes.map((lane) => lane.id)
    expect(order.indexOf('endpoint')).toBeLessThan(order.indexOf('AcquirerA'))
    expect(order.indexOf('system')).toBeLessThan(order.indexOf('endpoint'))
  })

  it('shows the failover and the second acquirer it moved to', async () => {
    const harness = createHarness({
      chaos: { providerUnavailable: { enabled: true, persistence: 'transient' } },
    })
    const tx = await harness.orchestrator.run(PAYMENT)
    const model = buildSequence(harness.events(tx))

    expect(model.lanes.map((lane) => lane.id)).toContain('AcquirerB')
    expect(model.marks.filter((mark) => mark.kind === 'note')).toHaveLength(1)

    const authorizeTargets = arrows(model.marks)
      .filter((mark) => mark.label.key === 'authorize')
      .map((mark) => mark.to)
    expect(authorizeTargets).toEqual(['AcquirerA', 'AcquirerB'])
  })

  it('advances exactly when the state machine does', async () => {
    const harness = createHarness()
    const tx = await harness.orchestrator.run(PAYMENT)
    const marks = buildSequence(harness.events(tx)).marks

    const bands = marks
      .filter((mark): mark is Extract<Mark, { kind: 'state' }> => mark.kind === 'state')
      .map((mark) => mark.state)

    expect(bands).toEqual(['CREATED', 'PROCESSING', 'AUTHORIZED', 'CAPTURED', 'COMPLETED'])
  })

  it('groups each call and its answer into one activation, sized by duration', async () => {
    const harness = createHarness()
    const tx = await harness.orchestrator.run(PAYMENT)

    const activations = buildSequence(harness.events(tx)).marks.filter(
      (mark): mark is Extract<Mark, { kind: 'activation' }> => mark.kind === 'activation',
    )

    // One for the authorization, one for the capture.
    expect(activations).toHaveLength(2)
    expect(activations.every((mark) => mark.tone === 'ok')).toBe(true)
    expect(activations.every((mark) => mark.endY > mark.y)).toBe(true)
    expect(activations.every((mark) => (mark.durationMs ?? 0) > 0)).toBe(true)
  })

  it('marks an activation that never got an answer as lost', async () => {
    const harness = createHarness({
      chaos: { providerTimeout: { enabled: true, persistence: 'transient' } },
    })
    const tx = await harness.orchestrator.run(PAYMENT)

    const tones = buildSequence(harness.events(tx))
      .marks.filter(
        (mark): mark is Extract<Mark, { kind: 'activation' }> => mark.kind === 'activation',
      )
      .map((mark) => mark.tone)

    // Two calls vanished, then one came back, then the capture.
    expect(tones).toEqual(['lost', 'lost', 'ok', 'ok'])
  })

  it('draws nothing for a payment that has not started', () => {
    expect(buildSequence([]).marks).toEqual([])
  })
})
