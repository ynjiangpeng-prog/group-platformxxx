import { get, post, put, del } from '@/lib/http'

export const listSkills = (params?: Record<string, unknown>) =>
  get<Record<string, unknown>>('/agent/skills', params)

export const createSkill = (data: Record<string, unknown>) =>
  post<Record<string, unknown>>('/agent/skills', data)

export const getSkill = (id: string) =>
  get<Record<string, unknown>>(`/agent/skills/${id}`)

export const updateSkill = (id: string, data: Record<string, unknown>) =>
  put<Record<string, unknown>>(`/agent/skills/${id}`, data)

export const deleteSkill = (id: string) =>
  del<Record<string, unknown>>(`/agent/skills/${id}`)

export const executeSkill = (id: string, parameters?: Record<string, unknown>) =>
  post<Record<string, unknown>>(`/agent/skills/${id}/execute`, { parameters })

export const listTasks = (params?: Record<string, unknown>) =>
  get<Record<string, unknown>>('/agent/tasks', params)

export const getTask = (id: string) =>
  get<Record<string, unknown>>(`/agent/tasks/${id}`)

export const saveMemory = (data: Record<string, unknown>) =>
  post<Record<string, unknown>>('/agent/memories', data)

export const getContext = () =>
  get<Record<string, unknown>>('/agent/context')

export const chat = (message: string, history?: Record<string, unknown>[]) =>
  post<Record<string, unknown>>('/agent/chat', { message, history })
