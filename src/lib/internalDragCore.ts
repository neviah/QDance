import { useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react'

export interface InternalFileMentionPayload {
  kind: 'file-mention'
  file: {
    type: 'file' | 'folder'
    path: string
    absolute: string
    name: string
  }
}

export interface InternalSessionPayload {
  kind: 'session'
  sessionId: string
  directory?: string
  title?: string
}

export interface InternalPanePayload {
  kind: 'pane'
  paneId: string
  title?: string
}

export interface InternalPreviewTabPayload {
  kind: 'preview-tab'
  id: string
  title?: string
}

export interface InternalPanelTabPayload {
  kind: 'panel-tab'
  position: 'right' | 'bottom'
  tabId: string
  label?: string
}

export type InternalDragPayload =
  | InternalFileMentionPayload
  | InternalSessionPayload
  | InternalPanePayload
  | InternalPreviewTabPayload
  | InternalPanelTabPayload

export interface InternalDragPoint {
  x: number
  y: number
}

export interface InternalDragPreview {
  label: string
  description?: string
  icon?: string
}

export interface InternalActiveDrag {
  phase: 'pending' | 'dragging'
  payload: InternalDragPayload
  start: InternalDragPoint
  current: InternalDragPoint
  offset: InternalDragPoint
  sourceRect: DOMRect
  preview: InternalDragPreview
  previewHtml: string
}

export interface InternalDragSnapshot {
  active: InternalActiveDrag | null
}

export interface InternalDropEvent {
  payload: InternalDragPayload
  point: InternalDragPoint
}

interface StartInternalDragOptions {
  preview?: InternalDragPreview
  threshold?: number
  allowTouch?: boolean
}

const DEFAULT_THRESHOLD = 5
const PREVIEW_MAX_WIDTH = 360
const subscribers = new Set<() => void>()
const dropSubscribers = new Set<(event: InternalDropEvent) => void>()
let snapshot: InternalDragSnapshot = { active: null }
let restoreUserSelect: string | null = null
let clickSuppressorArmed = false

function emitChange() {
  subscribers.forEach(listener => listener())
}

function setActiveDrag(active: InternalActiveDrag | null) {
  snapshot = { active }
  emitChange()
}

function distance(a: InternalDragPoint, b: InternalDragPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function armClickSuppressor() {
  if (clickSuppressorArmed) return
  clickSuppressorArmed = true

  const suppressClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    clickSuppressorArmed = false
    document.removeEventListener('click', suppressClick, true)
  }

  document.addEventListener('click', suppressClick, true)
}

function lockSelection() {
  if (restoreUserSelect !== null) return
  restoreUserSelect = document.body.style.userSelect
  document.body.style.userSelect = 'none'
  document.body.classList.add('internal-drag-active')
}

function unlockSelection() {
  if (restoreUserSelect !== null) {
    document.body.style.userSelect = restoreUserSelect
    restoreUserSelect = null
  }
  document.body.classList.remove('internal-drag-active')
}

function fallbackPreview(payload: InternalDragPayload): InternalDragPreview {
  switch (payload.kind) {
    case 'file-mention':
      return { label: payload.file.name, description: payload.file.path }
    case 'session':
      return { label: payload.title || payload.sessionId, description: payload.directory }
    case 'pane':
      return { label: payload.title || payload.paneId }
    case 'preview-tab':
      return { label: payload.title || payload.id }
    case 'panel-tab':
      return { label: payload.label || payload.tabId }
  }
}

function clonePreviewHtml(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement

  clone.removeAttribute('id')
  clone.removeAttribute('draggable')
  clone.style.pointerEvents = 'none'
  clone.style.margin = '0'
  clone.style.width = `${Math.min(element.getBoundingClientRect().width, PREVIEW_MAX_WIDTH)}px`
  clone.style.maxWidth = `${PREVIEW_MAX_WIDTH}px`
  clone.style.boxSizing = 'border-box'

  clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'))
  clone.querySelectorAll('input, textarea, select').forEach(node => {
    const control = node as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    control.disabled = true
  })

  return clone.outerHTML
}

export function getInternalDragSnapshot(): InternalDragSnapshot {
  return snapshot
}

export function subscribeInternalDrag(listener: () => void) {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

export function subscribeInternalDrop(listener: (event: InternalDropEvent) => void) {
  dropSubscribers.add(listener)
  return () => {
    dropSubscribers.delete(listener)
  }
}

export function useInternalDragSnapshot() {
  return useSyncExternalStore(subscribeInternalDrag, getInternalDragSnapshot, getInternalDragSnapshot)
}

export function startInternalDrag(
  event: ReactPointerEvent<HTMLElement>,
  payload: InternalDragPayload,
  options: StartInternalDragOptions = {},
) {
  if (event.button !== 0 || !event.isPrimary) return
  if (event.pointerType === 'touch' && !options.allowTouch) return

  const sourceElement = event.currentTarget
  const sourceRect = sourceElement.getBoundingClientRect()
  const start = { x: event.clientX, y: event.clientY }
  const threshold = options.threshold ?? DEFAULT_THRESHOLD
  const pointerId = event.pointerId
  let active: InternalActiveDrag = {
    phase: 'pending',
    payload,
    start,
    current: start,
    offset: {
      x: event.clientX - sourceRect.left,
      y: event.clientY - sourceRect.top,
    },
    sourceRect,
    preview: options.preview ?? fallbackPreview(payload),
    previewHtml: clonePreviewHtml(sourceElement),
  }

  setActiveDrag(active)

  const cleanup = () => {
    document.removeEventListener('pointermove', handlePointerMove, true)
    document.removeEventListener('pointerup', handlePointerUp, true)
    document.removeEventListener('pointercancel', handlePointerCancel, true)
    document.removeEventListener('keydown', handleKeyDown, true)
    window.removeEventListener('blur', cancel, true)
    unlockSelection()
    try {
      if (sourceElement.hasPointerCapture?.(pointerId)) {
        sourceElement.releasePointerCapture(pointerId)
      }
    } catch {
      // best effort only
    }
  }

  const cancel = () => {
    cleanup()
    setActiveDrag(null)
  }

  function updatePosition(point: InternalDragPoint) {
    if (active.phase === 'pending' && distance(start, point) < threshold) return

    if (active.phase === 'pending') {
      active = { ...active, phase: 'dragging', current: point }
      lockSelection()
    } else {
      active = { ...active, current: point }
    }

    setActiveDrag(active)
  }

  function handlePointerMove(pointerEvent: PointerEvent) {
    if (pointerEvent.pointerId !== pointerId) return
    updatePosition({ x: pointerEvent.clientX, y: pointerEvent.clientY })
  }

  function handlePointerUp(pointerEvent: PointerEvent) {
    if (pointerEvent.pointerId !== pointerId) return
    const shouldDrop = active.phase === 'dragging'
    const point = { x: pointerEvent.clientX, y: pointerEvent.clientY }
    const payloadToDrop = active.payload

    cleanup()
    setActiveDrag(null)

    if (shouldDrop) {
      armClickSuppressor()
      dropSubscribers.forEach(listener => listener({ payload: payloadToDrop, point }))
    }
  }

  function handlePointerCancel(pointerEvent: PointerEvent) {
    if (pointerEvent.pointerId === pointerId) cancel()
  }

  function handleKeyDown(keyEvent: KeyboardEvent) {
    if (keyEvent.key === 'Escape') cancel()
  }

  try {
    sourceElement.setPointerCapture?.(pointerId)
  } catch {
    // Some nested controls do not support capture in every WebView.
  }

  document.addEventListener('pointermove', handlePointerMove, true)
  document.addEventListener('pointerup', handlePointerUp, true)
  document.addEventListener('pointercancel', handlePointerCancel, true)
  document.addEventListener('keydown', handleKeyDown, true)
  window.addEventListener('blur', cancel, true)
}

export function isPointInsideElement(point: InternalDragPoint, element: HTMLElement | null): boolean {
  if (!element) return false
  const rect = element.getBoundingClientRect()
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
}
