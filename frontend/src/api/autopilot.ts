import { get, post } from '@/lib/http'

export interface QuickMetrics {
  today_income: number
  today_expense: number
  today_net: number
  month_income: number
  month_expense: number
  month_profit: number
  income_change_pct: number
  expense_change_pct: number
  cash_balance: number
}

export interface ChargingSummary {
  orders: number
  kwh: number
  revenue: number
  avg_price: number
}

export interface ProjectStatus {
  by_status: Record<string, { count: number; cost: number; budget: number }>
  total_budget: number
  total_cost: number
  budget_usage_pct: number
  delayed_count: number
  upcoming_milestones: { project: string; milestone: string; date: string }[]
}

export interface ArapSummary {
  receivable: { total: number; paid: number; remaining: number; overdue_count: number; overdue_amount: number }
  payable: { total: number; paid: number; remaining: number; overdue_count: number; overdue_amount: number }
  overdue_receivable: number
  net_position: number
}

export interface StationHealth {
  status_counts: Record<string, number>
  top_revenue_stations: { name: string; orders_30d: number; revenue_30d: number; kwh_30d: number }[]
}

export interface Alert {
  id: string
  category: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  suggestion: string
  details?: Record<string, unknown>[]
}

export interface Dashboard {
  generated_at: string
  company_status: string
  quick_metrics: QuickMetrics
  cash_flow: { daily: { date: string; income: number; expense: number; net: number }[] }
  charging: { today: ChargingSummary; this_month: ChargingSummary }
  projects: ProjectStatus
  finance: { arap: ArapSummary }
  inventory: { total_items: number; low_stock_count: number; total_value: number; low_stock_items: { name: string; quantity: number; min: number; unit: string }[] }
  stations: StationHealth
  upcoming: { items: { type: string; label: string; amount?: number; date: string }[] }
}

export interface DailyReport {
  date: string
  data: Record<string, unknown>
  briefing: string
}

export interface CommandResult {
  command: string
  intent: string
  data: Record<string, unknown>[]
  answer: string
  timestamp: string
}

export const getDashboard = () => get<Dashboard>('/autopilot/dashboard')
export const getAlerts = () => get<{ alerts: Alert[]; total: number }>('/autopilot/alerts')
export const getDailyBriefing = () => get<DailyReport>('/autopilot/reports/daily')
export const getWeeklyReport = () => get<Record<string, unknown>>('/autopilot/reports/weekly')
export const getSummary = () => get<{ status: string; cash_balance: number; today_net: number; month_profit: number; critical_count: number; warning_count: number; critical_items: string[]; warning_items: string[] }>('/autopilot/summary')
export const sendCommand = (command: string) => post<CommandResult>('/autopilot/command', { command })
