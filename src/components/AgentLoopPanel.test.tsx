import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const startMock = vi.fn()

vi.mock('../modules/agent', () => ({
  useAgentLoop: () => ({
    status: 'idle',
    currentStep: undefined,
    checkpoint: undefined,
    plan: [],
    logs: [],
  }),
  useAgentLoopActions: () => ({
    start: startMock,
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    checkpoint: vi.fn(),
  }),
}))

import { AgentLoopPanel } from './AgentLoopPanel'

describe('AgentLoopPanel', () => {
  it('starts loop with goal and directory config', () => {
    render(<AgentLoopPanel directory="D:/Projects/QDance/OpenCodeAutonomous" />)

    fireEvent.change(screen.getByPlaceholderText(/describe the coding goal/i), {
      target: { value: 'Implement tests' },
    })
    fireEvent.click(screen.getByRole('button', { name: /start loop/i }))

    expect(startMock).toHaveBeenCalledWith({
      workspacePath: 'D:/Projects/QDance/OpenCodeAutonomous',
      goal: 'Implement tests',
      maxIterations: 30,
    })
  })
})
