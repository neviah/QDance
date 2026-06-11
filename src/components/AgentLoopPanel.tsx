// ============================================
// Agent Loop Panel
// Displays plan items, status, logs, and controls for the autonomous loop.
// ============================================

import { memo, useState, useCallback } from 'react'
import { clsx } from 'clsx'
import { useAgentLoop, useAgentLoopActions } from '../modules/agent'
import { ModuleCard } from '../ui/components/ModuleCard'
import { StatusBadge } from '../ui/components/StatusBadge'
import type { AgentLoopStatus, AgentPlanItem } from '../modules/agent'

const statusTone = (s: AgentLoopStatus): 'neutral' | 'success' | 'warning' | 'danger' | 'info' => {
  if (s === 'idle') return 'neutral'
  if (s === 'failed') return 'danger'
  if (s === 'paused') return 'warning'
  return 'info'
}

interface AgentLoopPanelProps {
  directory?: string
}

export const AgentLoopPanel = memo(function AgentLoopPanel({ directory }: AgentLoopPanelProps) {
  const loop = useAgentLoop()
  const { start, pause, resume, stop, checkpoint } = useAgentLoopActions()

  const [goal, setGoal] = useState('')
  const [maxIter, setMaxIter] = useState(30)

  const handleStart = useCallback(() => {
    if (!goal.trim()) return
    void start({ workspacePath: directory ?? '', goal: goal.trim(), maxIterations: maxIter })
  }, [start, goal, directory, maxIter])

  const handleResume = useCallback(() => {
    if (!goal.trim()) return
    void resume({ workspacePath: directory ?? '', goal: goal.trim(), maxIterations: maxIter })
  }, [resume, goal, directory, maxIter])

  const isRunning = loop.status === 'acting' || loop.status === 'planning' ||
    loop.status === 'evaluating' || loop.status === 'fixing'

  const planTone = (s: string) => {
    if (s === 'done') return 'success'
    if (s === 'doing') return 'info'
    if (s === 'blocked') return 'danger'
    return 'neutral'
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Config */}
      <ModuleCard
        title="Autonomous Agent Loop"
        description="Plan → Act → Evaluate → Fix → Repeat. Checkpoints after each stable step."
        statusLabel={loop.status}
        statusTone={statusTone(loop.status)}
      >
        <div className="space-y-3">
          <textarea
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="Describe the coding goal…"
            rows={3}
            disabled={isRunning}
            className={clsx(
              'w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 resize-none placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50',
              isRunning && 'opacity-50 cursor-not-allowed',
            )}
          />

          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-400">Max iterations</label>
            <input
              type="number"
              min={1}
              max={200}
              value={maxIter}
              onChange={e => setMaxIter(parseInt(e.target.value, 10) || 30)}
              disabled={isRunning}
              className="w-16 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-100 text-center focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {loop.status === 'idle' || loop.status === 'failed' ? (
              <button
                onClick={handleStart}
                disabled={!goal.trim()}
                className={clsx(
                  'rounded-lg px-4 py-1.5 text-xs font-medium transition-colors',
                  goal.trim() ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400 cursor-not-allowed',
                )}
              >
                Start Loop
              </button>
            ) : null}

            {loop.status === 'paused' ? (
              <button
                onClick={handleResume}
                disabled={!goal.trim()}
                className="rounded-lg px-4 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors"
              >
                Resume
              </button>
            ) : null}

            {isRunning ? (
              <button
                onClick={pause}
                className="rounded-lg px-4 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors"
              >
                Pause
              </button>
            ) : null}

            {loop.status !== 'idle' ? (
              <>
                <button
                  onClick={checkpoint}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                >
                  Checkpoint
                </button>
                <button
                  onClick={stop}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium bg-rose-800 hover:bg-rose-700 text-rose-100 transition-colors"
                >
                  Stop
                </button>
              </>
            ) : null}
          </div>

          {loop.currentStep && (
            <p className="text-xs text-sky-300">↳ {loop.currentStep}</p>
          )}
          {loop.checkpoint && (
            <p className="text-xs text-slate-500">Last checkpoint: {new Date(loop.checkpoint.createdAt).toLocaleString()}</p>
          )}
        </div>
      </ModuleCard>

      {/* Plan */}
      {loop.plan.length > 0 && (
        <ModuleCard
          title="Plan"
          statusLabel={`${loop.plan.filter((p: AgentPlanItem) => p.status === 'done').length}/${loop.plan.length}`}
          statusTone="info"
        >
          <ol className="space-y-1.5">
            {loop.plan.map((item: AgentPlanItem, i: number) => (
              <li key={item.id} className="flex items-start gap-2 text-xs">
                <span className="text-slate-500 shrink-0 tabular-nums w-5">{i + 1}.</span>
                <span className={clsx(
                  'flex-1',
                  item.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-200',
                  item.status === 'doing' ? 'text-sky-300' : '',
                  item.status === 'blocked' ? 'text-rose-300' : '',
                )}>
                  {item.title}
                </span>
                <StatusBadge label={item.status} tone={planTone(item.status)} />
              </li>
            ))}
          </ol>
        </ModuleCard>
      )}

      {/* Logs */}
      {loop.logs.length > 0 && (
        <ModuleCard title="Execution Log" statusLabel={`${loop.logs.length} lines`} statusTone="neutral">
          <pre className="max-h-56 overflow-y-auto text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
            {loop.logs.join('\n')}
          </pre>
        </ModuleCard>
      )}
    </div>
  )
})
