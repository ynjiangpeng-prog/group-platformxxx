import { get, post, put, del } from '@/lib/http'
import type { PaginatedResult, Company, Department, User, Role, Permission } from './types'

export const listCompanies = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Company>>('/organization/companies', params)
export const createCompany = (data: Partial<Company>) =>
  post<Company>('/organization/companies', data)
export const getCompany = (id: string) =>
  get<Company>(`/organization/companies/${id}`)
export const updateCompany = (id: string, data: Partial<Company>) =>
  put<Company>(`/organization/companies/${id}`, data)
export const deleteCompany = (id: string) =>
  del<void>(`/organization/companies/${id}`)

export const listDepartments = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Department>>('/organization/departments', params)
export const createDepartment = (data: Partial<Department>) =>
  post<Department>('/organization/departments', data)
export const updateDepartment = (id: string, data: Partial<Department>) =>
  put<Department>(`/organization/departments/${id}`, data)
export const deleteDepartment = (id: string) =>
  del<void>(`/organization/departments/${id}`)

export const listUsers = (params?: Record<string, unknown>) =>
  get<PaginatedResult<User>>('/organization/users', params)
export const createUser = (data: Partial<User>) =>
  post<User>('/organization/users', data)
export const getUser = (id: string) =>
  get<User>(`/organization/users/${id}`)
export const updateUser = (id: string, data: Partial<User>) =>
  put<User>(`/organization/users/${id}`, data)
export const deleteUser = (id: string) =>
  del<void>(`/organization/users/${id}`)
export const resetUserPassword = (id: string, data: { password: string }) =>
  put<void>(`/organization/users/${id}/reset-password`, data)
export const toggleUserStatus = (id: string) =>
  put<void>(`/organization/users/${id}/status`)
export const assignUserRoles = (id: string, data: { role_ids: string[] }) =>
  put<void>(`/organization/users/${id}/roles`, data)

export const listRoles = (params?: Record<string, unknown>) =>
  get<PaginatedResult<Role>>('/organization/roles', params)
export const createRole = (data: Partial<Role>) =>
  post<Role>('/organization/roles', data)
export const getRole = (id: string) =>
  get<Role>(`/organization/roles/${id}`)
export const updateRole = (id: string, data: Partial<Role>) =>
  put<Role>(`/organization/roles/${id}`, data)
export const deleteRole = (id: string) =>
  del<void>(`/organization/roles/${id}`)
export const getRolePermissions = (id: string) =>
  get<Permission[]>(`/organization/roles/${id}/permissions`)
export const assignRolePermissions = (id: string, data: { permission_ids: string[] }) =>
  put<void>(`/organization/roles/${id}/permissions`, data)

export const listPermissions = (params?: Record<string, unknown>) =>
  get<Permission[]>('/organization/permissions', params)
