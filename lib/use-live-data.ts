"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePusherEvent, isRealtimeConfigured } from "./use-pusher";

/**
 * Fetches `url` and keeps the result fresh via Pusher push events on
 * `channel`/`event`. Also polls every `pollMs` as a safety net (and as the
 * sole update mechanism if Pusher env vars aren't set yet, e.g. first local run).
 */
export function useLiveData<T>(
  url: string | null,
  channel: string | null,
  event: string,
  pollMs = 4000
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const urlRef = useRef(url);
  urlRef.current = url;

  const refetch = useCallback(async () => {
    if (!urlRef.current) return;
    try {
      const res = await fetch(urlRef.current, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Request failed.");
        return;
      }
      setError(null);
      setData(json);
    } catch {
      setError("Connection issue — retrying…");
    } finally {
      setLoading(false);
    }
  }, []);

  usePusherEvent(channel, event, refetch);

  useEffect(() => {
    if (!url) return;
    refetch();
    const effectivePoll = isRealtimeConfigured() ? pollMs * 3 : pollMs; // still poll lightly even with realtime, as a safety net
    const id = setInterval(refetch, effectivePoll);
    return () => clearInterval(id);
  }, [url, pollMs, refetch]);

  return { data, error, loading, refetch };
}
