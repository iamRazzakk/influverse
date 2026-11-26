import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, User, UserPlus } from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAcceptInviteMutation } from '@/lib/api/authApi';
import { getErrorMessage } from '@/lib/api/baseApi';

/** Opened from the team invitation email: `/accept-invite?token=...`. Logs the new admin in on success. */
export const AcceptInvitePage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [acceptInvite, { isLoading }] = useAcceptInviteMutation();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Please enter your name.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');

    try {
      await acceptInvite({ token, name: name.trim(), password }).unwrap();
      navigate(ROUTES.DASHBOARD.OVERVIEW, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'This invitation is invalid or has expired.'));
    }
  };

  if (!token) {
    return (
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-bold text-neutral-900">Invalid invitation</h2>
        <p className="text-xs text-neutral-500">This link is missing its token. Ask a super admin to resend the invite.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1">
        <div className="w-10 h-10 rounded-xl bg-pink-50 text-brand-pink flex items-center justify-center mb-3">
          <UserPlus className="w-5 h-5" />
        </div>
        <h2 className="text-xl font-bold text-neutral-900">Join the admin team</h2>
        <p className="text-xs text-neutral-500">Set your name and a password to activate your account.</p>
      </div>

      {error && (
        <div className="p-3 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">{error}</div>
      )}

      <div className="space-y-4">
        <Input
          label="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          leftIcon={<User className="w-4 h-4" />}
          required
          autoFocus
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leftIcon={<Lock className="w-4 h-4" />}
          required
        />
        <Input
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          leftIcon={<Lock className="w-4 h-4" />}
          required
        />
      </div>

      <Button type="submit" variant="primary" size="lg" className="w-full font-bold" isLoading={isLoading}>
        Activate Account
      </Button>
    </form>
  );
};
export default AcceptInvitePage;
