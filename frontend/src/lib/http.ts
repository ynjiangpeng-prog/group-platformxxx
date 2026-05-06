import axios from "axios";
import type { AxiosRequestConfig } from "axios";
import { toast } from "sonner";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "/api/v1",
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (error) p.reject(error);
    else if (token) p.resolve(token);
  });
  failedQueue = [];
}

client.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem("refresh_token");

      if (!refreshToken) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(client(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const resp = await axios.post(`${client.defaults.baseURL || ''}/auth/refresh`, {
          refresh_token: refreshToken,
        });
        const data = resp.data
        const newToken = data.access_token ?? data.token;
        localStorage.setItem("access_token", newToken);
        if (data.refresh_token) {
          localStorage.setItem("refresh_token", data.refresh_token);
        }
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return client(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    let msg = error.response?.data?.message ?? error.response?.data?.msg ?? null;
    if (!msg && error.response?.status === 422 && Array.isArray(error.response?.data?.detail)) {
      msg = error.response.data.detail.map((d: any) => d.msg ?? `${d.loc?.join('.')}: ${d.type}`).join('; ');
    }
    msg = msg ?? error.message ?? "请求失败";
    toast.error(msg);
    return Promise.reject(error);
  },
);

export function get<T>(url: string, params?: Record<string, unknown>, config?: AxiosRequestConfig): Promise<T> {
  return client.get(url, { params, ...config });
}

export function post<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  return client.post(url, data, config);
}

export function put<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  return client.put(url, data, config);
}

export function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return client.delete(url, config);
}
