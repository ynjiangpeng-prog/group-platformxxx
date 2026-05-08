import { get, post } from '@/lib/http'

export const getInsights = (params?: Record<string, unknown>) =>
  get<unknown>('/ai/insights', params)
export const getRecommendations = (params?: Record<string, unknown>) =>
  get<unknown>('/ai/recommendations', params)
export const getRiskAlerts = (params?: Record<string, unknown>) =>
  get<unknown>('/ai/risk-alerts', params)
export const getProjectRisk = (params?: Record<string, unknown>) =>
  get<unknown>('/ai/project-risk', params)
export const getStationRevenue = (params?: Record<string, unknown>) =>
  get<unknown>('/ai/station-revenue', params)
export const getFinanceHealth = () =>
  get<unknown>('/ai/finance-health')
export const getProcurementAnalysis = () =>
  get<unknown>('/ai/procurement')
export const getDeviceHealth = (params?: Record<string, unknown>) =>
  get<unknown>('/ai/device-health', params)
export const getCustomerChurn = () =>
  get<unknown>('/ai/customer-churn')
export const getCrossBusiness = () =>
  get<unknown>('/ai/cross-business')
export const getDailyBriefing = () =>
  get<unknown>('/ai/daily-briefing')
export const executeAiTask = (data: { task_type: string; params?: Record<string, unknown> }) =>
  post<unknown>('/ai/execute', data)

export const getProjectAnalysis = (projectId: string) =>
  get<unknown>(`/ai/project-analysis/${projectId}`)

export const smartClassify = (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return post<unknown>('/ai/ocr/smart-classify', formData)
}

export interface PossibleFormType {
  value: string
  label: string
  recommended: boolean
}

export interface QuickEntryResult {
  document_type: string
  form_type: string
  form_type_label: string
  confidence: number
  extracted_fields: Record<string, unknown>
  suggested_project_id: string | null
  suggested_project_name: string | null
  possible_form_types: PossibleFormType[]
}

export const quickEntryAnalyze = (data: FormData) =>
  post<QuickEntryResult>('/ai/quick-entry', data, { headers: { 'Content-Type': 'multipart/form-data' } })

export const quickEntryAnalyzeText = (text: string) =>
  post<QuickEntryResult>('/ai/quick-entry/text', { text })

export const quickEntrySubmit = (data: {
  form_type: string
  form_data: Record<string, unknown>
  project_id?: string
}) => post<{ success: boolean; id?: string; error?: string }>('/ai/quick-entry/submit', data)
