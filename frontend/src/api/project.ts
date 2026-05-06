import { get, post, put, del } from '@/lib/http'
import type { PaginatedResult, Project, Milestone, DailyTarget, DailyBudget, DailyLabor, ConstructionLog, ProcurementApproval, ServiceTicket, Inspection, SafetyInspection, ProjectAcceptance } from './types'

export const listProjects = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Project>>('/project/projects', params)
export const createProject = (data: Partial<Project>) =>
  post<Project>('/project/projects', data)
export const getProject = (id: string) =>
  get<Project>(`/project/projects/${id}`)
export const updateProject = (id: string, data: Partial<Project>) =>
  put<Project>(`/project/projects/${id}`, data)
export const deleteProject = (id: string) =>
  del<void>(`/project/projects/${id}`)
export const updateProjectProgress = (id: string, data: { progress: number }) =>
  put<void>(`/project/projects/${id}/progress`, data)

export const listMilestones = (projectId: string, params?: Record<string, unknown>) =>
  get<PaginatedResult<Milestone>>(`/project/projects/${projectId}/milestones`, params)
export const createMilestone = (projectId: string, data: Partial<Milestone>) =>
  post<Milestone>(`/project/projects/${projectId}/milestones`, data)
export const updateMilestone = (_projectId: string, id: string, data: Partial<Milestone>) =>
  put<Milestone>(`/project/milestones/${id}`, data)
export const deleteMilestone = (_projectId: string, id: string) =>
  del<void>(`/project/milestones/${id}`)

export const listDailyTargets = (projectId: string, params?: Record<string, unknown>) =>
  get<PaginatedResult<DailyTarget>>('/project/daily-targets', { ...params, project_id: projectId })
export const createDailyTarget = (data: Partial<DailyTarget>) =>
  post<DailyTarget>('/project/daily-targets', data)
export const updateDailyTarget = (_projectId: string, id: string, data: Partial<DailyTarget>) =>
  put<DailyTarget>(`/project/daily-targets/${id}`, data)
export const deleteDailyTarget = (_projectId: string, id: string) =>
  del<void>(`/project/daily-targets/${id}`)

export const listDailyBudgets = (projectId: string, params?: Record<string, unknown>) =>
  get<PaginatedResult<DailyBudget>>('/project/daily-budgets', { ...params, project_id: projectId })
export const createDailyBudget = (data: Partial<DailyBudget>) =>
  post<DailyBudget>('/project/daily-budgets', data)
export const updateDailyBudget = (_projectId: string, id: string, data: Partial<DailyBudget>) =>
  put<DailyBudget>(`/project/daily-budgets/${id}`, data)
export const deleteDailyBudget = (_projectId: string, id: string) =>
  del<void>(`/project/daily-budgets/${id}`)

export const listDailyLabor = (projectId: string, params?: Record<string, unknown>) =>
  get<PaginatedResult<DailyLabor>>('/project/daily-labor', { ...params, project_id: projectId })
export const createDailyLabor = (data: Partial<DailyLabor>) =>
  post<DailyLabor>('/project/daily-labor', data)
export const updateDailyLabor = (_projectId: string, id: string, data: Partial<DailyLabor>) =>
  put<DailyLabor>(`/project/daily-labor/${id}`, data)
export const deleteDailyLabor = (_projectId: string, id: string) =>
  del<void>(`/project/daily-labor/${id}`)

export const listConstructionLogs = (projectId?: string, params?: Record<string, unknown>) =>
  get<PaginatedResult<ConstructionLog>>('/project/construction-logs', { ...params, ...(projectId ? { project_id: projectId } : {}) })
export const createConstructionLog = (data: Partial<ConstructionLog>) =>
  post<ConstructionLog>('/project/construction-logs', data)
export const updateConstructionLog = (_projectId: string, id: string, data: Partial<ConstructionLog>) =>
  put<ConstructionLog>(`/project/construction-logs/${id}`, data)
export const deleteConstructionLog = (_projectId: string, id: string) =>
  del<void>(`/project/construction-logs/${id}`)

export const listProcurementApprovals = (projectId: string, params?: Record<string, unknown>) =>
  get<PaginatedResult<ProcurementApproval>>('/project/procurement-approvals', { ...params, project_id: projectId })
export const createProcurementApproval = (data: Partial<ProcurementApproval>) =>
  post<ProcurementApproval>('/project/procurement-approvals', data)
export const updateProcurementApproval = (_projectId: string, id: string, data: Partial<ProcurementApproval>) =>
  put<ProcurementApproval>(`/project/procurement-approvals/${id}`, data)
