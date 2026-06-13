import { clsx } from 'clsx'

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

interface StatusBadgeProps {
  label: string
  tone?: StatusTone
  className?: string
}

const toneClasses: Record<StatusTone, string> = {
  neutral: 'bg-bg-200/70 text-text-200 ring-1 ring-border-200/40',
  success: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30',
  danger: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30',
  info: 'bg-accent-main-100/10 text-accent-main-100 ring-1 ring-accent-main-100/30',
}

export function StatusBadge({ label, tone = 'neutral', className }: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium tracking-wide',
        toneClasses[tone],
        className,
      )}
    >
      {label}
    </span>
  )
}