'use client';

// components/use-device-data.ts
//
// One small hook for "read something out of this device's storage once the page is running."
//
// Every screen that shows saved data needs the same four things: the value, whether it's
// still loading, whether it failed, and a way to re-read it after a change. Rather than
// repeat that in the roster, the athlete page and the results page, it lives here once.
//
// WHY IT HAS TO BE AN EFFECT: IndexedDB and sessionStorage only exist in the browser. Next.js
// renders these pages on the server first, where neither is available, so the read cannot
// happen during render — it has to wait until the component is running in the browser. That
// is exactly what an effect is for.

import { useCallback, useEffect, useState } from 'react';

export type DeviceData<T> = {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** Re-read from storage. Call after saving or deleting something. */
  reload: () => Promise<void>;
};

/**
 * @param load An async function that reads from device storage. Wrap it in useCallback in the
 *             calling component, otherwise a new function every render would re-trigger the
 *             read forever.
 */
export function useDeviceData<T>(load: () => Promise<T>): DeviceData<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const value = await load();
        // If the component was removed (or the id in the URL changed) while we were waiting
        // on the database, throw the answer away instead of writing it into a screen that has
        // already moved on.
        if (!active) return;
        setData(value);
        setError(null);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught : new Error(String(caught)));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [load]);

  return { data, loading, error, reload: run };
}
