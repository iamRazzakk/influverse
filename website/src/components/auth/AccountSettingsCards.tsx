'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input, Modal, Switch, message } from 'antd';
import {
  AlertTriangle,
  Calendar,
  Clock,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  RotateCcw,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { http } from '@/lib/api/client';
import { authEndpoints, type SessionInfo } from '@/lib/api/endpoints/auth';
import { meEndpoints } from '@/lib/api/endpoints/me';
import { getErrorMessage } from '@/lib/api/errors';
import { useMutation } from '@/lib/hooks/useMutation';
import { useAuth } from '@/lib/session/AuthProvider';
import type { NotificationPrefs } from '@/types/api';

/**
 * Account cards shared by the brand and creator settings pages.
 * Each card writes through `http` + useMutation. The sessions list is loaded by the server page and
 * passed in; account fields (notification prefs, deactivation status) come from useAuth().
 */

const cardClass = 'bg-white rounded-xl p-4 sm:p-6 lg:p-8 border border-[#E7E7E2] shadow-2xs';

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

const formatDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

// ---------------------------------------------------------------------------
// Change password
// ---------------------------------------------------------------------------
export function ChangePasswordCard() {
  // Success → router.refresh(), so the sessions list (other devices signed out) re-renders.
  const { run: changePassword, loading: isLoading } = useMutation((body: { currentPassword: string; newPassword: string }) =>
    authEndpoints(http).changePassword(body.currentPassword, body.newPassword),
  );
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) return message.error('Please enter your current password.');
    if (newPassword.length < 8) return message.error('New password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return message.error('New passwords do not match.');
    if (newPassword === currentPassword) return message.error('New password must be different.');

    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      message.success('Password updated. Other devices have been signed out.');
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`${cardClass} space-y-6`}>
      <div className="flex items-center gap-3 pb-4 border-b border-[#E7E7E2]">
        <div className="w-10 h-10 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] flex items-center justify-center shrink-0">
          <KeyRound className="w-5 h-5 text-[#0A0A0A]" />
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">Change Password</h2>
          <p className="text-sm text-[#66665E] mt-0.5">Changing it signs out every other device.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <div className="md:col-span-7 space-y-5 min-w-0">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-[#0A0A0A]">Current Password</label>
              <Link href="/forgot-password" className="text-xs font-bold text-[#66665E] hover:text-[#FF2D78] transition-colors">
                Forgot current password?
              </Link>
            </div>
            <Input.Password
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="rounded-lg h-11 text-base sm:text-sm font-medium"
              autoComplete="current-password"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-[#0A0A0A]">New Password</label>
              <Input.Password
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="rounded-lg h-11 text-base sm:text-sm font-medium"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-[#0A0A0A]">Confirm New Password</label>
              <Input.Password
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="rounded-lg h-11 text-base sm:text-sm font-medium"
                autoComplete="new-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full sm:w-auto justify-center h-11 px-7 rounded-lg font-bold text-sm bg-[#0A0A0A] hover:bg-zinc-800 text-white transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            <span>Update Password</span>
          </button>
        </div>

        <div className="md:col-span-5 bg-[#FAFAF8] rounded-lg p-4 sm:p-5 border border-[#E7E7E2] space-y-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#0A0A0A]">
            <ShieldCheck className="w-4 h-4 text-[#FF2D78]" />
            <span>Password Guidelines</span>
          </div>
          <ul className="space-y-2 text-xs font-medium text-[#66665E]">
            <li className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${newPassword.length >= 8 ? 'bg-[#0A0A0A]' : 'bg-[#D2D2CA]'}`} />
              <span>Minimum 8 characters</span>
            </li>
            <li className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${/[0-9]/.test(newPassword) ? 'bg-[#0A0A0A]' : 'bg-[#D2D2CA]'}`} />
              <span>At least one number (recommended)</span>
            </li>
            <li className="flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${newPassword && newPassword === confirmPassword ? 'bg-[#0A0A0A]' : 'bg-[#D2D2CA]'}`}
              />
              <span>Passwords must match</span>
            </li>
          </ul>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Active sessions
// ---------------------------------------------------------------------------
/** `sessions` = GET /auth/sessions loaded by the settings page (null = request failed → Retry). */
export function SessionsCard({ sessions: sessionList }: { sessions: SessionInfo[] | null }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const sessions = sessionList ?? [];
  const isLoading = false;
  const isError = sessionList === null;
  const refetch = () => router.refresh();
  // Success → router.refresh() re-renders the page with the shorter list.
  const { run: revokeSession, loading: isRevoking } = useMutation((id: string) => authEndpoints(http).revokeSession(id));
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleRevoke = async (id: string) => {
    setBusyId(id);
    try {
      await revokeSession(id);
      message.success('Device signed out');
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleLogout = async (allDevices: boolean) => {
    setIsLoggingOut(true);
    // signOut never throws: the session is cleared locally even if the server call fails.
    await signOut(allDevices);
    message.success(allDevices ? 'Signed out from all devices' : 'Signed out successfully');
    router.push('/login');
  };

  return (
    <div className={`${cardClass} space-y-4`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E7E7E2]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-[#0A0A0A]" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">Active Devices &amp; Sessions</h2>
            <p className="text-sm text-[#66665E] mt-0.5">Devices currently logged into your account.</p>
          </div>
        </div>
        {sessions.length > 1 && (
          <button
            type="button"
            disabled={isLoggingOut}
            onClick={() => handleLogout(true)}
            className="h-10 px-4 rounded-lg font-bold text-xs bg-white border border-[#E7E7E2] hover:border-rose-300 hover:bg-rose-50 text-rose-600 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs self-start sm:self-auto"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out everywhere</span>
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#A3A39B]" />
        </div>
      ) : isError ? (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-center justify-between gap-3">
          <span>Could not load your sessions.</span>
          <button type="button" onClick={() => refetch()} className="font-bold underline cursor-pointer">
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Monitor className="w-5 h-5 text-[#66665E] shrink-0" />
                <div className="space-y-0.5 min-w-0">
                  <div className="text-sm font-bold text-[#0A0A0A] truncate">{s.deviceLabel || 'Unknown device'}</div>
                  <div className="text-sm text-[#66665E] truncate">
                    {[s.ip, s.lastUsedAt ? `Last active ${formatDateTime(s.lastUsedAt)}` : `Signed in ${formatDateTime(s.createdAt)}`]
                      .filter(Boolean)
                      .join(' • ')}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {s.current ? (
                  <>
                    <span className="text-xs font-bold uppercase px-2.5 py-1 rounded-md bg-[#F4F4F0] text-[#0A0A0A] border border-[#E7E7E2]">
                      This Device
                    </span>
                    <button
                      type="button"
                      disabled={isLoggingOut}
                      onClick={() => handleLogout(false)}
                      className="h-10 px-4 rounded-lg font-bold text-xs bg-white border border-[#E7E7E2] hover:border-rose-300 hover:bg-rose-50 text-rose-600 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={isRevoking && busyId === s.id}
                    onClick={() => handleRevoke(s.id)}
                    className="h-10 px-4 rounded-lg font-bold text-xs bg-white border border-[#E7E7E2] hover:border-rose-300 hover:bg-rose-50 text-rose-600 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs disabled:opacity-60"
                  >
                    {isRevoking && busyId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                    <span>Sign out device</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification preferences (email alerts)
// ---------------------------------------------------------------------------
const PREF_ROWS: { key: keyof NotificationPrefs; title: string; desc: string }[] = [
  { key: 'offers', title: 'Offers & Bookings', desc: 'New offers, accepted or declined offers.' },
  { key: 'messages', title: 'Direct Messages', desc: 'When someone sends you a new message.' },
  { key: 'deliverables', title: 'Deliverables & Reviews', desc: 'Submitted work, revision requests and approvals.' },
  { key: 'payouts', title: 'Payments & Payouts', desc: 'Escrow funding, releases, refunds and payouts.' },
  { key: 'marketing', title: 'Product News & Tips', desc: 'Occasional updates about new Influverse features.' },
];

export function NotificationPrefsCard() {
  const { currentUser, reload } = useAuth();
  const savedPrefs = currentUser?.notificationPrefs;
  // No router.refresh() here: reload() below re-reads /me and refreshes the server layout itself.
  const { run: updatePrefs, loading: isLoading } = useMutation(
    (body: Partial<NotificationPrefs>) => meEndpoints(http).updateNotificationPrefs(body),
    { refresh: false },
  );
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    offers: true,
    messages: true,
    deliverables: true,
    payouts: true,
    marketing: true,
  });

  useEffect(() => {
    if (savedPrefs) setPrefs(savedPrefs);
  }, [savedPrefs]);

  const handleSave = async () => {
    try {
      await updatePrefs(prefs);
      // Reload /me so the session (and this card) shows the saved values.
      await reload();
      message.success('Notification preferences saved.');
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  return (
    <div className={`${cardClass} space-y-6`}>
      <div className="pb-4 border-b border-[#E7E7E2]">
        <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A]">Notification Preferences</h2>
        <p className="text-sm text-[#66665E] mt-0.5">Choose which email alerts you receive. In-app notifications are always on.</p>
      </div>

      <div className="space-y-3.5">
        {PREF_ROWS.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-4 p-4 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2]">
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-[#0A0A0A]">{row.title}</div>
              <div className="text-sm text-[#66665E]">{row.desc}</div>
            </div>
            <Switch className="shrink-0" checked={prefs[row.key]} onChange={(checked) => setPrefs((p) => ({ ...p, [row.key]: checked }))} />
          </div>
        ))}
      </div>

      <div className="pt-2 flex flex-col sm:flex-row sm:justify-end">
        <Button
          type="primary"
          loading={isLoading}
          onClick={handleSave}
          className="h-10 px-6 rounded-lg font-semibold text-sm bg-[#0A0A0A] hover:!bg-zinc-800 text-white border-none shadow-sm cursor-pointer"
        >
          Save Preferences
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deactivation (grace period banner + danger zone + password modal)
// ---------------------------------------------------------------------------
export function DeactivationCard({ accountLabel }: { accountLabel: string }) {
  const { currentUser, reload } = useAuth();
  // No router.refresh() here: reloadMe() re-reads /me and refreshes the server layout itself.
  const { run: deactivate, loading: isDeactivating } = useMutation(
    (body: { password: string; reason?: string }) => meEndpoints(http).deactivate(body.password, body.reason),
    { refresh: false },
  );
  const { run: cancelDeactivation, loading: isCancelling } = useMutation(() => meEndpoints(http).cancelDeactivation(), {
    refresh: false,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const isScheduled = currentUser?.status === 'deactivation_scheduled';
  const scheduledFor = currentUser?.deactivation?.scheduledFor;
  const daysLeft = scheduledFor ? Math.max(0, Math.ceil((new Date(scheduledFor).getTime() - Date.now()) / 86_400_000)) : null;

  /** Account status lives on GET /me — reload it after a change. */
  const reloadMe = () => reload();

  const closeModal = () => {
    setIsModalOpen(false);
    setPassword('');
    setReason('');
    setError('');
  };

  const handleConfirm = async () => {
    if (!password) {
      setError('Please enter your account password to confirm.');
      return;
    }
    try {
      await deactivate({ password, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      await reloadMe();
      closeModal();
      message.warning('Account scheduled for deactivation. You can undo it during the grace period.');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleCancel = async () => {
    try {
      await cancelDeactivation();
      await reloadMe();
      message.success('Deactivation cancelled. Your account is active again.');
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  return (
    <>
      {isScheduled && (
        <div className="p-4 sm:p-6 rounded-xl bg-amber-50/90 border border-amber-300 shadow-2xs space-y-3.5">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Clock className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl sm:text-2xl font-extrabold text-amber-950">Account Deactivation in Progress</h3>
                {daysLeft !== null && (
                  <span className="text-sm font-bold px-2.5 py-0.5 rounded-md bg-amber-200 text-amber-900 border border-amber-300/80">
                    {daysLeft} {daysLeft === 1 ? 'Day' : 'Days'} Left to Undo
                  </span>
                )}
              </div>
              <p className="text-xs text-amber-900/85 leading-relaxed">
                Your profile is hidden while the grace period runs. Undo any time before{' '}
                <strong>{formatDate(scheduledFor)}</strong> to restore your account.
              </p>
            </div>
          </div>
          <div className="pt-2.5 border-t border-amber-200 flex items-center justify-between flex-wrap gap-3">
            <span className="text-xs text-amber-800 font-medium flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Scheduled for: {formatDate(scheduledFor)}
            </span>
            <button
              type="button"
              disabled={isCancelling}
              onClick={handleCancel}
              className="h-10 px-5 rounded-lg font-semibold text-sm bg-[#0A0A0A] hover:bg-zinc-800 text-white transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isCancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              <span>Undo Deactivation</span>
            </button>
          </div>
        </div>
      )}

      {!isScheduled && (
        <div className={`${cardClass} border-rose-200 space-y-4`}>
          <div className="flex items-center gap-2 pb-3 border-b border-rose-100 text-rose-600">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="text-xl sm:text-2xl font-extrabold">Danger Zone</h2>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-[#0A0A0A]">Deactivate {accountLabel}</div>
              <div className="text-sm text-[#66665E]">
                Hides your profile and pauses new activity. Includes a grace period during which you can undo it.
              </div>
            </div>
            <Button
              danger
              type="primary"
              onClick={() => setIsModalOpen(true)}
              className="h-10 px-5 rounded-lg font-semibold text-sm bg-rose-600 hover:!bg-rose-700 text-white border-none shadow-xs cursor-pointer shrink-0"
            >
              Deactivate Account
            </Button>
          </div>
        </div>
      )}

      <Modal
        title={
          <div className="flex items-center gap-2.5 pb-2 border-b border-[#E7E7E2]">
            <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="text-xl font-extrabold text-[#0A0A0A] tracking-tight">Deactivate Account</div>
          </div>
        }
        open={isModalOpen}
        onCancel={closeModal}
        footer={null}
        width={480}
        centered
      >
        <div className="py-2 space-y-4 font-sans">
          <p className="text-sm text-[#66665E] leading-relaxed">
            Your public profile will be hidden immediately. You can undo this from settings during the grace period;
            after that the account is closed permanently.
          </p>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">Reason (optional)</label>
            <Input.TextArea
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tell us why you're leaving"
              className="rounded-lg text-base sm:text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">Enter Password to Confirm</label>
            <Input.Password
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
              placeholder="Enter your account password"
              className="h-11 rounded-lg text-base sm:text-sm border-[#E7E7E2]"
              status={error ? 'error' : undefined}
            />
            {error && <span className="text-xs text-rose-600 font-semibold block">{error}</span>}
          </div>
          <div className="pt-3 border-t border-[#E7E7E2] flex items-center justify-end gap-2.5">
            <Button onClick={closeModal} className="rounded-lg h-10 px-5 font-semibold text-sm">
              Cancel
            </Button>
            <Button
              type="primary"
              danger
              loading={isDeactivating}
              onClick={handleConfirm}
              className="h-10 px-5 rounded-lg font-semibold text-sm bg-rose-600 hover:!bg-rose-700 text-white border-none shadow-xs cursor-pointer"
            >
              Deactivate Account
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
