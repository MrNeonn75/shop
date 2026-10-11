import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { env } from '../config/env';
import { useSessionStore } from '../stores/sessionStore';
import { CustomRequestConfig } from './types';
import { normalizeApiError } from './errors';

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export const httpClient: AxiosInstance = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request Interceptor
httpClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const customConfig = config as InternalAxiosRequestConfig & CustomRequestConfig;

    // 1. Auth token injection
    if (!customConfig.skipAuth) {
      const token = useSessionStore.getState().token;
      if (token) {
        customConfig.headers.Authorization = `Bearer ${token}`;
      }
    }

    // 2. Idempotency-Key injection for POST/PUT on critical transactions (sales, payments, orders)
    const method = customConfig.method?.toUpperCase();
    const url = customConfig.url || '';
    const isStateMutation = method === 'POST' || method === 'PUT' || method === 'PATCH';
    const isCriticalTransaction =
      url.includes('/sales') ||
      url.includes('/payments') ||
      url.includes('/orders') ||
      customConfig.idempotent === true;

    if (isStateMutation && isCriticalTransaction && !customConfig.skipIdempotency) {
      if (!customConfig.headers['Idempotency-Key']) {
        customConfig.headers['Idempotency-Key'] = generateIdempotencyKey();
      }
    }

    return customConfig;
  },
  (error) => Promise.reject(normalizeApiError(error))
);

// Response Interceptor
httpClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & CustomRequestConfig) | undefined;

    // If 401 Unauthorized and not already retrying
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (newToken: string) => {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(httpClient(originalRequest));
            },
            reject: (err: unknown) => {
              reject(normalizeApiError(err));
            },
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const currentRefreshToken = useSessionStore.getState().refreshToken;

      if (!currentRefreshToken) {
        useSessionStore.getState().clearSession();
        isRefreshing = false;
        return Promise.reject(normalizeApiError(error));
      }

      try {
        const refreshResponse = await axios.post<{
          token: string;
          refreshToken?: string;
        }>(`${env.VITE_API_BASE_URL}/auth/refresh`, {
          refreshToken: currentRefreshToken,
        });

        const { token: newToken, refreshToken: newRefreshToken } = refreshResponse.data;
        const currentUser = useSessionStore.getState().user;

        if (currentUser) {
          useSessionStore.getState().setSession(currentUser, newToken, newRefreshToken || currentRefreshToken);
        }

        processQueue(null, newToken);

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return httpClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        useSessionStore.getState().clearSession();
        return Promise.reject(normalizeApiError(refreshError));
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(normalizeApiError(error));
  }
);

/**
 * Helper to create an AbortController for request cancellation.
 */
export function createAbortController(): AbortController {
  return new AbortController();
}

