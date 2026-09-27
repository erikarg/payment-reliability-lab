# Payment Reliability Lab

A simulation of how a payment system behaves when things go wrong: providers stop
answering, webhooks arrive twice or in the wrong order, and captures go
unacknowledged. You break it on purpose and watch it hold its shape.

> **This is a reliability simulation, not a payment gateway.** No money moves, no
> acquirer is contacted, no card data is handled, and every provider in here is a
> few hundred lines of TypeScript pretending. It exists to make failure handling
> visible, not to process payments.

---

## Why it exists

Payment integrations are easy to write and hard to get right, because almost
everything interesting happens on the unhappy path. The code that matters is the
code that runs when a request times out and you have no idea whether it was
processed, when the same webhook arrives three times, when a capture leaves you
holding a transaction nobody can account for.

That code is usually invisible. This makes it the interface.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build        # production build
npm run test         # unit tests (Vitest)
npm run test:e2e     # end-to-end tests (Playwright, against the production build)
npm run lint
npm run typecheck
```

End-to-end tests need a browser binary once per machine:

```bash
npx playwright install chromium
```

No environment variables. No database, queue, cache or external service. Nothing
to configure before the first run.

---

## Reading the interface

The screen is laid out as a **run inspector**, not a dashboard: a rail on the
left holds everything that decides what happens next (amount, provider, presets,
faults, history), the run itself runs across the top as a strip, the widest
surface on screen is the thing you are here to read, and session counters sit in
a strip along the bottom. Selecting an event — a row in the log, or an arrow in
the diagram — opens an inspector on the right with its payload.

That arrangement is deliberate. An earlier version was three equal columns, which
gave a third of the screen to numbers you glance at once and squeezed the diagram
into the middle. Run timelines in durable-execution tools are laid out the other
way round for a reason: the trace is the product, everything else is chrome.

The main view is a **sequence diagram**, not a log. Every concept this project
is about is a message between parties over time, so that is what gets drawn.
The log is one tab away for when you want the exact payload.

Lanes are `Your system`, the `Webhook endpoint` and whichever acquirers the
payment actually touched. Reading down:

- **A request** is an arrow out, carrying the idempotency key it was sent with.
- **A timeout** is an arrow out with **no arrow back** — a cross on the
  acquirer's lane and a reply that trails off. The absence is the point: the
  request may well have been processed.
- **A backoff** is a band whose *height* is the wait. The second one is visibly
  twice the first, because it is.
- **A replayed decision** comes back dashed. The same key went out three times
  and the same answer came back — that is idempotency, drawn.
- **A failover** switches which lane the arrows point at.
- **A webhook** crosses the endpoint lane through a ticked node, because that is
  where it was verified and translated.
- **A refusal** is an arrow that arrives and hits a wall, with the reason beside
  it. A duplicate is turned away at the boundary; a late webhook is turned away
  with the stage it would have dragged the payment back to.
- **A call and its answer are one unit.** The bar on the acquirer's lifeline runs
  from the request to the reply and carries the latency — the classic activation
  box, and the same grouping run timelines use when they fold a
  scheduled/started/completed triple into a single row. A call that never came
  back leaves a bar that simply stops.

The state machine above it highlights only what
`ALLOWED_TRANSITIONS[current]` permits, and when a move is refused it strikes
the state that was claimed. The moment the machine turns something down is the
moment it is doing its job, so it is shown rather than logged quietly.

---

## Languages

The interface is available in **English, Português (BR) and Español**, switched
from the header. The choice is stored with the rest of the session, so it
survives a reload.

There is no i18n dependency, no `[locale]` route segment and no middleware. The
application is a single client-rendered page whose content has no SEO value, so
locale lives in the session store alongside the seed and the chaos settings, and
`<html lang>` is corrected once the client knows which one was chosen.

**Making it translatable changed the domain, for the better.** Events used to
carry a `message` field — English sentences written inside the orchestrator. A
domain layer that writes prose cannot be translated without being rewritten, so
the field is gone. Events now carry only facts:

```ts
// before
{ type: 'RETRY_SCHEDULED', message: `Retrying in 60ms (attempt 2 of 3)`, data: {...} }

// after
{ type: 'RETRY_SCHEDULED', data: { delayMs: 60, nextAttempt: 2, maxAttempts: 3, ... } }
```

Every sentence in the product is written in `src/i18n`, and `describeEvent` is
the single place that turns an event into one. The same move pushed the last
prose out of the rest of the domain: transition verdicts (`'terminal'`,
`'not-allowed'`) and decline reasons (`'risk-limit'`) are codes now.

English is the reference dictionary and `Dictionary = typeof en` is the contract
the others satisfy, so a missing key, a typo or a leftover from a rename is a
compile error rather than a blank space someone notices later. The diagram model
emits label *keys* rather than words for the same reason — the renderer supplies
the language, and the tests can assert on a diagram without reading English.

---

## The payment lifecycle

One transition table governs every state change in the system. There is no code
path anywhere that writes a state directly.

```
CREATED ──▶ PROCESSING ──▶ AUTHORIZED ──▶ CAPTURED ──▶ COMPLETED
                 │              │
                 │              └──▶ CAPTURE_PENDING ──▶ CAPTURED
                 │                          │
                 ├──▶ DECLINED              └──▶ FAILED
                 └──▶ FAILED
