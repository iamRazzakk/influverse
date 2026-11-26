'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from '@/components/shared/Logo';
import { useAuth } from '@/lib/session/AuthProvider';
import { useRealtime } from '@/lib/realtime/RealtimeProvider';
import { AccountAvatar } from '@/components/auth/AccountAvatar';
import type { CreatorProfile } from '@/types/api';
import { message } from 'antd';
import {
  LayoutDashboard,
  Layers,
  Package,
  Film,
  MessageSquare,
  CreditCard,
  Settings,
  LogOut,
  User,
  Scale,
} from 'lucide-react';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';

export function CreatorSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, profile, signOut } = useAuth();
  const creatorProfile = profile as CreatorProfile | null;

  const creatorName = currentUser?.name || 'Creator';
  const creatorHandle = creatorProfile?.handle ? `@${creatorProfile.handle}` : '';
  const isVerified = Boolean(creatorProfile?.verified);

  const handleLogout = async () => {
    await signOut();
    message.success('Signed out successfully');
    router.push('/login');
  };

  // Orders APIs are not built yet (Phase 3) — those badges stay hidden until then.
  // Pending brand offers: refreshed when an offer notice arrives over the socket.
  const { pendingOffers: pendingOffersCount, chatUnread: unreadMessagesCount } = useRealtime();
  const activeOrdersCount = 0;
  const openDisputesCount = 0;
  // Live via the `chat:unread` socket event (src/lib/realtime/RealtimeProvider.tsx).

  const navItems = [
    {
      name: 'Overview',
      href: '/creator/dashboard',
      icon: LayoutDashboard,
    },
    {
      name: 'Profile',
      href: '/creator/profile',
      icon: User,
    },
    {
      name: 'Portfolio',
      href: '/creator/portfolio',
      icon: Film,
    },
    {
      name: 'Packages',
      href: '/creator/packages',
      icon: Package,
    },
    {
      name: 'Campaigns',
      href: '/creator/campaigns',
      icon: Layers,
    },
    {
      name: 'Disputes',
      href: '/creator/disputes',
      icon: Scale,
      badge: openDisputesCount > 0 ? openDisputesCount : undefined,
    },
    {
      name: 'Messages',
      href: '/creator/messages',
      icon: MessageSquare,
      badge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined,
    },
    {
      name: 'Payouts',
      href: '/creator/payments',
      icon: CreditCard,
    },
    {
      name: 'Settings',
      href: '/creator/settings',
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
            const isActive = pathname === item.href || (item.href !== '/creator/dashboard' && pathname.startsWith(item.href));
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
                {item.badge !== undefined && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-extrabold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-[#EAEAE3] text-[#0A0A0A]'
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
            href="/creator/profile"
            className="flex items-center gap-2.5 min-w-0 flex-1 pr-1.5 cursor-pointer"
            title="View Profile"
          >
            <div className="relative shrink-0">
              <AccountAvatar src={currentUser?.avatar} name={creatorName} />
              {isVerified && <VerifiedBadge className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5" />}
            </div>
            <div className="overflow-hidden min-w-0 flex-1">
              <div className="text-sm font-bold text-[#0A0A0A] group-hover:text-zinc-600 transition-colors truncate">
                {creatorName}
              </div>
              <div className="text-sm text-[#66665E] font-medium truncate">
                {creatorHandle || 'Finish your profile'}
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
