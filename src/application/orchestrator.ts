import { WEBHOOK_TARGET_STATE, type WebhookKind } from '@/domain/events/webhook'
import { evaluateTransition } from '@/domain/payment/transitions'
import { policyFor } from '@/domain/provider/failure'
import type {
  PaymentProvider,
  ProviderFailureKind,
  ProviderId,
  ProviderResult,
} from '@/domain/provider/provider'
import { decide } from '@/domain/reconciliation/policy'
import type { PaymentEventType } from '@/domain/events/event'
import { EventRecorder } from './recorder'
import { RETRY_POLICY, backoffDelayMs } from './retry'
import type {
  Clock,
  IdGenerator,
  ProviderRegistry,
  Rng,
  TransactionLog,
  WebhookChannel,
} from './ports'

const FAILURE_EVENT: Record<ProviderFailureKind, PaymentEventType> = {
  timeout: 'PROVIDER_TIMEOUT',
  'server-error': 'PROVIDER_ERROR',
  unavailable: 'PROVIDER_UNAVAILABLE',
}

export interface OrchestratorDeps {
  readonly log: TransactionLog
  readonly clock: Clock
  readonly rng: Rng
  readonly ids: IdGenerator
  readonly registry: ProviderRegistry
  readonly webhooks: WebhookChannel
}

export interface RunPaymentInput {
  readonly amountCents: number
  readonly currency: string
  readonly primaryProvider: ProviderId
}


function failureData(result: Exclude<ProviderResult<unknown>, { kind: 'ok' }>) {
  return result.kind === 'server-error'
    ? { latencyMs: result.latencyMs, httpStatus: result.status }
    : { latencyMs: result.latencyMs }
}

/**
 * Drives a payment from creation to a terminal state.
 *
 * It holds no state of its own and knows nothing about fault injection: every
 * decision it makes comes from what the provider interface returned and what
 * the transition table permits. Swapping the simulated acquirers for real ones
 * would not change a line in here.
 */
export class PaymentOrchestrator {
  private readonly recorder: EventRecorder

  constructor(private readonly deps: OrchestratorDeps) {
    this.recorder = new EventRecorder(deps.log, deps.clock, deps.ids)
  }

  async run(input: RunPaymentInput): Promise<string> {
    const transactionId = this.deps.ids.next('txn')
    const idempotencyKey = this.deps.ids.next('idk')

    this.recorder.record(transactionId, {
      type: 'PAYMENT_CREATED',
      source: 'orchestrator',
      data: {
        amountCents: input.amountCents,
        currency: input.currency,
        provider: input.primaryProvider,
        idempotencyKey,
      },
    })

    this.recorder.record(transactionId, {
      type: 'AUTHORIZATION_REQUESTED',
      source: 'orchestrator',
      transitionsTo: 'PROCESSING',
      data: { provider: input.primaryProvider, idempotencyKey },
    })

    const authorization = await this.authorize(transactionId, idempotencyKey, input)
    if (!authorization) return transactionId

    const { provider, authorizationId } = authorization

    // Started here, awaited at the very end. When the acquirer plans a late
    // authorization webhook it has to be in flight while capture proceeds —
    // that is the whole point of the scenario.
    const lateAuthWebhooks = this.deliverPlan(
      transactionId,
      provider,
      'authorization.succeeded',
      input.amountCents,
    )

    const captured = await this.capture(transactionId, provider, {
      authorizationId,
      idempotencyKey,
      amountCents: input.amountCents,
    })

    if (captured) {
      await this.deliverPlan(transactionId, provider, 'payment.settled', input.amountCents)
    }

    await lateAuthWebhooks
    return transactionId
  }