```

| From | To |
| --- | --- |
| `CREATED` | `PROCESSING` |
| `PROCESSING` | `AUTHORIZED`, `DECLINED`, `FAILED` |
| `AUTHORIZED` | `CAPTURED`, `CAPTURE_PENDING`, `FAILED` |
| `CAPTURE_PENDING` | `CAPTURED`, `FAILED` |
| `CAPTURED` | `COMPLETED` |
| `COMPLETED`, `DECLINED`, `FAILED` | — terminal |

Three decisions in that table are worth spelling out.

**`DECLINED` and `FAILED` are different states.** A decline is the acquirer's
answer about the money — insufficient funds, risk, a dead card. A failure is
infrastructure falling over. Retrying the second is correct; retrying the first
is pointless and, against a real acquirer, abusive. Collapsing them into one
state throws away the only fact that decides what to do next.

**`COMPLETED` is reached by webhook, not by capture.** A successful capture gets
the payment to `CAPTURED`. Settlement is confirmed asynchronously, which is what
makes late and duplicate webhooks a real problem rather than a contrived one.

**There are no self-transitions.** An event that does not move the payment — a
scheduled retry, an inconclusive reconciliation — carries no target state and is
simply appended to the log. The table only describes movement.

---

## The log is the state

Nothing stores a status field. A payment is `reduce(events)` and nothing else.

```ts
const { aggregate, rejected } = reduce(events)
```

Four requirements collapse into that one decision:

- **Reload.** Read the events back from storage, run the reducer. There is no
  separate rehydration path to keep in sync.
- **Deduplication.** The set of processed webhook ids is derived from the log, so
  it survives a reload without being persisted separately.
- **Late events.** A webhook aiming at a stage already passed is refused by the
  transition table. No special case is needed to stop it.
- **Corruption.** `localStorage` is user-editable. Events that cannot be applied
  are collected in `rejected` rather than thrown, so one bad entry degrades a
  single transaction instead of the session.

The reducer is also the last line of enforcement. The orchestrator checks the
table before emitting a transition, and the reducer checks it again before
applying one. Both read the same table, so they cannot drift.

---

## Failure modes

Every fault is injected inside the acquirer adapters. The orchestration code
cannot read the chaos settings — it only sees what the `PaymentProvider`
interface returns, exactly as it would against a real acquirer.

| Fault | What the provider does | What the system does |
| --- | --- | --- |
| **Provider timeout** | Authorization never answers | Retries with backoff, under the same idempotency key |
| **Provider 5xx** | Returns 502 | Retries — nothing was processed, so a fresh attempt is safe |
| **Provider unavailable** | Refuses connections | Fails over to the other acquirer; does not waste retries |
| **Indeterminate capture** | Capture never answers | Moves to `CAPTURE_PENDING` and waits for reconciliation |
| **Duplicate webhook** | Sends settlement twice, one event id | Logs both, applies the first, ignores the second |
| **Out-of-order webhook** | Sends a late authorization webhook | Refuses it — it would move a settled payment backwards |

The three transport faults have a second setting: whether the fault **clears** or
**never clears**. That is the distinction retries exist for. A transient fault is
the case a retry can fix; a persistent one is the case where retrying only delays
the bad news, and the payment ends in `FAILED` with `ALL_PROVIDERS_EXHAUSTED`.

For unavailability the same setting reads differently: transient takes down the
primary only, so the failover succeeds; persistent takes down both, so there is
nowhere left to go.

### Retry policy

Three attempts per provider, exponential backoff from a 100ms base, doubling,
with **equal jitter** — half the window fixed, half randomised.

Jitter is not cosmetic. Without it, every client that failed during an outage
retries at the same instant and knocks the recovering provider straight back
over. Equal jitter is used rather than full jitter because full jitter regularly
produces near-zero waits, and a backoff nobody can see teaches nobody anything.

A failover resets the attempt budget: the previous acquirer's failures say
nothing about this one's health.

---

## Idempotency

Two mechanisms, in opposite directions, for two different problems.

### Outbound — the same request, twice

Every authorization attempt carries the same idempotency key. When the acquirer
recognises a key it has already decided on, it replays that decision instead of
authorizing again, and the timeline records `IDEMPOTENT_REPLAY_DETECTED`.

This is what makes retrying a **timeout** safe. The simulated acquirer models the
ordering that matters: it records its decision *before* the response can go
missing. A timeout means the answer was lost, not that the work was never done —
so the retry finds a decision already waiting.

A 502 or a refused connection works the other way: those never reach the decision
engine, so nothing is recorded and the retry starts clean. The adapter reads that
distinction straight off `FAILURE_POLICY.indeterminate`, so the simulation and
the stated policy cannot disagree.

Each acquirer keeps its own keys. That is deliberate: **failing over to a second
acquirer really is a fresh authorization**, because the second one has never seen
the key the first one holds. Failover trades an availability problem for a
double-charge risk, which is precisely why it is reserved for providers that are
genuinely down rather than merely slow.

### Inbound — the same webhook, twice

Every webhook carries a provider event id. Deduplication is keyed on it, and the
set of ids already seen is derived from the event log.

A redelivery is **logged and then ignored**, in two separate events. Dropping it
silently would hide the very thing this is here to demonstrate.

---

## Reconciliation

When a capture times out, the payment is not failed. It is unresolved, and those
are different facts. Reporting an unresolved capture as failed is how you refund
money you did take, or tell a customer you did not take money you did.

So the payment sits in `CAPTURE_PENDING` and exposes **Run reconciliation**,
which asks the provider what actually happened. Three answers are accepted:

- **captured** → `CAPTURED`, and settlement proceeds by webhook as it would have
- **not captured** → `FAILED`
- **still unknown** → the payment stays exactly where it is, and you can ask again

The third answer is the one that matters. A reconciliation routine that has to
produce a verdict will eventually produce a wrong one.

---

## Architecture

```
src/
  domain/            pure TypeScript — no React, no Next, no browser, no I/O
    payment/         states, transition table, the reducer
    provider/        the PaymentProvider contract, failure classification
    events/          the event shape, normalised webhook shape
    reconciliation/  what to do with each provider answer
  application/       orchestration, retry policy, metrics, ports
  infrastructure/    adapters — acquirers, clock, RNG, storage, webhooks, store
  app/               routes and the webhook Route Handler
  i18n/              every sentence in the product, one file per language
  components/        the interface, including the sequence diagram's pure model
  fonts/             the two bundled typefaces (see fonts/NOTICE.md)
