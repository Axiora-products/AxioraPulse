/**
 * lib/apiError.js
 * ───────────────
 * Centralized translation of any thrown error (axios HTTP errors, Cognito/Amplify
 * auth errors, network failures) into a clear, user-friendly message.
 *
 * Rules:
 *   - NEVER return raw backend detail, status codes, stack traces or exception
 *     text. Callers pass an action-specific fallback (e.g. "Unable to publish the
 *     survey.") which is used for unclassified failures.
 *   - Technical detail is logged internally for debugging (console + Sentry), but
 *     never surfaced to the user.
 */

import { ERROR } from './messages';

/** Log the full technical error internally without exposing it to the user. */
export function logTechnicalError(error, context = '') {
  try {
    // eslint-disable-next-line no-console
    console.error(`[api-error]${context ? ' ' + context : ''}`, error);
    if (typeof window !== 'undefined' && window.Sentry?.captureException) {
      window.Sentry.captureException(error);
    }
  } catch {
    /* logging must never throw */
  }
}

/** Map common Cognito/Amplify auth error text to friendly copy. */
function authMessageFrom(text = '') {
  const m = String(text).toLowerCase();
  if (!m) return null;
  if (m.includes('incorrect') || m.includes('invalid login') || m.includes('invalid credentials') ||
      m.includes('notauthorized') || m.includes('email not confirmed'))
    return ERROR.LOGIN_FAILED;
  if (m.includes('expired') || (m.includes('token') && m.includes('expire')))
    return ERROR.UNAUTHORIZED;
  if (m.includes('rate limit') || m.includes('too many') || m.includes('limitexceeded'))
    return ERROR.RATE_LIMITED;
  if (m.includes('network') || m.includes('fetch') || m.includes('failed to fetch'))
    return ERROR.NETWORK;
  if (m.includes('usernotfound') || m.includes('user does not exist'))
    return ERROR.LOGIN_FAILED;
  return null;
}

/**
 * Translate any error into a user-friendly message.
 * @param {*} error    The caught error (axios error, Error, string, etc.)
 * @param {string} fallback Action-specific friendly message for unclassified cases.
 */
export function getApiErrorMessage(error, fallback = ERROR.GENERIC) {
  logTechnicalError(error);

  // Network / no response (offline, DNS, CORS, timeout)
  if (error && (error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '')))
    return ERROR.TIMEOUT;
  if (error && error.request && !error.response)
    return ERROR.NETWORK;
  if (error && /network/i.test(error.message || ''))
    return ERROR.NETWORK;

  const status = error?.response?.status;
  if (status) {
    switch (status) {
      case 400:
      case 422:
        return fallback || ERROR.VALIDATION;
      case 401:
        return ERROR.UNAUTHORIZED;
      case 403:
        return ERROR.FORBIDDEN;
      case 404:
        return fallback || ERROR.NOT_FOUND;
      case 408:
      case 504:
        return ERROR.TIMEOUT;
      case 409:
        return fallback || ERROR.CONFLICT;
      case 413:
        return ERROR.FILE_TOO_LARGE;
      case 429:
        return ERROR.RATE_LIMITED;
      default:
        if (status >= 500) return ERROR.SERVER;
        return fallback || ERROR.GENERIC;
    }
  }

  // Non-HTTP errors (Cognito/Amplify, thrown Errors, strings)
  const text = typeof error === 'string' ? error : error?.message || '';
  return authMessageFrom(text) || fallback || ERROR.GENERIC;
}

/** Back-compat helper for the auth pages' previous friendlyAuthError(). */
export function getAuthErrorMessage(error, fallback = ERROR.LOGIN_FAILED) {
  return getApiErrorMessage(error, fallback);
}
