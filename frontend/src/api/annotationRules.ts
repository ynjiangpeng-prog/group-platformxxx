import { get, post, put, del } from '@/lib/http'

export interface FieldCondition {
  operator: string
  value: string
}

export interface RuleConditions {
  counterparty?: FieldCondition
  summary?: FieldCondition
  purpose?: FieldCondition
  counterparty_account?: FieldCondition
  account_name?: FieldCondition
  tx_amount_min?: number
  tx_amount_max?: number
  tx_type?: string
  entity_id?: string
}

export interface RuleActions {
  expense_type?: string
  expense_subtype?: string
  project_id?: string
  contract_id?: string
  remark?: string
  tags?: string[]
}

export interface AnnotationRule {
  _rule_id: string
  _rule_name: string
  rule_name: string
  conditions: RuleConditions
  actions: RuleActions
  is_active: boolean
  priority: number
  match_count: number
  last_matched_at?: string
}

export interface UnannotatedTransaction {
  id: string
  tx_date: string
  tx_amount: number
  balance: number
  counterparty: string | null
  summary: string | null
  purpose: string | null
  tx_type: string | null
  account_name: string | null
  account_no: string | null
  bank_name: string | null
  counterparty_account: string | null
  entity_id: string | null
  fund_level: number | null
  source: string | null
}

export const listAnnotationRules = () =>
  get<{ success: boolean; data: AnnotationRule[] }>('/finance/bank/annotation-rules')

export const createAnnotationRule = (data: {
  rule_name: string
  conditions: RuleConditions
  actions: RuleActions
  priority?: number
  is_active?: boolean
}) => post<{ success: boolean; data: any }>('/finance/bank/annotation-rules', data)

export const updateAnnotationRule = (id: string, data: {
  rule_name?: string
  conditions?: RuleConditions
  actions?: RuleActions
  priority?: number
  is_active?: boolean
}) => put<{ success: boolean; data: any }>(`/finance/bank/annotation-rules/${id}`, data)

export const deleteAnnotationRule = (id: string) =>
  del<{ success: boolean }>(`/finance/bank/annotation-rules/${id}`)

export const previewAnnotationRule = (id: string) =>
  post<{ success: boolean; match_count: number; matched_transactions: any[] }>(`/finance/bank/annotation-rules/${id}/preview`)

export const applySingleRule = (id: string) =>
  post<{ success: boolean; transactions_annotated: number }>(`/finance/bank/annotation-rules/${id}/apply`)

export const applyAllRules = () =>
  post<{ success: boolean; transactions_annotated: number; rules_applied: number }>('/finance/bank/annotation-rules/apply-all')

export const listUnannotatedTransactions = (params?: { entity_id?: string; offset?: number; limit?: number }) =>
  get<{ items: UnannotatedTransaction[]; total: number }>('/finance/bank/transactions/unannotated', params)

export const annotateCard = (txId: string, data: {
  expense_type?: string
  expense_subtype?: string
  project_id?: string
  quick_project_name?: string
  contract_id?: string
  remark?: string
  tags?: any[]
  create_rule_from_this?: boolean
}) => post<{ success: boolean; project_id?: string; rule_id?: string }>(`/finance/bank/transactions/${txId}/annotate-card`, data)

export const getExpenseTypes = () =>
  get<Record<string, string[]>>('/finance/bank/expense-types')

export const addExpenseType = (data: { name: string; subtypes?: string[] }) =>
  post<{ success: boolean; name: string }>('/finance/bank/expense-types', data)
