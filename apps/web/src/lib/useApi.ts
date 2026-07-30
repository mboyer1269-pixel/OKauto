"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiClientError } from "./api";

interface UseApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Simple data-fetching hook with reload support. Pass null to skip. */
export function useApi<T>(path: string | null): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(path));
  const [tick, setTick] = useState(0);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api<T>(path)
      .then((result) => {
        if (active.current) setData(result);
      })
      .catch((err) => {
        if (active.current) setError(err instanceof ApiClientError ? err.message : "Something went wrong");
      })
      .finally(() => {
        if (active.current) setLoading(false);
      });
    return () => {
      active.current = false;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
