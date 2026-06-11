// ============================================
// Model downloader
// Streams a GGUF/safetensors file from HuggingFace into /models
// Works in Tauri (plugin-http + plugin-fs) and browser (Fetch + File API)
// ============================================

import type { ModelDownloadRequest, ModelDownloadState } from './types'
import { isTauri } from '../../utils/tauri'

export type DownloadProgressCallback = (state: ModelDownloadState) => void

export interface DownloadControlOptions {
  signal?: AbortSignal
}

const browserPartialChunks = new Map<string, Uint8Array[]>()
const browserPartialBytes = new Map<string, number>()

function getAbortReason(signal?: AbortSignal): 'paused' | 'cancelled' | null {
  if (!signal?.aborted) return null
  const reason = String(signal.reason ?? '').toLowerCase()
  return reason === 'pause' ? 'paused' : 'cancelled'
}

function throwIfAborted(signal?: AbortSignal) {
  const reason = getAbortReason(signal)
  if (reason) {
    throw new Error(reason === 'paused' ? '__DOWNLOAD_PAUSED__' : '__DOWNLOAD_CANCELLED__')
  }
}

/** Downloads a model to the given destination path, reporting progress. */
export async function downloadModel(
  request: ModelDownloadRequest,
  onProgress?: DownloadProgressCallback,
  options?: DownloadControlOptions,
): Promise<ModelDownloadState> {
  const state: ModelDownloadState = {
    ...request,
    status: 'downloading',
    progress: 0,
  }

  onProgress?.(state)
  throwIfAborted(options?.signal)

  if (isTauri()) {
    return downloadViaTauri(request, state, onProgress, options)
  }
  return downloadViaBrowser(request, state, onProgress, options)
}

// -------------------------------------------------------
// Tauri path
// -------------------------------------------------------
async function downloadViaTauri(
  request: ModelDownloadRequest,
  state: ModelDownloadState,
  onProgress?: DownloadProgressCallback,
  options?: DownloadControlOptions,
): Promise<ModelDownloadState> {
  try {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
    const { writeFile, mkdir, exists, stat, remove, rename } = await import('@tauri-apps/plugin-fs')
    throwIfAborted(options?.signal)

    const tempPath = `${request.destinationPath}.part`

    // Ensure destination directory exists
    const dir = request.destinationPath.substring(0, Math.max(request.destinationPath.lastIndexOf('/'), request.destinationPath.lastIndexOf('\\')))
    if (dir) {
      try { await mkdir(dir, { recursive: true }) } catch { /* already exists */ }
    }

    let resumeFrom = 0
    if (await exists(tempPath)) {
      const info = await stat(tempPath)
      if (typeof info.size === 'number' && info.size > 0) {
        resumeFrom = info.size
      }
    }

    let response = await tauriFetch(request.sourceUri, {
      method: 'GET',
      headers: resumeFrom > 0 ? { Range: `bytes=${resumeFrom}-` } : undefined,
    })

    if (resumeFrom > 0 && response.status !== 206) {
      await remove(tempPath).catch(() => {})
      resumeFrom = 0
      response = await tauriFetch(request.sourceUri, { method: 'GET' })
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)

    const totalStr = response.headers.get('content-length')
    const currentTotal = totalStr ? parseInt(totalStr, 10) : undefined
    const total = currentTotal !== undefined ? resumeFrom + currentTotal : undefined
    state.totalBytes = total

    let downloaded = resumeFrom
    state.downloadedBytes = downloaded
    state.progress = total ? Math.round((downloaded / total) * 100) : 0
    onProgress?.({ ...state })

    if (response.body) {
      const reader = response.body.getReader()
      while (true) {
        throwIfAborted(options?.signal)
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          await writeFile(tempPath, value, { append: downloaded > 0, create: true })
          downloaded += value.byteLength
          state.downloadedBytes = downloaded
          state.progress = total ? Math.round((downloaded / total) * 100) : 0
          onProgress?.({ ...state })
        }
      }
    } else {
      const buf = await response.arrayBuffer()
      const chunk = new Uint8Array(buf)
      await writeFile(tempPath, chunk, { append: downloaded > 0, create: true })
      downloaded += chunk.byteLength
    }

    await rename(tempPath, request.destinationPath)

    state.status = 'ready'
    state.progress = 100
    state.downloadedBytes = downloaded
    onProgress?.(state)
    return state
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === '__DOWNLOAD_PAUSED__') {
      state.status = 'paused'
      state.errorMessage = undefined
    } else if (message === '__DOWNLOAD_CANCELLED__') {
      state.status = 'cancelled'
      state.errorMessage = undefined
      const tempPath = `${request.destinationPath}.part`
      const { remove } = await import('@tauri-apps/plugin-fs')
      await remove(tempPath).catch(() => {})
    } else {
      state.status = 'failed'
      state.errorMessage = message
    }
    onProgress?.(state)
    return state
  }
}

