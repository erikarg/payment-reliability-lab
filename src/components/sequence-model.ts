import type { PaymentEvent } from '@/domain/events/event'
import type { PaymentState } from '@/domain/payment/states'
import { PROVIDER_IDS, type ProviderId } from '@/domain/provider/provider'

/**
 * Turns an event log into a sequence diagram.
 *
 * The log already records who called whom and when, so nothing here invents
 * information — it only decides how each fact is drawn. Labels are emitted as
 * keys rather than words: the model describes structure, the renderer supplies
 * language, and the tests can assert on a diagram without reading English.
 */

export type LaneId = 'system' | ProviderId | 'endpoint'

export interface Lane {
  readonly id: LaneId
  readonly kind: 'system' | 'acquirer' | 'endpoint'
}

/** What an arrow says, before anyone decides in which language to say it. */
export type ArrowLabel =
  | { readonly key: 'authorize' }
  | { readonly key: 'capture' }
  | { readonly key: 'getStatus' }
  | { readonly key: 'authorized' }
  | { readonly key: 'replayed' }
  | { readonly key: 'declined' }
  | { readonly key: 'captured' }
  | { readonly key: 'unavailable' }
  | { readonly key: 'serverError'; readonly status: string }
  | { readonly key: 'statusUnknown' }
  | { readonly key: 'statusResolved'; readonly status: string }
  | { readonly key: 'webhook'; readonly kind: string }

export type Refusal =
  | { readonly key: 'duplicate' }
  | { readonly key: 'backwards'; readonly state: string }
  | { readonly key: 'other'; readonly reason: string }

export type ArrowStyle = 'request' | 'response' | 'replay' | 'error' | 'pending'

export type Mark =
  | {
      readonly kind: 'arrow'
      readonly id: string
      readonly y: number
      readonly from: LaneId
      readonly to: LaneId
      readonly label: ArrowLabel
      readonly chip?: string
      readonly style: ArrowStyle
      /** Drawn as a node where the arrow crosses this lane on its way. */
      readonly via?: LaneId
      /** Set when the arrow arrived but was refused rather than applied. */
      readonly refused?: Refusal
    }
  /** A request that never came back. The absence is the point. */
  | { readonly kind: 'lost'; readonly id: string; readonly y: number; readonly at: LaneId }
  /**
   * The bar on a lifeline between a request going out and its answer coming
   * back — the classic activation box. Borrowed from how run timelines group a
   * scheduled/started/completed triple into one row: the pair reads as one
   * unit of work, and its duration becomes something you can see rather than
   * something you read off a label.
   */
  | {
      readonly kind: 'activation'
      readonly id: string
      readonly y: number
      readonly endY: number
      readonly lane: LaneId
      readonly tone: 'ok' | 'error' | 'lost'
      readonly durationMs: number | null
    }
  | {
      readonly kind: 'wait'
      readonly id: string
      readonly y: number
      readonly height: number
      readonly reason: 'backoff' | 'awaiting'
      readonly delayMs: number
      /** True when the real duration was longer than the drawing allows. */
      readonly clamped: boolean
    }
  | { readonly kind: 'state'; readonly id: string; readonly y: number; readonly state: PaymentState }
  | { readonly kind: 'note'; readonly id: string; readonly y: number; readonly provider: ProviderId }

export interface SequenceModel {
  readonly lanes: readonly Lane[]
  readonly marks: readonly Mark[]
  readonly height: number
}

const ROW = 40
const STATE_ROW = 30
const TOP = 16
const BOTTOM = 20

/**
 * Waits are the one place where duration itself is the lesson, so they get
 * height instead of a timestamp. Everything else is a uniform row — which also
 * stops a single 900ms wait from swallowing the canvas.
 */
const WAIT_MIN_MS = 60
const WAIT_PX_PER_MS = 0.5
const WAIT_MIN_PX = 26
const WAIT_MAX_PX = 128

/**
 * The endpoint sits next to our own system rather than at the far edge, because
 * an inbound webhook has to *cross* it on its way in. Put it last and the
 * verification node ends up floating beside an arrow it never touches.
 */
const LANE_ORDER: LaneId[] = ['system', 'endpoint', 'AcquirerA', 'AcquirerB']

