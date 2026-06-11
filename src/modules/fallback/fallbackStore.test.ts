import { beforeEach, describe, expect, it } from 'vitest'
import { fallbackEngineStore } from './fallbackStore'

describe('fallbackEngineStore', () => {
  beforeEach(() => {
    localStorage.clear()
    fallbackEngineStore.reset()
  })

  it('sets chain ordered by priority and picks the first enabled endpoint', () => {
    fallbackEngineStore.setChain([
      { id: 'p2', provider: 'B', model: 'm', priority: 20, enabled: true },
      { id: 'p1', provider: 'A', model: 'm', priority: 10, enabled: true },
    ])

    const snapshot = fallbackEngineStore.getSnapshot()
    expect(snapshot.endpoints.map(e => e.id)).toEqual(['p1', 'p2'])
    expect(snapshot.activeEndpointId).toBe('p1')
  })

  it('selects next enabled endpoint on failure', () => {
    fallbackEngineStore.setChain([
      { id: 'p1', provider: 'A', model: 'm', priority: 10, enabled: true },
      { id: 'p2', provider: 'B', model: 'm', priority: 20, enabled: true },
    ])

    const resolution = fallbackEngineStore.recordFailure('p1', 'error', 'boom')

    expect(resolution?.endpoint.id).toBe('p2')
    expect(fallbackEngineStore.getSnapshot().activeEndpointId).toBe('p2')
    expect(fallbackEngineStore.getSnapshot().events.length).toBeGreaterThan(0)
  })

  it('skips providers currently in cooldown when selecting next endpoint', () => {
    fallbackEngineStore.setChain([
      { id: 'p1', provider: 'A', model: 'm', priority: 10, enabled: true },
      { id: 'p2', provider: 'B', model: 'm', priority: 20, enabled: true },
      { id: 'p3', provider: 'C', model: 'm', priority: 30, enabled: true },
    ])

    const first = fallbackEngineStore.recordFailure('p1', 'error', 'boom-1')
    expect(first?.endpoint.id).toBe('p2')

    const second = fallbackEngineStore.recordFailure('p2', 'rate_limit', 'boom-2')
    expect(second?.endpoint.id).toBe('p3')

    const snapshot = fallbackEngineStore.getSnapshot()
    expect(snapshot.health.p1?.state).toBe('cooldown')
    expect(snapshot.health.p2?.state).toBe('cooldown')
  })
})
