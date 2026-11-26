import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import { useAppSelector } from '@/store/hooks';
import { useLogoutMutation } from '@/lib/api/authApi';
import { useGetSupportUnreadCountQuery } from '@/lib/api/supportApi';
import { Avatar } from '@/components/ui/Avatar';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  ShoppingBag,
  Receipt,
  FileEdit,
  ShieldAlert,
  Settings,
  LifeBuoy,
  LogOut,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppLogo } from '@/components/shared/AppLogo';

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAppSelector((state) => state.auth.currentUser);
  const [logout] = useLogoutMutation();
  // Support threads with unread user messages. Every admin role has tickets.manage, so this never 403s.
  // Shares the cache entry with the Support page, which polls faster while it is open.
  const { data: unreadSupportChats = 0 } = useGetSupportUnreadCountQuery(undefined, {
    pollingInterval: 60_000,
    skipPollingIfUnfocused: true,
  });

  const navItems = [
    {
      label: 'Overview',
      path: ROUTES.DASHBOARD.OVERVIEW,
      icon: <LayoutDashboard className="w-[18px] h-[18px]" />,
    },
    {
      label: 'Users',
      path: ROUTES.DASHBOARD.USERS,
      icon: <Users className="w-[18px] h-[18px]" />,
    },
    {
      label: 'Verifications',
      path: ROUTES.DASHBOARD.VERIFICATION,
      icon: <ShieldCheck className="w-[18px] h-[18px]" />,
    },
    {
      label: 'Orders',
      path: ROUTES.DASHBOARD.ORDERS,
      icon: <ShoppingBag className="w-[18px] h-[18px]" />,
    },
    {
      label: 'Transactions',
      path: ROUTES.DASHBOARD.TRANSACTIONS,
      icon: <Receipt className="w-[18px] h-[18px]" />,
    },
    {
      label: 'Support',
      path: ROUTES.DASHBOARD.TICKETS,
      icon: <LifeBuoy className="w-[18px] h-[18px]" />,
      badge: unreadSupportChats > 0 ? unreadSupportChats : undefined,
    },
    {
      label: 'CMS',
      path: ROUTES.DASHBOARD.CMS,
      icon: <FileEdit className="w-[18px] h-[18px]" />,
    },
    {
      label: 'Team',
      path: ROUTES.DASHBOARD.TEAM,
      icon: <ShieldAlert className="w-[18px] h-[18px]" />,
    },
    {
      label: 'Settings',
      path: ROUTES.DASHBOARD.SETTINGS,
      icon: <Settings className="w-[18px] h-[18px]" />,
    },
  ];

  const handleLogout = async () => {
    await logout().unwrap().catch(() => undefined);
    navigate(ROUTES.AUTH.LOGIN);
  };

  return (
    <aside className="w-64 bg-white border-r border-neutral-200/80 flex flex-col h-screen shrink-0 sticky top-0">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-neutral-100">
        <div className="flex items-center gap-2.5">
          <AppLogo size="md" />
          <div>
            <div className="font-black text-sm tracking-tight text-neutral-950">
              INFLUVERSE
            </div>
            <p className="text-[10px] text-neutral-400 font-semibold">
              Dashboard
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 py-4 px-3 overflow-y-auto space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === ROUTES.DASHBOARD.OVERVIEW}
            className={({ isActive }) =>
              cn(
                'flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-bold transition-all duration-150 group',
                isActive
                  ? 'bg-brand-black text-white shadow-sm'
                  : 'text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100/80'
              )
            }
          >
            {({ isActive }) => (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={cn(
                      'transition-colors shrink-0',
                      isActive ? 'text-white' : 'text-neutral-400 group-hover:text-neutral-700'
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </div>

                {item.badge !== undefined && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-500 text-white leading-none">
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* User Footer Profile */}
      <div className="p-3 border-t border-neutral-100 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar
            src={currentUser?.avatar}
            name={currentUser?.name}
            size="sm"
            statusIndicator="online"
          />
          <div className="min-w-0">
            <p className="text-xs font-black text-neutral-950 truncate">
              {currentUser?.name}
            </p>
            <p className="text-[10px] font-bold text-neutral-400 capitalize truncate">
              {currentUser?.role?.replace('_', ' ')}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          title="Sign out of HQ"
          className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-neutral-100 rounded-lg transition-colors shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
