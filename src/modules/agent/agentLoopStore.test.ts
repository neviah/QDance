import { beforeEach, describe, expect, it, vi } from 'vitest'

const createSessionMock = vi.fn()
const updateSessionMock = vi.fn()
const sendMessageWithFallbackMock = vi.fn()

vi.mock('../../api/session', () => ({
  createSession: (...args: unknown[]) => createSessionMock(...args),
  updateSession: (...args: unknown[]) => updateSessionMock(...args),
}))

vi.mock('../../api/message', () => ({
  getSessionMessages: vi.fn(),
}))

vi.mock('../fallback', () => ({
  sendMessageAsyncWithFallback: (...args: unknown[]) => sendMessageWithFallbackMock(...args),
}))

vi.mock('../../providers/providerStore', () => ({
  providerRegistryStore: {
    getActiveProvider: () => ({ id: 'openrouter', supportedModels: [{ id: 'openai/gpt-4o' }] }),
    getSnapshot: () => ({ activeSelection: { providerId: 'openrouter', modelId: 'openai/gpt-4o' } }),
  },
}))

import { agentLoopStore } from './agentLoopStore'

describe('agentLoopStore', () => {
  beforeEach(() => {
    localStorage.clear()
    createSessionMock.mockReset()
    updateSessionMock.mockReset()
    sendMessageWithFallbackMock.mockReset()
    createSessionMock.mockResolvedValue({ id: 'session-1' })
    updateSessionMock.mockResolvedValue({ id: 'session-1' })
    sendMessageWithFallbackMock.mockResolvedValue(undefined)
    agentLoopStore.stop()
  })

  it('runs a basic plan-act-evaluate cycle to completion', async () => {
    const waitSpy = vi.spyOn(agentLoopStore as unknown as { waitForResponse: () => Promise<string> }, 'waitForResponse')
      .mockResolvedValueOnce('1. Add feature flag')
      .mockResolvedValueOnce('Implemented feature flag')
      .mockResolvedValueOnce('PASS: looks good')

    const snapshot = await agentLoopStore.start({
      workspacePath: 'D:/Projects/QDance/OpenCodeAutonomous',
      goal: 'Add a feature flag toggle',
      maxIterations: 3,
    })

    expect(createSessionMock).toHaveBeenCalledTimes(1)
    expect(sendMessageWithFallbackMock).toHaveBeenCalledTimes(3)
    expect(updateSessionMock).toHaveBeenCalledTimes(1)
    expect(snapshot.status).toBe('idle')
    expect(snapshot.plan[0]?.status).toBe('done')

    waitSpy.mockRestore()
  })
})
