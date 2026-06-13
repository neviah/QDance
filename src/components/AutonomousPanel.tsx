// ============================================
// Autonomous Panel
// Self-contained control surface with its own tab bar.
// Mount anywhere — adds no changes to the existing layout system.
// ============================================

import { lazy, memo, Suspense, useState } from 'react'
import { clsx } from 'clsx'

type TabId = 'hardware' | 'providers' | 'fallback' | 'agent'

interface TabDef {
  id: TabId
  label: string
  icon: string
}

const TABS: TabDef[] = [
  { id: 'hardware', label: 'Hardware', icon: '' },
  { id: 'providers', label: 'Providers', icon: '' },
  { id: 'fallback', label: 'Fallback', icon: '' },
  { id: 'agent', label: 'Agent Loop', icon: '' },
]

const HardwareScanPanel = lazy(() =>
  import('./HardwareScanPanel').then(m => ({ default: m.HardwareScanPanel })),
)
const ProviderSelectorPanel = lazy(() =>
  import('./ProviderSelectorPanel').then(m => ({ default: m.ProviderSelectorPanel })),
)
const FallbackChainPanel = lazy(() =>
  import('./FallbackChainPanel').then(m => ({ default: m.FallbackChainPanel })),
)
const AgentLoopPanel = lazy(() =>
  import('./AgentLoopPanel').then(m => ({ default: m.AgentLoopPanel })),
)

function PanelFallback() {
  return (
    <div className="flex items-center justify-center h-full text-slate-500 text-xs">
      Loading…
    </div>
  )
}

interface AutonomousPanelProps {
  directory?: string
  className?: string
}

export const AutonomousPanel = memo(function AutonomousPanel({ directory, className }: AutonomousPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('hardware')

  return (
    <div className={clsx('flex flex-col bg-bg-000 text-text-100 h-full', className)}>
      {/* Tab bar */}
      <div className="flex items-center border-b border-border-200/50 px-2 shrink-0 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'px-3 py-2.5 text-[length:var(--fs-xs)] font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
              activeTab === tab.id
                ? 'border-accent-main-100 text-text-100'
                : 'border-transparent text-text-400 hover:text-text-200',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<PanelFallback />}>
          {activeTab === 'hardware' && <HardwareScanPanel />}
          {activeTab === 'providers' && <ProviderSelectorPanel />}
          {activeTab === 'fallback' && <FallbackChainPanel />}
          {activeTab === 'agent' && <AgentLoopPanel directory={directory} />}
        </Suspense>
      </div>
    </div>
  )
})
