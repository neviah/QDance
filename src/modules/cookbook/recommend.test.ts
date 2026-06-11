import { describe, expect, it } from 'vitest'
import { recommendModel, resolveDownloadUrl } from './recommend'
import type { HardwareScanResult } from './types'

function makeScan(overrides: Partial<HardwareScanResult> = {}): HardwareScanResult {
  return {
    cpu: {
      modelName: 'Test CPU',
      instructionSets: ['AVX2'],
      coreCount: 8,
      threadCount: 16,
    },
    gpus: [{ backend: 'cuda', name: 'RTX Test', vramGiB: 16 }],
    ramGiB: 32,
    detectedBackends: ['cuda', 'vulkan'],
    notes: [],
    ...overrides,
  }
}

describe('cookbook recommend', () => {
  it('returns a local recommendation for capable hardware', () => {
    const recommendation = recommendModel(makeScan())

    expect(recommendation.source).toBe('local')
    expect(recommendation.modelId.length).toBeGreaterThan(0)
    expect(recommendation.reasoning).toContain('VRAM')
  })

  it('still returns a cpu-compatible recommendation on constrained hardware', () => {
    const recommendation = recommendModel(
      makeScan({
        gpus: [{ backend: 'cpu', name: 'CPU only' }],
        detectedBackends: ['cpu'],
        ramGiB: 2,
      }),
    )

    expect(recommendation.source).toBe('local')
    expect(recommendation.reasoning).toContain('cpu backend')
  })

  it('resolves known model download metadata', () => {
    const resolved = resolveDownloadUrl('qwen2.5-coder:7b-instruct-q6_K')

    expect(resolved).toBeDefined()
    expect(resolved?.url).toContain('huggingface.co')
    expect(resolved?.fileName.endsWith('.gguf')).toBe(true)
  })
})
