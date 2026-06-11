import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./HardwareScanPanel', () => ({
  HardwareScanPanel: () => <div>Hardware panel body</div>,
}))

vi.mock('./ProviderSelectorPanel', () => ({
  ProviderSelectorPanel: () => <div>Providers panel body</div>,
}))

vi.mock('./FallbackChainPanel', () => ({
  FallbackChainPanel: () => <div>Fallback panel body</div>,
}))

vi.mock('./AgentLoopPanel', () => ({
  AgentLoopPanel: () => <div>Agent panel body</div>,
}))

import { AutonomousPanel } from './AutonomousPanel'

describe('AutonomousPanel', () => {
  it('switches tabs and renders corresponding panel', async () => {
    render(<AutonomousPanel />)

    expect(await screen.findByText('Hardware panel body')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /providers/i }))
    expect(await screen.findByText('Providers panel body')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /fallback/i }))
    expect(await screen.findByText('Fallback panel body')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /agent loop/i }))
    expect(await screen.findByText('Agent panel body')).toBeInTheDocument()
  })
})
