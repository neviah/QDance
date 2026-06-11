// ============================================
// Model Recommendation Logic
// Scores model families by available VRAM + RAM + backend
// ============================================

import type { HardwareScanResult, ModelRecommendation } from './types'

interface ModelEntry {
  family: string
  modelId: string
  huggingFaceRepo: string
  fileName: string
  estimatedVRAMGiB: number
  estimatedContextWindow: number
  backends: Array<'cuda' | 'rocm' | 'metal' | 'vulkan' | 'cpu'>
  quantization: string
  minRamGiB?: number
}

// Priority-ordered model catalogue — edit freely to add new entries
const MODEL_CATALOGUE: ModelEntry[] = [
  {
    family: 'DeepSeek-Coder-V2',
    modelId: 'deepseek-coder-v2:16b-instruct-q6_K',
    huggingFaceRepo: 'bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF',
    fileName: 'DeepSeek-Coder-V2-Lite-Instruct-Q6_K.gguf',
    estimatedVRAMGiB: 13,
    estimatedContextWindow: 128000,
    backends: ['cuda', 'rocm', 'metal', 'vulkan'],
    quantization: 'Q6_K',
  },
  {
    family: 'Qwen2.5-Coder',
    modelId: 'qwen2.5-coder:14b-instruct-q5_K_M',
    huggingFaceRepo: 'bartowski/Qwen2.5-Coder-14B-Instruct-GGUF',
    fileName: 'Qwen2.5-Coder-14B-Instruct-Q5_K_M.gguf',
    estimatedVRAMGiB: 11,
    estimatedContextWindow: 32768,
    backends: ['cuda', 'rocm', 'metal', 'vulkan'],
    quantization: 'Q5_K_M',
  },
  {
    family: 'Qwen2.5-Coder',
    modelId: 'qwen2.5-coder:7b-instruct-q6_K',
    huggingFaceRepo: 'bartowski/Qwen2.5-Coder-7B-Instruct-GGUF',
    fileName: 'Qwen2.5-Coder-7B-Instruct-Q6_K.gguf',
    estimatedVRAMGiB: 6,
    estimatedContextWindow: 32768,
    backends: ['cuda', 'rocm', 'metal', 'vulkan', 'cpu'],
    quantization: 'Q6_K',
  },
  {
    family: 'Mistral-7B',
    modelId: 'mistral:7b-instruct-v0.3-q5_K_M',
    huggingFaceRepo: 'bartowski/Mistral-7B-Instruct-v0.3-GGUF',
    fileName: 'Mistral-7B-Instruct-v0.3-Q5_K_M.gguf',
    estimatedVRAMGiB: 5,
    estimatedContextWindow: 32768,
    backends: ['cuda', 'rocm', 'metal', 'vulkan', 'cpu'],
    quantization: 'Q5_K_M',
  },
  {
    family: 'Phi-3.5-mini',
    modelId: 'phi3.5:3.8b-mini-instruct-q6_K',
    huggingFaceRepo: 'bartowski/Phi-3.5-mini-instruct-GGUF',
    fileName: 'Phi-3.5-mini-instruct-Q6_K.gguf',
    estimatedVRAMGiB: 3.5,
    estimatedContextWindow: 128000,
    backends: ['cuda', 'rocm', 'metal', 'vulkan', 'cpu'],
    quantization: 'Q6_K',
    minRamGiB: 6,
  },
  {
    family: 'Phi-3.5-mini',
    modelId: 'phi3.5:3.8b-mini-instruct-q4_K_M',
    huggingFaceRepo: 'bartowski/Phi-3.5-mini-instruct-GGUF',
    fileName: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
    estimatedVRAMGiB: 2.5,
    estimatedContextWindow: 128000,
    backends: ['cuda', 'rocm', 'metal', 'vulkan', 'cpu'],
    quantization: 'Q4_K_M',
    minRamGiB: 4,
  },
]

function bestVramGiB(scan: HardwareScanResult): number {
  return scan.gpus.reduce((max, g) => Math.max(max, g.vramGiB ?? 0), 0)
}

export function recommendModel(scan: HardwareScanResult): ModelRecommendation {
  const vram = bestVramGiB(scan)
  const backends = new Set(scan.detectedBackends)

  // Filter by hardware compatibility
  const compatible = MODEL_CATALOGUE.filter(m => {
    const hasBackend = m.backends.some(b => backends.has(b) || b === 'cpu')
    if (!hasBackend) return false
    const fitsVram = vram > 0 ? m.estimatedVRAMGiB <= vram * 0.9 : true
    const fitsRam = m.minRamGiB ? scan.ramGiB >= m.minRamGiB : true
    return fitsVram && fitsRam
  })

  if (compatible.length === 0) {
    // Nothing fits — recommend the smallest model we have
    const fallback = MODEL_CATALOGUE.at(-1)!
    return {
      family: fallback.family,
      modelId: fallback.modelId,
      quantization: fallback.quantization,
      source: 'local',
      reasoning: `No model perfectly matches your hardware (${vram} GiB VRAM, ${scan.ramGiB} GiB RAM). Recommending the lightest option as a starting point.`,
      estimatedContextWindow: fallback.estimatedContextWindow,
      estimatedVRAMGiB: fallback.estimatedVRAMGiB,
    }
  }

  // Pick the largest model that fits
  const best = compatible[0]
  const parts: string[] = []
  if (vram > 0) parts.push(`${vram} GiB VRAM detected`)
  parts.push(`${scan.ramGiB} GiB RAM`)
  const backendList = scan.detectedBackends.join(', ')
  parts.push(`${backendList} backend`)

  return {
    family: best.family,
    modelId: best.modelId,
    quantization: best.quantization,
    source: 'local',
    reasoning: `Best fit for ${parts.join(', ')}. Uses ~${best.estimatedVRAMGiB} GiB VRAM with ${best.quantization} quantization.`,
    estimatedContextWindow: best.estimatedContextWindow,
    estimatedVRAMGiB: best.estimatedVRAMGiB,
  }
}

/** Compute the Hugging Face direct download URL for a model entry. */
export function resolveDownloadUrl(modelId: string): { repo: string; fileName: string; url: string } | undefined {
  const entry = MODEL_CATALOGUE.find(m => m.modelId === modelId)
  if (!entry) return undefined
  return {
    repo: entry.huggingFaceRepo,
    fileName: entry.fileName,
    url: `https://huggingface.co/${entry.huggingFaceRepo}/resolve/main/${entry.fileName}`,
  }
}

export { MODEL_CATALOGUE }
export type { ModelEntry }
