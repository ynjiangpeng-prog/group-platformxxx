import { get, post, put } from '@/lib/http'

export const listKnowledge = (params?: Record<string, unknown>) =>
  get<Record<string, unknown>>('/intelligence/knowledge', params)

export const createKnowledge = (data: Record<string, unknown>) =>
  post<Record<string, unknown>>('/intelligence/knowledge', data)

export const updateKnowledge = (id: string, data: Record<string, unknown>) =>
  put<Record<string, unknown>>(`/intelligence/knowledge/${id}`, data)

export const seedKnowledge = () =>
  post<Record<string, unknown>>('/intelligence/knowledge/seed')

export const listAlerts = (params?: Record<string, unknown>) =>
  get<Record<string, unknown>>('/intelligence/alerts', params)

export const resolveAlert = (id: string, status: string, resolution_note?: string) =>
  put<Record<string, unknown>>(`/intelligence/alerts/${id}`, { status, resolution_note })

export const scanAlerts = () =>
  post<Record<string, unknown>>('/intelligence/alerts/scan')

export const submitFeedback = (data: Record<string, unknown>) =>
  post<Record<string, unknown>>('/intelligence/feedback', data)

export const triggerLearning = () =>
  post<Record<string, unknown>>('/intelligence/learn')

export const getDashboard = () =>
  get<Record<string, unknown>>('/intelligence/dashboard')
