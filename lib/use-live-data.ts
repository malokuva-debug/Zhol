import { useState, useEffect, useRef } from "react";
import Pusher from "pusher-js";

export function useLiveData<T>(
  url: string | null,
  channelName: string,
  eventName: string,
  pollIntervalMs = 2500
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDeadRef = useRef(false);

  useEffect(() => {
    if (!url) return;
    isDeadRef.current = false;

    async function fetchData() {
      if (isDeadRef.current) return;
      try {
        const res = await fetch(url!);
        if (res.status === 404) {
          isDeadRef.current = true;
          setError("404 Room not found");
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to sync room data.");
        }
        const json = await res.json();
        setData(json);
        setError(null);
      } catch (e) {
        if (!isDeadRef.current) {
          setError(e instanceof Error ? e.message : "Sync error.");
        }
      }
    }

    fetchData();

    const interval = setInterval(() => {
      if (!isDeadRef.current) {
        fetchData();
      }
    }, pollIntervalMs);

    let channel: any = null;
    let pusher: Pusher | null = null;

    if (process.env.NEXT_PUBLIC_PUSHER_KEY && process.env.NEXT_PUBLIC_PUSHER_CLUSTER) {
      pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
      });

      channel = pusher.subscribe(channelName);
      channel.bind(eventName, () => {
        if (!isDeadRef.current) fetchData();
      });
    }

    return () => {
      clearInterval(interval);
      if (channel) channel.unbind_all();
      if (pusher) pusher.unsubscribe(channelName);
    };
  }, [url, channelName, eventName, pollIntervalMs]);

  return { data, error };
}
