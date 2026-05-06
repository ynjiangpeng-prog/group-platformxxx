import { get, post, put, del } from '@/lib/http'
import type { PaginatedResult, Station, Device, FleetCustomer, Partnership, TargetCustomer, MonthlyTask, ElectricityPayment, StationFinancial, SiteProspect, ChargingOrder, ChargingMember, FleetRecharge, FleetBill, FleetInvoiceRequest, RevenueSharePlan, SiteVisit } from './types'

export const listStations = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Station>>('/charging/stations', params)
export const createStation = (data: Partial<Station>) =>
  post<Station>('/charging/stations', data)
export const getStation = (id: string) =>
  get<Station>(`/charging/stations/${id}`)
export const updateStation = (id: string, data: Partial<Station>) =>
  put<Station>(`/charging/stations/${id}`, data)
export const deleteStation = (id: string) =>
  del<void>(`/charging/stations/${id}`)

export const listDevices = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Device>>('/charging/devices', params)
export const createDevice = (data: Partial<Device>) =>
  post<Device>('/charging/devices', data)
export const updateDevice = (id: string, data: Partial<Device>) =>
  put<Device>(`/charging/devices/${id}`, data)
export const deleteDevice = (id: string) =>
  del<void>(`/charging/devices/${id}`)

export const listFleetCustomers = (params?: Record<string, unknown>) =>
  get<PaginatedResult<FleetCustomer>>('/charging/fleet-customers', params)
export const createFleetCustomer = (data: Partial<FleetCustomer>) =>
  post<FleetCustomer>('/charging/fleet-customers', data)
export const updateFleetCustomer = (id: string, data: Partial<FleetCustomer>) =>
  put<FleetCustomer>(`/charging/fleet-customers/${id}`, data)
export const deleteFleetCustomer = (id: string) =>
  del<void>(`/charging/fleet-customers/${id}`)

export const listPartnerships = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Partnership>>('/charging/partnerships', params)
export const createPartnership = (data: Partial<Partnership>) =>
  post<Partnership>('/charging/partnerships', data)
export const updatePartnership = (id: string, data: Partial<Partnership>) =>
  put<Partnership>(`/charging/partnerships/${id}`, data)
export const deletePartnership = (id: string) =>
  del<void>(`/charging/partnerships/${id}`)

export const listTargetCustomers = (params?: Record<string, unknown>) =>
  get<PaginatedResult<TargetCustomer>>('/charging/target-customers', params)
export const createTargetCustomer = (data: Partial<TargetCustomer>) =>
  post<TargetCustomer>('/charging/target-customers', data)
export const updateTargetCustomer = (id: string, data: Partial<TargetCustomer>) =>
  put<TargetCustomer>(`/charging/target-customers/${id}`, data)
export const deleteTargetCustomer = (id: string) =>
  del<void>(`/charging/target-customers/${id}`)

export const listMonthlyTasks = (params?: Record<string, unknown>) =>
  get<PaginatedResult<MonthlyTask>>('/charging/monthly-tasks', params)
export const createMonthlyTask = (data: Partial<MonthlyTask>) =>
  post<MonthlyTask>('/charging/monthly-tasks', data)
export const updateMonthlyTask = (id: string, data: Partial<MonthlyTask>) =>
  put<MonthlyTask>(`/charging/monthly-tasks/${id}`, data)
export const deleteMonthlyTask = (id: string) =>
  del<void>(`/charging/monthly-tasks/${id}`)

export const listElectricityPayments = (params?: Record<string, unknown>) =>
  get<PaginatedResult<ElectricityPayment>>('/charging/electricity-payments', params)
export const createElectricityPayment = (data: Partial<ElectricityPayment>) =>
  post<ElectricityPayment>('/charging/electricity-payments', data)
export const updateElectricityPayment = (id: string, data: Partial<ElectricityPayment>) =>
  put<ElectricityPayment>(`/charging/electricity-payments/${id}`, data)
export const deleteElectricityPayment = (id: string) =>
  del<void>(`/charging/electricity-payments/${id}`)

export const listStationFinancials = (params?: Record<string, unknown>) =>
  get<PaginatedResult<StationFinancial>>('/charging/station-financial-monthly', params)
export const createStationFinancial = (data: Partial<StationFinancial>) =>
  post<StationFinancial>('/charging/station-financial-monthly', data)
export const updateStationFinancial = (id: string, data: Partial<StationFinancial>) =>
  put<StationFinancial>(`/charging/station-financial-monthly/${id}`, data)
export const confirmStationFinancial = (id: string) =>
  put<StationFinancial>(`/charging/station-financial-monthly/${id}/confirm`)

export const listSiteProspects = (params?: Record<string, unknown>) =>
  get<PaginatedResult<SiteProspect>>('/charging/site-prospects', params)
