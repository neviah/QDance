import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const startScanMock = vi.fn()
const retryDownloadMock = vi.fn()
const mockState: {
  scanStatus: 'idle' | 'scanning' | 'done' | 'failed'
  scanError: string | undefined
  scan: unknown
  recommendation: {
    family: string
    modelId: string
    quantization: string
    source: 'local' | 'cloud'
    reasoning: string
  } | undefined
  downloads: Array<{
    modelId: string
    sourceUri: string
    destinationPath: string
    status: 'queued' | 'downloading' | 'paused' | 'cancelled' | 'ready' | 'failed'
    progress: number
    downloadedBytes?: number
    totalBytes?: number
    errorMessage?: string
  }>
  registeredModels: unknown[]
} = {
  scanStatus: 'idle',
  scanError: undefined,
  scan: undefined,
  recommendation: undefined,
  downloads: [],
  registeredModels: [],
}

vi.mock('../modules/cookbook', () => ({
  useCookbook: () => mockState,
  useCookbookActions: () => ({
    startScan: startScanMock,
    startDownload: vi.fn(),
    pauseDownload: vi.fn(),
    cancelDownload: vi.fn(),
    retryDownload: retryDownloadMock,
  }),
}))

vi.mock('../modules/cookbook/recommend', () => ({
  resolveDownloadUrl: vi.fn(),
}))

import { HardwareScanPanel } from './HardwareScanPanel'

describe('HardwareScanPanel', () => {
  it('triggers hardware scan from the action button', () => {
    mockState.scanStatus = 'idle'
    mockState.recommendation = undefined
    mockState.downloads = []

    render(<HardwareScanPanel />)

    fireEvent.click(screen.getByRole('button', { name: /run hardware scan/i }))

    expect(startScanMock).toHaveBeenCalledTimes(1)
  })

  it('allows retrying a paused download for the recommended model', () => {
    mockState.recommendation = {
      family: 'Qwen2.5-Coder',
      modelId: 'qwen2.5-coder:7b-instruct-q6_K',
      quantization: 'Q6_K',
      source: 'local',
      reasoning: 'test',
    }
    mockState.downloads = [
      {
        modelId: 'qwen2.5-coder:7b-instruct-q6_K',
        sourceUri: 'https://example.com/model.gguf',
        destinationPath: 'models/model.gguf',
        status: 'paused',
        progress: 45,
      },
    ]

    render(<HardwareScanPanel />)

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(retryDownloadMock).toHaveBeenCalledWith('qwen2.5-coder:7b-instruct-q6_K')
  })
})
