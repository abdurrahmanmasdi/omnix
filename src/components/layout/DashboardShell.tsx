'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { axiosInstance } from '@/lib/api/axios-client';
import { Sidebar } from '@/components/layout/Sidebar';

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const router = useRouter();
  const { accessToken, user, logout } = useAuthStore();
  const [hasHydrated, setHasHydrated] = useState(false);

  // Wait for Zustand to hydrate from localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      setHasHydrated(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Route protection
  useEffect(() => {
    if (hasHydrated) {
      if (!accessToken) {
        router.push('/login');
      } else if (!user?.hasCompletedOnboarding) {
        router.push('/onboarding/create-organization');
      }
    }
  }, [hasHydrated, accessToken, user, router]);

  const handleLogout = useCallback(async () => {
    try {
      await axiosInstance.post('/auth/logout');
    } catch (e) {
      console.error('Logout failed on server', e);
    } finally {
      logout();
      router.push('/login');
    }
  }, [logout, router]);

  // Loading / auth guard
  if (!hasHydrated || !accessToken || !user?.hasCompletedOnboarding) {
    return (
      <div className="flex h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
