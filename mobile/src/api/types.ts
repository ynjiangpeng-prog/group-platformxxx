// 与 Web 端 types 对齐
export interface Project {
  id: string
  project_code: string
  name: string
  project_type: string
  status: string
  priority: number
  progress: number
  total_budget?: number
  actual_cost?: number
  province?: string
  city?: string
  address?: string
  start_date?: string
  end_date?: string
  description?: string
  project_manager_id?: string
  created_at?: string
}

export interface Contract {
  id: string
  contract_no: string
  name: string
  contract_type: string
  total_amount?: number
  paid_amount: number
  status: string
  start_date?: string
  end_date?: string
  party_a?: string
  party_b?: string
}

export interface Station {
  id: string
  station_code: string
  name: string
  station_type: string
  status: string
  province?: string
  city?: string
  address?: string
  longitude?: number
  latitude?: number
  total_parking?: number
}

export interface DashboardStats {
  active_projects: number
  active_stations: number
  pending_approvals: number
  total_ar: number
  overdue_ar: number
  total_ap: number
  pending_tickets: number
  monthly_revenue: number
  monthly_expense: number
}

export interface QuickMetrics {
  cash_balance: number
  month_income: number
  month_expense: number
  month_profit: number
  income_change_pct: number
  today_income: number
  today_expense: number
}

export interface AutopilotDashboard {
  company_status: string
  quick_metrics: QuickMetrics
  charging: {
    this_month: { orders: number; kwh: number; revenue: number }
  }
  projects: {
    total_budget: number
    budget_usage_pct: number
    delayed_count: number
  }
  finance: {
    arap: {
      receivable: { remaining: number; overdue_count: number; overdue_amount: number }
      payable: { remaining: number }
    }
  }
  stations: {
    status_counts: Record<string, number>
    top_revenue_stations: { name: string; orders_30d: number; revenue_30d: number }[]
  }
  upcoming: { items: { type: string; label: string; amount?: number; date: string }[] }
}

export interface Alert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  suggestion: string
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
}
