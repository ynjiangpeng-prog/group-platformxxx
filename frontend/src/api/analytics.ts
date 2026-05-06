import { get } from '@/lib/http'

export const getOverview = (params?: Record<string, unknown>) =>
  get<Record<string, unknown>>('/analytics/overview', params)

export const getTrends = (params?: Record<string, unknown>) =>
  get<Record<string, unknown>>('/analytics/trends', params)

export const getTopCustomers = (params?: Record<string, unknown>) =>
  get<Record<string, unknown>>('/analytics/top-customers', params)

export const getRevenueAnalysis = (params?: Record<string, unknown>) =>
  get<Record<string, unknown>>('/analytics/revenue', params)
