'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, message } from 'antd';
import { Loader2, MailCheck, RotateCw } from 'lucide-react';
import { Logo } from '@/components/shared/Logo';
import { http } from '@/lib/api/client';
import { authEndpoints } from '@/lib/api/endpoints/auth';
import { getErrorMessage } from '@/lib/api/errors';
import { useMutation } from '@/lib/hooks/useMutation';
import { useAuth } from '@/lib/session/AuthProvider';
import { homeFor } from '@/lib/session/routes';

const CODE_LENGTH = 6;
/** Same as the server's OTP_RESEND_COOLDOWN_SEC. */
const RESEND_COOLDOWN_SEC = 60;

/**
 * Step right after signup: the server emails a 6-digit code, the user types it here.
 * Workspace / onboarding pages send unverified users back to this page (see requireSession).
 */
export default function VerifyEmailPage() {
  const router = useRouter();
  // Root AuthProvider loads /me in the browser (this page stays static).
  const { status, currentUser, reload, signOut } = useAuth();
  const verifyEmail = useMutation(authEndpoints(http).verifyEmail, { refresh: false });
  const resendCode = useMutation(authEndpoints(http).resendVerificationEmail, { refresh: false });
  const isVerifying = verifyEmail.loading;
  const isResending = resendCode.loading;

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SEC);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Set while "Use another account" signs out, so the guest redirect below doesn't send the user
  // to /login instead of /register.
  const leavingRef = useRef(false);

  // Not logged in → login. Already verified → continue to onboarding / dashboard.
  useEffect(() => {
    if (leavingRef.current) return;
    if (status === 'guest') router.replace('/login?next=/verify-email');
    else if (status === 'authenticated' && currentUser?.emailVerified) {
      router.replace(homeFor(currentUser.role, currentUser.onboardingCompleted));
    }
  }, [status, currentUser, router]);

  // Resend countdown (a code was sent when the account was created).
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, [status]);

  const code = digits.join('');

  const setDigit = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned && value !== '') return;
    const next = [...digits];
    next[index] = cleaned.slice(-1);
    setDigits(next);
    if (cleaned && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = Array.from({ length: CODE_LENGTH }, (_, i) => pasted[i] ?? '');
    setDigits(next);
    inputRefs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < CODE_LENGTH) return;
    try {
      const { user } = await verifyEmail.run(code);
      // Re-read /me so the session shows `emailVerified: true`.
      await reload();
      message.success('Email verified!');
      router.replace(homeFor(user.role, user.onboardingCompleted));
    } catch (err) {
      message.error(getErrorMessage(err, 'Invalid or expired code'));
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    try {
      const msg = await resendCode.run();
      message.success(msg || 'A new code is on its way.');
      setCooldown(RESEND_COOLDOWN_SEC);
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleUseAnotherAccount = async () => {
    leavingRef.current = true;
    await signOut();
    router.replace('/register');
  };

  if (status !== 'authenticated' || !currentUser || currentUser.emailVerified) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#FAFAF8]">
        <Loader2 className="h-6 w-6 animate-spin text-[#A3A39B]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-flex items-center justify-center mb-5">
          <Logo size="lg" />
        </Link>
        <h2 className="text-3xl font-black text-[#0A0A0A] tracking-tight">Verify your email</h2>
        <p className="text-sm sm:text-base text-[#66665E] font-medium leading-[24px] mt-2 sm:mt-3">
          We sent a 6-digit code to <span className="font-bold text-[#0A0A0A]">{currentUser.email}</span>. Enter it
          below to activate your account.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-5 sm:px-10 shadow-xl shadow-black/[0.04] rounded-3xl border border-[#E7E7E2]">
          <div className="w-12 h-12 mx-auto mb-6 rounded-2xl bg-[#FF2D78]/10 text-[#FF2D78] flex items-center justify-center">
            <MailCheck className="w-6 h-6" />
          </div>

          <form onSubmit={handleVerify} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-[#0A0A0A] mb-2">Enter 6-digit code</label>
              <div className="flex items-center justify-between gap-1.5 sm:gap-2" onPaste={handlePaste}>
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    aria-label={`Digit ${index + 1}`}
                    value={digit}
                    onChange={(e) => setDigit(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl font-bold text-[#0A0A0A] bg-[#FAFAF8] border border-[#E7E7E2] rounded-xl outline-none focus:border-[#0A0A0A] focus:bg-white focus:ring-2 focus:ring-zinc-900/10 transition-all"
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-[#66665E] pt-1">
              <span>Didn&apos;t receive the code? Check spam too.</span>
              {cooldown > 0 ? (
                <span className="font-semibold">Resend in {cooldown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isResending}
                  className="font-bold text-[#0A0A0A] hover:text-[#FF2D78] flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                >
                  <RotateCw className="w-3 h-3" />
                  Resend Code
                </button>
              )}
            </div>

            <Button
              type="primary"
              htmlType="submit"
              loading={isVerifying}
              disabled={code.length < CODE_LENGTH}
              size="large"
              className="w-full bg-[#0A0A0A] hover:!bg-[#FF2D78] disabled:opacity-40 disabled:cursor-not-allowed !text-white rounded-full font-bold text-sm h-12 transition-all shadow-sm cursor-pointer"
            >
              Verify Email
            </Button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={handleUseAnotherAccount}
                className="text-xs text-[#66665E] hover:text-[#0A0A0A] font-semibold underline cursor-pointer"
              >
                Wrong email? Sign up with another account
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
