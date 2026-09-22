import { RISK_LIMIT_CENTS, type ChaosConfig, type InjectedFault } from '@/application/config'
import type { Clock, IdGenerator, ProviderRegistry, Rng } from '@/application/ports'
import { policyFor } from '@/domain/provider/failure'
import type {
  AuthorizationOutcome,
  AuthorizationRequest,
  CaptureOutcome,
  CaptureRequest,
  PaymentProvider,
  PlannedWebhook,
  ProviderFailureKind,
  ProviderId,
  ProviderResult,
  StatusOutcome,
  StatusRequest,
  WebhookPlanRequest,
} from '@/domain/provider/provider'

/** Each acquirer feels slightly different, which makes a failover visible. */
const LATENCY: Record<ProviderId, { authorize: [number, number]; capture: [number, number] }> = {
  AcquirerA: { authorize: [140, 260], capture: [120, 220] },
  AcquirerB: { authorize: [200, 380], capture: [180, 300] },
}

const SETTLEMENT_WEBHOOK_MS = 120
const DUPLICATE_GAP_MS = 90
/** Comfortably longer than capture plus settlement, so a late webhook is late at any speed. */
const LATE_WEBHOOK_MS = 900

export interface AcquirerOptions {
  readonly id: ProviderId
  /** Whether this acquirer is the one the operator selected to go to first. */
  readonly isPrimary: boolean
  readonly chaos: ChaosConfig
  readonly clock: Clock
  readonly rng: Rng
  readonly ids: IdGenerator
}

/**
 * A simulated acquirer. Both `AcquirerA` and `AcquirerB` are this class behind
 * the `PaymentProvider` interface — the differences that matter are in the
 * configuration, not in the orchestration code that calls them.
 *
 * Every fault the lab can inject is decided here. Nothing above this layer ever
 * reads the chaos settings.
 */
class SimulatedAcquirer implements PaymentProvider {
  readonly id: ProviderId

  /**
   * Idempotency keys this acquirer has already decided on. Per acquirer, never
   * shared — failing over to the other one really is a fresh authorization,
   * which is exactly the risk a failover carries.
   */
  private readonly decisions = new Map<string, AuthorizationOutcome>()

  constructor(private readonly options: AcquirerOptions) {
    this.id = options.id
  }

  async authorize(request: AuthorizationRequest): Promise<ProviderResult<AuthorizationOutcome>> {
    const latencyMs = this.options.rng.between(...LATENCY[this.id].authorize)
    const fault = this.faultFor(request.isFinalAttempt)

    // A 502 or a refused connection means the request never reached the
    // decision engine, so there is nothing to remember and a retry starts
    // clean. A timeout is the opposite case, handled below.
    if (fault && !policyFor(fault).indeterminate) {
      await this.options.clock.sleep(latencyMs)
      return this.asFailure(fault, latencyMs)
    }

    // Everything past this point was processed. The decision is made and stored
    // *before* the response can go missing, which is precisely why a timed-out
    // authorization is indeterminate rather than undone.
    const previous = this.decisions.get(request.idempotencyKey)
    const outcome: AuthorizationOutcome = previous
      ? { ...previous, replayed: true }
      : this.newDecision(request)

    if (!previous) this.decisions.set(request.idempotencyKey, outcome)

    await this.options.clock.sleep(latencyMs)

    if (fault) return this.asFailure(fault, latencyMs)

    return { kind: 'ok', value: outcome, latencyMs }
  }

  async capture(request: CaptureRequest): Promise<ProviderResult<CaptureOutcome>> {
    const latencyMs = this.options.rng.between(...LATENCY[this.id].capture)
    await this.options.clock.sleep(latencyMs)

    // A capture the acquirer cannot answer for is reported as a timeout, which
    // is what makes it indeterminate rather than failed.
    if (this.options.chaos.indeterminateCapture) {
      return { kind: 'timeout', latencyMs }
    }

    // Capture ids trace back to the authorization they settle, which is what
    // makes a reconciliation query answerable at all.
    return {
      kind: 'ok',
      value: { captureId: `cap_${request.authorizationId.replace(/^auth_/, '')}` },
      latencyMs,
    }
  }

