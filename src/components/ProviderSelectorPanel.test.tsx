import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const selectMock = vi.fn()

vi.mock('../providers', () => ({
  useProviderRegistry: () => ({
    providers: [
      {
        id: 'openrouter',
        kind: 'openrouter',
        name: 'OpenRouter',
        enabled: true,
        priority: 10,
        supportedModels: [{ id: 'openai/gpt-4o', label: 'GPT-4o' }],
      },
    ],
    activeSelection: undefined,
  }),
  useProviderRegistryActions: () => ({
    register: vi.fn(),
    remove: vi.fn(),
    toggle: vi.fn(),
    select: selectMock,
  }),
}))

import { ProviderSelectorPanel } from './ProviderSelectorPanel'

describe('ProviderSelectorPanel', () => {
  it('selects a provider model when model chip is clicked', () => {
    render(<ProviderSelectorPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'GPT-4o' }))

    expect(selectMock).toHaveBeenCalledWith({ providerId: 'openrouter', modelId: 'openai/gpt-4o' })
  })
})
