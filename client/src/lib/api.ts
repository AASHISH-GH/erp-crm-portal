import axios, { AxiosError } from 'axios';

const TOKEN_KEY = 'erp_crm_token';
const USER_KEY = 'erp_crm_user';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export const userStore = {
  get: <T>(): T | null => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  },
  set: (user: unknown) => localStorage.setItem(USER_KEY, JSON.stringify(user)),
};

// In dev, Vite proxies /api to the API server. In production the deployed API's origin
// is injected at build time.
export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ''}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    // An expired or invalid token means the session is unusable — drop it and bounce
    // to login rather than letting every subsequent page render an error.
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      tokenStore.clear();
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }> | Record<string, unknown>;
  };
}

/** Turns any axios failure into a single human-readable line for the UI. */
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const body = error.response?.data;
    if (body?.error) {
      const details = body.error.details;
      if (Array.isArray(details) && details.length > 0) {
        return details.map((item) => `${item.field}: ${item.message}`).join(' · ');
      }
      return body.error.message;
    }
    if (error.code === 'ERR_NETWORK') {
      return 'Cannot reach the API. Is the server running?';
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong';
};

export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: unknown;
}
