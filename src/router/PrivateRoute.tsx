import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAppSelector } from '@/store/hooks';
import { ROUTES } from '@/constants/routes';

export const PrivateRoute: React.FC = () => {
  const status = useAppSelector((state) => state.auth.status);
  const location = useLocation();

  // Still restoring the session from the refresh cookie — don't bounce to login yet.
  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to={ROUTES.AUTH.LOGIN} replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
};

/** Login / forgot-password pages: an already logged-in admin goes straight to the dashboard. */
export const GuestRoute: React.FC = () => {
  const status = useAppSelector((state) => state.auth.status);
  if (status === 'authenticated') return <Navigate to={ROUTES.DASHBOARD.OVERVIEW} replace />;
  return <Outlet />;
};
