import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, Lock } from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useResetPasswordMutation } from '@/lib/api/authApi';
import { getErrorMessage } from '@/lib/api/baseApi';

/** Opened from the reset email: `/reset-password?token=...` */
export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [resetPassword, { isLoading }] = useResetPasswordMutation();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');

    try {
      await resetPassword({ token, password }).unwrap();
      navigate(ROUTES.AUTH.LOGIN, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'This reset link is invalid or has expired.'));
    }
  };

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-xl font-bold text-neutral-900">Invalid link</h2>
        <p className="text-xs text-neutral-500">This reset link is missing its token. Request a new one.</p>
        <Link to={ROUTES.AUTH.FORGOT_PASSWORD} className="text-xs font-semibold text-brand-pink hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1">
        <div className="w-10 h-10 rounded-xl bg-pink-50 text-brand-pink flex items-center justify-center mb-3">
          <KeyRound className="w-5 h-5" />
        </div>
        <h2 className="text-xl font-bold text-neutral-900">Set a new password</h2>
        <p className="text-xs text-neutral-500">Use at least 8 characters.</p>
      </div>

      {error && (
        <div className="p-3 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">{error}</div>
      )}

      <div className="space-y-4">
        <Input
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leftIcon={<Lock className="w-4 h-4" />}
          required
          autoFocus
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
        Update Password
      </Button>

      <div className="text-center pt-1">
        <Link
          to={ROUTES.AUTH.LOGIN}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Sign In</span>
        </Link>
      </div>
    </form>
  );
};
export default ResetPasswordPage;
