// ============================================
// Provider Store
// Manages cloud + local provider definitions and active selection.
// Persisted to localStorage, reactive via useSyncExternalStore.
// ============================================

import { useSyncExternalStore, useCallback } from 'react'
import type { ProviderDefinition, ProviderKind, ProviderModelDescriptor, ProviderSelection } from './types'

export type { ProviderDefinition, ProviderKind, ProviderModelDescriptor, ProviderSelection }

const STORAGE_KEY = 'oca-providers-v1'

// -------------------------------------------------------
// Built-in provider defaults
// -------------------------------------------------------
export const DEFAULT_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'openrouter',
    kind: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    priority: 10,
    enabled: true,
    supportedModels: [
      { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', contextWindow: 200000 },
      { id: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku', contextWindow: 200000 },
      { id: 'openai/gpt-4o', label: 'GPT-4o', contextWindow: 128000 },
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', contextWindow: 128000 },
      { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash', contextWindow: 1000000 },
      { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1', contextWindow: 64000 },
      { id: 'qwen/qwen-2.5-coder-32b-instruct', label: 'Qwen 2.5 Coder 32B', contextWindow: 32000 },
    ],
  },
  {
    id: 'deepseek',
    kind: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    priority: 20,
    enabled: true,
    supportedModels: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat', contextWindow: 64000 },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', contextWindow: 64000 },
    ],
  },
  {
    id: 'gemini',
    kind: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyEnvVar: 'GEMINI_API_KEY',
    priority: 30,
    enabled: true,
    supportedModels: [
      { id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash', contextWindow: 1000000 },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', contextWindow: 1000000 },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', contextWindow: 2000000 },
    ],
  },
  {
    id: 'openai',
    kind: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    priority: 40,
    enabled: true,
    supportedModels: [
      { id: 'gpt-4o', label: 'GPT-4o', contextWindow: 128000 },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', contextWindow: 128000 },
      { id: 'o1-mini', label: 'o1 mini', contextWindow: 128000 },
    ],
  },
  {
    id: 'local',
    kind: 'local',
    name: 'Local (llama.cpp)',
    baseUrl: 'http://localhost:8080/v1',
    priority: 5,
    enabled: false,
    supportedModels: [],
  },
]

interface ProviderStoreSnapshot {
  providers: ProviderDefinition[]
  activeSelection?: ProviderSelection
}

function loadSnapshot(): ProviderStoreSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as ProviderStoreSnapshot
  } catch { /* ignore */ }
  return { providers: DEFAULT_PROVIDERS }
}

type Subscriber = () => void

class ProviderRegistryStore {
  private snapshot: ProviderStoreSnapshot = loadSnapshot()
  private subscribers = new Set<Subscriber>()

  getSnapshot = (): ProviderStoreSnapshot => this.snapshot

  subscribe = (cb: Subscriber): (() => void) => {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }

  private update(patch: Partial<ProviderStoreSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshot)) } catch { /* ignore */ }
    this.subscribers.forEach(s => s())
  }

  listProviders() { return this.snapshot.providers }

  registerProvider(provider: ProviderDefinition) {
    this.update({
      providers: [
        ...this.snapshot.providers.filter(p => p.id !== provider.id),
        provider,
      ].sort((a, b) => a.priority - b.priority),
    })
  }

  removeProvider(providerId: string) {
    this.update({ providers: this.snapshot.providers.filter(p => p.id !== providerId) })
  }

  selectProvider(selection: ProviderSelection) {
    this.update({ activeSelection: selection })
  }

  toggleEnabled(providerId: string, enabled: boolean) {
    this.update({
      providers: this.snapshot.providers.map(p => p.id === providerId ? { ...p, enabled } : p),
    })
  }

  updatePriority(providerId: string, priority: number) {
    this.update({
      providers: this.snapshot.providers
        .map(p => p.id === providerId ? { ...p, priority } : p)
        .sort((a, b) => a.priority - b.priority),
    })
  }

  getActiveProvider(): ProviderDefinition | undefined {
    const sel = this.snapshot.activeSelection
    if (!sel) return this.snapshot.providers.find(p => p.enabled)
    return this.snapshot.providers.find(p => p.id === sel.providerId)
  }

  addModelToProvider(providerId: string, model: ProviderModelDescriptor) {
    this.update({
      providers: this.snapshot.providers.map(p =>
        p.id === providerId
          ? { ...p, supportedModels: [...p.supportedModels.filter(m => m.id !== model.id), model] }
          : p,
      ),
    })
  }
}

export const providerRegistryStore = new ProviderRegistryStore()

// -------------------------------------------------------
// React hooks
// -------------------------------------------------------

export function useProviderRegistry() {
  return useSyncExternalStore(providerRegistryStore.subscribe, providerRegistryStore.getSnapshot)
}

export function useProviderRegistryActions() {
  const register = useCallback((p: ProviderDefinition) => providerRegistryStore.registerProvider(p), [])
  const remove = useCallback((id: string) => providerRegistryStore.removeProvider(id), [])
  const select = useCallback((sel: ProviderSelection) => providerRegistryStore.selectProvider(sel), [])
  const toggle = useCallback((id: string, enabled: boolean) => providerRegistryStore.toggleEnabled(id, enabled), [])
  const setPriority = useCallback((id: string, priority: number) => providerRegistryStore.updatePriority(id, priority), [])
  const addModel = useCallback((providerId: string, model: ProviderModelDescriptor) => providerRegistryStore.addModelToProvider(providerId, model), [])
  return { register, remove, select, toggle, setPriority, addModel }
}
