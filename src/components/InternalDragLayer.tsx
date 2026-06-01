import { createPortal } from 'react-dom'
import { useInternalDragSnapshot } from '../lib/internalDragCore'

export function InternalDragLayer() {
  const { active } = useInternalDragSnapshot()
  if (!active || active.phase !== 'dragging') return null

  const width = Math.min(Math.max(active.sourceRect.width, 160), 320)
  const leftOffset = Math.min(active.offset.x, width - 12)
  const topOffset = Math.min(active.offset.y, Math.max(active.sourceRect.height, 1) - 6)

  return createPortal(
    <div
      className="fixed z-[10000] pointer-events-none opacity-80 shadow-lg"
      style={{
        left: active.current.x - leftOffset,
        top: active.current.y - topOffset,
        width,
      }}
      dangerouslySetInnerHTML={{ __html: active.previewHtml }}
    />,
    document.body,
  )
}
