import { get, put, post } from '@/lib/http'
import type { DashboardStats, DashboardCharts, Notification, PaginatedResult, LogEntry } from './types'

export const getDashboard = () =>
  get<unknown>('/system/dashboard')
export const getDashboardStats = () =>
  get<DashboardStats>('/system/dashboard/stats')
export const getDashboardCharts = (params?: Record<string, unknown>) =>
  get<DashboardCharts>('/system/dashboard/charts', params)

export const getLogs = (params?: Record<string, unknown>) =>
  get<PaginatedResult<LogEntry>>('/system/logs', params)
export const getConfig = () =>
  get<Record<string, string>>('/system/config')
export const updateConfig = (data: Record<string, unknown>) =>
  put<Record<string, string>>('/system/config', data)

export const listNotifications = (params?: Record<string, unknown>) =>
  get<Notification[]>('/system/notifications', params)
export const markNotificationRead = (id: string) =>
  put<void>(`/system/notifications/${id}/read`)
export const markAllRead = () =>
  put<void>('/system/notifications/read-all')