export const deleteProcurementApproval = (_projectId: string, id: string) =>
  del<void>(`/project/procurement-approvals/${id}`)

export const listServiceTickets = (projectId?: string, params?: Record<string, unknown>) =>
  get<PaginatedResult<ServiceTicket>>('/project/service-tickets', { ...params, ...(projectId ? { project_id: projectId } : {}) })
export const createServiceTicket = (data: Partial<ServiceTicket>) =>
  post<ServiceTicket>('/project/service-tickets', data)
export const updateServiceTicket = (_projectId: string, id: string, data: Partial<ServiceTicket>) =>
  put<ServiceTicket>(`/project/service-tickets/${id}`, data)
export const deleteServiceTicket = (_projectId: string, id: string) =>
  del<void>(`/project/service-tickets/${id}`)

export const listInspections = (projectId?: string, params?: Record<string, unknown>) =>
  get<PaginatedResult<Inspection>>('/project/inspections', { ...params, ...(projectId ? { project_id: projectId } : {}) })
export const createInspection = (data: Partial<Inspection>) =>
  post<Inspection>('/project/inspections', data)
export const updateInspection = (_projectId: string, id: string, data: Partial<Inspection>) =>
  put<Inspection>(`/project/inspections/${id}`, data)
export const deleteInspection = (_projectId: string, id: string) =>
  del<void>(`/project/inspections/${id}`)

export const matchProjectByLocation = (lat: number, lng: number) =>
  post<{ id: string; name: string; type: string; status: string; distance_meters: number }[]>("/project/match-by-location", { latitude: lat, longitude: lng })

export const getProjectCostSummary = (id: string) =>
  get<{ total_cost: number; budget: number; budget_usage_rate: number; by_type: Record<string, number>; monthly_trend: { month: string; cost: number; accumulated: number }[] }>(`/project/${id}/cost-summary`)

export const getProjectCostBreakdown = (id: string) =>
  get<Record<string, { count: number; total: number; items: { id: string; source_no: string; amount: number; record_date: string; description: string }[] }> & { total_budget: number; total_actual: number; budget_usage_rate: number; remaining_budget: number }>(`/project/${id}/cost-breakdown`)

export const listSafetyInspections = (projectId: string, params?: Record<string, unknown>) =>
  get<PaginatedResult<SafetyInspection>>('/project/safety-inspections', { ...params, project_id: projectId })
export const createSafetyInspection = (data: Partial<SafetyInspection>) =>
  post<SafetyInspection>('/project/safety-inspections', data)
export const updateSafetyInspection = (_projectId: string, id: string, data: Partial<SafetyInspection>) =>
  put<SafetyInspection>(`/project/safety-inspections/${id}`, data)
export const deleteSafetyInspection = (_projectId: string, id: string) =>
  del<void>(`/project/safety-inspections/${id}`)

export const listAcceptances = (projectId: string, params?: Record<string, unknown>) =>
  get<PaginatedResult<ProjectAcceptance>>('/project/acceptances', { ...params, project_id: projectId })
export const createAcceptance = (data: Partial<ProjectAcceptance>) =>
  post<ProjectAcceptance>('/project/acceptances', data)
export const updateAcceptance = (_projectId: string, id: string, data: Partial<ProjectAcceptance>) =>
  put<ProjectAcceptance>(`/project/acceptances/${id}`, data)
export const deleteAcceptance = (_projectId: string, id: string) =>
  del<void>(`/project/acceptances/${id}`)

export const getProjectStations = (projectId: string) =>
  get<{ items: { id: string; station_code: string; name: string; station_type: string; status: string; address?: string; total_parking?: number; power_capacity?: number; monthly_rent?: number; operation_start_date?: string; device_count: number }[]; total: number }>(`/project/${projectId}/stations`)

export const getProjectOpsSummary = (projectId: string, params?: Record<string, unknown>) =>
  get<{ monthly: { id: string; station_id: string; month: string; total_orders: number; total_kwh: number; total_energy_revenue: number; total_service_revenue: number; total_revenue: number; electricity_cost: number; rent_cost: number; depreciation: number; maintenance_cost: number; labor_cost: number; total_cost: number; gross_profit: number; gross_margin: number; status: string }[]; totals: { revenue: number; cost: number; profit: number; orders: number; kwh: number } }>(`/project/${projectId}/operations-summary`, params)

export const getProjectRevenueShares = (projectId: string) =>
  get<{ items: { id: string; partnership_id: string; partner_name: string; station_id: string; period: string; total_revenue: number; our_share_ratio: number; our_share_amount: number; partner_share_amount: number; deduct_electricity: number; deduct_rent: number; deduct_maintenance: number; net_share_amount: number; payment_due_date?: string; payment_status: string }[]; total: number }>(`/project/${projectId}/revenue-shares`)

