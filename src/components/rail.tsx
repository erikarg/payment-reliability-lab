'use client'

import type { SessionState } from '@/infrastructure/store'
import { ChaosPanel } from './chaos-panel'
import { ScenarioBar } from './scenario-bar'
import { SimulatorPanel } from './simulator-panel'
import { TransactionList } from './transaction-list'

/**
 * Everything that decides what happens next, in one column: what to run, which
 * preset, what to break, and what has been run already. Previously these were
 * split across opposite edges of the screen for no reason anyone could act on.
 */
export function Rail({ session }: { session: SessionState }) {
  return (
    <div className="scroll-thin w-full shrink-0 space-y-7 overflow-y-auto border-hairline px-5 py-5 lg:w-[300px] lg:border-r">
      <SimulatorPanel session={session} />
      <ScenarioBar />
      <ChaosPanel session={session} />
      <TransactionList session={session} />
    </div>
  )
}
