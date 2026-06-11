import { clsx } from 'clsx'

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

interface StatusBadgeProps {
  label: string
  tone?: StatusTone
  className?: string
}

const toneClasses: Record<StatusTone, string> = {
  neutral: 'bg-slate-700/70 text-slate-100 ring-1 ring-slate-500/40',
  success: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30',
  warning: 'bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/30',
  danger: 'bg-rose-500/15 text-rose-100 ring-1 ring-rose-400/30',
  info: 'bg-sky-500/15 text-sky-100 ring-1 ring-sky-400/30',
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