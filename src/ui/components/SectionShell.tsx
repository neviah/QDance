import type { ReactNode } from 'react'
import { clsx } from 'clsx'

interface SectionShellProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
  children: ReactNode
}

export function SectionShell({ title, subtitle, actions, className, children }: SectionShellProps) {
  return (
    <section className={clsx('rounded-3xl border border-white/10 bg-slate-950/60 p-5', className)}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className="mt-4">{children}</div>
    </section>
  )
}