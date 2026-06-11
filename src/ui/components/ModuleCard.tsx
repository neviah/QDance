import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { StatusBadge } from './StatusBadge'

interface ModuleCardProps {
  title: string
  description?: string
  statusLabel?: string
  statusTone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
  children?: ReactNode
}

export function ModuleCard({
  title,
  description,
  statusLabel,
  statusTone = 'neutral',
  className,
  children,
}: ModuleCardProps) {
  return (
    <section
      className={clsx(
        'rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-[0_10px_40px_rgba(15,23,42,0.35)] backdrop-blur',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-50">{title}</h3>
          {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
        </div>
        {statusLabel ? <StatusBadge label={statusLabel} tone={statusTone} /> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  )
}