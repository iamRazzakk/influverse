import { ApiError } from './core';

/**
 * One readable message for the UI from anything a request can throw (ApiError, Error, unknown).
 * Validation errors list their field messages, same as before.
 */
export const getErrorMessage = (error: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (error instanceof ApiError) {
    if (error.status === 0 && error.message === 'Could not reach the server') return 'Cannot reach the server. Check your connection.';
    const details = error.fieldErrors.map((e) => e.message).filter(Boolean);
    if (error.message === 'Validation Error' && details.length) return details.join(', ');
    return error.message || details[0] || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

/** Per-field validation errors from the server, e.g. `{ email: 'Invalid email address' }`. */
export const getFieldErrors = (error: unknown): Record<string, string> => {
  if (!(error instanceof ApiError)) return {};
  return Object.fromEntries(error.fieldErrors.filter((e) => e.path).map((e) => [e.path, e.message]));
};
