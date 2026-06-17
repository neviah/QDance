import { sendMessageAsync, type SendMessageParams } from '../../api'
import { providerRegistryStore } from '../../providers'
import { fallbackEngineStore } from './fallbackStore'

type FallbackReason = 'error' | 'rate_limit' | 'timeout'

const OPENROUTER_PROVIDER_ID = 'openrouter'
const RATE_LIMITED_OPENROUTER_MODEL_ID = 'google/gemma-4-31b-it:free'
const SAFER_OPENROUTER_MODEL_IDS = [
  'openai/gpt-4o-mini',
  'anthropic/claude-3.5-haiku',
  'deepseek/deepseek-chat',
]
const DEPRECATED_OPENROUTER_MODEL_IDS = [
  'qwen/qwen3-coder:free',
]

function isRateLimitedOpenRouterSelection(providerId: string, modelId: string): boolean {
  return providerId === OPENROUTER_PROVIDER_ID && modelId === RATE_LIMITED_OPENROUTER_MODEL_ID
}

function classifyFailureReason(error: unknown): FallbackReason | null {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (message.includes('aborted') || message.includes('cancelled') || message.includes('canceled')) return null
  if (message.includes('401') || message.includes('403') || message.includes('unauthorized') || message.includes('forbidden')) return 'error'
  if (message.includes('429') || message.includes('rate') || message.includes('quota')) return 'rate_limit'
  if (message.includes('timeout') || message.includes('timed out') || message.includes('deadline')) return 'timeout'
  return 'error'
}

function isModelDeprecatedError(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('deprecated') || normalized.includes('please use')
}

function resolveSameProviderModelFallback(providerId: string, modelId: string, errorMessage: string): string | null {
  if (providerId !== OPENROUTER_PROVIDER_ID) return null

  const provider = providerRegistryStore.getSnapshot().providers.find(p => p.id === providerId)
  if (!provider) return null

  const shouldFallback = isRateLimitedOpenRouterSelection(providerId, modelId)
    || (DEPRECATED_OPENROUTER_MODEL_IDS.includes(modelId) && isModelDeprecatedError(errorMessage))

  if (!shouldFallback) return null

  for (const safeModelId of SAFER_OPENROUTER_MODEL_IDS) {
    if (safeModelId === modelId) continue
    if (provider.supportedModels.some(model => model.id === safeModelId)) {
      return safeModelId
    }
  }

  return null
}

function resolveModelForProvider(providerId: string, preferredModelId: string): string {
  const provider = providerRegistryStore.getSnapshot().providers.find(p => p.id === providerId)
  if (!provider) return preferredModelId

  if (isRateLimitedOpenRouterSelection(providerId, preferredModelId)) {
    for (const safeModelId of SAFER_OPENROUTER_MODEL_IDS) {
      if (provider.supportedModels.some(model => model.id === safeModelId)) {
        return safeModelId
      }
    }
  }

  if (provider.supportedModels.some(model => model.id === preferredModelId)) return preferredModelId
  return provider.supportedModels[0]?.id ?? preferredModelId
}

function syncFallbackChain(activeModelId: string) {
  const existing = fallbackEngineStore.getSnapshot()
  if (existing.endpoints.length > 0) {
    const sanitizedEndpoints = existing.endpoints.map(endpoint => {
      const preferredModelId = endpoint.model || activeModelId
      if (!isRateLimitedOpenRouterSelection(endpoint.id, preferredModelId)) return endpoint

      const safeModelId = resolveModelForProvider(endpoint.id, preferredModelId)
      if (safeModelId === endpoint.model) return endpoint
      return {
        ...endpoint,
        model: safeModelId,
      }
    })

    const changed = sanitizedEndpoints.some((endpoint, index) => endpoint.model !== existing.endpoints[index]?.model)
    if (changed) {
      fallbackEngineStore.setChain(sanitizedEndpoints, false)
    }
    return
  }

  const providers = providerRegistryStore
    .getSnapshot()
    .providers
    .map(provider => ({
      id: provider.id,
      name: provider.name,
      enabled: provider.enabled,
      priority: provider.priority,
    }))

  const safeActiveModelId = isRateLimitedOpenRouterSelection(OPENROUTER_PROVIDER_ID, activeModelId)
    ? resolveModelForProvider(OPENROUTER_PROVIDER_ID, activeModelId)
    : activeModelId
  fallbackEngineStore.syncFromProviders(providers, safeActiveModelId, false)
}

export async function sendMessageAsyncWithFallback(
  params: SendMessageParams,
  options?: { onFallback?: (fromProviderId: string, toProviderId: string, reason: string) => void },
): Promise<{ providerID: string; modelID: string }> {
  syncFallbackChain(params.model.modelID)

  const activeEndpoint = fallbackEngineStore.getActiveEndpoint()
  let providerID = activeEndpoint?.id ?? params.model.providerID
  let modelID = activeEndpoint?.model || resolveModelForProvider(providerID, params.model.modelID)
  const attemptedProviderIds = new Set<string>()
  const attemptedTargets = new Set<string>()
  let lastError: unknown

  while (true) {
    const targetKey = `${providerID}:${modelID}`
    if (attemptedTargets.has(targetKey)) break
    attemptedTargets.add(targetKey)
    attemptedProviderIds.add(providerID)

    try {
      await sendMessageAsync({
        ...params,
        model: {
          providerID,
          modelID,
        },
      })

      fallbackEngineStore.recordSuccess(providerID)
      providerRegistryStore.selectProvider({ providerId: providerID, modelId: modelID })
      return { providerID, modelID }
    } catch (error) {
      lastError = error
      const reason = classifyFailureReason(error)
      const message = error instanceof Error ? error.message : String(error)

      // User/system cancellation should not trigger provider failover.
      if (!reason) {
        throw error instanceof Error ? error : new Error(message)
      }

      const sameProviderModelFallback = resolveSameProviderModelFallback(providerID, modelID, message)
      if (sameProviderModelFallback && !attemptedTargets.has(`${providerID}:${sameProviderModelFallback}`)) {
        modelID = sameProviderModelFallback
        continue
      }

      const resolution = fallbackEngineStore.recordFailure(providerID, reason, message)

      if (!resolution) {
        break
      }

      if (attemptedProviderIds.has(resolution.endpoint.id)) {
        break
      }

      options?.onFallback?.(providerID, resolution.endpoint.id, message)
      providerID = resolution.endpoint.id
      modelID = resolution.endpoint.model || resolveModelForProvider(providerID, params.model.modelID)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Failed to send message'))
}
