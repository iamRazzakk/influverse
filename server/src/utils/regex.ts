/**
 * Escape user input before putting it inside a RegExp.
 * Without this, a search like `.*(a+)+$` becomes a ReDoS payload or matches everything.
 */
export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
