'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  LogOut, 
  MessageSquare, 
  LayoutDashboard, 
  Settings, 
  Users, 
  ChevronDown,
  Target,
  FileText,
  Briefcase,
} from 'lucide-react';

interface SidebarProps {
  user: { firstName?: string; lastName?: string };
  onLogout: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  matchPath: string;
  children?: NavItem[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: <LayoutDashboard className="mr-2 h-4 w-4" />, matchPath: '/dashboard' },
  { href: '/dashboard/leads', label: 'Leads', icon: <Users className="mr-2 h-4 w-4" />, matchPath: '/leads' },
  { href: '/dashboard/conversations', label: 'Conversations', icon: <MessageSquare className="mr-2 h-4 w-4" />, matchPath: '/conversations' },
  { 
    href: '/dashboard/settings', 
    label: 'Settings', 
    icon: <Settings className="mr-2 h-4 w-4" />, 
    matchPath: '/settings',
    children: [
      { href: '/dashboard/settings/lead-sources', label: 'Lead Sources', icon: <Target className="mr-2 h-3.5 w-3.5" />, matchPath: '/settings/lead-sources' },
      { href: '/dashboard/settings/experiences', label: 'Experiences', icon: <Briefcase className="mr-2 h-3.5 w-3.5" />, matchPath: '/settings/experiences' },
      { href: '/dashboard/settings/documents', label: 'Documents', icon: <FileText className="mr-2 h-3.5 w-3.5" />, matchPath: '/settings/documents' },
    ],
  },
];

export function Sidebar({ user, onLogout }: SidebarProps) {
  const pathname = usePathname();

  // Auto-expand settings if we're currently on a settings page
  const [settingsOpen, setSettingsOpen] = useState(pathname.includes('/settings'));

  const isActive = (item: NavItem) => {
    if (item.href === '/dashboard') return pathname === '/dashboard';
    return pathname.includes(item.matchPath);
  };

  const isExactActive = (item: NavItem) => {
    return pathname === item.href;
  };

  return (
    <aside className="w-64 border-r bg-white flex flex-col shrink-0">
      {/* Brand */}
      <div className="flex h-16 items-center px-6 border-b">
        <span className="text-lg font-bold">Lean Commerce</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {NAV_ITEMS.map((item) => {
          // If the item has children, render it as a collapsible group
          if (item.children) {
            return (
              <div key={item.href}>
                <Button
                  variant={isActive(item) ? 'secondary' : 'ghost'}
                  className="w-full justify-between"
                  onClick={() => setSettingsOpen((prev) => !prev)}
                >
                  <span className="flex items-center">
                    {item.icon}
                    {item.label}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${settingsOpen ? 'rotate-180' : ''}`} />
                </Button>

                {/* Sub-items */}
                <div className={`overflow-hidden transition-all duration-200 ${settingsOpen ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                  <div className="ml-4 pl-3 border-l border-slate-200 space-y-0.5">
                    {item.children.map((child) => (
                      <Link key={child.href} href={child.href}>
                        <Button
                          variant={isExactActive(child) ? 'secondary' : 'ghost'}
                          size="sm"
                          className="w-full justify-start h-9 text-[13px]"
                        >
                          {child.icon}
                          {child.label}
                        </Button>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          }

          // Regular nav item
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive(item) ? 'secondary' : 'ghost'}
                className="w-full justify-start"
              >
                {item.icon}
                {item.label}
              </Button>
            </Link>
          );
        })}
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
