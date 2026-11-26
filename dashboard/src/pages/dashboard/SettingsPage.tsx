import React, { useEffect, useState } from 'react';
import { useAppSelector } from '@/store/hooks';
import { useChangePasswordMutation, useUpdateMeMutation } from '@/lib/api/authApi';
import { useUploadFile } from '@/lib/api/uploadApi';
import { useGetAuditLogsQuery } from '@/lib/api/teamApi';
import { getErrorMessage } from '@/lib/api/baseApi';
import { timeAgo } from '@/lib/utils';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  User,
  Lock,
  CheckCircle,
  Save,
  Camera,
  KeyRound,
  AlertTriangle,
  History,
  Loader2,
} from 'lucide-react';

/** Latest admin actions (super admin only — `/admin/audit-logs` needs `settings.manage`). */
const AuditLogList: React.FC = () => {
  const [page, setPage] = useState(1);
  const { data, isFetching, error } = useGetAuditLogsQuery({ page, limit: 20 });
  const items = data?.items ?? [];
  const totalPages = data?.meta.totalPages ?? 1;

  if (error) {
    return <p className="text-xs font-semibold text-rose-600">{getErrorMessage(error)}</p>;
  }
  if (isFetching && !items.length) {
    return (
      <div className="p-8 flex justify-center text-neutral-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (!items.length) {
    return <p className="text-xs text-neutral-500 font-medium p-6 text-center">No admin activity recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-xl overflow-hidden">
        {items.map((log) => (
          <div key={log.id} className="p-3 flex items-start justify-between gap-3 bg-white">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="neutral" size="sm">
                  {log.action}
                </Badge>
                <span className="text-xs font-bold text-neutral-900">{log.adminSnapshot?.name || 'Admin'}</span>
                <span className="text-[11px] text-neutral-500">
                  on {log.targetType}
                  {log.targetCode ? ` ${log.targetCode}` : ''}
                </span>
              </div>
              {log.reason && <p className="text-[11px] text-neutral-600 mt-1 line-clamp-2">{log.reason}</p>}
            </div>
            <span className="text-[11px] text-neutral-400 shrink-0">{timeAgo(log.createdAt)}</span>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-xs text-neutral-500 font-semibold">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

export const SettingsPage: React.FC = () => {
  const currentUser = useAppSelector((state) => state.auth.currentUser);
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const [updateMe, { isLoading: isSavingProfile }] = useUpdateMeMutation();
  const [changePassword, { isLoading: isChangingPassword }] = useChangePasswordMutation();
  const uploadFile = useUploadFile();

  // Tabs
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'activity'>('profile');

  // Profile Form State
  const [name, setName] = useState(currentUser?.name || '');
  const [avatar, setAvatar] = useState(currentUser?.avatar || '');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Keep the form in sync if the profile is restored after the page mounted.
  useEffect(() => {
    setName(currentUser?.name || '');
    setAvatar(currentUser?.avatar || '');
  }, [currentUser?.name, currentUser?.avatar]);

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordNotice, setPasswordNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  /** Uploads the picked photo to S3 right away; it is saved on the profile with "Save Profile". */
  const handleAvatarFile = async (file?: File) => {
    if (!file) return;
    setProfileNotice(null);
    setIsUploadingAvatar(true);
    try {
      const uploaded = await uploadFile(file, 'avatar');
      if (uploaded.url) setAvatar(uploaded.url);
    } catch (err) {
      setProfileNotice({ type: 'error', text: getErrorMessage(err, 'Photo upload failed.') });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileNotice(null);
    try {
      // `null` removes the avatar on the server.
      await updateMe({ name: name.trim(), avatar: avatar || null }).unwrap();
      setProfileNotice({ type: 'success', text: 'Saved' });
    } catch (err) {
      setProfileNotice({ type: 'error', text: getErrorMessage(err) });
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      setPasswordNotice({
        type: 'error',
        text: 'Please fill in both current and new password.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordNotice({
        type: 'error',
        text: 'New password and confirmation do not match.',
      });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordNotice({
        type: 'error',
        text: 'Password must be at least 8 characters long.',
      });
      return;
    }

    try {
      // Other devices are signed out; this tab keeps working with the new access token.
      await changePassword({ currentPassword, newPassword }).unwrap();
      setPasswordNotice({ type: 'success', text: 'Password updated. Other devices were signed out.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordNotice({ type: 'error', text: getErrorMessage(err) });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Settings"
        subtitle="Manage your profile and credentials."
      />

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-neutral-200">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'profile'
              ? 'border-brand-black text-brand-black'
              : 'border-transparent text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Profile</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'security'
              ? 'border-brand-black text-brand-black'
              : 'border-transparent text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Security</span>
        </button>

        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'activity'
                ? 'border-brand-black text-brand-black'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Activity Log</span>
          </button>
        )}

      </div>

      {/* TAB 1: PROFILE */}
      {activeTab === 'profile' && (
        <Card className="p-6">
          <div className="pb-3 border-b border-neutral-100 mb-5 flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-neutral-900">
              Profile
            </h3>
            {profileNotice && (
              <div
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                  profileNotice.type === 'success'
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : 'text-rose-700 bg-rose-50 border-rose-200'
                }`}
              >
                {profileNotice.type === 'success' ? (
                  <CheckCircle className="w-3.5 h-3.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                <span>{profileNotice.text}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-6">
            {/* Centered Standard Circular Avatar */}
            <div className="flex flex-col items-center justify-center py-2">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-neutral-200 shadow-sm bg-neutral-100 flex items-center justify-center">
                  {isUploadingAvatar ? (
                    <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
                  ) : avatar ? (
                    <img
                      src={avatar}
                      alt={name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-10 h-10 text-neutral-400" />
                  )}
                </div>
                <label className="absolute inset-0 rounded-full bg-black/40 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <Camera className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-bold">Change</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      void handleAvatarFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <label className="text-xs font-bold text-brand-pink hover:underline cursor-pointer">
                  Change Photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      void handleAvatarFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                {avatar && (
                  <>
                    <span className="text-neutral-300">•</span>
                    <button
                      type="button"
                      onClick={() => setAvatar('')}
                      className="text-xs font-semibold text-neutral-400 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Name & Email Below Avatar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                leftIcon={<User className="w-4 h-4" />}
                required
              />
              <Input
                label="Email Address"
                type="email"
                value={currentUser?.email || ''}
                disabled
                readOnly
                rightIcon={<Lock className="w-4 h-4 text-neutral-400" />}
                className="bg-neutral-100/80 text-neutral-500 font-medium cursor-not-allowed select-none border-neutral-200"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-neutral-500 font-medium">
                Role: <strong className="capitalize text-neutral-900 font-bold">{currentUser?.role?.replace('_', ' ')}</strong>
              </div>
              <Button
                type="submit"
                variant="accent"
                size="sm"
                className="font-bold text-xs"
                isLoading={isSavingProfile}
                disabled={isUploadingAvatar}
                leftIcon={<Save className="w-3.5 h-3.5" />}
              >
                Save Profile
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* TAB 2: SECURITY */}
      {activeTab === 'security' && (
        <Card className="p-6">
          <div className="pb-3 border-b border-neutral-100 mb-5 flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-neutral-900">
              Password
            </h3>
            {passwordNotice && (
              <div
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                  passwordNotice.type === 'success'
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : 'text-rose-700 bg-rose-50 border-rose-200'
                }`}
              >
                {passwordNotice.type === 'success' ? (
                  <CheckCircle className="w-3.5 h-3.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                <span>{passwordNotice.text}</span>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <Input
                label="Current Password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••••••"
                leftIcon={<Lock className="w-4 h-4" />}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="New Password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  leftIcon={<KeyRound className="w-4 h-4" />}
                />
                <Input
                  label="Confirm Password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  leftIcon={<KeyRound className="w-4 h-4" />}
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" variant="primary" size="sm" isLoading={isChangingPassword}>
                  Update Password
                </Button>
              </div>
            </form>
          </div>
        </Card>
      )}

      {/* TAB 3: AUDIT LOG (super admin) */}
      {activeTab === 'activity' && isSuperAdmin && (
        <Card className="p-6">
          <div className="pb-3 border-b border-neutral-100 mb-5">
            <h3 className="text-sm font-extrabold text-neutral-900">Admin Activity</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Every sensitive admin action is recorded here.</p>
          </div>
          <AuditLogList />
        </Card>
      )}
    </div>
  );
};
