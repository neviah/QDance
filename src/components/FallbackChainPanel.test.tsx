import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const syncFromProvidersMock = vi.fn()

vi.mock('../modules/fallback', () => ({
  useFallbackChain: () => ({
    activeEndpointId: 'openrouter',
    endpoints: [],
    events: [],
  }),
  useFallbackActions: () => ({
    clearEvents: vi.fn(),
    syncFromProviders: syncFromProvidersMock,
  }),
}))

vi.mock('../providers', () => ({
  useProviderRegistry: () => ({
    providers: [
      { id: 'openrouter', name: 'OpenRouter', enabled: true, priority: 10 },
      { id: 'deepseek', name: 'DeepSeek', enabled: true, priority: 20 },
    ],
  }),
  useProviderRegistryActions: () => ({
    toggle: vi.fn(),
    setPriority: vi.fn(),
  }),
}))

import { FallbackChainPanel } from './FallbackChainPanel'

describe('FallbackChainPanel', () => {
  it('syncs chain using current provider registry values', () => {
    render(<FallbackChainPanel />)

    fireEvent.click(screen.getByRole('button', { name: /sync from providers/i }))

    expect(syncFromProvidersMock).toHaveBeenCalledTimes(1)
    expect(syncFromProvidersMock).toHaveBeenCalledWith([
      { id: 'openrouter', name: 'OpenRouter', enabled: true, priority: 10 },
      { id: 'deepseek', name: 'DeepSeek', enabled: true, priority: 20 },
    ])
  })
})
