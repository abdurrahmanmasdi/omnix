'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Layers,
  BookOpen,
  Settings,
  ChevronDown,
  Target,
  FileText,
  Briefcase,
  Building2,
  Plug,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  matchPath: string;
  children?: NavItem[];
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Overview',
    icon: <LayoutDashboard className="mr-2.5 h-4 w-4" />,
    matchPath: '/dashboard',
  },
  {
    href: '/dashboard/leads',
    label: 'Leads',
    icon: <Users className="mr-2.5 h-4 w-4" />,
    matchPath: '/leads',
  },
  {
    href: '/dashboard/conversations',
    label: 'Conversations',
    icon: <MessageSquare className="mr-2.5 h-4 w-4" />,
    matchPath: '/conversations',
  },
  // {
  //   href: '/dashboard/knowledge-base',
  //   label: 'Knowledge Base',
  //   icon: <BookOpen className="mr-2.5 h-4 w-4" />,
  //   matchPath: '/knowledge-base',
  // },
  {
    href: '/dashboard/settings',
    label: 'Settings',
    icon: <Settings className="mr-2.5 h-4 w-4" />,
    matchPath: '/settings',
    children: [
      { href: '/dashboard/settings/lead-sources', label: 'Lead Sources', icon: <Target className="mr-2 h-3.5 w-3.5" />, matchPath: '/settings/lead-sources' },
      { href: '/dashboard/settings/pipeline-stages', label: 'Pipeline Stages', icon: <Layers className="mr-2 h-3.5 w-3.5" />, matchPath: '/settings/pipeline-stages' },
      { href: '/dashboard/settings/experiences', label: 'Experiences', icon: <Briefcase className="mr-2 h-3.5 w-3.5" />, matchPath: '/settings/experiences' },
      { href: '/dashboard/settings/channels', label: 'Channels', icon: <Plug className="mr-2 h-3.5 w-3.5" />, matchPath: '/settings/channels' },
      {
        href: '/dashboard/settings/documents',
        label: 'Documents',
        icon: <BookOpen className="mr-2.5 h-4 w-4" />,
        matchPath: '/settings/documents',
      },
      
    ],
  },
];

import { useAuthStore } from '@/store/auth-store';

export function Sidebar() {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(pathname.includes('/settings'));
  const user = useAuthStore((state) => state.user);

  const isActive = (item: NavItem) => {
    if (item.href === '/dashboard') return pathname === '/dashboard';
    return pathname.includes(item.matchPath);
  };

  const isExactActive = (item: NavItem) => pathname === item.href;

  return (
    <aside className="w-[260px] border-r border-white/5 bg-brand-navy flex flex-col shrink-0">
      {/* Brand */}
      <div className="flex h-16 items-center px-6 border-b border-white/5">
        <div className="flex items-center gap-3 w-full">
          <Image src="/full_logo.png" alt="OMNIX" width={140} height={40} className="object-contain" priority />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-3 overflow-y-auto">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-ice/40 px-3 pt-3 pb-2">
          Main Menu
        </p>
        {NAV_ITEMS.map((item) => {
          if (item.children) {
            return (
              <div key={item.href}>
                <Button
                  variant="ghost"
                  className={`w-full justify-between h-10 rounded-xl text-[13px] font-semibold transition-all ${
                    isActive(item) 
                      ? 'bg-brand-electric/10 text-brand-cyan hover:bg-brand-electric/20 hover:text-brand-glow' 
                      : 'text-brand-ice/70 hover:bg-transparent/5 hover:text-brand-ice'
                  }`}
                  onClick={() => setSettingsOpen((prev) => !prev)}
                >
                  <span className="flex items-center">
                    {item.icon}
                    {item.label}
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                      settingsOpen ? 'rotate-180' : ''
                    }`}
                  />
                </Button>

                <div
                  className={`overflow-hidden transition-all duration-200 ${
                    settingsOpen ? 'max-h-96 opacity-100 mt-0.5' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="ml-5 pl-3 border-l-2 border-white/5 space-y-0.5 py-0.5">
                    {item.children.map((child) => (
                      <Link key={child.href} href={child.href}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`w-full justify-start h-8 text-[12px] font-medium rounded-lg transition-all ${
                            isExactActive(child)
                              ? 'bg-brand-electric/10 text-brand-cyan hover:bg-brand-electric/20 hover:text-brand-glow'
                              : 'text-brand-ice/70 hover:bg-transparent/5 hover:text-brand-ice'
                          }`}
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

          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant="ghost"
                className={`w-full justify-start h-10 rounded-xl text-[13px] font-semibold transition-all ${
                  isActive(item)
                    ? 'bg-brand-electric/10 text-brand-cyan hover:bg-brand-electric/20 hover:text-brand-glow'
                    : 'text-brand-ice/70 hover:bg-transparent/5 hover:text-brand-ice'
                }`}
              >
                {item.icon}
                {item.label}
              </Button>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-deep/30 overflow-hidden shrink-0 border border-brand-electric/20">
            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.firstName || 'user'}`} alt="Avatar" className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-semibold text-brand-ice truncate">
              {user?.firstName} {user?.lastName}
            </span>
            <p className="text-[11px] font-medium text-brand-ice/40 mt-0.5">OMNIX v2.0</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
