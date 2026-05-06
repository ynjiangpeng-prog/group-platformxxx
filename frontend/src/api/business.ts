import { get, post, put, del } from '@/lib/http'
import type { PaginatedResult, SiteDecision, ProjectPermit, WeeklyPlan, DailyPlan, DailyExpense, FixedExpense, EmployeePlan, WorkHour, DailyExpenseSummary } from './types'

export const listSiteDecisions = (params?: Record<string, unknown>) =>
  get<PaginatedResult<SiteDecision>>('/site-decisions', params)
export const createSiteDecision = (data: Partial<SiteDecision>) =>
  post<SiteDecision>('/site-decisions', data)

export const listProjectPermits = (params?: Record<string, unknown>) =>
  get<PaginatedResult<ProjectPermit>>('/project-permits', params)
export const createProjectPermit = (data: Partial<ProjectPermit>) =>
  post<ProjectPermit>('/project-permits', data)
export const updateProjectPermit = (id: string, data: Partial<ProjectPermit>) =>
  put<ProjectPermit>(`/project-permits/${id}`, data)

export const listWeeklyPlans = (params?: Record<string, unknown>) =>
  get<PaginatedResult<WeeklyPlan>>('/weekly-plans', params)
export const createWeeklyPlan = (data: Partial<WeeklyPlan>) =>
  post<WeeklyPlan>('/weekly-plans', data)
export const updateWeeklyPlan = (id: string, data: Partial<WeeklyPlan>) =>
  put<WeeklyPlan>(`/weekly-plans/${id}`, data)
export const deleteWeeklyPlan = (id: string) =>
  del<void>(`/weekly-plans/${id}`)

export const listDailyPlans = (params?: Record<string, unknown>) =>
  get<PaginatedResult<DailyPlan>>('/daily-plans', params)
export const createDailyPlan = (data: Partial<DailyPlan>) =>
  post<DailyPlan>('/daily-plans', data)
export const updateDailyPlan = (id: string, data: Partial<DailyPlan>) =>
  put<DailyPlan>(`/daily-plans/${id}`, data)
export const deleteDailyPlan = (id: string) =>
  del<void>(`/daily-plans/${id}`)

export const listDailyFeedbacks = (params?: Record<string, unknown>) =>
  get<PaginatedResult<unknown>>('/daily-feedbacks', params)
export const createDailyFeedback = (data: Record<string, unknown>) =>
  post<unknown>('/daily-feedbacks', data)
export const updateDailyFeedback = (id: string, data: Record<string, unknown>) =>
  put<unknown>(`/daily-feedbacks/${id}`, data)
export const deleteDailyFeedback = (id: string) =>
  del<void>(`/daily-feedbacks/${id}`)

export const listDailyExpenses = (params?: Record<string, unknown>) =>
  get<PaginatedResult<DailyExpense>>('/daily-expenses', params)
export const createDailyExpense = (data: Partial<DailyExpense>) =>
  post<DailyExpense>('/daily-expenses', data)
export const updateDailyExpense = (id: string, data: Partial<DailyExpense>) =>
  put<DailyExpense>(`/daily-expenses/${id}`, data)
export const deleteDailyExpense = (id: string) =>
  del<void>(`/daily-expenses/${id}`)
export const getDailyExpenseSummary = (params?: Record<string, unknown>) =>
  get<DailyExpenseSummary>('/daily-expenses/summary', params)

export const listFixedExpenses = (params?: Record<string, unknown>) =>
  get<PaginatedResult<FixedExpense>>('/fixed-expenses', params)
export const createFixedExpense = (data: Partial<FixedExpense>) =>
  post<FixedExpense>('/fixed-expenses', data)
export const updateFixedExpense = (id: string, data: Partial<FixedExpense>) =>
  put<FixedExpense>(`/fixed-expenses/${id}`, data)
export const deleteFixedExpense = (id: string) =>
  del<void>(`/fixed-expenses/${id}`)

export const listEmployeePlans = (params?: Record<string, unknown>) =>
  get<PaginatedResult<EmployeePlan>>('/employee-plans', params)
export const createEmployeePlan = (data: Partial<EmployeePlan>) =>
  post<EmployeePlan>('/employee-plans', data)
export const getMyEmployeePlan = (params?: Record<string, unknown>) =>
  get<EmployeePlan>('/employee-plans/my-plan', params)
export const completeEmployeePlan = (id: string, data?: { completion_note?: string }) =>
  put<EmployeePlan>(`/employee-plans/${id}/complete`, data)

export const listWorkHours = (params?: Record<string, unknown>) =>
  get<PaginatedResult<WorkHour>>('/work-hours', params)
export const createWorkHour = (data: Partial<WorkHour>) =>
  post<WorkHour>('/work-hours', data)
export const getWorkHourSummary = (params?: Record<string, unknown>) =>
  get<{ total_hours: number; total_overtime: number }>('/work-hours/summary', params)
