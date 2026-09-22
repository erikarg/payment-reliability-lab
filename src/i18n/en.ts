/**
 * The reference dictionary. Its shape is the contract every other locale has to
 * satisfy — `Dictionary = typeof en` — so a missing or misspelled key is a
 * compile error rather than a blank space someone notices in production.
 *
 * Wording lives here and nowhere else. The domain and application layers record
 * facts; every sentence in the product is written in this folder.
 */
export const en = {
  locale: { name: 'English', short: 'EN' },

  app: {
    title: 'Payment Reliability Lab',
    tagline:
      'A simulated payment flow you can break on purpose. Inject faults, watch the state machine refuse the moves that would corrupt it, and reconcile what was left unresolved.',
    seed: (seed: number) => `seed ${seed}`,
    language: 'Language',
    exportSession: 'export session',
    disclaimer:
      'A reliability simulation, not a payment gateway. No money moves, no acquirer is contacted, and every provider in here is a few hundred lines of TypeScript pretending.',
  },

  simulator: {
    title: 'Payment simulator',
    amount: 'Amount',
    riskWarning: (limit: string) =>
      `At or above ${limit} the acquirer refuses on risk. That is a decision, not a fault — retries will not change it.`,
    primaryProvider: 'Primary provider',
    seed: 'Seed',
    newSeed: 'New seed',
    speed: 'Speed',
    run: 'Run payment',
    running: 'Running…',
    determinism: 'The same seed and the same faults produce the same run, delays included.',
  },

  chaos: {
    title: 'Chaos controls',
    none: 'none active',
    active: (count: number) => `${count} active`,
    footnote:
      'Faults are read only by the acquirer adapters. The orchestration code cannot see this panel — it reacts to what the provider interface returns.',
    persistence: (fault: string) => `${fault} persistence`,
    faults: {
      providerTimeout: {
        label: 'Provider timeout',
        detail: 'Authorization never answers. The request may still have been processed.',
        transient: 'recovers',
        persistent: 'never clears',
      },
      providerServerError: {
        label: 'Provider 5xx',
        detail: 'Authorization returns 502. Nothing happened on the acquirer side.',
        transient: 'recovers',
        persistent: 'never clears',
      },
      providerUnavailable: {
        label: 'Provider unavailable',
        detail: 'The acquirer is down. Retrying it achieves nothing.',
        transient: 'primary only',
        persistent: 'both acquirers',
      },
      indeterminateCapture: {
        label: 'Indeterminate capture',
        detail: 'The capture call never answers. Nobody knows whether the money moved.',
      },
      duplicateWebhook: {
        label: 'Duplicate webhook',
        detail: 'The settlement webhook is delivered twice, sharing one event id.',
      },
      delayedWebhook: {
        label: 'Out-of-order webhook',
        detail: 'A late authorization webhook lands after settlement has completed.',
      },
    },
  },

  scenarios: {
    title: 'Scenarios',
    groups: {
      baseline: 'Baseline',
      provider: 'Provider faults',
      webhook: 'Webhook faults',
      unresolved: 'Unresolved',
    },
    items: {
      'happy-path': {
        name: 'Happy path',
        description: 'Authorize, capture, settle by webhook. Nothing goes wrong.',
      },
      'timeout-retry': {
        name: 'Timeout → retry',
        description:
          'The acquirer stops answering, then recovers. Retries carry the idempotency key, so the replayed decision is the original one.',
      },
      'provider-failover': {
        name: 'Provider failover',
        description:
          'The primary acquirer is down. Retrying it is pointless, so the payment moves to the other one.',
      },
      'total-outage': {
        name: 'Total outage',
        description:
          'Both acquirers are down. The payment fails, and it fails for an infrastructure reason.',
      },
      'server-errors': {
        name: 'Transient 5xx',
        description:
          'The acquirer returns 502 twice. Nothing happened on its side, so retrying is safe.',
      },
      'duplicate-webhook': {
        name: 'Duplicate webhook',
        description:
          'The settlement webhook is delivered twice with one event id. The second delivery changes nothing.',
      },
      'delayed-webhook': {
        name: 'Out-of-order webhook',
        description:
          'A late authorization webhook lands after settlement. Applying it would move the payment backwards.',
      },
      'indeterminate-capture': {
        name: 'Indeterminate capture',
        description:
          'The capture never answers. The payment is not failed — it is pending, and reconciliation decides.',
      },
      'risk-decline': {
        name: 'Risk decline',
        description:
          'An amount above the acquirer risk limit. A business decision, and the one outcome retries must never touch.',
      },
    },
  },

  transaction: {
    title: 'Current transaction',
    empty: 'No transaction yet. Pick a scenario and run a payment.',
    fields: {
      transaction: 'Transaction',
      amount: 'Amount',
      provider: 'Provider',
      attempts: 'Attempts',
      retries: 'Retries',
      elapsed: 'Elapsed',
      idempotencyKey: 'Idempotency key',
      authorization: 'Authorization',
      capture: 'Capture',
    },
    failedOverFrom: (provider: string) => `failed over from ${provider}`,
    exits: 'exits',
    pending: {
      explanation:
        'The capture was never confirmed. This payment is not failed — it is unresolved, and only the provider can say which it is.',
      run: 'Run reconciliation',
      running: 'Reconciling…',
      attempts: (count: number) => `${count} attempt${count === 1 ? '' : 's'} so far`,
    },
  },

  views: {
    sequence: 'Sequence',
    log: 'Event log',
    events: (count: number) => `${count} events`,
    emptySequence: 'Run a payment to see the calls it makes.',
    emptyLog: 'Run a payment to see its events.',
  },

  inspector: {
    title: 'Event',
    empty: 'Select an event, or an arrow in the diagram, to inspect it.',
    close: 'Close',
    payload: 'Payload',
  },
  lanes: {
    system: { label: 'Your system', sublabel: 'orchestrator' },
    acquirer: { sublabel: 'acquirer' },
    endpoint: { label: 'Webhook endpoint', sublabel: 'verifies · normalises' },
  },

  diagram: {
    authorize: 'authorize',
    capture: 'capture',
    getStatus: 'get status',
    authorized: 'authorized',
    replayed: 'replayed decision',
    declined: 'declined',
    captured: 'captured',
    unavailable: 'unavailable',
    serverError: (status: string) => status,
    statusUnknown: 'still unknown',
    statusResolved: (status: string) => `status: ${status}`,
    noAnswer: 'no answer — outcome unknown',
    failover: (provider: string) =>
      `failing over to ${provider} — a fresh key it has never seen`,
    backoff: (delay: string) => `backoff ${delay}`,
    awaiting: (delay: string) => `waiting ${delay} for the acquirer`,
    verified: 'signature verified and normalised here',
    refusedDuplicate: 'duplicate event id — already processed',
    refusedBackwards: (state: string) => `would move back to ${state} — refused`,
    refusedOther: (reason: string) => `refused: ${reason}`,
  },

  metrics: {
    title: 'Session',
    successRate: 'Success rate',
    noData: 'no settled payments yet',
    settled: (completed: number, total: number) => `${completed} of ${total} settled`,
    transactions: 'Transactions',
    completed: 'Completed',
    failed: 'Failed',
    declined: 'Declined',
    pendingReconciliation: 'Pending',
    retries: 'Retries',
    fallbacks: 'Failovers',
    duplicateWebhooks: 'Dup. webhooks',
    inFlight: 'In flight',
    footnote: 'Success rate counts settled payments only. One still in flight is not a failure yet.',
  },

  history: {
    title: 'History',
    clear: 'clear',
    empty: 'Nothing run yet in this session.',
    events: (count: number) => `${count} events`,
  },

  concepts: {
    title: 'What this demonstrates',
    items: [
      {
        title: 'An explicit state machine',
        body: 'Every state change goes through one transition table. A payment cannot reach COMPLETED without having been CAPTURED, and no branch of the code can invent a shortcut, because there is no code path that writes a state directly.',
      },
      {
        title: 'Declines are not failures',
        body: 'DECLINED and FAILED are separate terminal states. One is a decision the acquirer made about the money; the other is infrastructure falling over. Retrying the second is correct. Retrying the first is, at best, rude.',
      },
      {
        title: 'Idempotency, in both directions',
        body: 'Outbound, every authorization attempt carries the same key, so an acquirer that already decided replays that decision instead of charging twice. Inbound, every webhook carries an event id, so a redelivery is recognised and dropped.',
      },
      {
        title: 'Retries with backoff and jitter',
        body: 'Three attempts per provider, doubling the wait each time, with half the window randomised. Jitter is not decoration: without it, everything that failed together retries together, and the recovering provider is knocked over by its own clients.',
      },
      {
        title: 'A timeout is not a failure',
        body: 'When a call times out, the request may well have been processed — the answer is what got lost. That is why a timed-out capture moves to CAPTURE_PENDING rather than FAILED, and why retrying one is only safe behind an idempotency key.',
      },
      {
        title: 'Failover, and its cost',
        body: 'An unavailable provider is not retried, it is replaced. But the second acquirer has never seen the idempotency key the first one holds, so failover trades one risk for another — which is exactly why it is reserved for providers that are genuinely down.',
      },
      {
        title: 'Eventual consistency',
        body: 'Settlement arrives by webhook, whenever it arrives. The payment sits at CAPTURED in the meantime, which is correct rather than stale. A late webhook aiming at a stage already passed is refused by the same table that governs everything else.',
      },
      {
        title: 'Reconciliation as a first-class action',
        body: 'When nobody knows what happened, the answer is to go and ask, not to guess. Reconciliation queries the provider and accepts three answers: it was captured, it was not, or it is still unknown — and the third leaves the payment exactly where it was.',
      },
      {
        title: 'The log is the state',
        body: 'Nothing stores a status field. The payment is whatever reducing its events produces, which is why a page reload reconstructs it exactly, and why the timeline can never disagree with the badge next to it.',
      },
    ],
  },

  events: {
    created: (amount: string) => `Payment created for ${amount}`,
    authorizationRequested: (provider: string) => `Requesting authorization from ${provider}`,
    authorizationAttempted: (provider: string, attempt: number, max: number) =>
      `Attempt ${attempt} of ${max} to ${provider}`,
    providerTimeout: (provider: string) => `${provider}: request timed out — outcome unknown`,
    providerError: (provider: string, status: number) => `${provider}: returned ${status}`,
    providerUnavailable: (provider: string) => `${provider}: unavailable`,
    retryScheduled: (delay: string, attempt: number, max: number) =>
      `Retrying in ${delay} (attempt ${attempt} of ${max})`,
    fallbackSelected: (from: string, to: string) => `Failing over from ${from} to ${to}`,
    idempotentReplay: (provider: string) =>
      `${provider} recognised the idempotency key and replayed its original decision`,
    authorized: (provider: string) => `Authorized by ${provider}`,
    authorizedByWebhook: (provider: string) => `Authorization confirmed by webhook from ${provider}`,
    declined: (provider: string, reason: string) => `Declined by ${provider}: ${reason}`,
    exhausted: (failedOver: boolean): string =>
      failedOver
        ? 'Both acquirers are unreachable — giving up'
        : 'No attempts left and no fallback available',
    captureRequested: (provider: string) => `Requesting capture from ${provider}`,
    captured: (provider: string) => `Captured by ${provider}`,
    capturePending: 'Capture outcome is unknown — holding for reconciliation instead of failing',
    webhookReceived: (kind: string, provider: string) => `Received ${kind} from ${provider}`,
    webhookDuplicate: (eventId: string) =>
      `Event ${eventId} was already processed — ignoring the redelivery`,
    webhookBackwards: (kind: string, state: string) =>
      `Late ${kind} would move the payment back to ${state} — ignored`,
    webhookNotApplicable: (reported: string, current: string) =>
      `Webhook reports ${reported}, payment is already ${current} — nothing to do`,
    webhookSignatureRejected: 'Webhook rejected at the endpoint: invalid signature',
    completed: 'Settlement confirmed by webhook — payment complete',
    reconciliationStarted: (provider: string) =>
      `Querying ${provider} for the real status of this capture`,
    reconciliationInconclusive: 'Provider still cannot confirm the capture — payment stays pending',
    reconciliationResolved: (captured: boolean): string =>
      captured
        ? 'Provider confirmed the capture went through'
        : 'Provider confirmed the capture never happened',
    unknown: (type: string) => type,
  },

  declineReasons: {
    'risk-limit': 'risk limit exceeded',
  },
}
