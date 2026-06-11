export interface ProviderEndpoint {
  id: string
  provider: string
  model: string
  baseUrl?: string
  priority: number
  enabled: boolean
}

export interface FallbackEvent {
  timestamp: string
  fromEndpointId?: string
  toEndpointId?: string
  reason: 'error' | 'rate_limit' | 'timeout' | 'manual' | 'health_check'
  message: string
}

export interface FallbackChainState {
  activeEndpointId?: string
  endpoints: ProviderEndpoint[]
  events: FallbackEvent[]
}

export interface FallbackResolution {
  endpoint: ProviderEndpoint
  reason?: string
}

export interface FallbackEngine {
  getState(): Promise<FallbackChainState>
  setChain(endpoints: ProviderEndpoint[]): Promise<void>
  selectNext(reason: FallbackEvent['reason'], message: string): Promise<FallbackResolution>
  recordSuccess(endpointId: string): Promise<void>
  recordFailure(endpointId: string, reason: FallbackEvent['reason'], message: string): Promise<FallbackResolution>
}