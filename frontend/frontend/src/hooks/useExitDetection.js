import { useEffect } from 'react';
import API from '../api/axios';

/**
 * useExitDetection
 * ─────────────────────────────────────────────────────────────────
 * Attaches three browser-level exit listeners so abandoned responses
 * are always flagged, even when the tab is killed mid-survey.
 *
 * Usage in SurveyRespond
 * ──────────────────────
 *   useExitDetection(responseIdRef, tracker.onAbandon, isDone);
 *
 *   responseIdRef  — React ref holding the current survey_response UUID
 *   onAbandon      — tracker.onAbandon from useResponseTracking
 *   isDone         — boolean; if true the survey is complete, skip listeners
 */
export function useExitDetection(responseIdRef, onAbandon, isDone = false) {
  useEffect(() => {
    if (isDone) return;

    let fired = false;

    function handle() {
      if (fired) return;
      fired = true;
      onAbandon?.();
    }

    // pagehide fires reliably on mobile + bfcache scenarios
    window.addEventListener('pagehide', handle);

    // beforeunload fires on desktop close/refresh
    window.addEventListener('beforeunload', handle);

    // visibilitychange catches tab switching to background on mobile
    function onVisibility() {
      if (document.visibilityState === 'hidden') handle();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('pagehide', handle);
      window.removeEventListener('beforeunload', handle);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isDone, onAbandon, responseIdRef]);
}

/**
 * markAbandoned
 * ─────────────────────────────────────────────────────────────────
 * Utility for manual abandon marking (e.g., if user navigates away
 * via React Router without closing the tab).
 */
export async function markAbandoned(responseId) {
  if (!responseId) return;
  try {
    await API.post(`/responses/${responseId}/abandon`);
  } catch (e) {
    console.warn('[ExitDetection] markAbandoned failed:', e?.message);
  }
}
