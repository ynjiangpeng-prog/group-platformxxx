import { post, del } from '@/lib/http'

export interface FileItem {
  file_id: string
  object_name: string
  original_filename: string
  size: number
  content_type: string
  url: string
}

export const uploadFile = async (file: File, folder = 'uploads'): Promise<FileItem> => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await post<{ success: boolean; data: FileItem }>(`/files/upload?folder=${folder}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  } as any)
  return (res as any).data ?? res
}

export const uploadBatch = async (files: File[], folder = 'uploads'): Promise<FileItem[]> => {
  const formData = new FormData()
  files.forEach((f) => formData.append('files', f))
  const res = await post<{ success: boolean; data: FileItem[] }>(`/files/upload-batch?folder=${folder}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  } as any)
  return (res as any).data ?? res
}

export const deleteFile = (objectName: string) =>
  del<void>(`/files/${objectName}`)
