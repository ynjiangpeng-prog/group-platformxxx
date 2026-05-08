import { get, post, put, del } from '@/lib/http'

// ─── 类型定义 ───

export interface EvoAgent {
  id: string
  name: string
  description: string | null
  status: 'active' | 'disabled' | 'evolving'
  version: number
  system_prompt: string | null
  tools: Record<string, unknown> | null
  capabilities: Record<string, unknown> | null
  quality_score: number | null
  execution_count: number
  success_count: number
  config: Record<string, unknown> | null
  created_at: string | null
}

export interface AgentItem {
  id: string
  name: string
  description: string | null
  status: string
  version: number
  quality_score: number | null
  execution_count: number
  success_count: number
  capabilities: Record<string, unknown> | null
  created_at: string | null
}

export interface EvolutionHistoryItem {
  id: string
  level: number
  evolution_type: string
  score_before: number | null
  score_after: number | null
  delta: number
  status: 'pending' | 'approved' | 'rejected' | 'rolled_back'
  diff_summary: string | null
  created_at: string | null
  approved_at: string | null
}

export interface QualityTrendPoint {
  date: string
  avg_score: number
  count: number
}

export interface WorkflowTemplate {
  id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'archived'
  version: number
  fitness_score: number | null
  category: string | null
  node_count: number
  created_at: string | null
}

export interface AgentStats {
  total_agents: number
  active_agents: number
  total_executions: number
  avg_quality: number
}

export interface HookItem {
  id: string
  hook_type: string
  agent_id: string | null
  handler_name: string
  enabled: boolean
}

export interface WorkflowInstance {
  id: string
  template_id: string
  status: string
  duration_ms: number | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
}

export interface NodeExecution {
  id: string
  node_id: string
  agent_id: string | null
  status: string
  duration_ms: number | null
  error_message: string | null
  started_at: string | null
  completed_at: string | null
}

// ─── Agent管理 ───

export const listAgents = (params?: Record<string, unknown>) =>
  get<{ items: AgentItem[]; total: number }>('/agent-evo/agents', params)

export const createAgent = (data: Record<string, unknown>) =>
  post<Record<string, unknown>>('/agent-evo/agents', data)

export const getAgent = (id: string) =>
  get<EvoAgent>(`/agent-evo/agents/${id}`)

export const updateAgent = (id: string, data: Record<string, unknown>) =>
  put<Record<string, unknown>>(`/agent-evo/agents/${id}`, data)

export const toggleAgentStatus = (id: string, status: string) =>
  put<Record<string, unknown>>(`/agent-evo/agents/${id}/toggle`, { status })

export const deleteAgent = (id: string) =>
  del<Record<string, unknown>>(`/agent-evo/agents/${id}`)

export const initBuiltinAgents = () =>
  post<Record<string, unknown>>('/agent-evo/agents/init-builtin')

export const getAgentStats = () =>
  get<AgentStats>('/agent-evo/agents/stats/overview')

export const executeAgent = (data: { agent_id: string; input_data: Record<string, unknown>; task_type?: string }) =>
  post<Record<string, unknown>>('/agent-evo/execute', data)

// ─── Hook管理 ───

export const listHooks = (params?: Record<string, unknown>) =>
  get<{ items: HookItem[] }>('/agent-evo/hooks', params)

// ─── 进化操作 ───

export const listEvolutionTargets = () =>
  get<{ targets: Array<{ agent_id: string; agent_name: string; current_score: number; reasons: string[] }> }>('/agent-evo/evolution/targets')

export const evolveAgent = (agentId: string, params?: Record<string, unknown>) =>
  post<{ variants: Array<{ history_id: string; content: string; score: number; delta: number }> }>(`/agent-evo/evolution/evolve/${agentId}`, params)

export const applyEvolution = (historyId: string) =>
  post<{ agent_id: string; version: number; new_score: number; regression_rolled_back?: boolean; reason?: string }>(`/agent-evo/evolution/apply/${historyId}`)

export const rollbackEvolution = (historyId: string) =>
  post<{ agent_id: string; version: number }>(`/agent-evo/evolution/rollback/${historyId}`)

export const getEvolutionHistory = (agentId: string, params?: Record<string, unknown>) =>
  get<{ items: EvolutionHistoryItem[] }>(`/agent-evo/evolution/history/${agentId}`, params)

export const listEvolutionHistory = (params?: Record<string, unknown>) =>
  get<{ items: EvolutionHistoryItem[] }>(`/agent-evo/evolution/list`, params)

// ─── 质量趋势 ───

export const getQualityTrend = (agentId: string, params?: Record<string, unknown>) =>
  get<{ data: QualityTrendPoint[] }>(`/agent-evo/quality/trend/${agentId}`, params)

// ─── 反馈 ───

export const submitFeedback = (data: { execution_id: string; agent_id: string; rating: string; comment?: string }) =>
  post<Record<string, unknown>>('/agent-evo/feedback', data)

// ─── 评估数据集 ───

export const buildDatasetFromExecutions = (agentId: string) =>
  post<Record<string, unknown>>(`/agent-evo/datasets/build-from-executions/${agentId}`)

export const buildDatasetFromLLM = (agentId: string, params?: Record<string, unknown>) =>
  post<Record<string, unknown>>(`/agent-evo/datasets/build-from-llm/${agentId}`, params)

// ─── 工作流 ───

export const listWorkflowTemplates = (params?: Record<string, unknown>) =>
  get<{ items: WorkflowTemplate[]; total: number }>('/agent-evo/workflows/templates', params)

export const createWorkflowTemplate = (data: Record<string, unknown>) =>
  post<Record<string, unknown>>('/agent-evo/workflows/templates', data)

export const getWorkflowTemplate = (id: string) =>
  get<Record<string, unknown>>(`/agent-evo/workflows/templates/${id}`)

export const updateWorkflowTemplate = (id: string, data: Record<string, unknown>) =>
  put<Record<string, unknown>>(`/agent-evo/workflows/templates/${id}`, data)

export const executeWorkflow = (id: string, data?: Record<string, unknown>) =>
  post<Record<string, unknown>>(`/agent-evo/workflows/templates/${id}/execute`, data)

export const autoGenerateWorkflow = (data: { description: string; name?: string }) =>
  post<Record<string, unknown>>('/agent-evo/workflows/auto-generate', data)

export const listWorkflowInstances = (params?: Record<string, unknown>) =>
  get<{ items: WorkflowInstance[] }>('/agent-evo/workflows/instances', params)

export const getInstanceNodes = (instanceId: string) =>
  get<{ items: NodeExecution[] }>(`/agent-evo/workflows/instances/${instanceId}/nodes`)

export const getWorkflowFitness = (templateId: string) =>
  get<Record<string, unknown>>(`/agent-evo/workflows/fitness/${templateId}`)

export const evolveWorkflow = (templateId: string) =>
  post<{ variants: unknown[] }>(`/agent-evo/workflows/evolve/${templateId}`)

export const applyWorkflowEvolution = (historyId: string) =>
  post<Record<string, unknown>>(`/agent-evo/workflows/evolution/apply-workflow/${historyId}`)

export const initPresetWorkflows = () =>
  post<{ created: number }>('/agent-evo/workflows/init-presets')
