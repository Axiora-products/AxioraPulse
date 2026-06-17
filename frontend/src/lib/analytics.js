/* ─────────────────────────────────────────────────────────────────
   Lightweight, dependency-free analytics dispatcher.

   Pulse has no bundled analytics SDK, so this fans events out to any
   provider that happens to be present on `window` (GA4 / GTM / Segment)
   and always mirrors to the console in dev. Calls are wrapped so a
   missing or throwing provider never breaks the UI.

   Usage:
     import { track, ANALYTICS_EVENTS } from '../lib/analytics';
     track(ANALYTICS_EVENTS.TEMPLATE_PREVIEW_OPENED, { template: 'NPS' });
───────────────────────────────────────────────────────────────── */

export const ANALYTICS_EVENTS = {
  TEMPLATE_VIEWED:            'template_viewed',
  TEMPLATE_PREVIEW_OPENED:    'template_preview_opened',
  CREATE_SURVEY_CLICKED:      'create_survey_clicked',
  AUTHENTICATION_REDIRECTED:  'authentication_redirected',
  TEMPLATE_SUCCESSFULLY_USED: 'template_successfully_used',
};

export function track(event, props = {}) {
  if (!event) return;
  const payload = { ...props, timestamp: new Date().toISOString() };

  try {
    // Google Tag Manager
    if (typeof window !== 'undefined' && Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event, ...payload });
    }
    // Google Analytics 4
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', event, payload);
    }
    // Segment
    if (typeof window !== 'undefined' && window.analytics && typeof window.analytics.track === 'function') {
      window.analytics.track(event, payload);
    }
  } catch (err) {
    // Never let analytics break the experience.
    console.warn('[analytics] dispatch failed', err);
  }

  if (typeof window !== 'undefined' && import.meta?.env?.DEV) {
    console.debug('[analytics]', event, payload);
  }
}
