'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { http } from '@/lib/api/client';
import { authEndpoints } from '@/lib/api/endpoints/auth';
import { getErrorMessage, getFieldErrors } from '@/lib/api/errors';
import { useMutation } from '@/lib/hooks/useMutation';
import { useAuth } from '@/lib/session/AuthProvider';
import { Logo } from '@/components/shared/Logo';
import {
  Lock,
  Mail,
  User as UserIcon,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Video,
  Briefcase,
} from 'lucide-react';
import { message } from 'antd';

type Role = 'creator' | 'brand';

/**
 * Step 1: choose creator or brand. Step 2: name, email, password → POST /auth/register.
 * The new account is logged in right away and continues to its onboarding flow.
 */
export default function RegisterPage() {
  const router = useRouter();
  const { reload } = useAuth();
  // The backend sets the httpOnly session cookies; nothing to refresh on this static page.
  const register = useMutation(authEndpoints(http).register, { refresh: false });
  const isLoading = register.loading;
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  // `/register?role=brand` (links from the marketing pages) skips the role picker.
  useEffect(() => {
    const role = new URLSearchParams(window.location.search).get('role');
    if (role === 'brand' || role === 'creator') setSelectedRole(role);
  }, []);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSelectCreator = () => setSelectedRole('creator');
  const handleSelectBrand = () => setSelectedRole('brand');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    setFieldErrors({});

    if (!name.trim()) return message.error('Please enter your full name');
    if (!email.trim() || !email.includes('@')) return message.error('Please enter a valid email address');
    if (password.length < 8) return message.error('Password must be at least 8 characters');

    try {
      const { user } = await register.run({ role: selectedRole, name: name.trim(), email: email.trim(), password });
      // Re-read /me so the root AuthProvider knows who is logged in.
      await reload();
      message.success(`Welcome to Influverse, ${user.name}!`);
      // A 6-digit code was emailed on signup — confirm it before onboarding.
      router.replace('/verify-email');
    } catch (err) {
      setFieldErrors(getFieldErrors(err));
      message.error(getErrorMessage(err, 'Could not create your account.'));
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col justify-between font-sans selection:bg-[#FF2D78]/20 selection:text-[#FF2D78]">
      {/* Clean Header */}
      <header className="border-b border-[#E7E7E2] bg-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Logo size="sm" />
          </Link>
        </div>
      </header>

      {/* Main Registration Layout */}
      <main className="flex-1 flex items-center justify-center py-10 sm:py-16 px-4 sm:px-6">
        <div className="w-full max-w-2xl space-y-8">
          {/* Headline */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl sm:text-4xl font-black text-[#0A0A0A] tracking-tight">
              {selectedRole === 'brand' ? 'Create your Brand Workspace' : selectedRole === 'creator' ? 'Create your Creator account' : 'Create your account'}
            </h1>
            <p className="text-sm sm:text-base text-[#66665E] font-medium">
              {selectedRole === 'brand'
                ? 'Launch campaigns and collaborate with vetted European creators.'
                : selectedRole === 'creator'
                ? 'Showcase your work and get hired by top brands.'
                : 'Choose how you want to use Influverse to get started.'}
            </p>
          </div>

          {selectedRole === null ? (
            /* STEP 1: Two Clean Role Selection Boxes (Creator vs Brand) */
            <div className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-6">
                {/* 1. Content Creator Box */}
                <div
                  onClick={handleSelectCreator}
                  className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 border-2 border-[#E7E7E2] hover:border-[#FF2D78] shadow-sm hover:shadow-xl transition-all duration-200 cursor-pointer flex flex-col justify-between group text-left relative overflow-hidden"
                >
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-[#FFF0F5] group-hover:bg-[#FF2D78] text-[#FF2D78] group-hover:text-white border border-[#FF2D78]/25 group-hover:border-[#FF2D78] flex items-center justify-center font-bold group-hover:scale-105 transition-all duration-300 shadow-sm">
                        <Video className="w-5 h-5 sm:w-6 sm:h-6 transition-colors" />
                      </div>
                      <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-[#FFF0F5] border border-[#FF2D78]/25 text-[#FF2D78] flex items-center gap-1">
                        <Video className="w-3 h-3" />
                        <span>For Creators</span>
                      </span>
                    </div>

                    <div>
                      <h2 className="text-lg sm:text-xl font-black text-[#0A0A0A] group-hover:text-[#FF2D78] transition-colors">
                        I am a Creator
                      </h2>
                      <p className="text-xs sm:text-sm text-[#66665E] font-medium mt-1 sm:mt-2 leading-relaxed">
                        Partner with top brands, showcase your portfolio, and collaborate on paid campaigns.
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 sm:pt-8">
                    <button
                      type="button"
                      className="w-full py-2.5 sm:py-3.5 px-4 rounded-xl bg-[#FF2D78] hover:bg-[#E02669] text-white font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm group-hover:shadow-md"
                    >
                      <span>Continue as Creator</span>
                      <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>

                {/* 2. Brand Marketer Box */}
                <div
                  onClick={handleSelectBrand}
                  className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 border-2 border-[#E7E7E2] hover:border-[#0A0A0A] shadow-sm hover:shadow-xl transition-all duration-200 cursor-pointer flex flex-col justify-between group text-left relative overflow-hidden"
                >
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-[#F4F4F0] group-hover:bg-[#0A0A0A] text-[#0A0A0A] group-hover:text-white border border-[#E7E7E2] group-hover:border-[#0A0A0A] flex items-center justify-center font-bold group-hover:scale-105 transition-all duration-300 shadow-sm">
                        <Briefcase className="w-5 h-5 sm:w-6 sm:h-6 transition-colors" />
                      </div>
                      <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-[#FAFAF8] border border-[#E7E7E2] text-[#66665E] flex items-center gap-1">
                        <Briefcase className="w-3 h-3" />
                        <span>For Brands</span>
                      </span>
                    </div>

                    <div>
                      <h2 className="text-lg sm:text-xl font-black text-[#0A0A0A] group-hover:text-black transition-colors">
                        I am a Brand
                      </h2>
                      <p className="text-xs sm:text-sm text-[#66665E] font-medium mt-1 sm:mt-2 leading-relaxed">
                        Discover vetted creators across Instagram, TikTok &amp; YouTube, and launch high-impact campaigns.
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 sm:pt-8">
                    <button
                      type="button"
                      className="w-full py-2.5 sm:py-3.5 px-4 rounded-xl bg-[#0A0A0A] hover:bg-black text-white font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm group-hover:shadow-md"
                    >
                      <span>Continue as Brand</span>
                      <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Already Have Account - Sign In */}
              <div className="text-center">
                <p className="text-sm text-[#66665E] font-medium">
                  Already have an account?{' '}
                  <Link
                    href="/login"
                    className="font-bold text-[#0A0A0A] hover:text-[#FF2D78] transition-colors"
                  >
                    Sign In
                  </Link>
                </p>
              </div>
            </div>
          ) : (
            /* STEP 2: account form (both roles) */
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E7E7E2] shadow-xl shadow-black/[0.03] space-y-6 max-w-lg mx-auto">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedRole(null)}
                  className="text-xs font-bold text-[#66665E] hover:text-[#0A0A0A] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Choose a different account type</span>
                </button>
                <span className="text-xs font-bold text-[#FF2D78]">
                  {selectedRole === 'creator' ? 'Creator account' : 'Brand account'}
                </span>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                {/* Full Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A39C]" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Elena Rostova"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:ring-0 text-sm font-medium text-[#0A0A0A] outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                    {selectedRole === 'brand' ? 'Work Email Address' : 'Email Address'}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A39C]" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:ring-0 text-sm font-medium text-[#0A0A0A] outline-none transition-all"
                    />
                  </div>
                  {fieldErrors.email && <p className="text-xs font-semibold text-rose-600">{fieldErrors.email}</p>}
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3A39C]" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#E7E7E2] focus:border-[#0A0A0A] focus:ring-0 text-sm font-medium text-[#0A0A0A] outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#A3A39C] hover:text-[#0A0A0A] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="text-xs font-semibold text-rose-600">{fieldErrors.password}</p>}
                </div>

                {/* Submit CTA */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="disabled:opacity-60 w-full py-3.5 px-6 rounded-2xl bg-[#0A0A0A] hover:bg-black text-white font-black text-sm tracking-wide transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  <span>{isLoading ? 'Creating account…' : selectedRole === 'brand' ? 'Create Brand Workspace' : 'Create Creator Account'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {/* Already Have Account */}
              <div className="text-center pt-3 border-t border-[#E7E7E2]/70">
                <p className="text-sm text-[#66665E] font-medium">
                  Already have an account?{' '}
                  <Link
                    href="/login"
                    className="font-bold text-[#0A0A0A] hover:text-[#FF2D78] transition-colors"
                  >
                    Sign In
                  </Link>
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
