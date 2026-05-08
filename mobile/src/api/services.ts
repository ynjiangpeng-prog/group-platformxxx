import { api } from './client'
import type {
  Project, Contract, Station, DashboardStats,
  AutopilotDashboard, Alert, PaginatedResult,
} from './types'

// 项目
export const listProjects = (params?: Record<string, unknown>) =>
  api.get<PaginatedResult<Project>>(`/projects?${toQuery(params)}`)
export const getProject = (id: string) => api.get<Project>(`/projects/${id}`)
export const createProject = (data: Partial<Project>) => api.post<Project>('/projects', data)

// 合同
export const listContracts = (params?: Record<string, unknown>) =>
  api.get<PaginatedResult<Contract>>(`/contracts?${toQuery(params)}`)

// 充电站
export const listStations = (params?: Record<string, unknown>) =>
  api.get<PaginatedResult<Station>>(`/charging/stations?${toQuery(params)}`)

// 仪表盘
export const getDashboardStats = () => api.get<DashboardStats>('/system/dashboard/stats')

// 自动驾驶
export const getAutopilotDashboard = () => api.get<AutopilotDashboard>('/autopilot/dashboard')
export const getAlerts = () => api.get<{ alerts: Alert[]; total: number }>('/autopilot/alerts')
export const sendCommand = (command: string) =>
  api.post<{ command: string; intent: string; answer: string }>('/autopilot/command', { command })

// 登录
export const login = (username: string, password: string) =>
  api.post<{ access_token: string; user_id: string; real_name?: string }>('/auth/login', { username, password })

function toQuery(params?: Record<string, unknown>): string {
  if (!params) return ''
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
}
