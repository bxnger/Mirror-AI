"use client";

import { useCallback, useState } from "react";

/** Runs an async command, exposing pending + last error for inline UI states. */
export function useCommand() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setPending(false);
    }
  }, []);
  return { run, pending, error, clearError: () => setError(null) };
}
