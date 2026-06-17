/* ─────────────────────────────────────────────────────────────────
   Pending template bridge.

   When a logged-out visitor clicks "Create Survey" on a landing-page
   template, we stash the template here and send them to sign in / sign
   up. After authentication the redirect target is honoured and the
   survey builder picks the template back up — so the visitor lands
   exactly where they left off, with the template pre-loaded.

   Persisted in localStorage so it survives the hard page reload that
   the Cognito auth flow performs.
───────────────────────────────────────────────────────────────── */

const TEMPLATE_KEY = 'np-pending-template';
const REDIRECT_KEY = 'np-post-auth-redirect';

/** Stash a template ({ name, qs }) and where to send the user afterwards. */
export function setPendingTemplate(template, redirectTo = '/surveys/new') {
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(template));
    localStorage.setItem(REDIRECT_KEY, redirectTo);
  } catch (err) {
    console.warn('Could not persist pending template', err);
  }
}

/** Read (and clear) the pending template. Returns null when none is queued. */
export function consumePendingTemplate() {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    localStorage.removeItem(TEMPLATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function hasPendingTemplate() {
  try {
    return !!localStorage.getItem(TEMPLATE_KEY);
  } catch {
    return false;
  }
}

/**
 * Where to send the user after a successful sign in / sign up.
 * Reads (and clears) any stored redirect, falling back to the dashboard.
 */
export function consumePostAuthRedirect(fallback = '/dashboard') {
  try {
    const path = localStorage.getItem(REDIRECT_KEY);
    localStorage.removeItem(REDIRECT_KEY);
    return path || fallback;
  } catch {
    return fallback;
  }
}
