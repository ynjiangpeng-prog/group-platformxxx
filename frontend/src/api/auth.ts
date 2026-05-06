import { get, post, put } from '@/lib/http'
import type { User, TokenResponse } from './types'

export const login = (username: string, password: string) =>
  post<TokenResponse>('/auth/login', { username, password })

export const register = (username: string, password: string, real_name?: string, phone?: string) =>
  post<TokenResponse>('/auth/register', { username, password, real_name, phone })

export const refreshToken = (refresh_token: string) =>
  post<TokenResponse>('/auth/refresh', { refresh_token })

export const getMe = () =>
  get<User>('/auth/me')

export const logout = () =>
  post<Record<string, unknown>>('/auth/logout')

export const changePassword = (old_password: string, new_password: string) =>
  put<Record<string, unknown>>('/auth/change-password', { old_password, new_password })
