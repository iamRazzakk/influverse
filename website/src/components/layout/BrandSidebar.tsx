'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from '@/components/shared/Logo';
import { useAuth } from '@/lib/session/AuthProvider';
import { useRealtime } from '@/lib/realtime/RealtimeProvider';
import { AccountAvatar } from '@/components/auth/AccountAvatar';
import type { BrandProfile } from '@/types/api';
import { message } from 'antd';
import {
  LayoutDashboard,
  Bookmark,
  Layers,
  PlusCircle,
  MessageSquare,
  CreditCard,
  Settings,
  LogOut,
  Scale,
} from 'lucide-react';

export function BrandSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, profile, signOut } = useAuth();
  const brandProfile = profile as BrandProfile | null;

  // Orders APIs are not built yet (Phase 3) — those badges stay hidden until then.
  const activeCampaignsCount = 0;
  const openDisputesCount = 0;
  // Live via the `chat:unread` socket event (src/lib/realtime/RealtimeProvider.tsx).
  const { chatUnread: unreadMessagesCount } = useRealtime();

  const handleLogout = async () => {
    await signOut();
    message.success('Signed out successfully');
    router.push('/login');
  };

  const navItems = [
    {
      name: 'Overview',
      href: '/brand/dashboard',
      icon: LayoutDashboard,
    },
    {
      name: 'Campaigns',
      href: '/brand/campaigns',
      icon: Layers,
    },
    {
      name: 'Disputes',
      href: '/brand/disputes',
      icon: Scale,
      badge: openDisputesCount > 0 ? openDisputesCount : undefined,
    },
    {
      name: 'New Campaign',
      href: '/brand/hire/new',
      icon: PlusCircle,
    },
    {
      name: 'Messages',
      href: '/brand/messages',
      icon: MessageSquare,
      badge: unreadMessagesCount,
    },
    {
      name: 'Saved',
      href: '/brand/saved',
      icon: Bookmark,
    },
    {
      name: 'Payments',
      href: '/brand/payments',
      icon: CreditCard,
    },
    {
      name: 'Settings',
      href: '/brand/settings',
      icon: Settings,
    },
  ];

  return (
    <aside className="flex h-full w-full flex-col justify-between border-r border-[#E7E7E2] bg-white font-sans">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-[#E7E7E2]">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <Logo size="sm" />
          </Link>
        </div>

        {/* Navigation Items */}
        <nav className="p-4 space-y-1.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/brand/dashboard' && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm leading-[20px] font-bold transition-all ${
                  isActive
                    ? 'bg-[#0A0A0A] text-white shadow-sm'
                    : 'text-[#555550] hover:text-[#0A0A0A] hover:bg-[#F4F4F0]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-[#66665E]'}`} />
                  <span>{item.name}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-black flex items-center justify-center transition-all ${
                      isActive ? 'bg-white text-[#0A0A0A]' : 'bg-[#0A0A0A] text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Standard Sidebar User Footer */}
      <div className="border-t border-[#E7E7E2] p-3">
        <div className="flex items-center justify-between p-2 rounded-lg bg-[#FAFAF8] hover:bg-white border border-[#E7E7E2] hover:border-[#0A0A0A] transition-all group">
          <Link
            href="/brand/settings"
            className="flex items-center gap-2.5 min-w-0 flex-1 pr-1.5 cursor-pointer"
            title="Account Settings"
          >
            <AccountAvatar src={brandProfile?.logo || currentUser?.avatar} name={brandProfile?.companyName || currentUser?.name} />
            <div className="overflow-hidden min-w-0 flex-1">
              <div className="text-sm font-bold text-[#0A0A0A] group-hover:text-zinc-600 transition-colors truncate">
                {currentUser?.name}
              </div>
              <div className="text-sm text-[#66665E] font-medium truncate">
                {brandProfile?.companyName || 'Your brand'}
              </div>
            </div>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            title="Sign Out"
            className="w-8 h-8 rounded-lg text-[#66665E] hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
