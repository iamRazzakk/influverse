'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/session/AuthProvider';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { Shield, Bell, User, ArrowRight, Mail, Phone, Lock, Camera, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Input, Button, message } from 'antd';
import {
  ChangePasswordCard,
  DeactivationCard,
  NotificationPrefsCard,
  SessionsCard,
} from '@/components/auth/AccountSettingsCards';
import { normalizePhone } from '@/components/auth/onboardingOptions';
import { http } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/api/errors';
import { meEndpoints } from '@/lib/api/endpoints/me';
import { profileEndpoints, type CreatorProfileUpdate } from '@/lib/api/endpoints/profile';
import { uploadFileWith, type UploadContext } from '@/lib/api/endpoints/upload';
import type { SessionInfo } from '@/lib/api/endpoints/auth';
import { useMutation } from '@/lib/hooks/useMutation';
import type { CreatorProfile } from '@/types/api';
import { RemoteImage } from '@/components/shared/RemoteImage';

/** Server rule for creator handles (creator.constant.ts HANDLE_REGEX). */
const HANDLE_REGEX = /^[a-z0-9_.]{3,30}$/;

interface SettingsViewProps {
  /** GET /me/creator-profile (null = failed; the account tab then shows empty handle / bio). */
  profile: CreatorProfile | null;
  /** GET /auth/sessions (null = failed → the card shows Retry). */
  sessions: SessionInfo[] | null;
}

