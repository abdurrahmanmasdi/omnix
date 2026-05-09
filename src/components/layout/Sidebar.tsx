'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LogOut, MessageSquare, LayoutDashboard, Settings, Users } from 'lucide-react';

interface SidebarProps {
  user: { firstName?: string; lastName?: string };
  onLogout: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  matchPath: string; // used for active state detection
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: <LayoutDashboard className="mr-2 h-4 w-4" />, matchPath: '/dashboard' },
  { href: '/dashboard/leads', label: 'Leads', icon: <Users className="mr-2 h-4 w-4" />, matchPath: '/leads' },
  { href: '/dashboard/conversations', label: 'Conversations', icon: <MessageSquare className="mr-2 h-4 w-4" />, matchPath: '/conversations' },
  { href: '/dashboard/settings', label: 'Settings', icon: <Settings className="mr-2 h-4 w-4" />, matchPath: '/settings' },
];

export function Sidebar({ user, onLogout }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (item: NavItem) => {
    // Exact match for dashboard root, includes match for sub-routes
    if (item.href === '/dashboard') return pathname === '/dashboard';
    return pathname.includes(item.matchPath);
  };

  return (
    <aside className="w-64 border-r bg-white flex flex-col shrink-0">
      {/* Brand */}
      <div className="flex h-16 items-center px-6 border-b">
        <span className="text-lg font-bold">Lean Commerce</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href}>
            <Button
              variant={isActive(item) ? 'secondary' : 'ghost'}
              className="w-full justify-start"
            >
              {item.icon}
              {item.label}
            </Button>
          </Link>
        ))}
      </nav>

      {/* User Profile & Logout */}
      <div className="p-4 border-t flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Avatar>
            <AvatarFallback>
              {user.firstName?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="text-sm font-medium leading-none">
            {user.firstName}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onLogout}
          title="Log out"
        >
          <LogOut className="h-4 w-4 text-slate-500" />
        </Button>
      </div>
    </aside>
  );
}
