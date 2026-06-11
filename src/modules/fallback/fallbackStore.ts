// ============================================
// Fallback Engine Store
// Priority-ordered provider chain with automatic failover.
// Persisted to localStorage, reactive via useSyncExternalStore.
// ============================================

import { useSyncExternalStore, useCallback } from 'react'
import type { FallbackChainState, FallbackEvent, FallbackResolution, ProviderEndpoint } from './types'

const STORAGE_KEY = 'oca-fallback-v1'
const MAX_EVENTS = 200

type Subscriber = () => void

function loadState(): FallbackChainState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as FallbackChainState
  } catch { /* ignore */ }
  return { endpoints: [], events: [] }
}

class FallbackEngineStore {
  private state: FallbackChainState = loadState()
  private subscribers = new Set<Subscriber>()

  getSnapshot = (): FallbackChainState => this.state

  subscribe = (cb: Subscriber): (() => void) => {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }

  private update(patch: Partial<FallbackChainState>) {
    this.state = { ...this.state, ...patch }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)) } catch { /* ignore */ }
    this.subscribers.forEach(s => s())
  }

  private addEvent(event: Omit<FallbackEvent, 'timestamp'>) {
    const events = [
      { ...event, timestamp: new Date().toISOString() },
      ...this.state.events,
    ].slice(0, MAX_EVENTS)
    this.update({ events })
  }

  setChain(endpoints: ProviderEndpoint[]) {
    const sorted = [...endpoints].sort((a, b) => a.priority - b.priority)
    const activeEndpointId = sorted.find(e => e.enabled)?.id
    this.update({ endpoints: sorted, activeEndpointId })
    this.addEvent({ reason: 'manual', message: `Chain updated with ${sorted.length} endpoints` })
  }

  syncFromProviders(providers: Array<{ id: string; name: string; enabled: boolean; priority: number }>, activeModelId?: string) {
    const endpoints: ProviderEndpoint[] = providers.map(p => ({
      id: p.id,
      provider: p.name,
      model: activeModelId ?? '',
      priority: p.priority,
      enabled: p.enabled,
    }))
    this.setChain(endpoints)
  }

  selectNext(reason: FallbackEvent['reason'], message: string): FallbackResolution | null {
    const current = this.state.activeEndpointId
    const sorted = [...this.state.endpoints].filter(e => e.enabled).sort((a, b) => a.priority - b.priority)
    const currentIdx = sorted.findIndex(e => e.id === current)
    const next = sorted[currentIdx + 1] ?? sorted[0]

    if (!next || next.id === current) {
      this.addEvent({ reason, message: `No fallback available: ${message}`, fromEndpointId: current })
      return null
    }

    this.addEvent({
      reason,
      message,
      fromEndpointId: current,
      toEndpointId: next.id,
    })
    this.update({ activeEndpointId: next.id })
    return { endpoint: next, reason: message }
  }

  recordSuccess(endpointId: string) {
    if (this.state.activeEndpointId !== endpointId) {
      this.update({ activeEndpointId: endpointId })
    }
  }

  recordFailure(
    endpointId: string,
    reason: FallbackEvent['reason'],
    message: string,
  ): FallbackResolution | null {
    return this.selectNext(reason, `${endpointId} failed — ${message}`)
  }

  getActiveEndpoint(): ProviderEndpoint | undefined {
    return this.state.endpoints.find(e => e.id === this.state.activeEndpointId)
  }

  clearEvents() {
    this.update({ events: [] })
  }
}

export const fallbackEngineStore = new FallbackEngineStore()

// -------------------------------------------------------
// React hooks
// -------------------------------------------------------

export function useFallbackChain() {
  return useSyncExternalStore(fallbackEngineStore.subscribe, fallbackEngineStore.getSnapshot)
}

export function useFallbackActions() {
  const setChain = useCallback((eps: ProviderEndpoint[]) => fallbackEngineStore.setChain(eps), [])
  const selectNext = useCallback((reason: FallbackEvent['reason'], msg: string) =>
    fallbackEngineStore.selectNext(reason, msg), [])
  const recordSuccess = useCallback((id: string) => fallbackEngineStore.recordSuccess(id), [])
  const recordFailure = useCallback((id: string, reason: FallbackEvent['reason'], msg: string) =>
    fallbackEngineStore.recordFailure(id, reason, msg), [])
  const clearEvents = useCallback(() => fallbackEngineStore.clearEvents(), [])
  const syncFromProviders = useCallback(
    (providers: Array<{ id: string; name: string; enabled: boolean; priority: number }>, modelId?: string) =>
      fallbackEngineStore.syncFromProviders(providers, modelId),
    [],
  )
  return { setChain, selectNext, recordSuccess, recordFailure, clearEvents, syncFromProviders }
}