export const createSiteProspect = (data: Partial<SiteProspect>) =>
  post<SiteProspect>('/charging/site-prospects', data)
export const updateSiteProspect = (id: string, data: Partial<SiteProspect>) =>
  put<SiteProspect>(`/charging/site-prospects/${id}`, data)
export const deleteSiteProspect = (id: string) =>
  del<void>(`/charging/site-prospects/${id}`)

export const listOrders = (params?: Record<string, unknown>) =>
  get<PaginatedResult<ChargingOrder>>('/charging/orders', params)
export const createOrder = (data: Partial<ChargingOrder>) =>
  post<ChargingOrder>('/charging/orders', data)
export const getOrder = (id: string) =>
  get<ChargingOrder>(`/charging/orders/${id}`)
export const updateOrder = (id: string, data: Partial<ChargingOrder>) =>
  put<ChargingOrder>(`/charging/orders/${id}`, data)

export const listMembers = (params?: Record<string, unknown>) =>
  get<PaginatedResult<ChargingMember>>('/charging/members', params)
export const createMember = (data: Partial<ChargingMember>) =>
  post<ChargingMember>('/charging/members', data)
export const getMember = (id: string) =>
  get<ChargingMember>(`/charging/members/${id}`)
export const updateMember = (id: string, data: Partial<ChargingMember>) =>
  put<ChargingMember>(`/charging/members/${id}`, data)

export const listFleetRecharges = (params?: Record<string, unknown>) =>
  get<PaginatedResult<FleetRecharge>>('/charging/fleet-recharges', params)
export const createFleetRecharge = (data: Partial<FleetRecharge>) =>
  post<FleetRecharge>('/charging/fleet-recharges', data)
export const getFleetRecharge = (id: string) =>
  get<FleetRecharge>(`/charging/fleet-recharges/${id}`)

export const listFleetBills = (params?: Record<string, unknown>) =>
  get<PaginatedResult<FleetBill>>('/charging/fleet-bills', params)
export const createFleetBill = (data: Partial<FleetBill>) =>
  post<FleetBill>('/charging/fleet-bills', data)
export const getFleetBill = (id: string) =>
  get<FleetBill>(`/charging/fleet-bills/${id}`)
export const updateFleetBill = (id: string, data: Partial<FleetBill>) =>
  put<FleetBill>(`/charging/fleet-bills/${id}`, data)

export const listFleetInvoiceRequests = (params?: Record<string, unknown>) =>
  get<PaginatedResult<FleetInvoiceRequest>>('/charging/fleet-invoice-requests', params)
export const createFleetInvoiceRequest = (data: Partial<FleetInvoiceRequest>) =>
  post<FleetInvoiceRequest>('/charging/fleet-invoice-requests', data)
export const updateFleetInvoiceRequest = (id: string, data: Partial<FleetInvoiceRequest>) =>
  put<FleetInvoiceRequest>(`/charging/fleet-invoice-requests/${id}`, data)

export const listRevenueSharePlans = (params?: Record<string, unknown>) =>
  get<PaginatedResult<RevenueSharePlan>>('/charging/revenue-share-plans', params)
export const createRevenueSharePlan = (data: Partial<RevenueSharePlan>) =>
  post<RevenueSharePlan>('/charging/revenue-share-plans', data)
export const getRevenueSharePlan = (id: string) =>
  get<RevenueSharePlan>(`/charging/revenue-share-plans/${id}`)
export const updateRevenueSharePlan = (id: string, data: Partial<RevenueSharePlan>) =>
  put<RevenueSharePlan>(`/charging/revenue-share-plans/${id}`, data)

export const listSiteVisits = (params?: Record<string, unknown>) =>
  get<PaginatedResult<SiteVisit>>('/charging/site-visits', params)
export const createSiteVisit = (data: Partial<SiteVisit>) =>
  post<SiteVisit>('/charging/site-visits', data)
export const updateSiteVisit = (id: string, data: Partial<SiteVisit>) =>
  put<SiteVisit>(`/charging/site-visits/${id}`, data)
export const deleteSiteVisit = (id: string) =>
  del<void>(`/charging/site-visits/${id}`)

export const importChargingOrders = async (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  const { post } = await import('@/lib/http')
  return post<{ imported: number; skipped: number; preview: Record<string, unknown>[] }>('/charging/orders/import-file', fd)
}

export const getStationAutoCreateSuggestions = () =>
  get<{ suggestions: { station_name: string; order_count: number; similar_stations: { id: string; name: string; code: string }[]; action: string }[] }>('/charging/stations/auto-from-orders')

export const confirmStationAutoCreate = (actions: { station_name: string; action: "create" | "merge"; merge_to_id?: string }[]) =>
  post<{ created: number; merged: number; linked_orders: number }>('/charging/stations/confirm-auto-create', { actions })