export const getProjectOpLogs = (projectId: string, params?: Record<string, unknown>) =>
  get<{ items: { id: string; log_date: string; weather?: string; work_content?: string; worker_count: number; equipment_used?: string; materials_used?: string; safety_status: string; quality_issues?: string; created_at: string }[]; total: number; page: number; page_size: number }>(`/project/${projectId}/operation-logs`, params)

export const getProjectHub = (projectId: string) =>
  get<Record<string, unknown>>(`/project/${projectId}/hub`)

export const listTargetCosts = (projectId: string) =>
  get<{ items: { id: string; project_id: string; category: string; module_code?: string; target_amount: number; actual_amount: number; variance_amount: number; varariance_rate: number; status: string; remark?: string }[] }>(`/project/projects/${projectId}/target-costs`)

export const createTargetCost = (projectId: string, data: Record<string, unknown>) =>
  post(`/project/projects/${projectId}/target-costs`, data)

export const updateTargetCost = (costId: string, data: Record<string, unknown>) =>
  put(`/project/target-costs/${costId}`, data)

export const deleteTargetCost = (costId: string) =>
  del(`/project/target-costs/${costId}`)

export const updateBudgetItems = (projectId: string, items: Record<string, unknown>[]) =>
  put(`/project/${projectId}/budget-items`, { items })

export const listProjectDocs = (projectId: string, params?: Record<string, unknown>) =>
  get<{ id: string; module_code: string; doc_type: string; name: string; files: unknown[]; remark?: string; status: string; created_at: string }[]>(`/project/${projectId}/documents`, params)

export const createProjectDoc = (data: Record<string, unknown>) =>
  post(`/project/${data.project_id}/documents`, data)

export const updateProjectDoc = (docId: string, data: Record<string, unknown>) =>
  put(`/project/documents/${docId}`, data)

export const deleteProjectDoc = (docId: string) =>
  del(`/project/documents/${docId}`)

export const listWarehouses = () =>
  get<{ id: string; name: string; wh_type: string; location?: string; manager_id?: string; status: string }[]>('/project/warehouses/list')

export const createWarehouse = (data: Record<string, unknown>) =>
  post('/project/warehouses/create', data)

export const updateWarehouse = (id: string, data: Record<string, unknown>) =>
  put(`/project/warehouses/${id}`, data)

export const deleteWarehouse = (id: string) =>
  del(`/project/warehouses/${id}`)

export const listInventory = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Record<string, unknown>>>('/project/inventory/list', params)

export const createInventoryItem = (data: Record<string, unknown>) =>
  post('/project/inventory/create', data)

export const updateInventoryItem = (id: string, data: Record<string, unknown>) =>
  put(`/project/inventory/${id}`, data)

export const deleteInventoryItem = (id: string) =>
  del(`/project/inventory/${id}`)

export const createInventoryTx = (data: Record<string, unknown>) =>
  post('/project/inventory/transaction', data)

export const listItemTransactions = (itemId: string, params?: Record<string, unknown>) =>
  get<PaginatedResult<Record<string, unknown>>>(`/project/inventory/${itemId}/transactions`, params)

export const scanLookupInventory = (barcode: string) =>
  post<{ found: boolean; item: Record<string, unknown> | null }>('/project/inventory/scan-lookup', { barcode })

export const listFixedAssets = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Record<string, unknown>>>('/project/fixed-assets/list', params)

export const createFixedAsset = (data: Record<string, unknown>) =>
  post('/project/fixed-assets/create', data)

export const updateFixedAsset = (id: string, data: Record<string, unknown>) =>
  put(`/project/fixed-assets/${id}`, data)

export const deleteFixedAsset = (id: string) =>
  del(`/project/fixed-assets/${id}`)

export const assignFixedAsset = (assetId: string, data: Record<string, unknown>) =>
  post(`/project/fixed-assets/${assetId}/assign`, data)

export const returnFixedAsset = (assetId: string, data: Record<string, unknown>) =>
  post(`/project/fixed-assets/${assetId}/return`, data)

export interface InvestmentROI {
  total_investment: number
  total_revenue: number
  revenue_from_operations: number
  revenue_from_contracts: number
  revenue_from_lines: number
  net_profit: number
  roi_percentage: number
  payback_months: number | null
  monthly_revenue_trend: { month: string; revenue: number }[]
}

export const getInvestmentROI = (projectId: string) =>
  get<InvestmentROI>(`/project/${projectId}/investment-roi`)
