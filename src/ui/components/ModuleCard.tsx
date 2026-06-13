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
        'rounded-xl border border-border-200/40 bg-bg-000/80 p-4',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[length:var(--fs-sm)] font-semibold text-text-100">{title}</h3>
          {description ? <p className="mt-1 text-[length:var(--fs-sm)] text-text-400">{description}</p> : null}
        </div>
        {statusLabel ? <StatusBadge label={statusLabel} tone={statusTone} /> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  )
}