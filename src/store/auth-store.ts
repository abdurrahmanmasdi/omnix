import { create } from 'zustand';

interface User {
  id: string;
  firstName?: string;
  lastName?: string;
  organizationId: string | null;
  hasCompletedOnboarding: boolean;
}

interface AuthState {
  accessToken: string | null;
  user: User | null;
  setAuth: (accessToken: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: null,
  user: null,
  setAuth: (accessToken, user) => set({ accessToken, user }),
  logout: () => set({ accessToken: null, user: null }),
}));