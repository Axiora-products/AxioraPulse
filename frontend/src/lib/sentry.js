import * as Sentry from '@sentry/react';

const parseSampleRate = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'local',
    tracesSampleRate: parseSampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.1),
    profilesSampleRate: parseSampleRate(import.meta.env.VITE_SENTRY_PROFILES_SAMPLE_RATE, 0),
    sendDefaultPii: false,
  });
}

export function captureSentrySmokeTest() {
  if (import.meta.env.VITE_SENTRY_DEBUG_ENABLED !== 'true') {
    return;
  }

  Sentry.captureException(new Error('Frontend Sentry smoke test'));
}
