import { api } from './client'

export const getInsights = () => api.get<unknown>('/ai/insights')
export const getRecommendations = () => api.get<unknown>('/ai/recommendations')
export const getRiskAlerts = () => api.get<unknown>('/ai/risk-alerts')
export const getProjectRisk = (params?: Record<string, unknown>) => api.get<unknown>('/ai/project-risk', params)
export const getStationRevenue = () => api.get<unknown>('/ai/station-revenue')
export const getFinanceHealth = () => api.get<unknown>('/ai/finance-health')
export const getProcurementAnalysis = () => api.get<unknown>('/ai/procurement')
export const getDeviceHealth = () => api.get<unknown>('/ai/device-health')
export const getCustomerChurn = () => api.get<unknown>('/ai/customer-churn')
export const getCrossBusiness = () => api.get<unknown>('/ai/cross-business')
export const getDailyBriefing = () => api.get<unknown>('/ai/daily-briefing')
export const executeAiTask = (data: { task_type: string; params?: Record<string, unknown> }) =>
  api.post<unknown>('/ai/execute', data)
export const getProjectAnalysis = (projectId: string) =>
  api.get<unknown>(`/ai/project-analysis/${projectId}`)
export const smartClassify = (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post<unknown>('/ai/ocr/smart-classify', formData)
}
export const quickEntryAnalyzeText = (text: string) =>
  api.post<unknown>('/ai/quick-entry/text', { text })
export const quickEntrySubmit = (data: {
  form_type: string; form_data: Record<string, unknown>; project_id?: string
}) => api.post<{ success: boolean; id?: string; error?: string }>('/ai/quick-entry/submit', data)
