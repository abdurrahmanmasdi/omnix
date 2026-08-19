'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth-store';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ChevronRight,
  LogOut,
  User,
  Settings,
  ChevronsUpDown,
} from 'lucide-react';

interface HeaderProps {
  onLogout: () => void;
}

// ─── Breadcrumb Generator ───────────────────────────────
const LABEL_MAP: Record<string, string> = {
  dashboard: 'Dashboard',
  leads: 'Leads',
  conversations: 'Conversations',
  pipeline: 'Pipeline',
  settings: 'Settings',
  'lead-sources': 'Lead Sources',
  'pipeline-stages': 'Pipeline Stages',
  experiences: 'Experiences',
  documents: 'Documents',
  notifications: 'Notifications',
};

function useBreadcrumbs() {
  const pathname = usePathname();

  return useMemo(() => {
    const segments = pathname
      .replace('/dashboard', '')
      .split('/')
      .filter(Boolean);

    const crumbs = [{ label: 'Dashboard', href: '/dashboard' }];

    let path = '/dashboard';
    for (const seg of segments) {
      path += `/${seg}`;
      crumbs.push({
        label: LABEL_MAP[seg] || seg.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        href: path,
      });
    }

    return crumbs;
  }, [pathname]);
}

export function Header({ onLogout }: HeaderProps) {
  const user = useAuthStore((s) => s.user);
  const breadcrumbs = useBreadcrumbs();
  const pageTitle = breadcrumbs[breadcrumbs.length - 1]?.label || 'Dashboard';

  return (
    <header className="h-16 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl flex items-center justify-between px-8 shrink-0">
      {/* Left: Breadcrumbs */}
      <div className="flex items-center space-x-1 min-w-0">
        {breadcrumbs.map((crumb, i) => {
          const isLast = i === breadcrumbs.length - 1;
          return (
            <div key={crumb.href} className="flex items-center">
              {i > 0 && (
                <ChevronRight className="h-3.5 w-3.5 text-slate-300 mx-1.5 shrink-0" />
              )}
              {isLast ? (
                <span className="text-sm font-bold text-slate-900 truncate">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors truncate"
                >
                  {crumb.label}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center space-x-2">
        {/* Notification Bell */}
        <NotificationBell />

        {/* User Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-10 px-2 rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-2"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-slate-900 text-white text-xs font-bold">
                  {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0) || ''}
                </AvatarFallback>
              </Avatar>
              <div className="hidden lg:flex flex-col items-start">
                <span className="text-sm font-bold text-slate-800 leading-none">
                  {user?.firstName} {user?.lastName}
                </span>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 hidden lg:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-56 shadow-2xl border-slate-200 rounded-xl p-2"
          >
            <DropdownMenuLabel className="px-3 py-2">
              <p className="text-sm font-bold text-slate-900">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-slate-400 font-medium mt-0.5">Administrator</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="my-1 bg-slate-100" />
            <DropdownMenuItem className="rounded-lg font-medium text-slate-700 py-2.5 cursor-pointer">
              <User className="mr-3 h-4 w-4 text-slate-400" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              className="rounded-lg font-medium text-slate-700 py-2.5 cursor-pointer"
              onClick={() => {
                window.location.href = '/dashboard/settings/lead-sources';
              }}
            >
              <Settings className="mr-3 h-4 w-4 text-slate-400" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1 bg-slate-100" />
            <DropdownMenuItem
              className="rounded-lg font-medium text-red-600 focus:text-red-600 focus:bg-red-50 py-2.5 cursor-pointer"
              onClick={onLogout}
            >
              <LogOut className="mr-3 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
