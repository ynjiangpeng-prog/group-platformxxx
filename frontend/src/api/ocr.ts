import { post } from '@/lib/http'

export interface ContractOcrResult {
  contract_no: string
  contract_name: string
  description?: string
  party_a: string
  party_b: string
  party_c?: string
  party_a_representative?: string
  party_b_representative?: string
  amount?: number
  amount_cn?: string
  total_amount?: number
  warranty_rate?: number
  warranty_amount?: number
  sign_date?: string
  start_date?: string
  end_date?: string
  duration_description?: string
  project_location?: string
  payment_terms?: string
  payment_installments?: { phase: string; percent: number; amount: number; condition: string }[]
  key_clauses?: string[]
  quality_standard?: string
  breach_liability?: string
  dispute_resolution?: string
  contact_person?: string
  contact_phone?: string
  suggested_entity_id?: string
  suggested_entity_name?: string
  direction?: string
  counterparty?: string
}

export interface InvoiceOcrResult {
  invoice_type: string
  invoice_no: string
  invoice_code?: string
  amount: number
  tax_amount: number
  total_amount: number
  seller_name: string
  buyer_name: string
  invoice_date: string
  check_code?: string
}

export interface ReceiptOcrResult {
  type: string
  date: string
  amount: number
  merchant_name?: string
  items?: string
}

export const recognizeContract = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return post<ContractOcrResult>('/ai/ocr/contract', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export const recognizeInvoice = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return post<InvoiceOcrResult>('/ai/ocr/invoice', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export const recognizeReceipt = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return post<ReceiptOcrResult>('/ai/ocr/receipt', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export const contractAutoSave = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return post<{ id: string }>('/ai/ocr/contract-auto-save', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export const invoiceAutoSave = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return post<{ id: string }>('/ai/ocr/invoice-auto-save', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export const batchRecognize = (files: File[], type: string) => {
  const fd = new FormData()
  files.forEach((f) => fd.append('files', f))
  fd.append('type', type)
  return post<unknown[]>('/ai/ocr/batch', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export const smartFill = (ocrResult: Record<string, unknown>, formType: string) =>
  post<Record<string, string>>('/ai/ocr/smart-fill', { ocr_result: ocrResult, form_type: formType })
