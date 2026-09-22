/**
 * The payment lifecycle states.
 *
 * `DECLINED` and `FAILED` are deliberately distinct: a decline is a business
 * outcome the acquirer decided on (insufficient funds, anti-fraud, invalid
 * card) and retrying it is both useless and abusive. A failure is an
 * infrastructure outcome (every attempt on every provider fell over) and is
 * the only one a retry could ever have fixed.
 */
export const PAYMENT_STATES = [
  'CREATED',
  'PROCESSING',
  'AUTHORIZED',
  'CAPTURE_PENDING',
  'CAPTURED',
  'COMPLETED',
  'DECLINED',
  'FAILED',
] as const

export type PaymentState = (typeof PAYMENT_STATES)[number]

/**
 * How far along the lifecycle a state sits. Used only to explain *why* a
 * transition was refused — a webhook aiming at a lower rank than the state we
 * already reached arrived out of order, rather than being nonsense.
 * Enforcement itself lives in the transition table, never here.
 */
const PROGRESS: Record<PaymentState, number> = {
  CREATED: 0,
  PROCESSING: 1,
  AUTHORIZED: 2,
  CAPTURE_PENDING: 3,
  CAPTURED: 4,
  COMPLETED: 5,
  DECLINED: 5,
  FAILED: 5,
}

export function progressOf(state: PaymentState): number {
  return PROGRESS[state]
}

export const TERMINAL_STATES = ['COMPLETED', 'DECLINED', 'FAILED'] as const

export type TerminalPaymentState = (typeof TERMINAL_STATES)[number]

export function isTerminal(state: PaymentState): state is TerminalPaymentState {
  return (TERMINAL_STATES as readonly PaymentState[]).includes(state)
}

/** States where the payment is still moving on its own. */
export function isInFlight(state: PaymentState): boolean {
  return !isTerminal(state) && state !== 'CAPTURE_PENDING'
}
