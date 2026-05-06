import { get, post, put, del } from '@/lib/http'
import type { PaginatedResult, Supplier, ProcurementRequest, PurchaseOrder, GoodsReceipt, Contract } from './types'

export const getNextContractNumber = () =>
  get<{ number: string }>('/erp/contracts/next-number')
export const getNextPurchaseOrderNumber = () =>
  get<{ number: string }>('/erp/purchase-orders/next-number')

export const listSuppliers = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Supplier>>('/erp/suppliers', params)
export const createSupplier = (data: Partial<Supplier>) =>
  post<Supplier>('/erp/suppliers', data)
export const updateSupplier = (id: string, data: Partial<Supplier>) =>
  put<Supplier>(`/erp/suppliers/${id}`, data)
export const deleteSupplier = (id: string) =>
  del<void>(`/erp/suppliers/${id}`)

export const listProcurementRequests = (params?: Record<string, unknown>) =>
  get<PaginatedResult<ProcurementRequest>>('/erp/procurement-requests', params)
export const createProcurementRequest = (data: Partial<ProcurementRequest>) =>
  post<ProcurementRequest>('/erp/procurement-requests', data)
export const updateProcurementRequest = (id: string, data: Partial<ProcurementRequest>) =>
  put<ProcurementRequest>(`/erp/procurement-requests/${id}`, data)
export const submitProcurementRequest = (id: string) =>
  post<ProcurementRequest>(`/erp/procurement-requests/${id}/submit`)
export const approveProcurementRequest = (id: string, data?: { approved: boolean; comment?: string }) =>
  post<ProcurementRequest>(`/erp/procurement-requests/${id}/approve`, data)
export const rejectProcurementRequest = (id: string, comment?: string) =>
  post<ProcurementRequest>(`/erp/procurement-requests/${id}/reject`, null, { params: comment ? { comment } : undefined })

export const listPurchaseOrders = (params?: Record<string, unknown>) =>
  get<PaginatedResult<PurchaseOrder>>('/erp/purchase-orders', params)
export const createPurchaseOrder = (data: Partial<PurchaseOrder>) =>
  post<PurchaseOrder>('/erp/purchase-orders', data)
export const getPurchaseOrder = (id: string) =>
  get<PurchaseOrder>(`/erp/purchase-orders/${id}`)
export const updatePurchaseOrder = (id: string, data: Partial<PurchaseOrder>) =>
  put<PurchaseOrder>(`/erp/purchase-orders/${id}`, data)
export const generateContract = (id: string) =>
  post<Contract>(`/erp/purchase-orders/${id}/generate-contract`)

export const listGoodsReceipts = (params?: Record<string, unknown>) =>
  get<PaginatedResult<GoodsReceipt>>('/erp/goods-receipts', params)
export const createGoodsReceipt = (data: Partial<GoodsReceipt>) =>
  post<GoodsReceipt>('/erp/goods-receipts', data)
export const qualityPass = (id: string) =>
  put<GoodsReceipt>(`/erp/goods-receipts/${id}/quality-pass`)

export const listContracts = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Contract>>('/erp/contracts', params)
export const getContract = (id: string) =>
  get<Contract>(`/erp/contracts/${id}`)
export const createContract = (data: Partial<Contract>) =>
  post<Contract | { data: Contract; synced: string[] }>('/erp/contracts', data)
export const updateContract = (id: string, data: Partial<Contract>) =>
  put<Contract>(`/erp/contracts/${id}`, data)
export const deleteContract = (id: string) =>
  del<void>(`/erp/contracts/${id}`)
export const changeContractStatus = (id: string, status: string) =>
  put<Contract | { data: Contract; synced: string[] }>(`/erp/contracts/${id}/status`, { status })

export const getThreeWayMatch = (poId: string) =>
  get<unknown>(`/erp/three-way-match/${poId}`)
export const confirmThreeWayMatch = (poId: string) =>
  post<unknown>(`/erp/three-way-match/${poId}/confirm`)
