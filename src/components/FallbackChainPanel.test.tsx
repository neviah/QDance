import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const setChainMock = vi.fn()

vi.mock('../modules/fallback', () => ({
  useFallbackChain: () => ({
    activeEndpointId: 'openrouter',
    endpoints: [],
    events: [],
  }),
  useFallbackActions: () => ({
    clearEvents: vi.fn(),
    setChain: setChainMock,
  }),
}))

vi.mock('../hooks', () => ({
  useModels: () => ({
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', providerId: 'deepseek' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', providerId: 'deepseek' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', providerId: 'openrouter' },
    ],
  }),
}))

vi.mock('../providers', () => ({
  useProviderRegistry: () => ({
    providers: [
      { id: 'openrouter', name: 'OpenRouter', kind: 'openrouter', enabled: true, priority: 10, supportedModels: [] },
      { id: 'deepseek', name: 'DeepSeek', kind: 'deepseek', enabled: true, priority: 20, supportedModels: [] },
    ],
  }),
  useProviderRegistryActions: () => ({
    toggle: vi.fn(),
  }),
}))

import { FallbackChainPanel } from './FallbackChainPanel'

describe('FallbackChainPanel', () => {
  it('adds provider rows and syncs them into the fallback chain', () => {
    render(<FallbackChainPanel />)

    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    const providerSelect = screen.getByRole('combobox', { name: /provider row 1/i })
    fireEvent.change(providerSelect, { target: { value: 'deepseek' } })

    const modelSelect = screen.getByRole('combobox', { name: /model row 1/i })
    fireEvent.change(modelSelect, { target: { value: 'deepseek-reasoner' } })

    expect(setChainMock).toHaveBeenCalledWith([
      {
        id: 'deepseek',
        provider: 'DeepSeek',
        model: 'deepseek-reasoner',
        priority: 10,
        enabled: true,
      },
    ])
  })
})
