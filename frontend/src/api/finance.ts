import { get, post, put, del } from '@/lib/http'
import type { PaginatedResult, Account, Period, Voucher, ArAp, Settlement, Invoice, TaxRecord, Budget, CostCenter } from './types'

export const getNextVoucherNumber = () =>
  get<{ number: string }>('/finance/vouchers/next-number')
export const getNextInvoiceNumber = () =>
  get<{ number: string }>('/finance/invoices/next-number')

export const listAccounts = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Account>>('/finance/accounts', params)
export const createAccount = (data: Partial<Account>) =>
  post<Account>('/finance/accounts', data)
export const updateAccount = (id: string, data: Partial<Account>) =>
  put<Account>(`/finance/accounts/${id}`, data)
export const deleteAccount = (id: string) =>
  del<void>(`/finance/accounts/${id}`)

export const listPeriods = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Period>>('/finance/periods', params)
export const createPeriod = (data: Partial<Period>) =>
  post<Period>('/finance/periods', data)
export const closePeriod = (id: string) =>
  put<Period>(`/finance/periods/${id}/close`)

export const listVouchers = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Voucher>>('/finance/vouchers', params)
export const createVoucher = (data: Partial<Voucher>) =>
  post<Voucher>('/finance/vouchers', data)
export const getVoucher = (id: string) =>
  get<Voucher>(`/finance/vouchers/${id}`)
export const updateVoucher = (id: string, data: Partial<Voucher>) =>
  put<Voucher>(`/finance/vouchers/${id}`, data)
export const reviewVoucher = (id: string) =>
  put<Voucher>(`/finance/vouchers/${id}/review`)
export const postVoucher = (id: string) =>
  put<Voucher>(`/finance/vouchers/${id}/post`)
export const deleteVoucher = (id: string) =>
  del<void>(`/finance/vouchers/${id}`)

export const getProjectVouchers = (projectId: string, params?: Record<string, unknown>) =>
  get<PaginatedResult<Voucher>>('/finance/vouchers', { ...params, project_id: projectId })

export const listArAp = (params?: Record<string, unknown>) =>
  get<PaginatedResult<ArAp>>('/finance/ar-ap', params)
export const createArAp = (data: Partial<ArAp>) =>
  post<ArAp>('/finance/ar-ap', data)
export const getArAp = (id: string) =>
  get<ArAp>(`/finance/ar-ap/${id}`)
export const updateArAp = (id: string, data: Partial<ArAp>) =>
  put<ArAp>(`/finance/ar-ap/${id}`, data)
export const deleteArAp = (id: string) =>
  del<void>(`/finance/ar-ap/${id}`)
export const settleArAp = (id: string, data: Partial<Settlement>) =>
  post<Settlement>(`/finance/ar-ap/${id}/settle`, data)

export const listSettlements = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Settlement>>('/finance/settlements', params)
export const getSettlement = (id: string) =>
  get<Settlement>(`/finance/settlements/${id}`)
export const deleteSettlement = (id: string) =>
  del<void>(`/finance/settlements/${id}`)

export const listInvoices = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Invoice>>('/finance/invoices', params)
export const createInvoice = (data: Partial<Invoice>) =>
  post<Invoice>('/finance/invoices', data)
export const getInvoice = (id: string) =>
  get<Invoice>(`/finance/invoices/${id}`)
export const updateInvoice = (id: string, data: Partial<Invoice>) =>
  put<Invoice>(`/finance/invoices/${id}`, data)
export const deleteInvoice = (id: string) =>
  del<void>(`/finance/invoices/${id}`)
export const checkInvoice = (id: string) =>
  put<Invoice>(`/finance/invoices/${id}/check`)

export const listTax = (params?: Record<string, unknown>) =>
  get<PaginatedResult<TaxRecord>>('/finance/tax', params)
export const createTax = (data: Partial<TaxRecord>) =>
  post<TaxRecord>('/finance/tax', data)
export const updateTax = (id: string, data: Partial<TaxRecord>) =>
  put<TaxRecord>(`/finance/tax/${id}`, data)

export const listBudgets = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Budget>>('/finance/budgets', params)
export const createBudget = (data: Partial<Budget>) =>
  post<Budget>('/finance/budgets', data)
export const updateBudget = (id: string, data: Partial<Budget>) =>
  put<Budget>(`/finance/budgets/${id}`, data)
export const getBudgetExecution = (id: string) =>
  get<{ budget: Budget; details: unknown[] }>(`/finance/budgets/${id}/execution`)

export const listCostCenters = (params?: Record<string, unknown>) =>
  get<PaginatedResult<CostCenter>>('/finance/cost-centers', params)
export const createCostCenter = (data: Partial<CostCenter>) =>
  post<CostCenter>('/finance/cost-centers', data)

export const getTrialBalance = (params?: Record<string, unknown>) =>
  get<unknown>('/finance/reports/trial-balance', params)
