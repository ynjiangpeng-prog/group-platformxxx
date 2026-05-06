import { get, post, put, del } from '@/lib/http'
import type { PaginatedResult } from './types'

export interface PettyCashFund {
  id: string; fund_no: string; project_id: string; employee_id: string
  amount: number; used_amount: number; remaining_amount: number
  purpose: string; issue_date: string; expected_return_date: string
  actual_return_date?: string; status: string; approved_by?: string
  remark?: string; created_at?: string
  employee_name?: string; project_name?: string
}

export interface PettyCashExpense {
  id: string; fund_id: string; project_id: string; expense_date: string
  category: string; amount: number; description?: string
  invoice_count: number; invoice_total: number; status: string
  leader_id?: string; finance_id?: string; reject_reason?: string
  remark?: string; created_at?: string
  fund_no?: string; employee_name?: string; project_name?: string
  invoices?: PettyCashInvoice[]
}

export interface PettyCashInvoice {
  id: string; expense_id: string; fund_id: string
  invoice_type: string; invoice_no?: string; invoice_date?: string
  seller_name?: string; amount_without_tax?: number; tax_amount?: number
  total_amount: number; file_url?: string; ocr_result?: Record<string, unknown>
  is_verified: boolean; remark?: string
}

export interface PettyCashStats {
  total_amount: number; total_used: number; total_remaining: number
  settling_count: number; overdue_count: number
}

export const listFunds = (params?: Record<string, unknown>) =>
  get<PaginatedResult<PettyCashFund>>('/petty-cash/funds', params)
export const createFund = (data: Partial<PettyCashFund>) =>
  post<PettyCashFund>('/petty-cash/funds', data)
export const getFund = (id: string) =>
  get<PettyCashFund>(`/petty-cash/funds/${id}`)
export const updateFund = (id: string, data: Partial<PettyCashFund>) =>
  put<void>(`/petty-cash/funds/${id}`, data)
export const cancelFund = (id: string) =>
  post<void>(`/petty-cash/funds/${id}/cancel`)
export const settleFund = (id: string) =>
  post<void>(`/petty-cash/funds/${id}/settle`)
export const getOverdueFunds = () =>
  get<PettyCashFund[]>('/petty-cash/funds/overdue')
export const getFundStats = () =>
  get<PettyCashStats>('/petty-cash/funds/stats')

export const listExpenses = (params?: Record<string, unknown>) =>
  get<PaginatedResult<PettyCashExpense>>('/petty-cash/expenses', params)
export const createExpense = (data: Partial<PettyCashExpense>) =>
  post<PettyCashExpense>('/petty-cash/expenses', data)
export const getExpense = (id: string) =>
  get<PettyCashExpense>(`/petty-cash/expenses/${id}`)
export const updateExpense = (id: string, data: Partial<PettyCashExpense>) =>
  put<void>(`/petty-cash/expenses/${id}`, data)
export const deleteExpense = (id: string) =>
  del<void>(`/petty-cash/expenses/${id}`)
export const submitExpense = (id: string) =>
  post<void>(`/petty-cash/expenses/${id}/submit`)
export const leaderApprove = (id: string, data?: Record<string, unknown>) =>
  post<void>(`/petty-cash/expenses/${id}/leader-approve`, data)
export const leaderReject = (id: string, data: { reject_reason: string }) =>
  post<void>(`/petty-cash/expenses/${id}/leader-reject`, data)
export const financeApprove = (id: string, data?: Record<string, unknown>) =>
  post<void>(`/petty-cash/expenses/${id}/finance-approve`, data)
export const financeReject = (id: string, data: { reject_reason: string }) =>
  post<void>(`/petty-cash/expenses/${id}/finance-reject`, data)
export const batchLeaderApprove = (ids: string[]) =>
  post<void>('/petty-cash/expenses/batch-leader-approve', { ids })
export const batchFinanceApprove = (ids: string[]) =>
  post<void>('/petty-cash/expenses/batch-finance-approve', { ids })

export const listInvoices = (params?: Record<string, unknown>) =>
  get<PaginatedResult<PettyCashInvoice>>('/petty-cash/invoices', params)
export const createInvoice = (data: Partial<PettyCashInvoice>) =>
  post<PettyCashInvoice>('/petty-cash/invoices', data)
export const ocrUploadInvoice = (formData: FormData) =>
  post<PettyCashInvoice>('/petty-cash/invoices/ocr-upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const updateInvoice = (id: string, data: Partial<PettyCashInvoice>) =>
  put<void>(`/petty-cash/invoices/${id}`, data)
export const deleteInvoice = (id: string) =>
  del<void>(`/petty-cash/invoices/${id}`)

export interface FundDisbursement {
  id: string; user_id: string; amount: number; disburse_date: string
  payment_method: string; payment_entity: string; remark?: string
  status: string; created_at?: string
  user_name?: string; entity_name?: string
}

export const createDisbursement = (data: Partial<FundDisbursement>) =>
  post<FundDisbursement>('/erp/entities/fund-disbursements', data)
export const listDisbursements = (params?: Record<string, unknown>) =>
  get<PaginatedResult<FundDisbursement>>('/erp/entities/fund-disbursements', params)
