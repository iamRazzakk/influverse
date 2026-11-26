/**
 * Human-readable follower / view counts for API responses ("450K", "1.2M").
 * Stored values in Mongo are always plain numbers; formatting only happens on the way out.
 */
export const formatCount = (value = 0): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(value);
};