  async getStatus(request: StatusRequest): Promise<ProviderResult<StatusOutcome>> {
    const latencyMs = this.options.rng.between(100, 180)
    await this.options.clock.sleep(latencyMs)

    // Providers do not always know either, at least not immediately. The first
    // query can come back empty-handed; later ones settle the question.
    if (request.attempt === 1 && this.options.rng.next() < 0.3) {
      return { kind: 'ok', value: { status: 'unknown', captureId: null }, latencyMs }
    }

    if (this.options.rng.next() < 0.85) {
      return {
        kind: 'ok',
        value: { status: 'captured', captureId: this.options.ids.next('cap') },
        latencyMs,
      }
    }

    return { kind: 'ok', value: { status: 'not-captured', captureId: null }, latencyMs }
  }

  planWebhooks(request: WebhookPlanRequest): readonly PlannedWebhook[] {
    if (request.kind === 'authorization.succeeded') {
      // Authorization is confirmed synchronously, so normally there is nothing
      // to send. Under the delayed-webhook fault the acquirer emits a late
      // confirmation that arrives after settlement — the out-of-order case.
      return this.options.chaos.delayedWebhook
        ? [{ providerEventId: `whk_${request.transactionId}_auth`, delayMs: LATE_WEBHOOK_MS }]
        : []
    }

    const providerEventId = `whk_${request.transactionId}_settled`
    const first: PlannedWebhook = { providerEventId, delayMs: SETTLEMENT_WEBHOOK_MS }

    // At-least-once delivery: the same event id, sent twice.
    return this.options.chaos.duplicateWebhook
      ? [first, { providerEventId, delayMs: SETTLEMENT_WEBHOOK_MS + DUPLICATE_GAP_MS }]
      : [first]
  }

  private newDecision(request: AuthorizationRequest): AuthorizationOutcome {
    if (request.amountCents >= RISK_LIMIT_CENTS) {
      return {
        decision: 'declined',
        authorizationId: null,
        declineReason: 'risk-limit',
        replayed: false,
      }
    }

    return {
      decision: 'approved',
      authorizationId: this.options.ids.next('auth'),
      declineReason: null,
      replayed: false,
    }
  }

  /**
   * Which fault, if any, this call runs into. Unavailability wins over the
   * others: an acquirer that is down never gets far enough to time out.
   */
  private faultFor(isFinalAttempt: boolean): ProviderFailureKind | null {
    const { providerUnavailable, providerTimeout, providerServerError } = this.options.chaos

    // A transient outage is one the fallback can absorb; a persistent one takes
    // both acquirers down and there is nowhere left to go.
    if (providerUnavailable.enabled) {
      const down = providerUnavailable.persistence === 'persistent' || this.options.isPrimary
      if (down) return 'unavailable'
    }

    if (providerTimeout.enabled && this.clears(providerTimeout, isFinalAttempt)) return 'timeout'
    if (providerServerError.enabled && this.clears(providerServerError, isFinalAttempt)) {
      return 'server-error'
    }

    return null
  }

  /**
   * A transient fault affects every attempt but the last, so the retry budget
   * is enough to recover. A persistent one never clears.
   */
  private clears(fault: InjectedFault, isFinalAttempt: boolean): boolean {
    return fault.persistence === 'persistent' ? true : !isFinalAttempt
  }

  private asFailure(kind: ProviderFailureKind, latencyMs: number): ProviderResult<never> {
    if (kind === 'server-error') return { kind, status: 502, latencyMs }
    return { kind, latencyMs }
  }
}

export interface RegistryOptions {
  readonly primary: ProviderId
  readonly chaos: ChaosConfig
  readonly clock: Clock
  readonly rng: Rng
  readonly ids: IdGenerator
}

export function createProviderRegistry(options: RegistryOptions): ProviderRegistry {
  const build = (id: ProviderId) =>
    new SimulatedAcquirer({
      id,
      isPrimary: id === options.primary,
      chaos: options.chaos,
      clock: options.clock,
      rng: options.rng,
      ids: options.ids,
    })

  const providers: Record<ProviderId, PaymentProvider> = {
    AcquirerA: build('AcquirerA'),
    AcquirerB: build('AcquirerB'),
  }

  return {
    get: (id) => providers[id],
    fallbackFor: (id) => providers[id === 'AcquirerA' ? 'AcquirerB' : 'AcquirerA'],
  }
}
