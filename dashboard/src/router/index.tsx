import React from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import { GuestRoute, PrivateRoute } from './PrivateRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';

import { LoginPage } from '@/pages/auth/LoginPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { AcceptInvitePage } from '@/pages/auth/AcceptInvitePage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { UsersPage } from '@/pages/dashboard/UsersPage';
import { VerificationPage } from '@/pages/dashboard/VerificationPage';
import { TransactionsPage } from '@/pages/dashboard/TransactionsPage';
import { OrdersPage } from '@/pages/dashboard/OrdersPage';
import { TicketsPage } from '@/pages/dashboard/TicketsPage';
import { CmsPage } from '@/pages/dashboard/CmsPage';
import { TeamPage } from '@/pages/dashboard/TeamPage';
import { SettingsPage } from '@/pages/dashboard/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export const router = createBrowserRouter([
  // Authentication Routes
  {
    element: <AuthLayout />,
    children: [
      {
        element: <GuestRoute />,
        children: [
          { path: ROUTES.AUTH.LOGIN, element: <LoginPage /> },
          { path: ROUTES.AUTH.FORGOT_PASSWORD, element: <ForgotPasswordPage /> },
        ],
      },
      // Email links work whether or not someone is logged in on this browser.
      { path: ROUTES.AUTH.RESET_PASSWORD, element: <ResetPasswordPage /> },
      { path: ROUTES.AUTH.ACCEPT_INVITE, element: <AcceptInvitePage /> },
    ],
  },

  // Protected Dashboard Routes
  {
    element: <PrivateRoute />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          {
            path: ROUTES.DASHBOARD.OVERVIEW,
            element: <DashboardPage />,
          },
          {
            path: ROUTES.DASHBOARD.USERS,
            element: <UsersPage />,
          },
          {
            path: ROUTES.DASHBOARD.VERIFICATION,
            element: <VerificationPage />,
          },
          {
            path: ROUTES.DASHBOARD.ORDERS,
            element: <OrdersPage />,
          },
          {
            path: ROUTES.DASHBOARD.TRANSACTIONS,
            element: <TransactionsPage />,
          },
          {
            path: ROUTES.DASHBOARD.TICKETS,
            element: <TicketsPage />,
          },
          {
            path: ROUTES.DASHBOARD.CMS,
            element: <CmsPage />,
          },
          {
            path: ROUTES.DASHBOARD.TEAM,
            element: <TeamPage />,
          },
          {
            path: ROUTES.DASHBOARD.SETTINGS,
            element: <SettingsPage />,
          },
        ],
      },
    ],
  },

  // Fallback 404
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
