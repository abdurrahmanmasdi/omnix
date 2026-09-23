import re

file = "src/components/layout/DashboardShell.tsx"
with open(file, "r") as f:
    content = f.read()

old_use_effect = """  // Wait for Zustand to hydrate from localStorage
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
  }, [hasHydrated, accessToken, user, router]);"""

new_use_effect = """  // Wait for auth to hydrate (or trigger refresh)
  useEffect(() => {
    let mounted = true;
    async function initAuth() {
      if (!accessToken) {
        try {
          // This will trigger a 401, which axios interceptor will catch and attempt a silent refresh
          await axiosInstance.get('/auth/me');
        } catch (err) {
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
  }, [hasHydrated, accessToken, user, router]);"""

content = content.replace(old_use_effect, new_use_effect)

with open(file, "w") as f:
    f.write(content)
