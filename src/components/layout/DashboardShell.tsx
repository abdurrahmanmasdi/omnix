'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { axiosInstance } from '@/lib/api/axios-client';
import { resetSession } from '@/lib/session-manager';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { Loader2 } from 'lucide-react';

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const router = useRouter();
  const { accessToken, user } = useAuthStore();
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
      // Always clear patient data, even if server logout failed/timed out
      await resetSession();
    }
  }, []);

  // Loading / auth guard
  if (!hasHydrated || !accessToken || !user?.hasCompletedOnboarding) {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-navy text-brand-ice">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-brand-glow" />
          <p className="text-sm font-medium text-brand-ice/60">Initializing secure session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-brand-navy text-brand-ice selection:bg-brand-electric/30 font-inter">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onLogout={handleLogout} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
