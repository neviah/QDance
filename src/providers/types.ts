export type ProviderKind = 'openrouter' | 'deepseek' | 'qwen' | 'gemini' | 'openai' | 'local'

export interface ProviderModelDescriptor {
  id: string
  label: string
  contextWindow?: number
  maxOutputTokens?: number
  quantization?: string
  localModelPath?: string
}

export interface ProviderDefinition {
  id: string
  kind: ProviderKind
  name: string
  baseUrl?: string
  apiKeyEnvVar?: string
  supportedModels: ProviderModelDescriptor[]
  enabled: boolean
  priority: number
}

export interface ProviderSelection {
  providerId: string
  modelId: string
}

export interface ProviderRegistry {
  listProviders(): Promise<ProviderDefinition[]>
  registerProvider(provider: ProviderDefinition): Promise<void>
  removeProvider(providerId: string): Promise<void>
  selectProvider(selection: ProviderSelection): Promise<void>
  getActiveProvider(): Promise<ProviderDefinition | undefined>
}