import { get, post, del } from '@/lib/http'

export interface BatchImportResult {
  total: number
  success: number
  failed: number
  errors: { row: number; message: string }[]
}

export const downloadTemplate = (templateType: string) =>
  get<Blob>(`/batch/templates/${templateType}/download`, undefined, { responseType: 'blob' })

export const batchImport = (entityType: string, file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return post<BatchImportResult>(`/batch/${entityType}/import`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export const batchApprove = (entityType: string, ids: string[]) =>
  post<{ success: number; failed: number }>(`/batch/approve`, { entity_type: entityType, ids })

export const batchDelete = (entityType: string, ids: string[]) =>
  post<{ success: number; failed: number }>(`/batch/delete`, { entity_type: entityType, ids })

export const batchExport = (entityType: string, filters?: Record<string, unknown>) =>
  post<Blob>('/batch/export', { entity_type: entityType, filters }, { responseType: 'blob' })
