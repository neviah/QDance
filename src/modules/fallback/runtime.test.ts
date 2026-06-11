import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMessageAsyncMock = vi.fn()

vi.mock('../../api', () => ({
  sendMessageAsync: (...args: unknown[]) => sendMessageAsyncMock(...args),
}))

vi.mock('../../providers', () => ({
  providerRegistryStore: {
    getSnapshot: () => ({
      providers: [
        { id: 'p1', name: 'Provider 1', enabled: true, priority: 10, supportedModels: [{ id: 'model-a' }] },
        { id: 'p2', name: 'Provider 2', enabled: true, priority: 20, supportedModels: [{ id: 'model-a' }] },
      ],
    }),
    selectProvider: vi.fn(),
  },
}))

import { fallbackEngineStore } from './fallbackStore'
import { sendMessageAsyncWithFallback } from './runtime'

describe('sendMessageAsyncWithFallback', () => {
  beforeEach(() => {
    localStorage.clear()
    fallbackEngineStore.reset()
    sendMessageAsyncMock.mockReset()
  })

  it('does not trigger fallback rotation on aborted sends', async () => {
    sendMessageAsyncMock.mockRejectedValueOnce(new Error('request aborted by user'))

    await expect(
      sendMessageAsyncWithFallback({
        sessionId: 's1',
        text: 'hello',
        attachments: [],
        model: { providerID: 'p1', modelID: 'model-a' },
      }),
    ).rejects.toThrow('aborted')

    expect(fallbackEngineStore.getSnapshot().events.length).toBe(0)
  })

  it('switches to the next provider when rate limited', async () => {
    sendMessageAsyncMock
      .mockRejectedValueOnce(new Error('429 rate limit exceeded'))
      .mockResolvedValueOnce(undefined)

    const result = await sendMessageAsyncWithFallback(
      {
        sessionId: 's1',
        text: 'hello',
        attachments: [],
        model: { providerID: 'p1', modelID: 'model-a' },
      },
      { onFallback: vi.fn() },
    )

    expect(result.providerID).toBe('p2')
    expect(sendMessageAsyncMock).toHaveBeenCalledTimes(2)
    expect(fallbackEngineStore.getSnapshot().activeEndpointId).toBe('p2')
  })
})
