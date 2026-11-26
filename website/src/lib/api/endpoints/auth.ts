import type { ApiClient } from '../types';
import type { AuthUser, UserRole } from '@/types/api';

/** Login / register return the user; the session itself lives in httpOnly cookies set by the backend. */
export interface AuthResult {
  user: AuthUser;
}

export interface SessionInfo {
  id: string;
  current: boolean;
  /** e.g. "Chrome on Windows" */
  deviceLabel?: string;
  ip?: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface RegisterInput {
  role: UserRole;
  name: string;
  email: string;
  password: string;
  phone?: string;
  rememberMe?: boolean;
}

/** `/auth/*` endpoints for brands and creators. */
export const authEndpoints = (c: ApiClient) => ({
  register: (body: RegisterInput) => c.post<AuthResult>('/auth/register', body),
  login: (body: { email: string; password: string; rememberMe?: boolean }) => c.post<AuthResult>('/auth/login', body),
  logout: (allDevices = false) => c.post(allDevices ? '/auth/logout-all' : '/auth/logout'),

  /** Checks the 6-digit code sent on signup. */
  verifyEmail: (otp: string) => c.post<{ user: AuthUser }>('/auth/verify-email', { otp }),
  resendVerificationEmail: async () => (await c.raw('POST', '/auth/resend-verification')).message,

  forgotPassword: async (email: string) => (await c.raw('POST', '/auth/forgot-password', { email })).message,
  /** Returns a short-lived `resetToken` used by resetPassword. */
  verifyOtp: (email: string, otp: string) => c.post<{ resetToken: string }>('/auth/verify-otp', { email, otp }),
  resetPassword: async (resetToken: string, password: string) =>
    (await c.raw('POST', '/auth/reset-password', { resetToken, password })).message,
  /** Other devices are signed out; the backend replaces this device's `at` cookie. */
  changePassword: (currentPassword: string, newPassword: string) =>
    c.post('/auth/change-password', { currentPassword, newPassword }),

  sessions: () => c.get<SessionInfo[]>('/auth/sessions'),
  revokeSession: (id: string) => c.delete(`/auth/sessions/${id}`),

  /** 60-second ticket for `io(url, { auth: { ticket } })`. */
  socketTicket: () => c.post<{ ticket: string; expiresIn: number }>('/auth/socket-ticket'),
});