  /**
   * Authorization, with retries on the same provider and one failover to the
   * other. Every attempt carries the same idempotency key, which is what makes
   * retrying a timed-out authorization safe rather than reckless.
   */
  private async authorize(
    transactionId: string,
    idempotencyKey: string,
    input: RunPaymentInput,
  ): Promise<{ provider: PaymentProvider; authorizationId: string } | null> {
    let provider = this.deps.registry.get(input.primaryProvider)
    let failedOver = false
    let attempt = 0

    for (;;) {
      attempt += 1
      const isFinalAttempt = attempt >= RETRY_POLICY.maxAttempts

      this.recorder.record(transactionId, {
        type: 'AUTHORIZATION_ATTEMPTED',
        source: 'orchestrator',
        data: { provider: provider.id, attempt, idempotencyKey, maxAttempts: RETRY_POLICY.maxAttempts },
      })

      const result = await provider.authorize({
        transactionId,
        amountCents: input.amountCents,
        currency: input.currency,
        idempotencyKey,
        attempt,
        isFinalAttempt,
      })

      if (result.kind === 'ok') {
        if (result.value.replayed) {
          this.recorder.record(transactionId, {
            type: 'IDEMPOTENT_REPLAY_DETECTED',
            source: 'acquirer',
            data: { provider: provider.id, idempotencyKey, attempt, decision: result.value.decision },
          })
        }

        if (result.value.decision === 'declined') {
          this.recorder.record(transactionId, {
            type: 'PAYMENT_DECLINED',
            source: 'acquirer',
            transitionsTo: 'DECLINED',
            data: {
              provider: provider.id,
              attempt,
              declineReason: result.value.declineReason,
              retryable: false,
            },
          })
          return null
        }

        const authorizationId = result.value.authorizationId as string
        this.recorder.record(transactionId, {
          type: 'PAYMENT_AUTHORIZED',
          source: 'acquirer',
          transitionsTo: 'AUTHORIZED',
          data: { provider: provider.id, attempt, authorizationId, latencyMs: result.latencyMs },
        })
        return { provider, authorizationId }
      }

      const policy = policyFor(result.kind)
      this.recorder.record(transactionId, {
        type: FAILURE_EVENT[result.kind],
        source: 'acquirer',
        data: {
          provider: provider.id,
          attempt,
          indeterminate: policy.indeterminate,
          ...failureData(result),
        },
      })

      if (policy.triggersFallback && !failedOver) {
        const fallback = this.deps.registry.fallbackFor(provider.id)
        if (fallback) {
          this.recorder.record(transactionId, {
            type: 'FALLBACK_PROVIDER_SELECTED',
            source: 'orchestrator',
            data: { provider: fallback.id, previousProvider: provider.id, idempotencyKey },
          })
          failedOver = true
          provider = fallback
          // The new provider gets its own attempt budget: the previous one's
          // failures say nothing about this one's health.
          attempt = 0
          continue
        }
      }

      if (policy.retryable && !isFinalAttempt) {
        const delayMs = backoffDelayMs(attempt, this.deps.rng)
        this.recorder.record(transactionId, {
          type: 'RETRY_SCHEDULED',
          source: 'orchestrator',
          data: {
            provider: provider.id,
            nextAttempt: attempt + 1,
            maxAttempts: RETRY_POLICY.maxAttempts,
            delayMs,
            idempotencyKey,
          },
        })
        await this.deps.clock.sleep(delayMs)
        continue
      }

      this.recorder.record(transactionId, {
        type: 'ALL_PROVIDERS_EXHAUSTED',
        source: 'orchestrator',
        transitionsTo: 'FAILED',
        data: { provider: provider.id, attempts: attempt, failedOver },
      })
      return null
    }
  }

  /**
   * Capture. A capture we cannot confirm is never reported as failed — it goes
   * to CAPTURE_PENDING and waits for reconciliation, because "the response was
   * lost" and "the money was not taken" are different facts.
   */
  private async capture(
    transactionId: string,
    provider: PaymentProvider,
    input: { authorizationId: string; idempotencyKey: string; amountCents: number },
  ): Promise<boolean> {
    this.recorder.record(transactionId, {
      type: 'CAPTURE_REQUESTED',
      source: 'orchestrator',
      data: { provider: provider.id, authorizationId: input.authorizationId },
    })

    const result = await provider.capture({
      transactionId,
      authorizationId: input.authorizationId,
      amountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey,
      attempt: 1,
      isFinalAttempt: true,
    })

    if (result.kind === 'ok') {
      this.recorder.record(transactionId, {
        type: 'PAYMENT_CAPTURED',
        source: 'acquirer',
        transitionsTo: 'CAPTURED',
        data: { provider: provider.id, captureId: result.value.captureId, latencyMs: result.latencyMs },
      })
      return true
    }

    this.recorder.record(transactionId, {
      type: FAILURE_EVENT[result.kind],
      source: 'acquirer',
      data: {
        provider: provider.id,
        phase: 'capture',
        indeterminate: policyFor(result.kind).indeterminate,
        ...failureData(result),
      },
    })

    this.recorder.record(transactionId, {
      type: 'CAPTURE_MARKED_PENDING',
      source: 'orchestrator',
      transitionsTo: 'CAPTURE_PENDING',
      data: {
        provider: provider.id,
        authorizationId: input.authorizationId,
        idempotencyKey: input.idempotencyKey,
        reason: result.kind,
      },
    })
    return false
  }