// -------------------------------------------------------
// Browser path — uses a streaming fetch + in-memory buffer
// (Useful for small models or testing outside Tauri)
// -------------------------------------------------------
async function downloadViaBrowser(
  request: ModelDownloadRequest,
  state: ModelDownloadState,
  onProgress?: DownloadProgressCallback,
  options?: DownloadControlOptions,
): Promise<ModelDownloadState> {
  try {
    throwIfAborted(options?.signal)

    const partialChunks = browserPartialChunks.get(request.modelId) ?? []
    const partialBytes = browserPartialBytes.get(request.modelId) ?? 0
    const chunks = [...partialChunks]

    let response = await fetch(request.sourceUri, {
      signal: options?.signal,
      headers: partialBytes > 0 ? { Range: `bytes=${partialBytes}-` } : undefined,
    })

    if (partialBytes > 0 && response.status !== 206) {
      chunks.length = 0
      browserPartialChunks.delete(request.modelId)
      browserPartialBytes.delete(request.modelId)
      response = await fetch(request.sourceUri, { signal: options?.signal })
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)

    const totalStr = response.headers.get('content-length')
    const currentTotal = totalStr ? parseInt(totalStr, 10) : undefined
    const total = currentTotal !== undefined ? partialBytes + currentTotal : undefined
    state.totalBytes = total

    let downloaded = partialBytes
    state.downloadedBytes = downloaded
    state.progress = total ? Math.round((downloaded / total) * 100) : 0
    onProgress?.({ ...state })

    if (response.body) {
      const reader = response.body.getReader()
      while (true) {
        throwIfAborted(options?.signal)
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          downloaded += value.byteLength
          browserPartialChunks.set(request.modelId, chunks)
          browserPartialBytes.set(request.modelId, downloaded)
          state.downloadedBytes = downloaded
          state.progress = total ? Math.round((downloaded / total) * 100) : 0
          onProgress?.({ ...state })
        }
      }
    } else {
      const buf = await response.arrayBuffer()
      chunks.push(new Uint8Array(buf))
      downloaded += buf.byteLength
      browserPartialChunks.set(request.modelId, chunks)
      browserPartialBytes.set(request.modelId, downloaded)
    }

    // In browser mode we trigger a browser download since we can't write to disk
    const full = new Uint8Array(downloaded)
    let offset = 0
    for (const chunk of chunks) {
      full.set(chunk, offset)
      offset += chunk.byteLength
    }
    if (typeof document !== 'undefined') {
      const blob = new Blob([full])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = request.destinationPath.split(/[\\/]/).at(-1) ?? 'model.gguf'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }, 500)
    }

    state.status = 'ready'
    state.progress = 100
    state.downloadedBytes = downloaded
    browserPartialChunks.delete(request.modelId)
    browserPartialBytes.delete(request.modelId)
    onProgress?.(state)
    return state
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === '__DOWNLOAD_PAUSED__') {
      state.status = 'paused'
      state.errorMessage = undefined
    } else if (message === '__DOWNLOAD_CANCELLED__' || message.includes('The operation was aborted')) {
      state.status = 'cancelled'
      state.errorMessage = undefined
      browserPartialChunks.delete(request.modelId)
      browserPartialBytes.delete(request.modelId)
    } else {
      state.status = 'failed'
      state.errorMessage = message
    }
    onProgress?.(state)
    return state
  }
}
