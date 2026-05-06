import { get, post, put, del } from '@/lib/http'
import type { PaginatedResult } from './types'

export interface CrmReminder {
  id: string
  lead_id?: string
  customer_name?: string
  reminder_type: string
  remind_at: string
  content?: string
  status: string
  assignee_id?: string
}

export const listReminders = (params?: Record<string, unknown>) =>
  get<PaginatedResult<CrmReminder>>('/crm/reminders', params)

export const createReminder = (data: Partial<CrmReminder>) =>
  post<CrmReminder>('/crm/reminders', data)

export const updateReminder = (id: string, data: Partial<CrmReminder>) =>
  put<CrmReminder>(`/crm/reminders/${id}`, data)

export const deleteReminder = (id: string) =>
  del<void>(`/crm/reminders/${id}`)
