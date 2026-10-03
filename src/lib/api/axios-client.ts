import axios, { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import type { AxiosError } from "axios";
import { useAuthStore } from "@/store/auth-store";
import { getSessionGeneration } from "@/lib/session-scope";
import { resetSession } from "@/lib/session-manager";
import { API_URL, refreshAccessToken } from "@/lib/api/token-refresh";

// Extend Axios config to carry session generation (internal, not sent as a header)
declare module "axios" {
  interface InternalAxiosRequestConfig {
    __sessionGeneration?: number;
    _retry?: boolean;
  }
}

// 1. Create the central Axios instance
export const axiosInstance = axios.create({
  // Point this to your NestJS backend URL
  baseURL: API_URL,
  // Crucial for sending/receiving HttpOnly cookies (like our refresh_token)
  withCredentials: true,
});

// 2. Request Interceptor
// Stamps each request with the current session generation and attaches
// the Bearer token if available. Does NOT reject tokenless requests —
// login and signup use this same instance.
axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Stamp session generation so the response interceptor can detect stale responses
  config.__sessionGeneration = getSessionGeneration();

  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// 3. Response Interceptor
axiosInstance.interceptors.response.use(
  (response) => {
    // Reject responses from a prior session generation
    const requestGeneration = (response.config as InternalAxiosRequestConfig)
      .__sessionGeneration;
    if (
      requestGeneration !== undefined &&
      requestGeneration !== getSessionGeneration()
    ) {
      throw new axios.CanceledError("Stale session response");
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig;

    // If the error is 401 (Unauthorized) and we haven't retried yet...
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/login") &&
      !originalRequest.url?.includes("/auth/refresh")
    ) {
      originalRequest._retry = true; // Prevent infinite loops

      try {
        // 1+2. One shared refresh for all concurrent 401s (and the socket); it
        // installs the new session through the session manager.
        const access_token = await refreshAccessToken();

        // 3. Update the failed request with the brand new token and generation
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }
        originalRequest.__sessionGeneration = getSessionGeneration();

        // 4. Retry the exact request that just failed!
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        // If the refresh fails (e.g., refresh token expired after 7 days)
        console.error("Session completely expired. Logging out.");
        resetSession();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);

// 4. The custom fetcher function that Orval will use to wrap all requests
export const customFetch = async <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  const { data } = await axiosInstance({
    ...config,
    ...options,
  });
  return data;
};
