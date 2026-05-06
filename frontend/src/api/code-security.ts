import { get, post } from '@/lib/http'

export const scanSecrets = (target_path: string, max_files?: number) =>
  post<Record<string, unknown>>('/code-security/scan/secrets', { target_path, max_files })

export const scanSast = (target_path: string) =>
  post<Record<string, unknown>>('/code-security/scan/sast', { target_path })

export const fullScan = (target_path: string) =>
  post<Record<string, unknown>>('/code-security/scan/full', { target_path })

export const aiReview = (file_path: string, focus_security?: boolean) =>
  post<Record<string, unknown>>('/code-security/review/ai', { file_path, focus_security })

export const getHealth = () =>
  get<Record<string, unknown>>('/code-security/health')
