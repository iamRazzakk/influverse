export const ROUTES = {
  AUTH: {
    LOGIN: '/login',
    FORGOT_PASSWORD: '/forgot-password',
    RESET_PASSWORD: '/reset-password',
    ACCEPT_INVITE: '/accept-invite',
  },
  DASHBOARD: {
    OVERVIEW: '/',
    ANALYTICS: '/analytics',
    USERS: '/users',
    VERIFICATION: '/verification',
    ORDERS: '/orders',
    TRANSACTIONS: '/transactions',
    TICKETS: '/tickets',
    CMS: '/cms',
    TEAM: '/team',
    SETTINGS: '/settings',
  },
} as const;