```

The dependency rule runs one way: `app` and `components` depend on
`infrastructure`, which depends on `application`, which depends on `domain`.
`domain` depends on nothing. That is checked by a test
(`tests/unit/boundaries.test.ts`) rather than asserted here, because a layering
nobody verifies is a layering that has already been violated.

Everything concrete reaches the application layer through a port — `Clock`,
`Rng`, `TransactionLog`, `ProviderRegistry`, `WebhookChannel`. That is what lets
the orchestrator be tested against scripted providers and run against simulated
ones without knowing the difference.

### Where the simulation runs, and why

**The engine runs entirely in the browser.** This is not a concession to the free
tier — it is the only correct answer given the constraints.

Route Handlers on Vercel are serverless functions. There is no guarantee that two
requests for the same transaction reach the same instance, and instances are
recycled without warning. In-memory state in a Route Handler works perfectly in
`next dev`, where there is one process, and fails *intermittently* in production.
That is the worst possible failure mode: it passes every local test and breaks in
front of an audience.

So the browser holds the event log, and the Route Handler holds nothing.

### What the Route Handler actually does

`POST /api/webhooks/[provider]` is a real, stateless endpoint doing the job a
webhook endpoint does:

1. **Verifies an HMAC-SHA256 signature** over the exact bytes received, compared
   without short-circuiting.
2. **Rejects malformed payloads** with a 400.
3. **Normalises the provider's format** into the one shape the system understands.

`AcquirerA` and `AcquirerB` send deliberately incompatible payloads — different
field names, different event names, different timestamp formats — because real
acquirers agree on nothing. Translating them is what gives the endpoint a reason
to exist beyond decoration.

The signing secret is a public constant. There are no environment variables, and
both ends of this webhook are the same application. It demonstrates the shape of
the check, not the secrecy of a key.

---

## Determinism

Two injected dependencies make runs reproducible.

**A seeded PRNG** (mulberry32, eight lines, no dependency) drives jitter,
latencies and reconciliation outcomes. The seed is shown in the header and is
editable: the same seed with the same faults produces the same run, delays
included.

**An injected clock** divides every delay by a speed factor: `1x` is real time,
`10x` divides by ten, and `Instant` removes the delays altogether (each wait
becomes a zero-length timer).
The simulation computes honest timings (a 200ms backoff is written as 200ms) and
the speed setting decides how much of that a human sits through. Nothing lies
about its own numbers, and the relative order of delays is preserved at every
speed, which is what keeps the out-of-order webhook genuinely out of order.

The tests exploit both: the end-to-end suite never calls `waitForTimeout` and
never asserts on elapsed time. It waits for states the application actually
reached.

---

## Persistence

Sessions are kept in `localStorage` under `prl:v1:session` — the configuration
plus the event log of the last 25 transactions.

Every read and write is wrapped, because private windows, blocked site data and
storage quotas all make these throw. When storage is unavailable the session
still works in memory; only surviving a reload is lost, which is not worth
interrupting a run for.

Writes are coalesced into a 120ms window that is *not* restarted by later
changes. A sliding debounce would never write at all during a busy run, and a tab
closed the moment a payment finishes would take the whole thing with it. The
session is also flushed synchronously when a run settles.

Old schema versions are dropped rather than migrated. Nothing stored here is
worth a migration.

---

## Trade-offs

**A client-side engine means the backend is not exercised.** There is no server
authority, no cross-device state, and nothing an adversary could not edit in
DevTools. In exchange, the whole thing deploys as a static page with one
stateless function, costs nothing to run, and behaves identically in development
and production. For a demonstration that is the right trade; for a real gateway
it would be indefensible.

**Faults are switches, not probabilities.** A seeded probability would be more
lifelike and far worse to demonstrate or test — you would not know whether a
scenario failed to appear because of a bug or because of the draw. `transient`
and `persistent` are explicit, which also happens to be the distinction worth
teaching.

**The transport faults affect authorization only.** Capture has one fault of its
own. Applying all six faults to all three provider calls would multiply the
matrix without adding a single new behaviour to observe, and would make each
control harder to reason about.

**One uniform event shape rather than a discriminated union per type.** The
reducer is generic over events — only `transitionsTo` affects state — and the UI
renders `data` as opaque JSON. Twenty near-identical union members would be
ceremony with no reader to serve.

**Next.js for an application that is essentially a SPA.** Vite would be leaner.
Next earns its place through the Route Handler and a one-click Vercel deploy;
outside those two things it is doing very little here.

---

## Testing

**Unit tests (Vitest, `tests/unit`)** cover the transition table, the reducer,
retry and backoff, idempotency in both directions, failover, duplicate and
out-of-order webhooks, indeterminate capture, all three reconciliation outcomes,
metrics, webhook signing and normalisation, and the architectural boundaries.

The sequence diagram is built by a pure function, so it is tested rather than
squinted at: that the second backoff is drawn taller than the first, that a
timeout produces no return arrow, that a redelivery is marked refused, that a
webhook crosses the endpoint lane, and that the bands advance exactly when the
state machine does.

Three of them are **property-based** (`fast-check`): for any sequence of events,
in any order, with duplicates injected, the reducer never produces a state
outside the machine, never moves a payment backwards, and never lets a
redelivered event change the outcome.

The orchestrator tests carry an extra assertion for free. The test harness
re-reduces the log after every append and throws if anything was rejected — so if
the orchestrator ever emits a transition the table forbids, the test that
provoked it fails immediately rather than quietly producing a stuck payment.

A further test renders every event type in every language and fails on an
unfilled template or a leaked key — which is how a crash on a malformed currency
code was found, rather than by someone hitting it.

**End-to-end tests (Playwright, `tests/e2e`)** run against `next build && next
start`, not the dev server, and cover the happy path, timeout with retry and
idempotent replay, duplicate webhook handling, provider failover, reconciliation
of an indeterminate capture, reconstruction of a session after a reload, and
switching language without disturbing the payment underneath.

They read the diagram through label *keys* (`[data-arrow="authorize"]`), not
through the words on screen, so the suite is not tied to one language.

**CI** (`.github/workflows/ci.yml`) runs `npm run lint`, `npm run typecheck` and
`npm run test` on every push and pull request to `main`. The end-to-end suite is
not part of CI, because it needs a browser binary; run it locally with
`npx playwright install chromium` once, then `npm run test:e2e`.

---

## Deploying

Import the repository on Vercel and deploy. The defaults are correct.

- **Hobby plan is sufficient.** One static page and one stateless function.
- **No environment variables**, at build time or runtime.
- **No external services** — no database, cache, queue, observability platform,
  auth provider or paid API.
- The build runs `next build` only. Playwright is never invoked during a build
  and its browsers are not needed there.
- **Fonts are bundled, not fetched.** A build-time download would be a network
  dependency in a project whose whole claim is that it has none. See
  `src/fonts/NOTICE.md` for licences.

---

## Licence

MIT — see [`LICENSE`](LICENSE). The bundled typefaces are under the SIL Open
Font License 1.1 — see `src/fonts/NOTICE.md`.