export const getArApAging = (params?: Record<string, unknown>) =>
  get<unknown>('/finance/reports/ar-ap-aging', params)
export const getProfitLoss = (params?: Record<string, unknown>) =>
  get<unknown>('/finance/reports/profit-loss', params)

export interface BankTransaction {
  id: string
  account_name?: string
  account_no?: string
  bank_name?: string
  tx_date: string
  tx_amount: number
  balance?: number
  counterparty?: string
  counterparty_account?: string
  summary?: string
  purpose?: string
  tx_type: string
  matched: boolean
  matched_arap_id?: string
  import_batch?: string
  source: string
  source_ref?: string
  entity_id?: string
  expense_type?: string
  expense_subtype?: string
  contract_id?: string
  project_id?: string
  remark?: string
  tags?: Record<string, unknown>[]
  fund_level?: number
  parent_tx_id?: string
  fund_group_id?: string
  is_proxy_payment?: boolean
  proxy_for_entity_id?: string
  tax_bearer?: string
  tax_amount?: number
  tax_rate?: number
  invoice_amount?: number
  actual_received?: number
  tax_loss?: number
}

export const importBankTransactions = (data: { transactions: Partial<BankTransaction>[]; source?: string; entity_id?: string }) =>
  post<{ imported: number; batch: string }>('/finance/bank/import', data)

export const listBankTransactions = (params?: Record<string, unknown>) =>
  get<PaginatedResult<BankTransaction>>('/finance/bank/list', params)

export const autoMatchBank = () =>
  post<{ matched: number }>('/finance/bank/auto-match')

export const manualMatchBank = (txId: string, arapId: string) =>
  put<{ message: string }>(`/finance/bank/${txId}/match`, { arap_id: arapId })

export const deleteBankTransaction = (txId: string) =>
  del<{ message: string; reversed?: string[] }>(`/finance/bank/${txId}`)

export const annotateBankTx = (txId: string, data: {
  expense_type?: string; expense_subtype?: string; contract_id?: string; project_id?: string; remark?: string; tags?: Record<string, unknown>[];
  is_proxy_payment?: boolean; proxy_for_entity_id?: string; tax_bearer?: string; tax_amount?: number; tax_rate?: number; invoice_amount?: number; tax_loss?: number;
}) => put<{ message: string; synced?: string[] }>(`/finance/bank/${txId}/annotate`, data)

export const batchAnnotateBankTx = (data: {
  ids: string[]; expense_type?: string; expense_subtype?: string; contract_id?: string; project_id?: string; remark?: string
}) => post<{ updated: number }>('/finance/bank/batch-annotate', data)

export const getFundFlow = (txId: string) =>
  get<{ chain: FundFlowNode[] }>(`/finance/bank/fund-flow/${txId}`)

export const listExpenseTypes = () =>
  get<Record<string, string[]>>('/finance/bank/expense-types')

export interface FundFlowNode {
  id: string
  tx_date: string
  tx_amount: number
  counterparty?: string
  summary?: string
  account_name?: string
  fund_level: number
  children?: FundFlowNode[]
}

export interface CrossEntityFlow {
  entities: { id: string; name: string }[]
  entity_totals: Record<string, { inflow: number; outflow: number; net: number; tax_loss: number; proxy_count: number }>
  pair_summaries: { entity_a: { id: string; name: string }; entity_b: { id: string; name: string }; a_to_b: number; b_to_a: number; net_a_to_b: number; flow_count: number }[]
  pair_flows: { id: string; tx_date: string; amount: number; counterparty: string; summary: string; entity_id: string; entity_name: string; counterparty_entity_id: string; counterparty_entity_name: string; direction: string; expense_type: string; is_proxy_payment?: boolean; tax_loss?: number; tax_bearer?: string; tax_amount?: number }[]
  total_flow_count: number
}

export const getCrossEntityFlow = (params?: Record<string, unknown>) =>
  get<CrossEntityFlow>('/finance/bank/cross-entity-flow', params)

export interface AnnotationSuggestion {
  type: string
  label: string
  expense_type: string
  project_id?: string
  station_id?: string
  fleet_customer_id?: string
}

export const suggestAnnotation = (txId: string) =>
  get<{ suggestions: AnnotationSuggestion[] }>(`/finance/bank/${txId}/suggest-annotation`)

export interface CounterpartySummary {
  suppliers: { name: string; total_inflow: number; total_outflow: number; inflow_count: number; outflow_count: number; latest_date: string; type: string }[]
  customers: { name: string; total_inflow: number; total_outflow: number; inflow_count: number; outflow_count: number; latest_date: string; type: string }[]
  total_suppliers: number
  total_customers: number
}

export const getCounterpartySummary = () =>
  get<CounterpartySummary>('/finance/bank/counterparty-summary')
