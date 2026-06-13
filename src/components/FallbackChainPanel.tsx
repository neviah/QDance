// ============================================
// Fallback Chain Panel
// Shows a compact provider chain editor and failover event log.
// ============================================

import { memo, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { useFallbackChain, useFallbackActions } from '../modules/fallback'
import { useProviderRegistry, useProviderRegistryActions } from '../providers'
import { useModels } from '../hooks'
import { ModuleCard } from '../ui/components/ModuleCard'
import { StatusBadge } from '../ui/components/StatusBadge'
import type { FallbackEvent } from '../modules/fallback'
import type { ProviderDefinition } from '../providers'
import type { ModelInfo } from '../api'

interface ChainDraftRow {
  providerId: string
  modelId: string
}

export const FallbackChainPanel = memo(function FallbackChainPanel() {
  const chain = useFallbackChain()
  const { clearEvents, setChain } = useFallbackActions()
  const registry = useProviderRegistry()
  const { toggle } = useProviderRegistryActions()
  const { models } = useModels()

  const providerById = useMemo(
    () => new Map(registry.providers.map((provider: ProviderDefinition) => [provider.id, provider])),
    [registry.providers],
  )

  const modelsByProvider = useMemo(() => {
    const grouped = new Map<string, ModelInfo[]>()
    for (const model of models) {
      const list = grouped.get(model.providerId) ?? []
      list.push(model)
      grouped.set(model.providerId, list)
    }
    return grouped
  }, [models])

  const [chainDraft, setChainDraft] = useState<ChainDraftRow[]>(() =>
    chain.endpoints.map(endpoint => ({ providerId: endpoint.id, modelId: endpoint.model })),
  )

  const persistChain = (nextDraft: ChainDraftRow[]) => {
    setChainDraft(nextDraft)

    const endpoints = nextDraft
      .map((row, index) => {
        if (!row.providerId || !row.modelId) return null
        const provider = providerById.get(row.providerId)
        if (!provider) return null

        return {
          id: provider.id,
          provider: provider.name,
          model: row.modelId,
          priority: (index + 1) * 10,
          enabled: provider.enabled,
        }
      })
      .filter((endpoint): endpoint is NonNullable<typeof endpoint> => Boolean(endpoint))

    setChain(endpoints)
  }

  const addChainRow = () => {
    persistChain([...chainDraft, { providerId: '', modelId: '' }])
  }

  const updateProvider = (rowIndex: number, providerId: string) => {
    const nextDraft = [...chainDraft]
    const providerModels = modelsByProvider.get(providerId) ?? []
    const fallbackModelId = providerModels[0]?.id ?? ''
    nextDraft[rowIndex] = { providerId, modelId: fallbackModelId }
    persistChain(nextDraft)
  }

  const updateModel = (rowIndex: number, modelId: string) => {
    const nextDraft = [...chainDraft]
    const row = nextDraft[rowIndex]
    nextDraft[rowIndex] = { ...row, modelId }
    persistChain(nextDraft)
  }

  const removeChainRow = (rowIndex: number) => {
    persistChain(chainDraft.filter((_, index) => index !== rowIndex))
  }

  const moveChainRow = (rowIndex: number, direction: -1 | 1) => {
    const targetIndex = rowIndex + direction
    if (targetIndex < 0 || targetIndex >= chainDraft.length) return

    const nextDraft = [...chainDraft]
    const [item] = nextDraft.splice(rowIndex, 1)
    nextDraft.splice(targetIndex, 0, item)
    persistChain(nextDraft)
  }

  const activeEndpoint = chain.activeEndpointId ? providerById.get(chain.activeEndpointId) : undefined

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      <ModuleCard
        title="Provider Chain"
        description="Models are tried in priority order. On failure the next is selected automatically."
        statusLabel={activeEndpoint?.name ?? 'No active'}
        statusTone={chain.activeEndpointId ? 'success' : 'neutral'}
      >
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={addChainRow}
            className="rounded-lg px-3 py-1.5 text-[length:var(--fs-xs)] font-medium bg-accent-main-100 hover:bg-accent-main-200 text-bg-000 transition-colors"
          >
            Add
          </button>
          <p className="text-[length:var(--fs-xs)] text-text-500">Pick providers in order. Add another row to append to the chain.</p>
        </div>

        {chainDraft.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-200/30 p-4 text-[length:var(--fs-xs)] text-text-500">
            No providers selected yet. Press Add to build the chain.
          </div>
        ) : (
          <ul className="space-y-2">
            {chainDraft.map((row, index) => {
              const selectedProvider = row.providerId ? providerById.get(row.providerId) : undefined
              const providerModels = row.providerId
                ? modelsByProvider.get(row.providerId) ?? []
                : []
              const isActive = chain.activeEndpointId === row.providerId
              return (
                <li
                  key={`${index}-${row.providerId || 'empty'}-${row.modelId || 'none'}`}
                  className={clsx(
                    'rounded-lg border px-3 py-2 flex items-center gap-2 flex-wrap',
                    isActive ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-border-200/40 bg-bg-100/40',
                  )}
                >
                  <span className="text-text-400 text-[length:var(--fs-xxs)] font-mono w-5 shrink-0">{(index + 1) * 10}</span>
                  <select
                    aria-label={`Provider row ${index + 1}`}
                    value={row.providerId}
                    onChange={e => updateProvider(index, e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-border-200/40 bg-bg-200/60 px-2 py-1.5 text-[length:var(--fs-sm)] text-text-100 focus:outline-none min-w-[10rem]"
                  >
                    <option value="">Select provider…</option>
                    {registry.providers.map((provider: ProviderDefinition) => (
                      <option
                        key={provider.id}
                        value={provider.id}
                      >
                        {provider.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Model row ${index + 1}`}
                    value={row.modelId}
                    onChange={e => updateModel(index, e.target.value)}
                    disabled={!row.providerId}
                    className="min-w-0 flex-1 rounded-lg border border-border-200/40 bg-bg-200/60 px-2 py-1.5 text-[length:var(--fs-sm)] text-text-100 focus:outline-none min-w-[12rem] disabled:opacity-50"
                  >
                    <option value="">Select model…</option>
                    {providerModels.map(model => (
                      <option key={`${row.providerId}:${model.id}`} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  {selectedProvider && <StatusBadge label={selectedProvider.kind} tone="info" />}
                  {isActive && <StatusBadge label="Active" tone="success" />}
                  <button
                    onClick={() => toggle(row.providerId, !selectedProvider?.enabled)}
                    disabled={!selectedProvider}
                    className={clsx(
                      'rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium transition-colors',
                      !selectedProvider
                        ? 'bg-bg-200/40 text-text-500 cursor-not-allowed'
                        : selectedProvider.enabled
                          ? 'bg-bg-200/60 text-text-300 hover:bg-rose-500/20 hover:text-rose-300'
                          : 'bg-bg-200/40 text-text-400 hover:bg-emerald-500/20 hover:text-emerald-300',
                    )}
                  >
                    {selectedProvider?.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => moveChainRow(index, -1)}
                      disabled={index === 0}
                      className="text-[length:var(--fs-xs)] px-1 text-text-400 hover:text-text-100 disabled:opacity-30"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveChainRow(index, 1)}
                      disabled={index === chainDraft.length - 1}
                      className="text-[length:var(--fs-xs)] px-1 text-text-400 hover:text-text-100 disabled:opacity-30"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removeChainRow(index)}
                      className="text-[length:var(--fs-xs)] px-1 text-rose-400/70 hover:text-rose-300"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </ModuleCard>

      {/* Event log */}
      <ModuleCard
        title="Fallback Events"
        statusLabel={chain.events.length > 0 ? `${chain.events.length}` : 'Empty'}
        statusTone={chain.events.length > 0 ? 'warning' : 'neutral'}
      >
        {chain.events.length === 0 ? (
          <p className="text-[length:var(--fs-xs)] text-text-500">No fallback events recorded.</p>
        ) : (
          <>
            <button
              onClick={clearEvents}
              className="mb-3 rounded-lg px-3 py-1 text-[length:var(--fs-xs)] font-medium bg-bg-200/60 hover:bg-bg-200/80 text-text-200 transition-colors"
            >
              Clear log
            </button>
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {chain.events.map((ev: FallbackEvent, i: number) => (
                <li key={i} className="text-xs flex items-start gap-2">
                  <span className="text-text-500 shrink-0 tabular-nums text-[length:var(--fs-xxs)]">
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                  <StatusBadge
                    label={ev.reason}
                    tone={ev.reason === 'error' || ev.reason === 'rate_limit' ? 'danger' : 'info'}
                  />
                  <span className="text-text-300 text-[length:var(--fs-xs)]">{ev.message}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </ModuleCard>
    </div>
  )
})
