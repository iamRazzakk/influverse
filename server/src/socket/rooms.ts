/** Socket room naming — in one place so a typo can't cause a leak (docs/00-final-plan.md §6). */
export const rooms = {
  user: (userId: string) => `user:${userId}`,
  admin: (adminId: string) => `admin:${adminId}`,
  /** All admins (verification / dispute / ticket alerts) */
  admins: "admins",
  conversation: (conversationId: string) => `conv:${conversationId}`,
} as const;
