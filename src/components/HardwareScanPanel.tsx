// ============================================
// Hardware Scan Panel
// Shows CPU, GPU, RAM, detected backends, and a compact compatible-model list.
// Triggers the Cookbook module scan and download.
// ============================================

import { memo, useState } from 'react'
import { clsx } from 'clsx'
import { useCookbook, useCookbookActions } from '../modules/cookbook'
import { resolveDownloadUrl, getCompatibleModels } from '../modules/cookbook/recommend'
import { ModuleCard } from '../ui/components/ModuleCard'
import { StatusBadge } from '../ui/components/StatusBadge'
import type { GpuCapabilityProfile, HardwareBackend, ModelDownloadState, RegisteredModel } from '../modules/cookbook'

function fmtCtx(n: number): string {
  if (!n) return '—'
  const k = Math.round(n / 1000)
  return k >= 1000 ? `${(k / 1000).toFixed(0)}M` : `${k}k`
}

const FIT_STYLE = {
  perfect: 'text-emerald-400 font-semibold',
  good: 'text-amber-400 font-semibold',
  ok: 'text-text-400',
} as const

export const HardwareScanPanel = memo(function HardwareScanPanel() {
  const state = useCookbook()
  const { startScan, startDownload, pauseDownload, retryDownload } = useCookbookActions()
  const [downloading, setDownloading] = useState<string | null>(null)

  const handleScan = () => { void startScan() }

  const handleDownload = (modelId: string) => {
    const meta = resolveDownloadUrl(modelId)
    if (!meta) return
    setDownloading(modelId)
    void startDownload({ modelId, sourceUri: meta.url, destinationPath: `models/${meta.fileName}` })
      .finally(() => setDownloading(null))
  }

  const { scan, scanStatus, downloads } = state
  const allModels = scan ? getCompatibleModels(scan) : []

  return (
    <div className="flex flex-col gap-3 p-4 overflow-y-auto">
      {/* Scan trigger + inline profile */}
      <ModuleCard
        title="Hardware Scan"
        description="Detect GPU, CPU, RAM, and VRAM to recommend the optimal local model."
        statusLabel={
          scanStatus === 'scanning' ? 'Scanning…'
            : scanStatus === 'done' ? 'Ready'
            : scanStatus === 'failed' ? 'Error'
            : 'Idle'
        }
        statusTone={
          scanStatus === 'done' ? 'success'
            : scanStatus === 'failed' ? 'danger'
            : scanStatus === 'scanning' ? 'warning'
            : 'neutral'
        }
      >
        <button
          onClick={handleScan}
          disabled={scanStatus === 'scanning'}
          className={clsx(
            'rounded-lg px-4 py-1.5 text-[length:var(--fs-xs)] font-medium transition-colors',
            scanStatus === 'scanning'
              ? 'bg-bg-200/60 text-text-400 cursor-not-allowed'
              : 'bg-accent-main-100 hover:bg-accent-main-200 text-bg-000',
          )}
        >
          {scanStatus === 'scanning' ? 'Scanning…' : 'Run Hardware Scan'}
        </button>

        {state.scanError && (
          <p className="mt-2 text-[length:var(--fs-xs)] text-rose-400">{state.scanError}</p>
        )}

        {scan && (
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-[length:var(--fs-xs)]">
            <dt className="text-text-400">CPU</dt>
            <dd className="text-text-200 truncate">{scan.cpu.modelName}</dd>

            <dt className="text-text-400">Threads / RAM</dt>
            <dd className="text-text-200">{scan.cpu.threadCount ?? '—'} / {scan.ramGiB} GiB</dd>

            {scan.gpus.map((gpu: GpuCapabilityProfile, i: number) => (
              <>
                <dt key={`gname-${i}`} className="text-text-400">GPU {scan.gpus.length > 1 ? i + 1 : ''}</dt>
                <dd key={`gval-${i}`} className="text-text-200 truncate">
                  {gpu.name}{gpu.vramGiB ? ` · ${gpu.vramGiB} GiB` : ''}
                </dd>
              </>
            ))}

            <dt className="text-text-400">Backends</dt>
            <dd className="flex flex-wrap gap-1">
              {scan.detectedBackends.map((b: HardwareBackend) => (
                <StatusBadge key={b} label={b.toUpperCase()} tone="info" />
              ))}
            </dd>
          </dl>
        )}

        {scan && scan.notes.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {scan.notes.map((n: string, i: number) => (
              <li key={i} className="text-[length:var(--fs-xs)] text-amber-400">⚠ {n}</li>
            ))}
          </ul>
        )}
      </ModuleCard>

      {/* Compact compatible model list */}
      {allModels.length > 0 && (
        <ModuleCard title="Compatible Models" statusLabel={`${allModels.length}`} statusTone="neutral">
          <div className="flex items-center gap-2 pb-1 border-b border-border-200/30 text-[length:var(--fs-xxs)] text-text-500 uppercase tracking-wider">
            <span className="w-14 shrink-0">Fit</span>
            <span className="flex-1 min-w-0">Model</span>
            <span className="w-12 text-right shrink-0">Quant</span>
            <span className="w-10 text-right shrink-0">VRAM</span>
            <span className="w-10 text-right shrink-0">CTX</span>
            <span className="w-5 shrink-0" />
          </div>

          <ul className="mt-1 space-y-0">
            {allModels.map(m => {
              const dl = downloads.find((d: ModelDownloadState) => d.modelId === m.modelId)
              const isDownloading = dl?.status === 'downloading'
              const isReady = dl?.status === 'ready'
              const isPaused = dl?.status === 'paused' || dl?.status === 'failed' || dl?.status === 'cancelled'

              return (
                <li key={m.modelId} className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-bg-200/30 text-[length:var(--fs-xs)]">
                  <span className={clsx('w-14 shrink-0 text-[length:var(--fs-xxs)]', FIT_STYLE[m.fit])}>
                    {m.fit.toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0 text-text-100 font-medium truncate">{m.family}</span>
                  <span className="w-12 text-right text-text-500 font-mono shrink-0">{m.quantization}</span>
                  <span className="w-10 text-right text-text-400 font-mono shrink-0">{m.estimatedVRAMGiB}G</span>
                  <span className="w-10 text-right text-text-500 font-mono shrink-0">{fmtCtx(m.estimatedContextWindow)}</span>
                  <div className="w-5 shrink-0 flex justify-center">
                    {isReady ? (
                      <span className="text-emerald-400">✓</span>
                    ) : isDownloading ? (
                      <button onClick={() => pauseDownload(m.modelId)} className="text-amber-400 hover:text-amber-300" title="Pause">⏸</button>
                    ) : isPaused ? (
                      <button onClick={() => void retryDownload(m.modelId)} className="text-accent-main-100 hover:text-accent-main-200" title="Retry" aria-label="Retry">↻</button>
                    ) : (
                      <button
                        onClick={() => handleDownload(m.modelId)}
                        disabled={!!downloading}
                        className="text-accent-main-100 hover:text-accent-main-200 disabled:opacity-40 transition-colors"
                        title="Download"
                      >
                        ↓
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Progress bars for active downloads */}
          {downloads.filter((d: ModelDownloadState) => d.status === 'downloading').map((dl: ModelDownloadState) => (
            <div key={dl.modelId} className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-[length:var(--fs-xxs)] text-text-400">
                <span className="truncate max-w-[70%]">{dl.modelId}</span>
                <span className="font-mono">{dl.progress}%</span>
              </div>
              <div className="h-1 rounded-full bg-bg-200/60 overflow-hidden">
                <div className="h-full rounded-full bg-accent-main-100 transition-all" style={{ width: `${dl.progress}%` }} />
              </div>
              {dl.errorMessage && <p className="text-[length:var(--fs-xxs)] text-rose-400">{dl.errorMessage}</p>}
            </div>
          ))}
        </ModuleCard>
      )}

      {/* Registered models */}
      {state.registeredModels.length > 0 && (
        <ModuleCard title="Registered Models" statusLabel={`${state.registeredModels.length}`} statusTone="info">
          <ul className="space-y-1">
            {state.registeredModels.map((m: RegisteredModel) => (
              <li key={m.modelId} className="flex items-center justify-between gap-2 text-[length:var(--fs-xs)]">
                <span className="text-text-200 truncate">{m.displayName}</span>
                <StatusBadge label={m.providerKind} tone="neutral" />
              </li>
            ))}
          </ul>
        </ModuleCard>
      )}
    </div>
  )
})

