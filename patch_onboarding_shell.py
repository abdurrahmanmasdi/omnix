import re

file = "src/app/onboarding/layout.tsx"
with open(file, "r") as f:
    content = f.read()

new_layout = """'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { axiosInstance } from '@/lib/api/axios-client';
import { Loader2 } from 'lucide-react';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function initAuth() {
      if (!accessToken) {
        try {
          await axiosInstance.get('/auth/me');
        } catch (err) {
          if (mounted) router.push('/login');
        }
      }
      if (mounted) setHasHydrated(true);
    }
    
    if (!hasHydrated && !accessToken) {
      initAuth();
    } else if (!hasHydrated && accessToken) {
      setHasHydrated(true);
    }
    
    return () => { mounted = false; };
  }, [accessToken, hasHydrated, router]);

  if (!hasHydrated || !accessToken) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-800">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-slate-600">Verifying session...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}"""

content = new_layout

with open(file, "w") as f:
    f.write(content)
