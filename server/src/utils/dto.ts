/**
 * API responses expose `id` (string) instead of Mongo's `_id`.
 * Works on lean documents (plain objects) — no Mongoose hydration needed.
 */
export const withId = <T extends { _id: unknown }>(doc: T): Omit<T, "_id"> & { id: string } => {
  const { _id, ...rest } = doc;
  return { ...rest, id: String(_id) };
};

/** Same as `withId` for arrays (list endpoints). */
export const withIds = <T extends { _id: unknown }>(docs: T[]) => docs.map(withId);

/** Drop keys from a plain object (used to strip private fields from lean docs). */
export const omit = <T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> => {
  const copy = { ...obj };
  for (const key of keys) delete copy[key];
  return copy;
};