  /**
   * Asks the provider what actually happened to a capture we lost track of.
   * An inconclusive answer is a valid answer: the payment stays pending and the
   * operator can ask again.
   */
  async reconcile(transactionId: string): Promise<void> {
    const aggregate = this.deps.log.aggregate(transactionId)
    if (!aggregate || aggregate.state !== 'CAPTURE_PENDING' || !aggregate.provider) return

    const provider = this.deps.registry.get(aggregate.provider)
    const attempt = aggregate.reconciliationAttempts + 1

    this.recorder.record(transactionId, {
      type: 'RECONCILIATION_STARTED',
      source: 'reconciliation',
      data: { provider: provider.id, attempt, idempotencyKey: aggregate.idempotencyKey },
    })

    const result = await provider.getStatus({
      transactionId,
      idempotencyKey: aggregate.idempotencyKey,
      attempt,
    })

    if (result.kind !== 'ok') {
      this.recorder.record(transactionId, {
        type: 'RECONCILIATION_INCONCLUSIVE',
        source: 'reconciliation',
        data: { provider: provider.id, attempt, failure: result.kind },
      })
      return
    }

    const decision = decide(result.value)

    if (decision.kind === 'inconclusive') {
      this.recorder.record(transactionId, {
        type: 'RECONCILIATION_INCONCLUSIVE',
        source: 'reconciliation',
        data: { provider: provider.id, attempt, providerStatus: result.value.status },
      })
      return
    }

    this.recorder.record(transactionId, {
      type: 'RECONCILIATION_RESOLVED',
      source: 'reconciliation',
      transitionsTo: decision.targetState,
      data: {
        provider: provider.id,
        attempt,
        providerStatus: result.value.status,
        captureId: decision.captureId,
        resolvedTo: decision.targetState,
      },
    })

    if (decision.targetState === 'CAPTURED') {
      await this.deliverPlan(transactionId, provider, 'payment.settled', aggregate.amountCents)
    }
  }

  /** Delivers every webhook the acquirer said it would attempt, in schedule order. */
  private async deliverPlan(
    transactionId: string,
    provider: PaymentProvider,
    kind: WebhookKind,
    amountCents: number,
  ): Promise<void> {
    const plan = [...provider.planWebhooks({ kind, transactionId })].sort(
      (a, b) => a.delayMs - b.delayMs,
    )

    let waited = 0
    for (const delivery of plan) {
      const scheduledDelayMs = Math.max(0, delivery.delayMs - waited)
      await this.deps.clock.sleep(scheduledDelayMs)
      waited = delivery.delayMs

      await this.receive(transactionId, provider.id, kind, delivery.providerEventId, {
        amountCents,
        scheduledDelayMs,
      })
    }
  }

  /**
   * Handles one inbound webhook. Two independent guards apply, in order: the
   * event id must not have been processed before, and the state it claims must
   * be reachable from where the payment actually is.
   */
  private async receive(
    transactionId: string,
    providerId: ProviderId,
    kind: WebhookKind,
    providerEventId: string,
    delivery: { amountCents: number; scheduledDelayMs: number },
  ): Promise<void> {
    const before = this.deps.log.aggregate(transactionId)
    if (!before) return

    const alreadyProcessed = before.processedWebhookIds.includes(providerEventId)

    const sent = await this.deps.webhooks.send({
      provider: providerId,
      kind,
      transactionId,
      providerEventId,
      amountCents: delivery.amountCents,
      occurredAt: this.deps.clock.now(),
    })

    if (!sent.ok) {
      this.recorder.record(transactionId, {
        type: sent.reason === 'invalid-signature' ? 'WEBHOOK_SIGNATURE_REJECTED' : 'WEBHOOK_IGNORED',
        source: 'webhook-gateway',
        data: { provider: providerId, kind, providerEventId, reason: sent.reason },
      })
      return
    }

    const webhook = sent.webhook
    const targetState = WEBHOOK_TARGET_STATE[webhook.kind]

    this.recorder.record(transactionId, {
      type: 'WEBHOOK_RECEIVED',
      source: 'webhook-gateway',
      data: {
        provider: providerId,
        kind: webhook.kind,
        providerEventId,
        targetState,
        signatureVerified: true,
        scheduledDelayMs: delivery.scheduledDelayMs,
        rawPayload: JSON.parse(sent.rawBody) as unknown,
      },
    })

    if (alreadyProcessed) {
      this.recorder.record(transactionId, {
        type: 'WEBHOOK_DUPLICATE_IGNORED',
        source: 'webhook-gateway',
        data: { provider: providerId, kind: webhook.kind, providerEventId },
      })
      return
    }

    const current = this.deps.log.aggregate(transactionId)
    if (!current) return

    const verdict = evaluateTransition(current.state, targetState)

    if (verdict.outcome === 'allowed') {
      this.recorder.record(transactionId, {
        type: targetState === 'COMPLETED' ? 'PAYMENT_COMPLETED' : 'PAYMENT_AUTHORIZED',
        source: 'webhook-gateway',
        transitionsTo: targetState,
        data: { provider: providerId, providerEventId, kind: webhook.kind },
      })
      return
    }

    const reason = verdict.outcome === 'invalid' ? verdict.reason : verdict.outcome

    this.recorder.record(transactionId, {
      type: 'WEBHOOK_IGNORED',
      source: 'webhook-gateway',
      data: {
        provider: providerId,
        kind: webhook.kind,
        providerEventId,
        reason,
        currentState: current.state,
        reportedState: targetState,
      },
    })
  }
}
