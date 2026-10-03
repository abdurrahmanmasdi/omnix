'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { axiosInstance } from '@/lib/api/axios-client';
import { resetSession } from '@/lib/session-manager';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useInboxText } from '@/features/inbox/i18n';
import { Loader2 } from 'lucide-react';

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const router = useRouter();
  const { t } = useInboxText();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { accessToken, user } = useAuthStore();
  const [hasHydrated, setHasHydrated] = useState(false);

  // Wait for auth to hydrate (or trigger refresh)
  useEffect(() => {
    let mounted = true;
    async function initAuth() {
      if (!accessToken) {
        try {
          // This will trigger a 401, which axios interceptor will catch and attempt a silent refresh
          await axiosInstance.get('/auth/me');
        } catch {
          if (mounted) router.push('/login');
        }
      }
      if (mounted) setHasHydrated(true);
    }
    
    // Only attempt refresh if we haven't hydrated yet and have no token
    if (!hasHydrated && !accessToken) {
      initAuth();
    } else if (!hasHydrated && accessToken) {
      setHasHydrated(true);
    }
    
    return () => { mounted = false; };
  }, [accessToken, hasHydrated, router]);

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
      {sidebarOpen && <button className="fixed inset-0 z-30 bg-black/50 md:hidden" aria-label={t('close')} onClick={() => setSidebarOpen(false)} />}
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
        <Header onLogout={handleLogout} onMenu={() => setSidebarOpen(old => !old)} menuOpen={sidebarOpen} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
