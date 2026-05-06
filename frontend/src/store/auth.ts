import { create } from "zustand";
import { get as httpGet, post } from "@/lib/http";
import * as authApi from "@/api/auth";

interface User {
  id: string | number;
  username: string;
  [key: string]: unknown;
}

interface AuthState {
  user: User | null;
  token: string | null;
  permissions: string[];
  loading: boolean;
  initialized: boolean;
  login: (username: string, password: string) => Promise<void>;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
  init: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem("access_token"),
  permissions: [],
  loading: false,
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    const token = get().token;
    if (token) {
      await get().fetchUser();
    }
    set({ initialized: true });
  },

  login: async (username, password) => {
    set({ loading: true });
    try {
      const res = await post<{
        access_token: string;
        refresh_token: string;
      }>("/auth/login", { username, password });
      localStorage.setItem("access_token", res.access_token);
      localStorage.setItem("refresh_token", res.refresh_token);
      set({ token: res.access_token });
      await get().fetchUser();
    } catch {
      set({ loading: false });
      throw new Error();
    }
  },

  fetchUser: async () => {
    set({ loading: true });
    try {
      const res = await httpGet("/auth/me") as Record<string, unknown>;
      set({
        user: {
          id: res.id as string,
          username: res.username as string,
          real_name: res.real_name as string,
          phone: res.phone as string,
          email: res.email as string,
          avatar_url: res.avatar_url as string,
          is_super_admin: res.is_super_admin as boolean,
          company_id: res.company_id as string,
          company_name: res.company_name as string,
          roles: res.roles,
        },
        permissions: (res.permissions as string[]) ?? [],
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  logout: async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    set({ user: null, token: null, permissions: [], loading: false, initialized: false });
    window.location.href = "/login";
  },

  hasPermission: (perm) => {
    return get().permissions.includes(perm);
  },
}));
