// ============================================
// Fallback Chain Panel
// Shows provider priority order, active endpoint, and failover event log.
// ============================================

import { memo } from 'react'
import { clsx } from 'clsx'
import { useFallbackChain, useFallbackActions } from '../modules/fallback'
import { useProviderRegistry, useProviderRegistryActions } from '../providers'
import { ModuleCard } from '../ui/components/ModuleCard'
import { StatusBadge } from '../ui/components/StatusBadge'
import type { FallbackEvent } from '../modules/fallback'
import type { ProviderDefinition } from '../providers'

export const FallbackChainPanel = memo(function FallbackChainPanel() {
  const chain = useFallbackChain()
  const { clearEvents, syncFromProviders } = useFallbackActions()
  const registry = useProviderRegistry()
  const { toggle, setPriority } = useProviderRegistryActions()

  const handleSync = () => {
    syncFromProviders(
      registry.providers.map((p: ProviderDefinition) => ({ id: p.id, name: p.name, enabled: p.enabled, priority: p.priority })),
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Provider list */}
      <ModuleCard
        title="Provider Chain"
        description="Models are tried in priority order. On failure the next is selected automatically."
        statusLabel={chain.activeEndpointId ? 'Active' : 'No active'}
        statusTone={chain.activeEndpointId ? 'success' : 'neutral'}
      >
        <div className="flex gap-2 mb-3">
          <button
            onClick={handleSync}
            className="rounded-lg px-3 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors"
          >
            Sync from providers
          </button>
        </div>

        <ul className="space-y-2">
          {registry.providers.map((p: ProviderDefinition) => {
            const isActive = chain.activeEndpointId === p.id
            return (
              <li
                key={p.id}
                className={clsx(
                  'rounded-xl border px-3 py-2 flex items-center justify-between gap-3',
                  isActive
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-white/10 bg-slate-900/60',
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-slate-300 text-xs font-mono w-5 shrink-0">{p.priority}</span>
                  <span className="text-sm text-slate-100 truncate">{p.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isActive && <StatusBadge label="Active" tone="success" />}
                  <button
                    onClick={() => toggle(p.id, !p.enabled)}
                    className={clsx(
                      'rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
                      p.enabled
                        ? 'bg-slate-700 text-slate-200 hover:bg-rose-900/70'
                        : 'bg-slate-800 text-slate-400 hover:bg-emerald-900/50',
                    )}
                  >
                    {p.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPriority(p.id, Math.max(1, p.priority - 10))}
                      className="text-xs px-1 text-slate-400 hover:text-white"
                      title="Increase priority"
                    >↑</button>
                    <button
                      onClick={() => setPriority(p.id, p.priority + 10)}
                      className="text-xs px-1 text-slate-400 hover:text-white"
                      title="Decrease priority"
                    >↓</button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </ModuleCard>

      {/* Event log */}
      <ModuleCard
        title="Fallback Events"
        statusLabel={chain.events.length > 0 ? `${chain.events.length}` : 'Empty'}
        statusTone={chain.events.length > 0 ? 'warning' : 'neutral'}
      >
        {chain.events.length === 0 ? (
          <p className="text-xs text-slate-500">No fallback events recorded.</p>
        ) : (
          <>
            <button
              onClick={clearEvents}
              className="mb-3 rounded-lg px-3 py-1 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
            >
              Clear log
            </button>
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {chain.events.map((ev: FallbackEvent, i: number) => (
                <li key={i} className="text-xs flex items-start gap-2">
                  <span className="text-slate-500 shrink-0 tabular-nums">
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                  <StatusBadge
                    label={ev.reason}
                    tone={ev.reason === 'error' || ev.reason === 'rate_limit' ? 'danger' : 'info'}
                  />
                  <span className="text-slate-300">{ev.message}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </ModuleCard>
    </div>
  )
})
