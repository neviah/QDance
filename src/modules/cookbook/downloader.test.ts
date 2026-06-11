import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/tauri', () => ({
  isTauri: () => false,
}))

import { downloadModel } from './downloader'

function chunkStream(chunks: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new Uint8Array(chunk))
      }
      controller.close()
    },
  })
}

describe('downloadModel (browser resumable)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('resumes from partial bytes after a paused download', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-length': '4' }),
        body: chunkStream([[1, 2], [3, 4]]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 206,
        statusText: 'Partial Content',
        headers: new Headers({ 'content-length': '2' }),
        body: chunkStream([[3, 4]]),
      })

    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    const paused = await downloadModel(
      {
        modelId: 'qwen2.5-coder:7b-instruct-q6_K',
        sourceUri: 'https://example.com/model.gguf',
        destinationPath: 'models/model.gguf',
      },
      state => {
        if ((state.downloadedBytes ?? 0) >= 2 && !controller.signal.aborted) {
          controller.abort('pause')
        }
      },
      { signal: controller.signal },
    )

    expect(paused.status).toBe('paused')
    expect(paused.downloadedBytes).toBe(2)

    const resumed = await downloadModel({
      modelId: 'qwen2.5-coder:7b-instruct-q6_K',
      sourceUri: 'https://example.com/model.gguf',
      destinationPath: 'models/model.gguf',
    })

    expect(resumed.status).toBe('ready')
    expect(resumed.downloadedBytes).toBe(4)

    const secondCall = fetchMock.mock.calls[1]
    expect(secondCall).toBeDefined()
    const init = secondCall[1] as RequestInit
    const headers = new Headers(init.headers as HeadersInit)
    expect(headers.get('Range')).toBe('bytes=2-')
  })
})
