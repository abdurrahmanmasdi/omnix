import axios, { AxiosRequestConfig } from "axios";
import type { AxiosError } from "axios";
import { useAuthStore } from "@/store/auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// 1. Create the central Axios instance
export const axiosInstance = axios.create({
  // Point this to your NestJS backend URL
  baseURL: API_URL,
  // Crucial for sending/receiving HttpOnly cookies (like our refresh_token)
  withCredentials: true,
});

// 2. Add Global Interceptors (You can expand this later!)
axiosInstance.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean;
    };

    // If the error is 401 (Unauthorized) and we haven't retried yet...
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      originalRequest._retry = true; // Prevent infinite loops

      try {
        // 1. Call our refresh endpoint using standard axios (not our instance) to avoid loops
        const refreshResponse = await axios.post(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true }, // Crucial: Sends the hidden refresh_token cookie
        );

        const { access_token, user } = refreshResponse.data;

        // 2. Update Zustand globally!
        useAuthStore.getState().setAuth(access_token, user);

        // 3. Update the failed request with the brand new token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }

        // 4. Retry the exact request that just failed!
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        // If the refresh fails (e.g., refresh token expired after 7 days)
        console.error("Session completely expired. Logging out.");
        useAuthStore.getState().logout();
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = "/login"; // Force them to the login screen
        }
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);

// 3. The custom fetcher function that Orval will use to wrap all requests
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
