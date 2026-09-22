import { type Page, expect, test } from '@playwright/test'

/**
 * Nothing here waits on a clock. Every assertion waits for a state the
 * application actually reached — which is the only thing that makes an
 * end-to-end suite over retries, backoff and late webhooks worth having.
 */

async function openLab(page: Page): Promise<void> {
  await page.goto('/')
  // Same delays, 10x faster. Ordering between them is preserved, so the
  // out-of-order scenario still behaves as it would in front of a person.
  await page.getByRole('button', { name: '10x', exact: true }).click()
}

async function runPayment(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Run payment' }).click()
}

function currentState(page: Page, state: string) {
  return page.locator(`[data-state-node="${state}"][data-current]`)
}

/** The sequence diagram is the default view; the log is behind a tab. */
async function showLog(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Event log' }).click()
}

function arrow(page: Page, label: string) {
  return page.locator(`[data-arrow="${label}"]`)
}

function events(page: Page, type: string) {
  return page.locator(`[data-event-type="${type}"]`)
}

test('completes a payment when nothing goes wrong', async ({ page }) => {
  await openLab(page)
  await runPayment(page)

  await expect(currentState(page, 'COMPLETED')).toBeVisible()

  // The diagram is what a reader sees first: one call out, one answer back,
  // and settlement arriving through the endpoint that verifies it.
  await expect(arrow(page, 'authorize')).toHaveCount(1)
  await expect(arrow(page, 'webhook')).toHaveCount(1)
  await expect(page.locator('[data-sequence-state="COMPLETED"]')).toBeVisible()

  await showLog(page)
  await expect(events(page, 'PAYMENT_AUTHORIZED')).toHaveCount(1)
  await expect(events(page, 'PAYMENT_CAPTURED')).toHaveCount(1)
  await expect(events(page, 'PAYMENT_COMPLETED')).toHaveCount(1)
  await expect(events(page, 'PROVIDER_TIMEOUT')).toHaveCount(0)
})

test('retries a timing-out provider and replays the original decision', async ({ page }) => {
  await openLab(page)
  await page.getByRole('button', { name: 'Timeout → retry' }).click()
  await runPayment(page)

  await expect(currentState(page, 'COMPLETED')).toBeVisible()

  // Three calls out, two of them with nothing coming back.
  await expect(arrow(page, 'authorize')).toHaveCount(3)
  await expect(page.locator('[data-lost]')).toHaveCount(2)
  // The answer that did arrive was the original decision, not a new one.
  await expect(arrow(page, 'replayed')).toHaveCount(1)

  // The backoff is not a label, it is height — and the second wait is longer.
  const backoffs = page.locator('[data-wait="backoff"]')
  await expect(backoffs).toHaveCount(2)
  const first = await backoffs.nth(0).boundingBox()
  const second = await backoffs.nth(1).boundingBox()
  expect(second!.height).toBeGreaterThan(first!.height)

  await showLog(page)
  await expect(events(page, 'PROVIDER_TIMEOUT')).toHaveCount(2)
  await expect(events(page, 'RETRY_SCHEDULED')).toHaveCount(2)
  await expect(events(page, 'IDEMPOTENT_REPLAY_DETECTED')).toHaveCount(1)
})

test('ignores a redelivered webhook without corrupting the payment', async ({ page }) => {
  await openLab(page)
  await page.getByRole('button', { name: 'Duplicate webhook' }).click()
  await runPayment(page)

  await expect(currentState(page, 'COMPLETED')).toBeVisible()

  // The redelivery is drawn arriving and being turned away at the boundary.
  await expect(page.locator('[data-refused]')).toHaveCount(1)
  await expect(page.locator('[data-refused]')).toHaveAttribute('data-refused', 'duplicate')

  await showLog(page)
  await expect(events(page, 'WEBHOOK_RECEIVED')).toHaveCount(2)
  await expect(events(page, 'WEBHOOK_DUPLICATE_IGNORED')).toHaveCount(1)
  // Settling twice is the bug this guards against.
  await expect(events(page, 'PAYMENT_COMPLETED')).toHaveCount(1)
})

test('fails over to the other acquirer when the primary is down', async ({ page }) => {
  await openLab(page)
  await page.getByRole('button', { name: 'Provider failover' }).click()
  await runPayment(page)

  await expect(currentState(page, 'COMPLETED')).toBeVisible()

  // Both acquirers are on the diagram, and the second call goes to the other one.
  await expect(arrow(page, 'authorize')).toHaveCount(2)
  await expect(page.locator('[data-field="provider"]')).toHaveText('AcquirerB')

  await showLog(page)
  await expect(events(page, 'PROVIDER_UNAVAILABLE')).toHaveCount(1)
  await expect(events(page, 'FALLBACK_PROVIDER_SELECTED')).toHaveCount(1)
  // Retrying an acquirer that is down would just waste the budget.
  await expect(events(page, 'RETRY_SCHEDULED')).toHaveCount(0)
})

test('holds an unconfirmed capture until reconciliation settles it', async ({ page }) => {
  await openLab(page)
  await page.getByRole('button', { name: 'Indeterminate capture' }).click()
  await runPayment(page)

  await expect(currentState(page, 'CAPTURE_PENDING')).toBeVisible()

  await showLog(page)
  await expect(events(page, 'PAYMENT_COMPLETED')).toHaveCount(0)

  const reconcile = page.getByRole('button', { name: 'Run reconciliation' })
  const answers = page.locator(
    '[data-event-type="RECONCILIATION_INCONCLUSIVE"], [data-event-type="RECONCILIATION_RESOLVED"]',
  )

  // The provider is allowed to say it still does not know, so ask again until
  // it commits. Each round waits for that round's answer — the STARTED event is
  // written before the provider replies, so counting those would race.
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await reconcile.click()
    await expect(answers).toHaveCount(attempt)

    if ((await events(page, 'RECONCILIATION_RESOLVED').count()) > 0) break
  }

  await expect(currentState(page, 'CAPTURE_PENDING')).toBeHidden()
  await expect(events(page, 'RECONCILIATION_RESOLVED')).toHaveCount(1)
})

test('rebuilds the timeline from local storage after a reload', async ({ page }) => {
  await openLab(page)
  await runPayment(page)
  await expect(currentState(page, 'COMPLETED')).toBeVisible()

  await showLog(page)
  const before = await events(page, 'PAYMENT_COMPLETED').count()

  await page.reload()

  // The state was never stored — it is whatever reducing the persisted log
  // produces, which has to be the same payment it was a moment ago.
  await expect(currentState(page, 'COMPLETED')).toBeVisible()

  await showLog(page)
  await expect(events(page, 'PAYMENT_COMPLETED')).toHaveCount(before)
})

test('switches language without losing the session', async ({ page }) => {
  await openLab(page)
  await runPayment(page)
  await expect(currentState(page, 'COMPLETED')).toBeVisible()

  await expect(page.getByRole('button', { name: 'Run payment' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await page.getByRole('button', { name: 'PT', exact: true }).click()

  // The interface changes language; the payment underneath does not change at all.
  await expect(page.getByRole('button', { name: 'Executar pagamento' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  await expect(currentState(page, 'COMPLETED')).toBeVisible()
  await expect(arrow(page, 'authorize')).toHaveCount(1)

  await page.getByRole('button', { name: 'ES', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Ejecutar pago' })).toBeVisible()

  // The choice survives a reload, because it lives with the rest of the session.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Ejecutar pago' })).toBeVisible()
  await expect(currentState(page, 'COMPLETED')).toBeVisible()
})
