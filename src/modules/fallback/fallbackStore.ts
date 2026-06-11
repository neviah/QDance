// ============================================
// Fallback Engine Store
// Priority-ordered provider chain with automatic failover.
// Persisted to localStorage, reactive via useSyncExternalStore.
// ============================================

import { useSyncExternalStore, useCallback } from 'react'
import type { FallbackChainState, FallbackEvent, FallbackResolution, ProviderEndpoint } from './types'

const STORAGE_KEY = 'oca-fallback-v1'
const MAX_EVENTS = 200
const DEFAULT_COOLDOWN_MS = 30_000

type Subscriber = () => void

function loadState(): FallbackChainState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FallbackChainState>
      return {
        activeEndpointId: parsed.activeEndpointId,
        endpoints: parsed.endpoints ?? [],
        events: parsed.events ?? [],
        health: parsed.health ?? {},
      }
    }
  } catch { /* ignore */ }
  return { endpoints: [], events: [], health: {} }
}

class FallbackEngineStore {
  private state: FallbackChainState = loadState()
  private subscribers = new Set<Subscriber>()

  getSnapshot = (): FallbackChainState => this.state

  subscribe = (cb: Subscriber): (() => void) => {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }

  private getEligibleEndpoints(): ProviderEndpoint[] {
    const now = Date.now()
    const healthy = this.state.endpoints
      .filter(endpoint => endpoint.enabled)
      .filter(endpoint => {
        const health = this.state.health[endpoint.id]
        if (!health?.cooldownUntil) return true
        return new Date(health.cooldownUntil).getTime() <= now
      })
      .sort((a, b) => a.priority - b.priority)

    if (healthy.length > 0) return healthy
    return this.state.endpoints.filter(endpoint => endpoint.enabled).sort((a, b) => a.priority - b.priority)
  }

  private upsertHealth(endpointId: string, patch: Partial<FallbackChainState['health'][string]>) {
    const current = this.state.health[endpointId]
    this.update({
      health: {
        ...this.state.health,
        [endpointId]: {
          ...(current ?? { state: 'healthy' as const, failureCount: 0 }),
          ...patch,
        },
      },
    })
  }

  private computeCooldownMs(reason: FallbackEvent['reason'], failureCount: number): number {
    if (reason === 'rate_limit') return Math.min(5 * 60_000, DEFAULT_COOLDOWN_MS * Math.max(2, failureCount))
    if (reason === 'timeout') return Math.min(2 * 60_000, DEFAULT_COOLDOWN_MS * Math.max(1, failureCount))
    if (reason === 'error') return Math.min(90_000, DEFAULT_COOLDOWN_MS * Math.max(1, failureCount - 1))
    return DEFAULT_COOLDOWN_MS
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

  setChain(endpoints: ProviderEndpoint[], emitEvent = true) {
    const sorted = [...endpoints].sort((a, b) => a.priority - b.priority)
    const currentlyActive = this.state.activeEndpointId
    const canKeepCurrent = currentlyActive && sorted.some(endpoint => endpoint.id === currentlyActive && endpoint.enabled)
    const now = Date.now()
    const eligible = sorted
      .filter(endpoint => endpoint.enabled)
      .filter(endpoint => {
        const health = this.state.health[endpoint.id]
        if (!health?.cooldownUntil) return true
        return new Date(health.cooldownUntil).getTime() <= now
      })
    const activeEndpointId = canKeepCurrent ? currentlyActive : (eligible[0] ?? sorted.find(endpoint => endpoint.enabled))?.id
    this.update({ endpoints: sorted, activeEndpointId })
    if (emitEvent) {
      this.addEvent({ reason: 'manual', message: `Chain updated with ${sorted.length} endpoints` })
    }
  }

  syncFromProviders(
    providers: Array<{ id: string; name: string; enabled: boolean; priority: number }>,
    activeModelId?: string,
    emitEvent = true,
  ) {
    const endpoints: ProviderEndpoint[] = providers.map(p => ({
      id: p.id,
      provider: p.name,
      model: activeModelId ?? '',
      priority: p.priority,
      enabled: p.enabled,
    }))
    this.setChain(endpoints, emitEvent)
  }

  selectNext(reason: FallbackEvent['reason'], message: string): FallbackResolution | null {
    const current = this.state.activeEndpointId
    const sorted = this.getEligibleEndpoints()
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
    this.upsertHealth(endpointId, {
      state: 'healthy',
      failureCount: 0,
      cooldownUntil: undefined,
      lastError: undefined,
    })

    if (this.state.activeEndpointId !== endpointId) {
      this.update({ activeEndpointId: endpointId })
    }
  }

  recordFailure(
    endpointId: string,
    reason: FallbackEvent['reason'],
    message: string,
  ): FallbackResolution | null {
    const previousFailures = this.state.health[endpointId]?.failureCount ?? 0
    const failureCount = previousFailures + 1
    const cooldownMs = this.computeCooldownMs(reason, failureCount)
    const cooldownUntil = new Date(Date.now() + cooldownMs).toISOString()

    this.upsertHealth(endpointId, {
      state: 'cooldown',
      failureCount,
      lastFailureAt: new Date().toISOString(),
      cooldownUntil,
      lastError: message,
    })

    return this.selectNext(reason, `${endpointId} failed — ${message}`)
  }

  getActiveEndpoint(): ProviderEndpoint | undefined {
    return this.state.endpoints.find(e => e.id === this.state.activeEndpointId)
  }

  clearEvents() {
    this.update({ events: [] })
  }

  reset() {
    this.update({
      activeEndpointId: undefined,
      endpoints: [],
      events: [],
      health: {},
    })
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
    (
      providers: Array<{ id: string; name: string; enabled: boolean; priority: number }>,
      modelId?: string,
      emitEvent?: boolean,
    ) => fallbackEngineStore.syncFromProviders(providers, modelId, emitEvent),
    [],
  )
  return { setChain, selectNext, recordSuccess, recordFailure, clearEvents, syncFromProviders }
}
