"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/session/AuthProvider";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { AccountAvatar } from "@/components/auth/AccountAvatar";
import { homeFor } from "@/lib/session/routes";
import type { BrandProfile } from "@/types/api";
import { Logo } from "@/components/shared/Logo";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { Button } from "@/components/ui";
import { Dropdown, MenuProps, Drawer } from "antd";
import {
  Menu as MenuIcon,
  Settings,
  ArrowRight,
  LogOut,
  LayoutDashboard,
  User,
} from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, activeRole, profile, signOut } = useAuth();
  // Brands show their company name/logo; creators their own name/photo.
  const brandProfile = activeRole === "brand" ? (profile as BrandProfile | null) : null;
  const displayName = brandProfile?.companyName || currentUser?.name;
  const displayImage = brandProfile?.logo || currentUser?.avatar;
  const workspaceHome = currentUser
    ? homeFor(currentUser.role, currentUser.onboardingCompleted)
    : "/login";

  /** Ends the session on the server (refresh cookie cleared) and locally. */
  const handleLogout = async (redirectTo: string) => {
    await signOut();
    router.push(redirectTo);
  };
  const { t } = useLang();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const navLinks = [
    { name: t?.nav?.home || "Home", href: "/" },
    { name: t?.nav?.discover || "Discover", href: "/creators" },
    { name: t?.nav?.howItWorks || "How It Works", href: "/how-it-works" },
    { name: t?.nav?.pricing || "Pricing", href: "/pricing" },
    { name: t?.nav?.faq || "FAQ", href: "/faq" },
  ];

  const userMenuItems: MenuProps["items"] = [
    {
      key: "header",
      label: (
        <div className="py-1.5 px-1 font-sans border-b border-[#E7E7E2] pb-2.5 min-w-[200px]">
          <div className="font-bold text-[#0A0A0A] text-xs truncate">
            {displayName}
          </div>
          <div className="text-sm text-[#66665E] truncate mt-0.5">
            {currentUser?.email}
          </div>
        </div>
      ),
    },
    {
      key: "dashboard",
      label: (
        <div className="flex items-center gap-2 py-1 font-sans text-sm font-bold text-[#0A0A0A]">
          <LayoutDashboard className="w-3.5 h-3.5 text-[#0A0A0A]" />
          <span>
            {activeRole === "brand" ? "Brand Workspace" : "Creator Workspace"}
          </span>
        </div>
      ),
      onClick: () => {
        router.push(workspaceHome);
      },
    },
    ...(activeRole === "creator"
      ? [
          {
            key: "profile",
            label: (
              <div className="flex items-center gap-2 py-1 font-sans text-sm font-bold text-[#0A0A0A]">
                <User className="w-3.5 h-3.5 text-[#66665E]" />
                <span>Profile</span>
              </div>
            ),
            onClick: () => {
              router.push("/creator/profile");
            },
          },
          {
            key: "settings",
            label: (
              <div className="flex items-center gap-2 py-1 font-sans text-sm font-bold text-[#0A0A0A]">
                <Settings className="w-3.5 h-3.5 text-[#66665E]" />
                <span>Account Settings</span>
              </div>
            ),
            onClick: () => {
              router.push("/creator/settings");
            },
          },
        ]
      : [
          {
            key: "settings",
            label: (
              <div className="flex items-center gap-2 py-1 font-sans text-sm font-bold text-[#0A0A0A]">
                <Settings className="w-3.5 h-3.5 text-[#66665E]" />
                <span>Brand Settings</span>
              </div>
            ),
            onClick: () => {
              router.push("/brand/settings");
            },
          },
        ]),
    {
      type: "divider",
    },
    {
      key: "logout",
      label: (
        <div className="flex items-center gap-2 py-1 font-sans text-sm font-bold text-rose-600">
          <LogOut className="w-3.5 h-3.5 text-rose-600" />
          <span>Sign Out</span>
        </div>
      ),
      onClick: () => {
        void handleLogout("/");
      },
    },
  ];

  return (
    <header className="sticky top-0 z-50 w-full bg-[#FAFAF8]/95 backdrop-blur-md border-b border-[#E7E7E2] transition-all duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 lg:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <Logo size="md" />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-4 xl:gap-7">
            {navLinks.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname === link.href ||
                    pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`text-sm font-bold font-sans transition-colors duration-200 whitespace-nowrap ${
                    isActive
                      ? "text-[#0A0A0A]"
                      : "text-[#666660] hover:text-[#0A0A0A]"
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </nav>

          {/* Desktop Right Actions */}
          <div className="hidden lg:flex items-center gap-4">
            {/* Language Switcher - Present on all pages */}
            <LanguageSwitcher />

            {/* Auth State */}
            {currentUser ? (
              <Dropdown
                menu={{ items: userMenuItems }}
                trigger={["click"]}
                placement="bottomRight"
              >
                <button
                  type="button"
                  aria-label="User profile menu"
                  className="w-9 h-9 rounded-full p-0.5 bg-white border border-[#E7E7E2] hover:border-[#0A0A0A] hover:shadow-2xs transition-all cursor-pointer flex items-center justify-center shrink-0 group focus:outline-none focus:ring-2 focus:ring-[#0A0A0A]/20"
                >
                  <AccountAvatar src={displayImage} name={displayName} className="w-full h-full rounded-full" />
                </button>
              </Dropdown>
            ) : (
              <div className="flex items-center">
                <Button href="/login" size="md" variant="primary">
                  Get Started
                </Button>
              </div>
            )}
          </div>

          {/* Mobile Menu Icon */}
          <div className="flex lg:hidden items-center gap-1.5 sm:gap-2">
            <LanguageSwitcher />
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="p-1.5 sm:p-2 text-[#0A0A0A] hover:bg-[#EFEFEA] rounded-xl cursor-pointer"
              aria-label="Open Navigation Menu"
            >
              <MenuIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      <Drawer
        title={<Logo size="sm" />}
        placement="right"
        onClose={() => setIsDrawerOpen(false)}
        open={isDrawerOpen}
        width={
          typeof window !== "undefined"
            ? Math.min(320, window.innerWidth - 40)
            : 300
        }
      >
        <div className="flex flex-col gap-6 font-sans">
          {currentUser ? (
            <div className="p-4 bg-[#F4F4F0] rounded-2xl border border-[#E7E7E2] space-y-3">
              <div className="flex items-center gap-3">
                <AccountAvatar src={displayImage} name={displayName} className="w-10 h-10 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-sm text-[#0A0A0A] truncate">
                    {displayName}
                  </div>
                  <div className="text-sm text-[#66665E] capitalize">
                    {activeRole} Account
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <Link
                  href={workspaceHome}
                  onClick={() => setIsDrawerOpen(false)}
                  className="w-full h-10 rounded-xl bg-[#0A0A0A] text-white font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <span>Open Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                {activeRole === "creator" ? (
                  <>
                    <Link
                      href="/creator/profile"
                      onClick={() => setIsDrawerOpen(false)}
                      className="w-full h-9 rounded-xl bg-white border border-[#E7E7E2] text-[#0A0A0A] font-bold text-xs flex items-center justify-center gap-1.5 hover:border-[#0A0A0A]"
                    >
                      <User className="w-3.5 h-3.5 text-[#66665E]" />
                      <span>Profile</span>
                    </Link>
                    <Link
                      href="/creator/settings"
                      onClick={() => setIsDrawerOpen(false)}
                      className="w-full h-9 rounded-xl bg-white border border-[#E7E7E2] text-[#0A0A0A] font-bold text-xs flex items-center justify-center gap-1.5 hover:border-[#0A0A0A]"
                    >
                      <Settings className="w-3.5 h-3.5 text-[#66665E]" />
                      <span>Account Settings</span>
                    </Link>
                  </>
                ) : (
                  <Link
                    href="/brand/settings"
                    onClick={() => setIsDrawerOpen(false)}
                    className="w-full h-9 rounded-xl bg-white border border-[#E7E7E2] text-[#0A0A0A] font-bold text-xs flex items-center justify-center gap-1.5 hover:border-[#0A0A0A]"
                  >
                    <Settings className="w-3.5 h-3.5 text-[#66665E]" />
                    <span>Brand Settings</span>
                  </Link>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsDrawerOpen(false);
                    void handleLogout("/login");
                  }}
                  className="w-full h-9 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-rose-100 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="pt-2">
              <Button
                href="/login"
                size="md"
                variant="primary"
                fullWidth
                onClick={() => setIsDrawerOpen(false)}
              >
                Get Started
              </Button>
            </div>
          )}

          {/* Nav Links */}
          <div className="space-y-1 border-t border-[#E7E7E2] pt-4">
            {navLinks.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname === link.href ||
                    pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsDrawerOpen(false)}
                  className={`block px-3 py-2 rounded-xl text-sm font-bold transition-colors ${
                    isActive
                      ? "bg-[#0A0A0A] text-white"
                      : "text-[#0A0A0A] hover:bg-[#F4F4F0]"
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </div>

          {/* Language Switcher in Drawer */}
          <div className="pt-3 border-t border-[#E7E7E2] flex items-center justify-between">
            <span className="text-xs font-bold text-[#66665E]">Language</span>
            <LanguageSwitcher />
          </div>
        </div>
      </Drawer>
    </header>
  );
}
