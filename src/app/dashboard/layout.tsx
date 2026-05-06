"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { axiosInstance } from "@/lib/api/axios-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, MessageSquare, LayoutDashboard, Settings } from "lucide-react"; // Make sure to npm install lucide-react if you haven't!

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, user, logout } = useAuthStore();
  const [hasHydrated, setHasHydrated] = useState(false);

  // 1. Wait for Next.js to mount and Zustand to hydrate from localStorage
  useEffect(() => {
    // 🚀 Wrapping it in a timeout pushes it to the next tick, satisfying the React linter
    const timer = setTimeout(() => {
      setHasHydrated(true);
    }, 0);

    // Cleanup function
    return () => clearTimeout(timer);
  }, []);

  // 1. Route Protection Logic
  useEffect(() => {
    if (hasHydrated) {
      if (!accessToken) {
        router.push("/login");
      } else if (!user?.hasCompletedOnboarding) {
        router.push("/onboarding/create-organization");
      }
    }
  }, [hasHydrated, accessToken, user, router]);

  // Prevent hydration mismatch and hide content until auth is verified
  if (!hasHydrated || !accessToken || !user?.hasCompletedOnboarding) {
    return (
      <div className="flex h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  const handleLogout = async () => {
    try {
      // Call the backend to destroy the HttpOnly cookie
      await axiosInstance.post("/auth/logout");
    } catch (e) {
      console.error("Logout failed on server", e);
    } finally {
      // Wipe Zustand and redirect
      logout();
      router.push("/login");
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-white flex flex-col">
        <div className="flex h-16 items-center px-6 border-b">
          <span className="text-lg font-bold">Lean Commerce</span>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          <Link href="/dashboard">
            <Button
              variant={pathname === "/dashboard" ? "secondary" : "ghost"}
              className="w-full justify-start"
            >
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Overview
            </Button>
          </Link>
          <Link href="/dashboard/conversations">
            <Button
              variant={
                pathname.includes("/conversations") ? "secondary" : "ghost"
              }
              className="w-full justify-start"
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Conversations
            </Button>
          </Link>
          <Link href="/dashboard/settings">
            <Button
              variant={pathname.includes("/settings") ? "secondary" : "ghost"}
              className="w-full justify-start"
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </Link>
        </nav>

        {/* User Profile & Logout at the bottom */}
        <div className="p-4 border-t flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Avatar>
              <AvatarFallback>
                {user.firstName?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="text-sm font-medium leading-none">
              {user.firstName}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            title="Log out"
          >
            <LogOut className="h-4 w-4 text-slate-500" />
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
