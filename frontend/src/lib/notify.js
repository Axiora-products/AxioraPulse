/**
 * lib/notify.js
 * ─────────────
 * Centralized notification service. Thin, consistent wrapper over react-hot-toast
 * (configured globally in App.jsx: bottom-right, auto-hide after 4s, dismissible).
 *
 * Use this everywhere instead of importing react-hot-toast directly so success
 * and error feedback stays consistent, and route ALL API/exception errors through
 * notify.apiError() so users never see raw technical detail.
 */

import toast from 'react-hot-toast';

import { getApiErrorMessage } from './apiError';
import { ERROR } from './messages';

export const notify = {
  success: (message, opts) => toast.success(message, opts),
  error: (message, opts) => toast.error(message, opts),
  info: (message, opts) => toast(message, opts),
  warning: (message, opts) => toast(message, { icon: '⚠️', ...opts }),
  loading: (message, opts) => toast.loading(message, opts),
  dismiss: (id) => toast.dismiss(id),
  promise: (promise, messages, opts) => toast.promise(promise, messages, opts),

  /**
   * Show a friendly toast for any caught error. The technical detail is logged
   * internally (see apiError.logTechnicalError) but never displayed.
   */
  apiError: (error, fallback = ERROR.GENERIC, opts) =>
    toast.error(getApiErrorMessage(error, fallback), opts),
};

export default notify;
