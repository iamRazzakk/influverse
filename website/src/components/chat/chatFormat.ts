/** Small, pure formatting helpers for the chat UI. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Inbox timestamp: "now", "5m", "3h", "Mon", "12 Nov", "12 Nov 2025". */
export const formatInboxTime = (iso: string | null | undefined) => {
  if (!iso) return '';
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < MINUTE) return 'now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY && new Date().getDate() === date.getDate()) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 6 * DAY) return date.toLocaleDateString('en-GB', { weekday: 'short' });
  const sameYear = new Date().getFullYear() === date.getFullYear();
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
};

/** Bubble time: "14:05". */
export const formatBubbleTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Day separator: "Today", "Yesterday", "Monday, 12 November". */
export const formatDayLabel = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(date)) / DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(today.getFullYear() === date.getFullYear() ? {} : { year: 'numeric' }),
  });
};

export const isSameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();
