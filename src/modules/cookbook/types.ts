export type HardwareBackend = 'cuda' | 'rocm' | 'metal' | 'vulkan' | 'cpu'

export interface CpuCapabilityProfile {
  modelName: string
  coreCount?: number
  threadCount?: number
  instructionSets: string[]
}

export interface GpuCapabilityProfile {
  backend: HardwareBackend
  name: string
  vendor?: string
  vramGiB?: number
  memoryBandwidthGBs?: number
}

export interface HardwareScanResult {
  hostName?: string
  cpu: CpuCapabilityProfile
  ramGiB: number
  gpus: GpuCapabilityProfile[]
  detectedBackends: HardwareBackend[]
  notes: string[]
}

export interface ModelRecommendation {
  family: string
  modelId: string
  quantization: string
  source: 'local' | 'cloud'
  reasoning: string
  estimatedContextWindow?: number
  estimatedVRAMGiB?: number
}

export interface ModelDownloadRequest {
  modelId: string
  sourceUri: string
  destinationPath: string
  revision?: string
  checksum?: string
}

export interface ModelDownloadState extends ModelDownloadRequest {
  status: 'queued' | 'downloading' | 'paused' | 'cancelled' | 'ready' | 'failed'
  progress: number
  downloadedBytes?: number
  totalBytes?: number
  errorMessage?: string
}

export interface RegisteredModel extends ModelDownloadState {
  displayName: string
  providerKind: 'local' | 'cloud'
}

export interface CookbookModule {
  scanHardware(): Promise<HardwareScanResult>
  recommendModel(scan: HardwareScanResult): Promise<ModelRecommendation>
  downloadModel(request: ModelDownloadRequest): Promise<ModelDownloadState>
  registerModel(model: RegisteredModel): Promise<void>
}