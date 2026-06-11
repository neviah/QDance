// ============================================
// Cookbook Store
// Reactive, localStorage-persisted state for hardware scan,
// model recommendations, downloads, and registered models.
// Follows the same useSyncExternalStore pattern as the rest of the app.
// ============================================

import { useSyncExternalStore, useCallback } from 'react'
import type { HardwareScanResult, ModelDownloadState, ModelRecommendation, RegisteredModel } from './types'
import { scanHardware as probeScanHardware } from './hardware'
import { recommendModel as computeRecommendation } from './recommend'
import { downloadModel as execDownload, type DownloadProgressCallback } from './downloader'
import type { ModelDownloadRequest } from './types'
import { providerRegistryStore } from '../../providers'

const STORAGE_KEY = 'oca-cookbook-v1'

interface CookbookSnapshot {
  scanStatus: 'idle' | 'scanning' | 'done' | 'failed'
  scanError?: string
  scan?: HardwareScanResult
  recommendation?: ModelRecommendation
  downloads: ModelDownloadState[]
  registeredModels: RegisteredModel[]
}

type Subscriber = () => void

const DEFAULT_SNAPSHOT: CookbookSnapshot = {
  scanStatus: 'idle',
  downloads: [],
  registeredModels: [],
}

function loadPersistedSnapshot(): CookbookSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CookbookSnapshot>
      const downloads = (parsed.downloads ?? []).map(download => {
        if (download.status === 'downloading' || download.status === 'queued') {
          return {
            ...download,
            status: 'failed' as const,
            errorMessage: download.errorMessage ?? 'Interrupted before completion',
          }
        }
        return download
      })

      return {
        ...DEFAULT_SNAPSHOT,
        ...parsed,
        // Always start fresh scan status on load
        scanStatus: 'idle',
        downloads,
      }
    }
  } catch {
    // corrupted storage — reset
  }
  return { ...DEFAULT_SNAPSHOT }
}

class CookbookStore {
  private snapshot: CookbookSnapshot = loadPersistedSnapshot()
  private subscribers = new Set<Subscriber>()
  private version = 0
  private activeDownloads = new Map<string, AbortController>()
  private lastDownloadRequests = new Map<string, ModelDownloadRequest>()

  getSnapshot = (): CookbookSnapshot => this.snapshot

  subscribe = (cb: Subscriber): (() => void) => {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }

  private update(patch: Partial<CookbookSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.version++
    this.persist()
    this.subscribers.forEach(s => s())
  }

  private persist() {
    try {
      const { scanStatus: _, ...rest } = this.snapshot
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rest, scanStatus: 'idle' }))
    } catch {
      // storage full — ignore
    }
  }

  async startScan() {
    this.update({ scanStatus: 'scanning', scanError: undefined })
    try {
      const scan = await probeScanHardware()
      const recommendation = computeRecommendation(scan)
      this.update({ scanStatus: 'done', scan, recommendation })
    } catch (err) {
      this.update({
        scanStatus: 'failed',
        scanError: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async startDownload(request: ModelDownloadRequest) {
    this.lastDownloadRequests.set(request.modelId, request)

    this.activeDownloads.get(request.modelId)?.abort('cancel')
    const controller = new AbortController()
    this.activeDownloads.set(request.modelId, controller)

    const initial: ModelDownloadState = { ...request, status: 'queued', progress: 0 }
    this.update({ downloads: [...this.snapshot.downloads.filter(d => d.modelId !== request.modelId), initial] })

    const onProgress: DownloadProgressCallback = state => {
      this.update({
        downloads: this.snapshot.downloads.map(d => (d.modelId === state.modelId ? state : d)),
      })
    }

    const result = await execDownload(request, onProgress, { signal: controller.signal })
    this.activeDownloads.delete(request.modelId)

    if (result.status === 'ready') {
      const registered: RegisteredModel = {
        ...result,
        displayName: request.modelId,
        providerKind: 'local',
      }

      providerRegistryStore.addModelToProvider('local', {
        id: registered.modelId,
        label: registered.displayName,
        localModelPath: registered.destinationPath,
      })
      providerRegistryStore.toggleEnabled('local', true)
      providerRegistryStore.selectProvider({ providerId: 'local', modelId: registered.modelId })

      this.update({
        downloads: this.snapshot.downloads.map(d => (d.modelId === result.modelId ? result : d)),
        registeredModels: [
          ...this.snapshot.registeredModels.filter(m => m.modelId !== registered.modelId),
          registered,
        ],
      })
      return
    }

    this.update({
      downloads: this.snapshot.downloads.map(d => (d.modelId === result.modelId ? result : d)),
    })
  }

  pauseDownload(modelId: string) {
    this.activeDownloads.get(modelId)?.abort('pause')
  }

  cancelDownload(modelId: string) {
    this.activeDownloads.get(modelId)?.abort('cancel')
    this.update({
      downloads: this.snapshot.downloads.map(download =>
        download.modelId === modelId
          ? { ...download, status: 'cancelled', errorMessage: undefined }
          : download,
      ),
    })
  }

  async retryDownload(modelId: string) {
    const request = this.lastDownloadRequests.get(modelId) ?? this.snapshot.downloads.find(download => download.modelId === modelId)
    if (!request) return
    await this.startDownload({
      modelId: request.modelId,
      sourceUri: request.sourceUri,
      destinationPath: request.destinationPath,
      revision: request.revision,
      checksum: request.checksum,
    })
  }

  registerModel(model: RegisteredModel) {
    this.update({
      registeredModels: [
        ...this.snapshot.registeredModels.filter(m => m.modelId !== model.modelId),
        model,
      ],
    })
  }

  removeRegisteredModel(modelId: string) {
    this.update({
      registeredModels: this.snapshot.registeredModels.filter(m => m.modelId !== modelId),
    })
  }
}

export const cookbookStore = new CookbookStore()

// -------------------------------------------------------
// React hooks
// -------------------------------------------------------

export function useCookbook() {
  return useSyncExternalStore(cookbookStore.subscribe, cookbookStore.getSnapshot)
}

export function useCookbookActions() {
  const startScan = useCallback(() => cookbookStore.startScan(), [])
  const startDownload = useCallback((req: ModelDownloadRequest) => cookbookStore.startDownload(req), [])
  const pauseDownload = useCallback((id: string) => cookbookStore.pauseDownload(id), [])
  const cancelDownload = useCallback((id: string) => cookbookStore.cancelDownload(id), [])
  const retryDownload = useCallback((id: string) => cookbookStore.retryDownload(id), [])
  const registerModel = useCallback((m: RegisteredModel) => cookbookStore.registerModel(m), [])
  const removeModel = useCallback((id: string) => cookbookStore.removeRegisteredModel(id), [])
  return { startScan, startDownload, pauseDownload, cancelDownload, retryDownload, registerModel, removeModel }
}
