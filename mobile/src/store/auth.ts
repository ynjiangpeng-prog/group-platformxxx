import { createStore } from 'zustand/vanilla'

interface AuthState {
  token: string | null
  user: { id: string; username: string; real_name?: string; company_id: string } | null
  setAuth: (token: string, user: AuthState['user']) => void
  logout: () => void
}

export const tokenStore = createStore<AuthState>((set) => ({
  token: null,
  user: null,
  setAuth: (token, user) => set({ token, user }),
  logout: () => set({ token: null, user: null }),
}))