function laneKind(id: LaneId): Lane['kind'] {
  if (id === 'system') return 'system'
  return id === 'endpoint' ? 'endpoint' : 'acquirer'
}

function str(data: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = data[key]
  return typeof value === 'string' ? value : null
}

function num(data: Readonly<Record<string, unknown>>, key: string): number | null {
  const value = data[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function providerLane(event: PaymentEvent): ProviderId | null {
  const provider = str(event.data, 'provider')
  return PROVIDER_IDS.includes(provider as ProviderId) ? (provider as ProviderId) : null
}

/** Long keys are unreadable on an arrow; the tail is enough to match them by eye. */
function shortKey(key: string | null): string | undefined {
  return key ? `idk…${key.slice(-4)}` : undefined
}

function waitHeight(delayMs: number): { height: number; clamped: boolean } {
  const raw = delayMs * WAIT_PX_PER_MS
  return {
    height: Math.round(Math.min(Math.max(raw, WAIT_MIN_PX), WAIT_MAX_PX)),
    clamped: raw > WAIT_MAX_PX,
  }
}

export function buildSequence(events: readonly PaymentEvent[]): SequenceModel {
  const marks: Mark[] = []
  const used = new Set<LaneId>(['system'])

  let y = TOP
  let replayPending = false
  let lastArrow = -1
  /** The outbound call still waiting for its answer, if there is one. */
  let openCall: { lane: LaneId; y: number; id: string } | null = null

  const push = (mark: Mark, advance: number) => {
    marks.push(mark)
    y += advance
  }

  const arrow = (
    event: PaymentEvent,
    from: LaneId,
    to: LaneId,
    label: ArrowLabel,
    style: ArrowStyle,
    extra: { chip?: string; via?: LaneId } = {},
  ) => {
    used.add(from)
    used.add(to)
    if (extra.via) used.add(extra.via)

    lastArrow = marks.length
    push({ kind: 'arrow', id: event.id, y, from, to, label, style, ...extra }, ROW)
  }

  /** Opens an activation bar on the callee's lifeline. */
  const openOn = (lane: LaneId, id: string) => {
    openCall = { lane, y: y - ROW + ROW / 2, id }
  }

  /** Closes it, and records how long the call actually took. */
  const closeCall = (tone: 'ok' | 'error' | 'lost', durationMs: number | null, endY: number) => {
    if (!openCall) return
    marks.push({
      kind: 'activation',
      id: `${openCall.id}_act`,
      y: openCall.y,
      endY,
      lane: openCall.lane,
      tone,
      durationMs,
    })
    openCall = null
  }

  /** Attaches a refusal to the arrow that just arrived, rather than adding a row. */
  const refuseLast = (refused: Refusal) => {
    const mark = marks[lastArrow]
    if (mark?.kind === 'arrow') marks[lastArrow] = { ...mark, refused }
  }

  const waitFor = (event: PaymentEvent, delayMs: number, reason: 'backoff' | 'awaiting') => {
    if (delayMs < WAIT_MIN_MS) return
    const { height, clamped } = waitHeight(delayMs)
    push({ kind: 'wait', id: `${event.id}_wait`, y, height, reason, delayMs, clamped }, height)
  }

  for (const event of events) {
    const lane = providerLane(event)
    const chip = shortKey(str(event.data, 'idempotencyKey'))

    switch (event.type) {
      case 'AUTHORIZATION_ATTEMPTED':
        if (lane) {
          arrow(event, 'system', lane, { key: 'authorize' }, 'request', { chip })
          openOn(lane, event.id)
        }
        break

      case 'CAPTURE_REQUESTED':
        if (lane) {
          arrow(event, 'system', lane, { key: 'capture' }, 'request', { chip })
          openOn(lane, event.id)
        }
        break

      case 'RECONCILIATION_STARTED':
        if (lane) {
          arrow(event, 'system', lane, { key: 'getStatus' }, 'request', { chip })
          openOn(lane, event.id)
        }
        break

      case 'PROVIDER_TIMEOUT':
        if (lane) {
          used.add(lane)
          closeCall('lost', num(event.data, 'latencyMs'), y + ROW / 2)
          push({ kind: 'lost', id: event.id, y, at: lane }, ROW)
        }
        break

      case 'PROVIDER_ERROR':
        if (lane) {
          closeCall('error', num(event.data, 'latencyMs'), y + ROW / 2)
          arrow(
            event,
            lane,
            'system',
            { key: 'serverError', status: String(num(event.data, 'httpStatus') ?? 500) },
            'error',
          )
        }
        break

      case 'PROVIDER_UNAVAILABLE':
        if (lane) {
          closeCall('error', num(event.data, 'latencyMs'), y + ROW / 2)
          arrow(event, lane, 'system', { key: 'unavailable' }, 'error')
        }
        break

      case 'IDEMPOTENT_REPLAY_DETECTED':
        // Not a message of its own — it changes how the reply that follows reads.
        replayPending = true
        break

      case 'PAYMENT_AUTHORIZED':
        if (lane && event.source === 'acquirer') {
          closeCall('ok', num(event.data, 'latencyMs'), y + ROW / 2)
          arrow(
            event,
            lane,
            'system',
            replayPending ? { key: 'replayed' } : { key: 'authorized' },
            replayPending ? 'replay' : 'response',
          )
          replayPending = false
        }
        break

      case 'PAYMENT_DECLINED':
        if (lane) {
          closeCall('error', num(event.data, 'latencyMs'), y + ROW / 2)
          arrow(event, lane, 'system', { key: 'declined' }, 'error')
        }
        break

      case 'PAYMENT_CAPTURED':
        if (lane && event.source === 'acquirer') {
          closeCall('ok', num(event.data, 'latencyMs'), y + ROW / 2)
          arrow(event, lane, 'system', { key: 'captured' }, 'response')
        }
        break

      case 'RETRY_SCHEDULED':
        waitFor(event, num(event.data, 'delayMs') ?? 0, 'backoff')
        break

      case 'FALLBACK_PROVIDER_SELECTED':
        if (lane) {
          used.add(lane)
          push({ kind: 'note', id: event.id, y, provider: lane }, STATE_ROW)
        }
        break

      case 'RECONCILIATION_INCONCLUSIVE':
        if (lane) {
          closeCall('error', num(event.data, 'latencyMs'), y + ROW / 2)
          arrow(event, lane, 'system', { key: 'statusUnknown' }, 'pending')
        }
        break

      case 'RECONCILIATION_RESOLVED':
        if (lane) {
          closeCall('ok', num(event.data, 'latencyMs'), y + ROW / 2)
          arrow(
            event,
            lane,
            'system',
            { key: 'statusResolved', status: str(event.data, 'providerStatus') ?? '—' },
            'response',
          )
        }
        break

      case 'WEBHOOK_RECEIVED': {
        waitFor(event, num(event.data, 'scheduledDelayMs') ?? 0, 'awaiting')

        if (lane) {
          arrow(
            event,
            lane,
            'system',
            { key: 'webhook', kind: str(event.data, 'kind') ?? 'webhook' },
            'request',
            { via: 'endpoint' },
          )
        }
        break
      }

      case 'WEBHOOK_DUPLICATE_IGNORED':
        refuseLast({ key: 'duplicate' })
        break

      case 'WEBHOOK_IGNORED':
        refuseLast(
          str(event.data, 'reason') === 'out-of-order'
            ? { key: 'backwards', state: str(event.data, 'reportedState') ?? '—' }
            : { key: 'other', reason: str(event.data, 'reason') ?? '—' },
        )
        break

      case 'WEBHOOK_SIGNATURE_REJECTED':
        refuseLast({ key: 'other', reason: 'invalid-signature' })
        break

      case 'PAYMENT_CREATED':
        push({ kind: 'state', id: event.id, y, state: 'CREATED' }, STATE_ROW)
        break

      default:
        break
    }

    // Bands come straight off `transitionsTo`, so the diagram advances exactly
    // when the state machine does and cannot drift from it.
    if (event.transitionsTo) {
      push({ kind: 'state', id: `${event.id}_state`, y, state: event.transitionsTo }, STATE_ROW)
    }
  }

  return {
    lanes: LANE_ORDER.filter((id) => used.has(id)).map((id) => ({ id, kind: laneKind(id) })),
    marks,
    height: y + BOTTOM,
  }
}
