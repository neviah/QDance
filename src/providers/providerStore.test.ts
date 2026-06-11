import { beforeEach, describe, expect, it } from 'vitest'
import { providerRegistryStore } from './providerStore'

describe('providerRegistryStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('registers and selects a provider model', () => {
    providerRegistryStore.registerProvider({
      id: 'custom',
      kind: 'openai',
      name: 'Custom OpenAI',
      enabled: true,
      priority: 15,
      supportedModels: [{ id: 'gpt-x', label: 'GPT X' }],
    })

    providerRegistryStore.selectProvider({ providerId: 'custom', modelId: 'gpt-x' })

    const snapshot = providerRegistryStore.getSnapshot()
    expect(snapshot.providers.some(p => p.id === 'custom')).toBe(true)
    expect(snapshot.activeSelection).toEqual({ providerId: 'custom', modelId: 'gpt-x' })
  })

  it('updates provider priority ordering', () => {
    providerRegistryStore.registerProvider({
      id: 'prio-a',
      kind: 'openai',
      name: 'Priority A',
      enabled: true,
      priority: 90,
      supportedModels: [],
    })

    providerRegistryStore.updatePriority('prio-a', 1)

    const snapshot = providerRegistryStore.getSnapshot()
    const item = snapshot.providers.find(p => p.id === 'prio-a')
    expect(item?.priority).toBe(1)
  })
})
