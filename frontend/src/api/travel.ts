import { get, post, put, del } from '@/lib/http'

export interface TripAllocation {
  project_id: string
  project_name?: string
  share_ratio: number
  allocated_amount: number
}

export interface TripFeedback {
  work_completed: string
  actual_expenses: { transport: number; hotel: number; meal: number; other: number }
  expense_remark: string
  receipt_files: { file_id: string; original_filename: string; url: string }[]
  outcome: string
  rating: string
}

export interface TravelTripItem {
  id: string
  trip_no: string
  title: string
  employee_id: string
  departure_date: string
  return_date: string
  origin: string
  destination: string
  vehicle: string
  objectives?: string
  planned_budget?: number
  actual_amount: number
  status: string
  feedback?: string
  completion_summary?: string
  result_rating?: number
  trip_feedback?: TripFeedback
  allocations: TripAllocation[]
  expense_summary: { count: number; total: number }
}

export interface TravelTripDetail extends TravelTripItem {
  expenses: {
    id: string; expense_type: string; amount: number;
    expense_date: string; description?: string; receipt_url?: string
  }[]
}

export const listTrips = (params?: Record<string, unknown>) =>
  get<{ items: TravelTripItem[]; total: number; page: number; page_size: number }>('/travel/trips', params)

export const createTrip = (data: Record<string, unknown>) =>
  post('/travel/trips', data)

export const getTrip = (id: string) =>
  get<TravelTripDetail>(`/travel/trips/${id}`)

export const updateTrip = (id: string, data: Record<string, unknown>) =>
  put(`/travel/trips/${id}`, data)

export const submitFeedback = (id: string, data: { feedback: string; completion_summary?: string; result_rating?: number }) =>
  post(`/travel/trips/${id}/feedback`, data)

export const updateAllocations = (id: string, allocations: { project_id: string; share_ratio: number }[]) =>
  put(`/travel/trips/${id}/allocations`, { allocations })

export const createTravelExpense = (data: Record<string, unknown>) =>
  post('/travel/expenses', data)

export const deleteTravelExpense = (id: string) =>
  del(`/travel/expenses/${id}`)
