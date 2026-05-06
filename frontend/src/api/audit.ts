import { get } from "@/lib/http"

export interface AuditProjectSummary {
  id: string
  name: string
  code: string
  status: string
  entity_name: string
  bank_count: number
  contract_count: number
  arap_count: number
  invoice_count: number
  station_count: number
  total_links: number
}

export interface AuditModuleData {
  label: string
  icon: string
  count: number
  total_income?: number
  total_expense?: number
  total_ar?: number
  total_ap?: number
  total_remaining?: number
  station_count?: number
  order_count?: number
  total_amount?: number
  recent_orders?: any[]
  total_fund?: number
  expense_count?: number
  items: any[]
}

export interface AuditProjectLinks {
  project: {
    id: string
    name: string
    code: string
    status: string
    project_type: string
    entity_id: string | null
    entity_name: string
    contract_id: string | null
    total_budget: number | null
    actual_cost: number | null
    progress: number | null
    start_date: string | null
    end_date: string | null
    counterparty_company: string | null
  }
  modules: Record<string, AuditModuleData>
  summary: {
    total_modules: number
    total_records: number
    bank_income: number
    bank_expense: number
    bank_net: number
  }
}

export function listAuditProjects(keyword?: string) {
  return get<{ items: AuditProjectSummary[]; total: number }>("/audit/projects-overview", keyword ? { keyword } : undefined)
}

export function getProjectAudit(projectId: string) {
  return get<AuditProjectLinks>(`/audit/project-links/${projectId}`)
}
