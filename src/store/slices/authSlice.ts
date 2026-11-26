import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AdminUser } from '@/types/admin.types';

/**
 * `checking`      — app just opened, we are trying the refresh cookie to restore the session
 * `authenticated` — we have an access token and the admin profile
 * `guest`         — not logged in
 *
 * The access token lives only in memory (never localStorage), the refresh token
 * is an httpOnly cookie the browser sends to /admin/auth/refresh by itself.
 */
export type AuthStatus = 'checking' | 'authenticated' | 'guest';

interface AuthState {
  accessToken: string | null;
  currentUser: AdminUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  accessToken: null,
  currentUser: null,
  status: 'checking',
  isAuthenticated: false,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signedIn: (state, action: PayloadAction<{ accessToken: string; admin: AdminUser }>) => {
      state.accessToken = action.payload.accessToken;
      state.currentUser = action.payload.admin;
      state.status = 'authenticated';
      state.isAuthenticated = true;
    },
    setAccessToken: (state, action: PayloadAction<string>) => {
      state.accessToken = action.payload;
    },
    setCurrentAdmin: (state, action: PayloadAction<AdminUser>) => {
      state.currentUser = action.payload;
    },
    signedOut: (state) => {
      state.accessToken = null;
      state.currentUser = null;
      state.status = 'guest';
      state.isAuthenticated = false;
    },
  },
});

export const { signedIn, setAccessToken, setCurrentAdmin, signedOut } = authSlice.actions;
export default authSlice.reducer;
