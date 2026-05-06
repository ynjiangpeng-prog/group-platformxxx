
import { get, post } from '@/lib/http'

export const getPendingActions = (status?: string) =>
  get<Record<string, unknown>>('/autopilot/executive/pending-actions', status ? { status } : undefined)

export const confirmAction = (actionId: string, confirmed: boolean) =>
  post<Record<string, unknown>>('/autopilot/executive/confirm', { action_id: actionId, confirmed })

export const getExecutiveStats = (days?: number) =>
  get<Record<string, unknown>>('/autopilot/executive/stats', days ? { days } : undefined)

export const triggerScan = () =>
  post<Record<string, unknown>>('/autopilot/executive/scan')
