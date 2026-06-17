import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMessageAsyncMock = vi.fn()

vi.mock('../../api', () => ({
  sendMessageAsync: (...args: unknown[]) => sendMessageAsyncMock(...args),
}))

vi.mock('../../providers', () => ({
  providerRegistryStore: {
    getSnapshot: () => ({
      providers: [
        {
          id: 'openrouter',
          name: 'OpenRouter',
          enabled: false,
          priority: 5,
          supportedModels: [
            { id: 'openai/gpt-4o-mini' },
            { id: 'qwen/qwen3-coder:free' },
            { id: 'google/gemma-4-31b-it:free' },
          ],
        },
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

  it('replaces flaky OpenRouter model with safer fallback before sending', async () => {
    sendMessageAsyncMock.mockResolvedValueOnce(undefined)

    await sendMessageAsyncWithFallback({
      sessionId: 's1',
      text: 'hello',
      attachments: [],
      model: { providerID: 'openrouter', modelID: 'google/gemma-4-31b-it:free' },
    })

    expect(sendMessageAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ modelID: 'openai/gpt-4o-mini' }),
      }),
    )
  })

  it('sanitizes stale fallback-chain endpoints that still point at flaky OpenRouter model', async () => {
    sendMessageAsyncMock.mockResolvedValueOnce(undefined)

    fallbackEngineStore.setChain([
      {
        id: 'openrouter',
        provider: 'OpenRouter',
        model: 'google/gemma-4-31b-it:free',
        priority: 10,
        enabled: true,
      },
      {
        id: 'p2',
        provider: 'Provider 2',
        model: 'model-a',
        priority: 20,
        enabled: true,
      },
    ], false)

    await sendMessageAsyncWithFallback({
      sessionId: 's1',
      text: 'hello',
      attachments: [],
      model: { providerID: 'openrouter', modelID: 'google/gemma-4-31b-it:free' },
    })

    expect(sendMessageAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { providerID: 'openrouter', modelID: 'openai/gpt-4o-mini' },
      }),
    )
  })

  it('retries with a safer OpenRouter model when the current model is deprecated', async () => {
    sendMessageAsyncMock
      .mockRejectedValueOnce(new Error('[Venice] The model `qwen3-coder-480b-a35b-instruct` has been deprecated. Please use `qwen3-coder-480b-a35b-instruct-turbo` instead.'))
      .mockResolvedValueOnce(undefined)

    fallbackEngineStore.setChain([
      {
        id: 'openrouter',
        provider: 'OpenRouter',
        model: 'qwen/qwen3-coder:free',
        priority: 10,
        enabled: true,
      },
      {
        id: 'p1',
        provider: 'Provider 1',
        model: 'model-a',
        priority: 20,
        enabled: true,
      },
    ], false)

    await sendMessageAsyncWithFallback({
      sessionId: 's1',
      text: 'hello',
      attachments: [],
      model: { providerID: 'openrouter', modelID: 'qwen/qwen3-coder:free' },
    })

    expect(sendMessageAsyncMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        model: { providerID: 'openrouter', modelID: 'qwen/qwen3-coder:free' },
      }),
    )
    expect(sendMessageAsyncMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        model: { providerID: 'openrouter', modelID: 'openai/gpt-4o-mini' },
      }),
    )
  })
})
