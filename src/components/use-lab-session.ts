'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { labStore, type SessionState } from '@/infrastructure/store'

/**
 * The store lives outside React because the orchestrator writes to it from
 * async code that knows nothing about rendering. `useSyncExternalStore` is the
 * supported way to read that, and its server snapshot keeps the first client
 * render identical to the server's — storage is only read afterwards.
 */
export function useLabSession(): SessionState {
  const session = useSyncExternalStore(
    labStore.subscribe,
    labStore.getSnapshot,
    labStore.getServerSnapshot,
  )

  useEffect(() => {
    labStore.hydrate()
  }, [])

  return session
}
