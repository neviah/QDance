// ============================================
// Provider Selector Panel
// Shows all registered providers with enable/disable toggles,
// model selection dropdowns, and an "Add provider" form.
// ============================================

import { memo, useState } from 'react'
import { clsx } from 'clsx'
import { useProviderRegistry, useProviderRegistryActions } from '../providers'
import type { ProviderDefinition, ProviderKind, ProviderModelDescriptor } from '../providers'
import { ModuleCard } from '../ui/components/ModuleCard'
import { StatusBadge } from '../ui/components/StatusBadge'

const KIND_LABELS: Record<ProviderKind, string> = {
  openrouter: 'OpenRouter',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  gemini: 'Gemini',
  openai: 'OpenAI',
  local: 'Local',
}

export const ProviderSelectorPanel = memo(function ProviderSelectorPanel() {
  const registry = useProviderRegistry()
  const { register, remove, toggle, select } = useProviderRegistryActions()

  const [showAddForm, setShowAddForm] = useState(false)
  const [newProvider, setNewProvider] = useState<Partial<ProviderDefinition>>({
    kind: 'openai',
    enabled: true,
    priority: 50,
    supportedModels: [],
  })
  const [newModelId, setNewModelId] = useState('')

  const handleAdd = () => {
    if (!newProvider.id || !newProvider.name) return
    register({
      id: newProvider.id,
      kind: newProvider.kind ?? 'openai',
      name: newProvider.name,
      baseUrl: newProvider.baseUrl,
      apiKeyEnvVar: newProvider.apiKeyEnvVar,
      priority: newProvider.priority ?? 50,
      enabled: newProvider.enabled ?? true,
      supportedModels: newProvider.supportedModels ?? [],
    })
    setShowAddForm(false)
    setNewProvider({ kind: 'openai', enabled: true, priority: 50, supportedModels: [] })
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      <ModuleCard
        title="Providers & Models"
        description="Configure cloud and local inference providers. The active provider is used by the agent loop."
      >
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="mb-3 rounded-lg px-3 py-1.5 text-[length:var(--fs-xs)] font-medium bg-accent-main-100 hover:bg-accent-main-200 text-bg-000 transition-colors"
        >
          {showAddForm ? 'Cancel' : '+ Add Provider'}
        </button>

        {showAddForm && (
          <div className="mb-4 rounded-xl border border-border-200/40 bg-bg-000/80 p-4 space-y-3 text-[length:var(--fs-xs)]">
            <h4 className="text-text-100 font-semibold">New Provider</h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-text-400 mb-1">Kind</label>
                <select
                  value={newProvider.kind}
                  onChange={e => setNewProvider((p: Partial<ProviderDefinition>) => ({ ...p, kind: e.target.value as ProviderKind }))}
                  className="w-full rounded-lg border border-border-200/40 bg-bg-200/60 px-2 py-1.5 text-text-100 focus:outline-none"
                >
                  {Object.entries(KIND_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-text-400 mb-1">ID</label>
                <input
                  value={newProvider.id ?? ''}
                  onChange={e => setNewProvider((p: Partial<ProviderDefinition>) => ({ ...p, id: e.target.value }))}
                  placeholder="e.g. openai-custom"
                  className="w-full rounded-lg border border-border-200/40 bg-bg-200/60 px-2 py-1.5 text-text-100 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-text-400 mb-1">Display Name</label>
              <input
                value={newProvider.name ?? ''}
                onChange={e => setNewProvider((p: Partial<ProviderDefinition>) => ({ ...p, name: e.target.value }))}
                placeholder="My Provider"
                className="w-full rounded-lg border border-border-200/40 bg-bg-200/60 px-2 py-1.5 text-text-100 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-text-400 mb-1">Base URL (optional)</label>
              <input
                value={newProvider.baseUrl ?? ''}
                onChange={e => setNewProvider((p: Partial<ProviderDefinition>) => ({ ...p, baseUrl: e.target.value }))}
                placeholder="https://api.example.com/v1"
                className="w-full rounded-lg border border-border-200/40 bg-bg-200/60 px-2 py-1.5 text-text-100 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-text-400 mb-1">API Key env var (optional)</label>
              <input
                value={newProvider.apiKeyEnvVar ?? ''}
                onChange={e => setNewProvider((p: Partial<ProviderDefinition>) => ({ ...p, apiKeyEnvVar: e.target.value }))}
                placeholder="MY_API_KEY"
                className="w-full rounded-lg border border-border-200/40 bg-bg-200/60 px-2 py-1.5 text-text-100 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-text-400 mb-1">Priority (lower = higher priority)</label>
              <input
                type="number"
                value={newProvider.priority ?? 50}
                onChange={e => setNewProvider((p: Partial<ProviderDefinition>) => ({ ...p, priority: parseInt(e.target.value, 10) || 50 }))}
                className="w-24 rounded-lg border border-border-200/40 bg-bg-200/60 px-2 py-1.5 text-text-100 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-text-400 mb-1">Add model ID (optional)</label>
              <div className="flex gap-2">
                <input
                  value={newModelId}
                  onChange={e => setNewModelId(e.target.value)}
                  placeholder="e.g. gpt-4o"
                  className="flex-1 rounded-lg border border-border-200/40 bg-bg-200/60 px-2 py-1.5 text-text-100 focus:outline-none"
                />
                <button
                  onClick={() => {
                    if (!newModelId.trim()) return
                    setNewProvider((p: Partial<ProviderDefinition>) => ({
                      ...p,
                      supportedModels: [...(p.supportedModels ?? []), { id: newModelId.trim(), label: newModelId.trim() }],
                    }))
                    setNewModelId('')
                  }}
                  className="rounded-lg px-3 py-1.5 bg-bg-200/60 hover:bg-bg-200/80 text-text-200 transition-colors"
                >
                  Add
                </button>
              </div>
              {newProvider.supportedModels && newProvider.supportedModels.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {newProvider.supportedModels.map((m: ProviderModelDescriptor) => (
                    <li key={m.id} className="text-[length:var(--fs-xs)] text-text-400">• {m.id}</li>
                  ))}
                </ul>
              )}
            </div>

            <button
              onClick={handleAdd}
              disabled={!newProvider.id || !newProvider.name}
              className={clsx(
                'rounded-lg px-4 py-1.5 font-medium transition-colors text-[length:var(--fs-xs)]',
                newProvider.id && newProvider.name
                  ? 'bg-accent-main-100 hover:bg-accent-main-200 text-bg-000'
                  : 'bg-bg-200/40 text-text-500 cursor-not-allowed',
              )}
            >
              Save Provider
            </button>
          </div>
        )}

        {/* Provider list */}
        <ul className="space-y-3">
          {registry.providers.map((p: ProviderDefinition) => {
            const isActive = registry.activeSelection?.providerId === p.id
            return (
              <li
                key={p.id}
                className={clsx(
                  'rounded-xl border px-3 py-3 space-y-2',
                  isActive ? 'border-emerald-500/40 bg-emerald-500/8' : 'border-white/10 bg-slate-900/50',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[length:var(--fs-sm)] font-medium text-text-100 truncate">{p.name}</span>
                    <StatusBadge label={KIND_LABELS[p.kind]} tone="info" />
                    {!p.enabled && <StatusBadge label="Disabled" tone="neutral" />}
                    {isActive && <StatusBadge label="Active" tone="success" />}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggle(p.id, !p.enabled)}
                      className={clsx(
                      'rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium transition-colors',
                      p.enabled ? 'bg-bg-200/60 text-text-300 hover:bg-rose-500/20 hover:text-rose-300' : 'bg-bg-200/40 text-text-400 hover:bg-emerald-500/20 hover:text-emerald-300',
                      )}
                    >
                      {p.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => remove(p.id)}
                      className="rounded-full px-2 py-0.5 text-xs text-rose-400 hover:text-rose-200 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {p.supportedModels.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[length:var(--fs-xxs)] text-text-500">Models:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {p.supportedModels.slice(0, 8).map((m: ProviderModelDescriptor) => (
                        <button
                          key={m.id}
                          onClick={() => select({ providerId: p.id, modelId: m.id })}
                          className={clsx(
                          'rounded-full px-2.5 py-0.5 text-[length:var(--fs-xs)] transition-colors',
                          registry.activeSelection?.providerId === p.id && registry.activeSelection.modelId === m.id
                            ? 'bg-accent-main-100/20 text-accent-main-100'
                            : 'bg-bg-200/50 text-text-300 hover:bg-bg-200/80',
                          )}
                        >
                          {m.label}
                        </button>
                      ))}
                      {p.supportedModels.length > 8 && (
                        <span className="text-[length:var(--fs-xxs)] text-text-500 self-center">+{p.supportedModels.length - 8} more</span>
                      )}
                    </div>
                  </div>
                )}

                {p.baseUrl && (
                  <p className="text-[length:var(--fs-xxs)] text-text-500 truncate">{p.baseUrl}</p>
                )}
              </li>
            )
          })}
        </ul>
      </ModuleCard>
    </div>
  )
})
