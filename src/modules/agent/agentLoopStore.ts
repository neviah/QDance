// ============================================
// Agent Loop Store
// Plan → Act → Evaluate → Fix → Repeat
// Integrates with the existing OpenCode session API for actual execution.
// Checkpoints to localStorage for crash recovery.
// ============================================

import { useSyncExternalStore, useCallback } from 'react'
import type { AgentCheckpoint, AgentLoopSnapshot, AgentLoopStatus, AgentPlanItem } from './types'
import { createSession, updateSession } from '../../api/session'
import { getSessionMessages } from '../../api/message'

import { providerRegistryStore } from '../../providers/providerStore'
import { sendMessageAsyncWithFallback } from '../fallback'

const STORAGE_KEY_CHECKPOINT = 'oca-agent-checkpoint-v1'
const MAX_LOG_LINES = 500

function getActiveModel(): { providerID: string; modelID: string } {
  const provider = providerRegistryStore.getActiveProvider()
  const sel = providerRegistryStore.getSnapshot().activeSelection
  return {
    providerID: provider?.id ?? 'openrouter',
    modelID: sel?.modelId ?? provider?.supportedModels[0]?.id ?? 'anthropic/claude-3.5-sonnet',
  }
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------
function nowIso() { return new Date().toISOString() }
function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` }

function loadCheckpoint(): AgentCheckpoint | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CHECKPOINT)
    return raw ? (JSON.parse(raw) as AgentCheckpoint) : undefined
  } catch { return undefined }
}

function saveCheckpoint(cp: AgentCheckpoint) {
  try { localStorage.setItem(STORAGE_KEY_CHECKPOINT, JSON.stringify(cp)) } catch { /* ignore */ }
}

function clearCheckpoint() {
  try { localStorage.removeItem(STORAGE_KEY_CHECKPOINT) } catch { /* ignore */ }
}

// -------------------------------------------------------
// Store implementation
// -------------------------------------------------------
type Subscriber = () => void

export interface AgentLoopConfig {
  workspacePath: string
  goal: string
  maxIterations?: number
  /** ID of an existing OpenCode session to use; if omitted a new one is created */
  sessionId?: string
}

class AgentLoopStore {
  private snapshot: AgentLoopSnapshot = {
    runId: uid(),
    status: 'idle',
    plan: [],
    logs: [],
    checkpoint: loadCheckpoint(),
  }
  private subscribers = new Set<Subscriber>()
  private abortController: AbortController | null = null
  private iterationCount = 0

  getSnapshot = (): AgentLoopSnapshot => this.snapshot

  subscribe = (cb: Subscriber): (() => void) => {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }

  private update(patch: Partial<AgentLoopSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.subscribers.forEach(s => s())
  }

  private log(line: string) {
    const ts = new Date().toLocaleTimeString()
    const lines = [`[${ts}] ${line}`, ...this.snapshot.logs].slice(0, MAX_LOG_LINES)
    this.update({ logs: lines })
  }

  private checkpoint(status: AgentLoopStatus, error?: string): AgentCheckpoint {
    const cp: AgentCheckpoint = {
      id: uid(),
      createdAt: nowIso(),
      status,
      workspacePath: this.snapshot.checkpoint?.workspacePath ?? '',
      activePlanItemIds: this.snapshot.plan.filter(p => p.status === 'doing').map(p => p.id),
      lastError: error,
    }
    saveCheckpoint(cp)
    this.update({ checkpoint: cp })
    return cp
  }

  // -------------------------------------------------------
  // Plan phase — ask the model to break the goal into tasks
  // -------------------------------------------------------
  private async planPhase(sessionId: string, goal: string): Promise<AgentPlanItem[]> {
    this.update({ status: 'planning', currentStep: 'Creating plan' })
    this.log('Phase: PLAN')

    const prompt = [
      'You are an expert software engineer.',
      'Break the following goal into a numbered list of concrete, atomic coding tasks.',
      'Reply ONLY with the numbered list, one task per line, no extra commentary.',
      '',
      `Goal: ${goal}`,
    ].join('\n')

    await sendMessageAsyncWithFallback(
      { sessionId, text: prompt, attachments: [], model: getActiveModel() },
      {
        onFallback: (fromProviderId, toProviderId, reason) => {
          this.log(`Fallback: ${fromProviderId} -> ${toProviderId} (${reason})`)
        },
      },
    )

    // Wait for the session to finish streaming (poll message count)
    const planText = await this.waitForResponse(sessionId)
    const items: AgentPlanItem[] = planText
      .split('\n')
      .filter(l => /^\d+[.)]\s+/.test(l.trim()))
      .map(l => ({
        id: uid(),
        title: l.replace(/^\d+[.)]\s+/, '').trim(),
        status: 'todo' as const,
      }))

    if (items.length === 0) {
      items.push({ id: uid(), title: goal, status: 'todo' })
    }

    this.log(`Plan created: ${items.length} tasks`)
    this.update({ plan: items })
    return items
  }

  // -------------------------------------------------------
  // Act phase — execute one plan item
  // -------------------------------------------------------
  private async actPhase(sessionId: string, item: AgentPlanItem): Promise<string> {
    const updated = this.snapshot.plan.map(p => p.id === item.id ? { ...p, status: 'doing' as const } : p)
    this.update({ status: 'acting', currentStep: item.title, plan: updated })
    this.log(`Phase: ACT — ${item.title}`)

    const prompt = [
      `Task: ${item.title}`,
      '',
      'Implement this task in the codebase. Make all necessary file edits.',
      'When done, reply with a brief summary of what you changed.',
    ].join('\n')

    await sendMessageAsyncWithFallback(
      { sessionId, text: prompt, attachments: [], model: getActiveModel() },
      {
        onFallback: (fromProviderId, toProviderId, reason) => {
          this.log(`Fallback: ${fromProviderId} -> ${toProviderId} (${reason})`)
        },
      },
    )
    return this.waitForResponse(sessionId)
  }

  // -------------------------------------------------------
  // Evaluate phase — check if the task was done correctly
  // -------------------------------------------------------
  private async evaluatePhase(sessionId: string, task: string, actionResult: string): Promise<{ passed: boolean; feedback: string }> {
    this.update({ status: 'evaluating', currentStep: 'Evaluating result' })
    this.log('Phase: EVALUATE')

    const prompt = [
      `You just completed the task: "${task}"`,
      `Here is what you reported: ${actionResult}`,
      '',
      'Evaluate if the task is correctly and completely done.',
      'Reply with either:',
      '  PASS: <brief reason>',
      '  FAIL: <what is missing or broken>',
    ].join('\n')

    await sendMessageAsyncWithFallback(
      { sessionId, text: prompt, attachments: [], model: getActiveModel() },
      {
        onFallback: (fromProviderId, toProviderId, reason) => {
          this.log(`Fallback: ${fromProviderId} -> ${toProviderId} (${reason})`)
        },
      },
    )
    const response = await this.waitForResponse(sessionId)
    const passed = /^PASS:/i.test(response.trim())
    return { passed, feedback: response }
  }

  // -------------------------------------------------------
  // Fix phase — attempt to repair a failed task
  // -------------------------------------------------------
  private async fixPhase(sessionId: string, task: string, feedback: string): Promise<void> {
    this.update({ status: 'fixing', currentStep: 'Fixing issues' })
    this.log(`Phase: FIX — ${feedback.slice(0, 80)}`)

    const prompt = [
      `The task "${task}" was evaluated and found to be incomplete or incorrect.`,
      `Feedback: ${feedback}`,
      '',
      'Please fix the issues and confirm when done.',
    ].join('\n')

    await sendMessageAsyncWithFallback(
      { sessionId, text: prompt, attachments: [], model: getActiveModel() },
      {
        onFallback: (fromProviderId, toProviderId, reason) => {
          this.log(`Fallback: ${fromProviderId} -> ${toProviderId} (${reason})`)
        },
      },
    )
    await this.waitForResponse(sessionId)
  }

  // -------------------------------------------------------
  // Poll the session until the AI response completes
  // -------------------------------------------------------
  private async waitForResponse(sessionId: string, pollMs = 800, timeoutMs = 120000): Promise<string> {
    const deadline = Date.now() + timeoutMs
    let lastCount = 0

    while (Date.now() < deadline) {
      if (this.abortController?.signal.aborted) throw new Error('Agent loop aborted')
      await sleep(pollMs)
      try {
        const messages = await getSessionMessages(sessionId)
        if (messages.length !== lastCount) {
          lastCount = messages.length
          // Wait one more cycle to ensure streaming is done
          await sleep(pollMs)
          const refreshed = await getSessionMessages(sessionId)
          if (refreshed.length === lastCount) {
            // Find last assistant message
            const last = [...refreshed].reverse().find(m => m.info.role === 'assistant')
            if (last) {
              // Extract text from parts
              return extractTextFromMessage(last)
            }
          }
        }
      } catch {
        // transient error — keep polling
      }
    }
    throw new Error('Timeout waiting for AI response')
  }

  // -------------------------------------------------------
  // Public API
  // -------------------------------------------------------

  async start(config: AgentLoopConfig): Promise<AgentLoopSnapshot> {
    if (this.snapshot.status !== 'idle' && this.snapshot.status !== 'failed') {
      throw new Error(`Cannot start: loop is currently ${this.snapshot.status}`)
    }

    this.abortController = new AbortController()
    this.iterationCount = 0
    const runId = uid()
    this.update({ runId, status: 'planning', plan: [], logs: [], currentStep: undefined })
    this.log(`Agent loop started — goal: ${config.goal}`)

    try {
      // Create or reuse an OpenCode session
      const session = config.sessionId
        ? { id: config.sessionId }
        : await createSession({ directory: config.workspacePath, title: `Agent: ${config.goal.slice(0, 60)}` })

      this.checkpoint('planning')

      // Plan
      const plan = await this.planPhase(session.id, config.goal)
      this.checkpoint('acting')

      const maxIter = config.maxIterations ?? plan.length * 3

      for (const item of plan) {
        if (this.abortController.signal.aborted) break
        if (this.iterationCount >= maxIter) {
          this.log(`Max iterations (${maxIter}) reached — stopping`)
          break
        }

        let retries = 0
        while (retries < 3) {
          if (this.abortController.signal.aborted) break

          // Act
          const actionResult = await this.actPhase(session.id, item)
          this.iterationCount++

          // Evaluate
          const { passed, feedback } = await this.evaluatePhase(session.id, item.title, actionResult)

          if (passed) {
            const updatedPlan = this.snapshot.plan.map(p =>
              p.id === item.id ? { ...p, status: 'done' as const } : p,
            )
            this.update({ plan: updatedPlan })
            this.log(`✓ Done: ${item.title}`)
            this.checkpoint('acting')
            break
          } else {
            retries++
            this.log(`✗ Fix attempt ${retries}: ${item.title}`)
            await this.fixPhase(session.id, item.title, feedback)
            this.iterationCount++
          }
        }

        if (retries >= 3) {
          const updatedPlan = this.snapshot.plan.map(p =>
            p.id === item.id ? { ...p, status: 'blocked' as const } : p,
          )
          this.update({ plan: updatedPlan })
          this.log(`⚠ Blocked after 3 retries: ${item.title}`)
        }
      }

      // Finish
      await updateSession(session.id, { title: `[Done] ${config.goal.slice(0, 60)}` })
      clearCheckpoint()
      this.update({ status: 'idle', currentStep: undefined })
      this.log('Agent loop completed')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.log(`Error: ${msg}`)
      this.checkpoint('failed', msg)
      this.update({ status: 'failed', currentStep: undefined })
    }

    return this.snapshot
  }

  pause(): AgentLoopSnapshot {
    if (this.snapshot.status === 'acting' || this.snapshot.status === 'planning' ||
        this.snapshot.status === 'evaluating' || this.snapshot.status === 'fixing') {
      this.abortController?.abort()
      this.checkpoint('paused')
      this.update({ status: 'paused' })
      this.log('Agent loop paused')
    }
    return this.snapshot
  }

  resume(config: AgentLoopConfig): Promise<AgentLoopSnapshot> {
    if (this.snapshot.status !== 'paused') {
      throw new Error('Cannot resume: loop is not paused')
    }
    this.log('Resuming agent loop')
    return this.start(config)
  }

  stop(): AgentLoopSnapshot {
    this.abortController?.abort()
    clearCheckpoint()
    this.update({ status: 'idle', currentStep: undefined })
    this.log('Agent loop stopped')
    return this.snapshot
  }

  takeCheckpoint(): AgentCheckpoint {
    return this.checkpoint(this.snapshot.status)
  }

  /** Load state from a stored checkpoint (for crash recovery). */
  loadFromCheckpoint(cp: AgentCheckpoint) {
    saveCheckpoint(cp)
    this.update({ checkpoint: cp, status: 'paused', currentStep: undefined })
    this.log(`Loaded checkpoint from ${cp.createdAt}`)
  }
}

// -------------------------------------------------------
// Utility
// -------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractTextFromMessage(msg: { info: unknown; parts?: unknown[] }): string {
  if (!msg.parts || !Array.isArray(msg.parts)) return ''
  return msg.parts
    .filter((p): p is { type: string; text?: string } =>
      typeof p === 'object' && p !== null && (p as { type?: string }).type === 'text',
    )
    .map(p => p.text ?? '')
    .join('\n')
}

export const agentLoopStore = new AgentLoopStore()

// -------------------------------------------------------
// React hooks
// -------------------------------------------------------

export function useAgentLoop() {
  return useSyncExternalStore(agentLoopStore.subscribe, agentLoopStore.getSnapshot)
}

export function useAgentLoopActions() {
  const start = useCallback((config: AgentLoopConfig) => agentLoopStore.start(config), [])
  const pause = useCallback(() => agentLoopStore.pause(), [])
  const resume = useCallback((config: AgentLoopConfig) => agentLoopStore.resume(config), [])
  const stop = useCallback(() => agentLoopStore.stop(), [])
  const checkpoint = useCallback(() => agentLoopStore.takeCheckpoint(), [])
  const loadFromCheckpoint = useCallback((cp: AgentCheckpoint) => agentLoopStore.loadFromCheckpoint(cp), [])
  return { start, pause, resume, stop, checkpoint, loadFromCheckpoint }
}