function CreatorSettingsContent({ profile, sessions }: SettingsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, reload } = useAuth();

  // Writes skip router.refresh(); reload() (after saving) re-reads /me and refreshes the server data.
  const { run: updateMe, loading: isSavingUser } = useMutation(
    (body: Parameters<ReturnType<typeof meEndpoints>['update']>[0]) => meEndpoints(http).update(body),
    { refresh: false },
  );
  const { run: updateProfile, loading: isSavingProfile } = useMutation(
    (body: CreatorProfileUpdate) => profileEndpoints(http).updateCreator(body),
    { refresh: false },
  );
  const checkHandle = (handle: string) => profileEndpoints(http).checkHandle(handle);
  const uploadFile = (file: File, context: UploadContext) => uploadFileWith(http, file, context);

  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Tab State: account | security | notifications
  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'account' | 'security' | 'notifications'>(
    initialTab === 'account' ? 'account' : initialTab === 'notifications' ? 'notifications' : 'security'
  );

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'profile' || tab === 'socials') {
      router.replace('/creator/profile');
    } else if (tab === 'portfolio' || tab === 'gallery') {
      router.replace('/creator/portfolio');
    } else if (tab === 'security' || tab === 'notifications' || tab === 'account') {
      setActiveTab(tab);
    }
  }, [searchParams, router]);

  // Account form: name / phone / photo live on the account, handle / bio on the creator profile.
  const [accountAvatar, setAccountAvatar] = useState(currentUser?.avatar || '');
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [accountName, setAccountName] = useState(currentUser?.name || '');
  const [accountHandle, setAccountHandle] = useState('');
  const accountEmail = currentUser?.email || '';
  const [accountPhone, setAccountPhone] = useState(currentUser?.phone || '');
  const [accountBio, setAccountBio] = useState('');

  useEffect(() => {
    if (!profile) return;
    setAccountHandle(profile.handle ?? '');
    setAccountBio(profile.bio ?? '');
  }, [profile]);

  const isApproved = profile?.approvalStatus === 'approved';
  const isSaving = isSavingUser || isSavingProfile;

  // Photo: upload → save on the account right away.
  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return message.error('Please upload an image file (PNG, JPG, or WEBP).');
    if (file.size > 10 * 1024 * 1024) return message.error('File size exceeds 10MB limit.');

    setIsAvatarUploading(true);
    try {
      const uploaded = await uploadFile(file, 'avatar');
      if (!uploaded.url) throw new Error('Upload failed');
      await updateMe({ avatar: uploaded.url });
      await reload();
      setAccountAvatar(uploaded.url);
      message.success('Profile photo updated!');
    } catch (err) {
      message.error(getErrorMessage(err, 'Photo upload failed. Please try again.'));
    } finally {
      setIsAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      await updateMe({ avatar: null });
      await reload();
      setAccountAvatar('');
      message.success('Photo removed');
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleSaveAccountInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountName.trim()) return message.error('Please enter your full name.');
    const handle = accountHandle.trim().toLowerCase().replace(/^@/, '');
    if (!HANDLE_REGEX.test(handle)) return message.error('Username: 3–30 characters, a-z, 0-9, _ or .');

    try {
      if (handle !== profile?.handle) {
        const { available } = await checkHandle(handle);
        if (!available) return message.error('This username is already taken.');
      }
      await updateMe({ name: accountName.trim(), phone: normalizePhone(accountPhone) || null });
      await updateProfile({ handle, bio: accountBio.trim() });
      await reload();
      message.success('Account details saved!');
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen pb-16 font-sans">
      <WorkspaceHeader
        title="Settings"
        subtitle="Manage your account, security, and preferences."
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Navigation Tabs - Order and Typography Matching System Standards */}
        <div className="bg-white rounded-lg p-1 border border-[#E7E7E2] flex items-center gap-1 shadow-2xs w-fit max-w-full overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`h-10 px-3.5 sm:px-5 rounded-md font-bold text-sm flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === 'security'
                ? 'bg-[#0A0A0A] text-white shadow-xs'
                : 'text-[#66665E] hover:text-[#0A0A0A] hover:bg-[#FAFAF8]'
            }`}
          >
            <Shield className={`w-4 h-4 shrink-0 ${activeTab === 'security' ? 'text-white' : 'text-[#66665E]'}`} />
            <span>Security</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className={`h-10 px-3.5 sm:px-5 rounded-md font-bold text-sm flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === 'account'
                ? 'bg-[#0A0A0A] text-white shadow-xs'
                : 'text-[#66665E] hover:text-[#0A0A0A] hover:bg-[#FAFAF8]'
            }`}
          >
            <Lock className={`w-4 h-4 shrink-0 ${activeTab === 'account' ? 'text-white' : 'text-[#66665E]'}`} />
            <span>Account</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className={`h-10 px-3.5 sm:px-5 rounded-md font-bold text-sm flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === 'notifications'
                ? 'bg-[#0A0A0A] text-white shadow-xs'
                : 'text-[#66665E] hover:text-[#0A0A0A] hover:bg-[#FAFAF8]'
            }`}
          >
            <Bell className={`w-4 h-4 shrink-0 ${activeTab === 'notifications' ? 'text-white' : 'text-[#66665E]'}`} />
            <span>Notifications</span>
          </button>
        </div>

        {/* Tab 1: Account Information (Private Credentials & Deactivation) */}
        {activeTab === 'account' && (
          <div className="space-y-6">
            {/* Account Information Card */}
            <div className="bg-white rounded-xl p-4 sm:p-6 lg:p-8 border border-[#E7E7E2] shadow-2xs space-y-6">
              <div className="pb-4 border-b border-[#E7E7E2] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
                    Profile & Account Details
                  </h2>
                  <p className="text-sm text-[#66665E] mt-0.5 font-medium">
                    Update your profile photo, display name, handle, and contact credentials.
                  </p>
                </div>
                {isApproved ? (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200 shrink-0 w-fit">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Approved Creator Account</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-50 text-amber-800 text-xs font-bold border border-amber-200 shrink-0 w-fit">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>{profile?.approvalStatus === 'action_required' ? 'Changes Requested' : 'Under Review'}</span>
                  </div>
                )}
              </div>

              <form onSubmit={handleSaveAccountInfo} className="space-y-6">
                {/* Profile Photo (Left-aligned) */}
                <div className="flex items-center gap-4 sm:gap-5 py-2 pb-6 border-b border-[#E7E7E2]">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />

                  {isAvatarUploading ? (
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 border-dashed border-[#D2D2CA] bg-[#FAFAF8] flex items-center justify-center shrink-0">
                      <Loader2 className="w-6 h-6 animate-spin text-[#66665E]" />
                    </div>
                  ) : accountAvatar ? (
                    <div
                      onClick={() => avatarInputRef.current?.click()}
                      className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-[#0A0A0A] shadow-md cursor-pointer group transition-transform hover:scale-105 shrink-0"
                    >
                      <RemoteImage src={accountAvatar} alt={accountName ?? ''} className="w-full h-full object-cover" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" />
                      <div className="absolute inset-0 bg-black/50 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera className="w-5 h-5 mb-0.5 text-white" />
                        <span className="text-[10px] font-bold">Change</span>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => avatarInputRef.current?.click()}
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 border-dashed border-[#D2D2CA] hover:border-[#0A0A0A] bg-[#FAFAF8] hover:bg-[#F4F4F0] flex flex-col items-center justify-center cursor-pointer transition-all text-[#66665E] hover:text-[#0A0A0A] group hover:scale-105 shrink-0"
                    >
                      <Camera className="w-6 h-6 mb-1 text-[#0A0A0A] group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#0A0A0A]">Upload</span>
                    </div>
                  )}

                  <div className="space-y-0.5 text-left">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="text-sm font-bold text-[#0A0A0A] hover:text-[#FF2D78] transition-colors cursor-pointer block text-left"
                    >
                      {accountAvatar ? 'Click photo to change' : 'Click to upload photo'}
                    </button>
                    <div className="text-xs text-[#66665E]">
                      JPG, PNG, or WEBP up to 10MB
                    </div>
                    {accountAvatar && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline transition-colors cursor-pointer pt-0.5 block text-left"
                      >
                        Remove photo
                      </button>
                    )}
                  </div>
                </div>

                {/* 2-Column Inputs Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                  {/* Full Name */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-[#0A0A0A] block">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      prefix={<User className="w-4 h-4 text-[#A3A39C] mr-0.5" />}
                      type="text"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      placeholder="Your full name"
                      className="h-11 rounded-lg font-medium text-base sm:text-sm border-[#E7E7E2] hover:border-[#0A0A0A] focus:border-[#0A0A0A]"
                    />
                  </div>

                  {/* Username Handle */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-[#0A0A0A] block">
                      Username <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      prefix={<span className="text-[#66665E] text-sm font-medium mr-0.5">@</span>}
                      type="text"
                      value={accountHandle}
                      onChange={(e) => setAccountHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                      placeholder="yourusername"
                      className="h-11 rounded-lg font-medium text-base sm:text-sm border-[#E7E7E2] hover:border-[#0A0A0A] focus:border-[#0A0A0A]"
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-[#0A0A0A] block">
                      Primary Login Email
                    </label>
                    <Input
                      prefix={<Mail className="w-4 h-4 text-[#A3A39C] mr-0.5" />}
                      type="email"
                      value={accountEmail}
                      readOnly
                      disabled
                      className="h-11 rounded-lg font-medium text-base sm:text-sm border-[#E7E7E2]"
                    />
                  </div>

                  {/* Phone */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-[#0A0A0A] block">
                      Phone Number
                    </label>
                    <Input
                      prefix={<Phone className="w-4 h-4 text-[#A3A39C] mr-0.5" />}
                      type="tel"
                      value={accountPhone}
                      onChange={(e) => setAccountPhone(e.target.value)}
                      placeholder="+4915112345678"
                      className="h-11 rounded-lg font-medium text-base sm:text-sm border-[#E7E7E2] hover:border-[#0A0A0A] focus:border-[#0A0A0A]"
                    />
                  </div>

                  {/* Bio */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-[#0A0A0A] block">
                        Bio
                      </label>
                      <span className="text-xs font-semibold text-[#66665E]">
                        {accountBio.length}/160
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      maxLength={160}
                      value={accountBio}
                      onChange={(e) => setAccountBio(e.target.value)}
                      placeholder="Tell brands what you create, your aesthetics, and what makes your content unique..."
                      className="w-full rounded-lg border border-[#E7E7E2] hover:border-[#0A0A0A] focus:border-[#0A0A0A] focus:outline-none p-3.5 text-base sm:text-sm font-normal text-[#0A0A0A] leading-relaxed transition-all resize-y shadow-2xs"
                    />
                  </div>
                </div>

                <div className="pt-4 flex flex-col-reverse items-stretch sm:flex-row sm:items-center justify-between gap-3 border-t border-[#E7E7E2]">
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={isSaving}
                    className="w-full sm:w-auto h-11 px-7 rounded-lg font-bold text-sm bg-[#0A0A0A] hover:!bg-zinc-800 text-white border-none shadow-sm cursor-pointer"
                  >
                    Save Changes
                  </Button>

                  <Link
                    href="/creator/profile"
                    className="min-h-10 text-sm font-bold text-[#0A0A0A] hover:text-[#FF2D78] flex items-center justify-center sm:justify-start gap-1.5 transition-colors"
                  >
                    <span>Edit Full Marketplace Profile Studio</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </form>
            </div>



            <DeactivationCard accountLabel="Creator Account" />
          </div>
        )}

        {/* Tab 2: Password & Security */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <ChangePasswordCard />
            <SessionsCard sessions={sessions} />
          </div>
        )}

        {/* Tab 3: Notification Preferences */}
        {activeTab === 'notifications' && <NotificationPrefsCard />}
      </div>
    </div>
  );
}

export function SettingsView(props: SettingsViewProps) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm font-bold text-[#66665E]">Loading settings...</div>}>
      <CreatorSettingsContent {...props} />
    </Suspense>
  );
}
