import { get, post, put, del } from '@/lib/http'
import type { PaginatedResult } from './types'

export interface WorkflowTemplateDetail {
  id: string
  code: string
  name: string
  description?: string
  stages: WorkflowStageDef[]
}

export interface WorkflowStageDef {
  code: string
  name: string
  order: number
  is_required: boolean
  auto_actions?: string[]
}

export interface ProjectStage {
  code: string
  name: string
  order: number
  status: 'pending' | 'in_progress' | 'completed' | 'skipped'
  started_at?: string
  completed_at?: string
  assignee?: string
  remark?: string
}

export interface ProjectProgress {
  project_id: string
  template_name: string
  stages: ProjectStage[]
}

export interface TransitionResult {
  success: boolean
  from_stage: string
  to_stage: string
  message?: string
}

export interface TimelineEntry {
  id: string
  from_stage: string
  to_stage: string
  action: string
  operator: string
  remark?: string
  created_at: string
}

export interface WfTemplate {
  id: string
  name: string
  code: string
  business_type: string
  description?: string
  version: number
  status: string
  node_config?: Record<string, unknown>
}

export interface WfInstance {
  id: string
  template_id: string
  title: string
  business_type: string
  business_id?: string
  initiator_id: string
  current_step: number
  status: string
  urgency: number
  form_data?: Record<string, unknown>
  created_at: string
}

export const getTemplates = () =>
  get<WorkflowTemplateDetail[]>('/workflow/engine/templates')

export const getTemplate = (code: string) =>
  get<WorkflowTemplateDetail>(`/workflow/engine/templates/${code}`)

export const createProjectFromTemplate = (data: Record<string, unknown>) =>
  post<{ project_id: string; stages: ProjectStage[] }>('/workflow/engine/projects/create', data)

export const getProjectProgress = (projectId: string) =>
  get<ProjectProgress>(`/workflow/engine/projects/${projectId}/progress`)

export const advanceStage = (projectId: string, data: { target_stage_code: string; action: string; data?: { remark?: string } }) =>
  post<TransitionResult>(`/workflow/engine/projects/${projectId}/advance`, data)

export const skipStage = (projectId: string, data: { target_stage_code: string; remark?: string }) =>
  post<TransitionResult>(`/workflow/engine/projects/${projectId}/advance`, { ...data, action: 'skip' })

export const rollbackStage = (projectId: string, data: { target_stage_code: string; remark?: string }) =>
  post<TransitionResult>(`/workflow/engine/projects/${projectId}/advance`, { ...data, action: 'rollback' })

export const getProjectTimeline = (projectId: string) =>
  get<TimelineEntry[]>(`/workflow/engine/projects/${projectId}/timeline`)

export const listWfTemplates = (params?: Record<string, unknown>) =>
  get<PaginatedResult<WfTemplate>>('/workflow/templates', params)

export const createWfTemplate = (data: Partial<WfTemplate>) =>
  post<WfTemplate>('/workflow/templates', data)

export const getWfTemplate = (id: string) =>
  get<WfTemplate>(`/workflow/templates/${id}`)

export const updateWfTemplate = (id: string, data: Partial<WfTemplate>) =>
  put<WfTemplate>(`/workflow/templates/${id}`, data)

export const deleteWfTemplate = (id: string) =>
  del<void>(`/workflow/templates/${id}`)

export const listWfInstances = (params?: Record<string, unknown>) =>
  get<PaginatedResult<WfInstance>>('/workflow/instances', params)

export const createWfInstance = (data: { template_id: string; title: string; business_type: string; business_id?: string; urgency?: number; form_data?: Record<string, unknown> }) =>
  post<WfInstance>('/workflow/instances', data)

export const getWfInstance = (id: string) =>
  get<WfInstance>(`/workflow/instances/${id}`)

export const approveWfInstance = (id: string, data: { action: 'approve' | 'reject'; comment?: string }) =>
  post<WfInstance>(`/workflow/instances/${id}/approve`, data)

export const cancelWfInstance = (id: string) =>
  post<WfInstance>(`/workflow/instances/${id}/cancel`)

export const listPendingInstances = (params?: Record<string, unknown>) =>
  get<PaginatedResult<WfInstance>>('/workflow/instances/pending', params)
