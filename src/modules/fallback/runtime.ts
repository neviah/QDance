import { sendMessageAsync, type SendMessageParams } from '../../api'
import { providerRegistryStore } from '../../providers'
import { fallbackEngineStore } from './fallbackStore'

type FallbackReason = 'error' | 'rate_limit' | 'timeout'

function classifyFailureReason(error: unknown): FallbackReason {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (message.includes('429') || message.includes('rate') || message.includes('quota')) return 'rate_limit'
  if (message.includes('timeout') || message.includes('timed out') || message.includes('deadline')) return 'timeout'
  return 'error'
}

function resolveModelForProvider(providerId: string, preferredModelId: string): string {
  const provider = providerRegistryStore.getSnapshot().providers.find(p => p.id === providerId)
  if (!provider) return preferredModelId
  if (provider.supportedModels.some(model => model.id === preferredModelId)) return preferredModelId
  return provider.supportedModels[0]?.id ?? preferredModelId
}

function syncFallbackChain(activeModelId: string) {
  const providers = providerRegistryStore
    .getSnapshot()
    .providers
    .map(provider => ({
      id: provider.id,
      name: provider.name,
      enabled: provider.enabled,
      priority: provider.priority,
    }))

  fallbackEngineStore.syncFromProviders(providers, activeModelId, false)
}

export async function sendMessageAsyncWithFallback(
  params: SendMessageParams,
  options?: { onFallback?: (fromProviderId: string, toProviderId: string, reason: string) => void },
): Promise<{ providerID: string; modelID: string }> {
  syncFallbackChain(params.model.modelID)

  const activeEndpoint = fallbackEngineStore.getActiveEndpoint()
  let providerID = activeEndpoint?.id ?? params.model.providerID
  let modelID = resolveModelForProvider(providerID, params.model.modelID)
  const attemptedProviderIds = new Set<string>()
  let lastError: unknown

  while (!attemptedProviderIds.has(providerID)) {
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
      const resolution = fallbackEngineStore.recordFailure(providerID, reason, message)

      if (!resolution) {
        break
      }

      options?.onFallback?.(providerID, resolution.endpoint.id, message)
      providerID = resolution.endpoint.id
      modelID = resolveModelForProvider(providerID, params.model.modelID)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Failed to send message'))
}
