import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const LoadingContext = createContext(null);

/**
 * LoadingProvider
 *
 * isLoading is derived from whether the current location.key has been
 * marked "done" — no ref-counting, no effect-ordering races.
 *
 * Every navigation produces a unique location.key.
 *   isLoading = true   → key not yet in doneKeys
 *   isLoading = false  → page called stopLoading(), key is in doneKeys
 *
 * Safety net: if stopLoading() is never called (e.g. a page forgot),
 * the spinner auto-dismisses after 8 s so the UI is never permanently blocked.
 */
export function LoadingProvider({ children }) {
  const location = useLocation();
  const [doneKeys, setDoneKeys] = useState(() => new Set());

  const isLoading = !doneKeys.has(location.key);

  const stopLoading = useCallback(() => {
    const key = location.key;
    setDoneKeys(prev => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      // Prune old keys to prevent unbounded growth
      if (next.size > 20) {
        const arr = [...next];
        return new Set(arr.slice(arr.length - 15));
      }
      return next;
    });
  }, [location.key]);

  // Safety net — auto-dismiss if a page forgets to call stopLoading()
  useEffect(() => {
    if (!isLoading) return;
    const t = setTimeout(stopLoading, 8000);
    return () => clearTimeout(t);
  }, [location.key]);

  return (
    <LoadingContext.Provider value={{ isLoading, stopLoading }}>
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const ctx = useContext(LoadingContext);
  if (!ctx) throw new Error('useLoading must be used inside <LoadingProvider>');
  return ctx;
}
