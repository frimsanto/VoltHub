import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth";
import { APP_VERSION, getPlatform } from "@/lib/appVersion";
import { captureError } from "@/lib/sentry";

// Set by the 426 handler so the app can render a blocking "please update" screen.
let forceUpdateListener: (() => void) | null = null;
export function onForceUpdate(cb: () => void): void {
  forceUpdateListener = cb;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT || "30000", 10);
const isDevelopment = import.meta.env.MODE === "development";

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
  },
});

// Aborts every in-flight request that didn't bring its own signal. Wired to
// logout() so a slow response can't land — and touch cleared auth state —
// after the user has already been redirected to /login. A fired
// AbortController can't be reused, so we swap in a fresh one each time.
let logoutAbortController = new AbortController();
export function abortPendingRequests(): void {
  logoutAbortController.abort();
  logoutAbortController = new AbortController();
}

// Request interceptor - add auth token & log
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Let callers opt out (e.g. logoutServer itself) by passing their own signal.
    if (!config.signal) {
      config.signal = logoutAbortController.signal;
    }

    // Version headers drive the backend force-update gate.
    config.headers["X-App-Version"] = APP_VERSION;
    config.headers["X-App-Platform"] = getPlatform();

    // Debug logging only in development
    if (isDevelopment) {
      console.log(`[API REQUEST] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, {
        headers: config.headers,
        data: config.data,
      });
    }

    return config;
  },
  (error) => {
    if (isDevelopment) {
      console.error("[API REQUEST ERROR]", error);
    }
    return Promise.reject(error);
  },
);

// Shared in-flight refresh so multiple parallel 401s trigger only ONE
// /auth/refresh call. Without this, each failed request fires its own refresh;
// if the backend rotates refresh tokens, the later calls fail and log the user
// out unexpectedly.
let refreshPromise: Promise<string> | null = null;

const refreshAccessToken = (): Promise<string> => {
  if (!refreshPromise) {
    const refreshToken = useAuthStore.getState().refreshToken;
    if (!refreshToken) {
      return Promise.reject(new Error("No refresh token"));
    }

    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refresh`, { refreshToken })
      .then((response) => {
        // Backend rotates refresh tokens: the response carries a NEW refresh
        // token (old one now revoked). Persist both, or the next refresh fails.
        const { accessToken, refreshToken: rotated } = response.data.data;
        useAuthStore.getState().setAccessToken(accessToken);
        if (rotated) {
          useAuthStore.getState().setRefreshToken(rotated);
        }
        return accessToken as string;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

// Response interceptor - handle errors & token refresh
apiClient.interceptors.response.use(
  (response) => {
    // Debug logging only in development
    if (isDevelopment) {
      console.log(
        `[API RESPONSE] ${response.config.method?.toUpperCase()} ${response.config.url}`,
        {
          status: response.status,
          data: response.data,
        },
      );
    }
    return response;
  },
  async (error: AxiosError) => {
    // Request was cancelled (e.g. abortPendingRequests() on logout) — not a
    // real failure, nothing to log or report.
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // 426 Upgrade Required — client too old. Trigger the blocking update screen.
    if (error.response?.status === 426) {
      forceUpdateListener?.();
      return Promise.reject(error);
    }

    // Debug logging for errors only in development
    if (isDevelopment) {
      console.error(
        `[API ERROR] ${originalRequest?.method?.toUpperCase()} ${originalRequest?.url}`,
        {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        },
      );
    }

    // Handle timeout errors
    if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
      if (isDevelopment) {
        console.error("[API TIMEOUT] Request took too long:", originalRequest?.url);
      }
      return Promise.reject(new Error("Request timeout. Server took too long to respond."));
    }

    // Don't redirect to login for login requests
    const isLoginRequest = originalRequest?.url?.includes("/auth/login");

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry && !isLoginRequest) {
      originalRequest._retry = true;

      try {
        // De-duplicated across all concurrent 401s (single /auth/refresh call).
        const accessToken = await refreshAccessToken();

        // Retry original request
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout user
        useAuthStore.getState().logout();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      if (isDevelopment) {
        console.error("Access forbidden:", error.response.data);
      }
    }

    // Handle 404 Not Found
    if (error.response?.status === 404) {
      if (isDevelopment) {
        console.error("Resource not found:", originalRequest?.url);
      }
    }

    // Handle 500 Server Error
    if (error.response?.status && error.response.status >= 500) {
      if (isDevelopment) {
        console.error("Server error:", error.response?.data);
      }
    }

    // Report server (5xx) and network/connection failures to Sentry. Client
    // (4xx) errors are expected/handled and intentionally NOT reported to avoid
    // noise. No-op when Sentry is disabled.
    const status = error.response?.status;
    if (!error.response || (status && status >= 500)) {
      captureError(error, {
        url: originalRequest?.url,
        method: originalRequest?.method,
        status,
      });
    }

    return Promise.reject(error);
  },
);

// Standardized API response type
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  error?: any;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

// Helper to handle API responses
export const handleResponse = <T>(response: { data: ApiResponse<T> }): T => {
  if (!response.data.success) {
    throw new Error(response.data.message || "API request failed");
  }
  return response.data.data;
};

// Helper to handle API errors
export const handleError = (error: AxiosError): string => {
  // Timeout error
  if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
    return "Request timeout. Server took too long to respond. Silakan coba lagi.";
  }

  // Network error (no response from server)
  if (!error.response) {
    if (error.code === "ECONNREFUSED" || error.message.includes("Network Error")) {
      return "Server tidak dapat dihubungi. Pastikan backend berjalan.";
    }
    return "Network error: Tidak dapat terhubung ke server";
  }

  // Server responded with error
  if (error.response?.data && typeof error.response.data === "object") {
    const data = error.response.data as ApiResponse<any>;
    return data.message || `Error ${error.response.status}: ${error.response.statusText}`;
  }

  // Handle specific status codes
  if (error.response?.status === 404) {
    return "Resource tidak ditemukan";
  }

  if (error.response?.status === 403) {
    return "Anda tidak memiliki akses ke resource ini";
  }

  if (error.response?.status >= 500) {
    return "Server error. Silakan coba lagi nanti";
  }

  return error.message || "Request failed";
};

export default apiClient;
