import { get, post, put, del } from '@/lib/http'
import type { PaginatedResult } from './types'

export interface CompanyEntity {
  id: string
  entity_name: string
  entity_code?: string
  legal_person?: string
  tax_no?: string
  bank_name?: string
  bank_account?: string
  address?: string
  is_default: boolean
}

export interface FundDisbursement {
  id: string
  fund_id: string
  user_id: string
  amount: number
  disburse_date: string
  payment_method: string
  payment_entity_id?: string
  remark?: string
  status: string
}

export const listEntities = (params?: Record<string, unknown>) =>
  get<PaginatedResult<CompanyEntity>>('/erp/entities/entities', params)

export const createEntity = (data: Partial<CompanyEntity>) =>
  post<CompanyEntity>('/erp/entities/entities', data)

export const updateEntity = (id: string, data: Partial<CompanyEntity>) =>
  put<CompanyEntity>(`/erp/entities/entities/${id}`, data)

export const deleteEntity = (id: string) =>
  del<void>(`/erp/entities/entities/${id}`)

export const listFundDisbursements = (params?: Record<string, unknown>) =>
  get<PaginatedResult<FundDisbursement>>('/erp/entities/fund-disbursements', params)

export const createFundDisbursement = (data: Partial<FundDisbursement>) =>
  post<FundDisbursement>('/erp/entities/fund-disbursements', data)

export const updateFundDisbursement = (id: string, data: Partial<FundDisbursement>) =>
  put<FundDisbursement>(`/erp/entities/fund-disbursements/${id}`, data)

export const deleteFundDisbursement = (id: string) =>
  del<void>(`/erp/entities/fund-disbursements/${id}`)
