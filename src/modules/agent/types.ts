export type AgentLoopStatus = 'idle' | 'planning' | 'acting' | 'evaluating' | 'fixing' | 'paused' | 'failed'

export interface AgentPlanItem {
  id: string
  title: string
  status: 'todo' | 'doing' | 'done' | 'blocked'
}

export interface AgentCheckpoint {
  id: string
  createdAt: string
  status: AgentLoopStatus
  workspacePath: string
  activePlanItemIds: string[]
  lastError?: string
}

export interface AgentLoopSnapshot {
  runId: string
  status: AgentLoopStatus
  currentStep?: string
  plan: AgentPlanItem[]
  checkpoint?: AgentCheckpoint
  logs: string[]
}

export interface AgentLoopController {
  getSnapshot(): Promise<AgentLoopSnapshot>
  start(): Promise<AgentLoopSnapshot>
  pause(): Promise<AgentLoopSnapshot>
  resume(): Promise<AgentLoopSnapshot>
  checkpoint(): Promise<AgentCheckpoint>
  stop(): Promise<AgentLoopSnapshot>
}