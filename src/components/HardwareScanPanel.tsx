// ============================================
// Hardware Scan Panel
// Shows CPU, GPU, RAM, detected backends, and recommended model.
// Triggers the Cookbook module scan and download.
// ============================================

import { memo, useState } from 'react'
import { clsx } from 'clsx'
import { useCookbook, useCookbookActions } from '../modules/cookbook'
import { resolveDownloadUrl } from '../modules/cookbook/recommend'
import { ModuleCard } from '../ui/components/ModuleCard'
import { StatusBadge } from '../ui/components/StatusBadge'
import type { GpuCapabilityProfile, HardwareBackend, ModelDownloadState, RegisteredModel } from '../modules/cookbook'

export const HardwareScanPanel = memo(function HardwareScanPanel() {
  const state = useCookbook()
  const { startScan, startDownload } = useCookbookActions()
  const [downloading, setDownloading] = useState<string | null>(null)

  const handleScan = () => { void startScan() }

  const handleDownload = (modelId: string) => {
    const meta = resolveDownloadUrl(modelId)
    if (!meta) return
    setDownloading(modelId)
    void startDownload({ modelId, sourceUri: meta.url, destinationPath: `models/${meta.fileName}` })
      .finally(() => setDownloading(null))
  }

  const { scan, scanStatus, recommendation, downloads } = state

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Scan trigger */}
      <ModuleCard
        title="Hardware Scan"
        description="Detect GPU, CPU, RAM, and VRAM to recommend the optimal local model."
        statusLabel={scanStatus === 'scanning' ? 'Scanning…' : scanStatus === 'done' ? 'Ready' : scanStatus === 'failed' ? 'Error' : 'Idle'}
        statusTone={scanStatus === 'done' ? 'success' : scanStatus === 'failed' ? 'danger' : scanStatus === 'scanning' ? 'warning' : 'neutral'}
      >
        <button
          onClick={handleScan}
          disabled={scanStatus === 'scanning'}
          className={clsx(
            'rounded-lg px-4 py-2 text-xs font-medium transition-colors',
            scanStatus === 'scanning'
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-sky-600 hover:bg-sky-500 text-white',
          )}
        >
          {scanStatus === 'scanning' ? 'Scanning…' : 'Run Hardware Scan'}
        </button>

        {state.scanError && (
          <p className="mt-2 text-xs text-rose-400">{state.scanError}</p>
        )}
      </ModuleCard>

      {/* Results */}
      {scan && (
        <ModuleCard title="System Profile">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <dt className="text-slate-400">CPU</dt>
            <dd className="text-slate-100 truncate">{scan.cpu.modelName}</dd>

            <dt className="text-slate-400">Threads</dt>
            <dd className="text-slate-100">{scan.cpu.threadCount ?? '—'}</dd>

            <dt className="text-slate-400">Instruction sets</dt>
            <dd className="text-slate-100">{scan.cpu.instructionSets.join(', ') || '—'}</dd>

            <dt className="text-slate-400">RAM</dt>
            <dd className="text-slate-100">{scan.ramGiB} GiB</dd>

            {scan.gpus.map((gpu: GpuCapabilityProfile, i: number) => (
              <>
                <dt key={`gname-${i}`} className="text-slate-400">GPU {i + 1}</dt>
                <dd key={`gval-${i}`} className="text-slate-100 truncate">
                  {gpu.name} {gpu.vramGiB ? `(${gpu.vramGiB} GiB)` : ''}
                </dd>
              </>
            ))}

            <dt className="text-slate-400">Backends</dt>
            <dd className="flex flex-wrap gap-1">
              {scan.detectedBackends.map((b: HardwareBackend) => (
                <StatusBadge key={b} label={b.toUpperCase()} tone="info" />
              ))}
            </dd>
          </dl>

          {scan.notes.length > 0 && (
            <ul className="mt-3 space-y-1">
              {scan.notes.map((n: string, i: number) => (
                <li key={i} className="text-xs text-amber-300">⚠ {n}</li>
              ))}
            </ul>
          )}
        </ModuleCard>
      )}

      {/* Recommendation + download */}
      {recommendation && (
        <ModuleCard
          title="Recommended Model"
          statusLabel={recommendation.source === 'local' ? 'Local' : 'Cloud'}
          statusTone="success"
        >
          <div className="space-y-2 text-xs">
            <p className="text-slate-200 font-medium">{recommendation.family} — {recommendation.quantization}</p>
            <p className="text-slate-400">{recommendation.reasoning}</p>
            {recommendation.estimatedVRAMGiB && (
              <p className="text-slate-400">~{recommendation.estimatedVRAMGiB} GiB VRAM · {recommendation.estimatedContextWindow?.toLocaleString()} ctx</p>
            )}
          </div>

          {/* Download progress */}
          {(() => {
            const dl = downloads.find((d: ModelDownloadState) => d.modelId === recommendation.modelId)
            if (!dl) {
              return (
                <button
                  onClick={() => handleDownload(recommendation.modelId)}
                  disabled={!!downloading}
                  className={clsx(
                    'mt-3 rounded-lg px-4 py-1.5 text-xs font-medium transition-colors',
                    downloading
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white',
                  )}
                >
                  Download & Register
                </button>
              )
            }
            return (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">{dl.status === 'ready' ? 'Downloaded' : dl.status === 'failed' ? 'Failed' : `${dl.progress}%`}</span>
                  <StatusBadge
                    label={dl.status}
                    tone={dl.status === 'ready' ? 'success' : dl.status === 'failed' ? 'danger' : 'warning'}
                  />
                </div>
                {dl.status === 'downloading' && (
                  <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sky-500 transition-all"
                      style={{ width: `${dl.progress}%` }}
                    />
                  </div>
                )}
                {dl.errorMessage && <p className="text-xs text-rose-400">{dl.errorMessage}</p>}
              </div>
            )
          })()}
        </ModuleCard>
      )}

      {/* All registered models */}
      {state.registeredModels.length > 0 && (
        <ModuleCard title="Registered Models" statusLabel={`${state.registeredModels.length}`} statusTone="info">
          <ul className="space-y-1.5">
            {state.registeredModels.map((m: RegisteredModel) => (
              <li key={m.modelId} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-200 truncate">{m.displayName}</span>
                <StatusBadge label={m.providerKind} tone="neutral" />
              </li>
            ))}
          </ul>
        </ModuleCard>
      )}
    </div>
  )
})
