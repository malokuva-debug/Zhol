"use client";

import { useEffect, useRef } from "react";
import Pusher from "pusher-js";

let sharedClient: Pusher | null = null;

function getClient(): Pusher | null {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) return null;
  if (!sharedClient) {
    sharedClient = new Pusher(key, { cluster });
  }
  return sharedClient;
}

/**
 * Subscribes to a channel and invokes `onEvent` whenever the named event
 * fires. Falls back to polling (handled by the caller) if Pusher env vars
 * aren't configured, so local dev works even before you set up an account.
 */
export function usePusherEvent(channelName: string | null, eventName: string, onEvent: () => void) {
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    if (!channelName) return;
    const client = getClient();
    if (!client) return; // caller should poll as a fallback

    const channel = client.subscribe(channelName);
    const handler = () => cb.current();
    channel.bind(eventName, handler);

    return () => {
      channel.unbind(eventName, handler);
      client.unsubscribe(channelName);
    };
  }, [channelName, eventName]);
}

export function isRealtimeConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_PUSHER_KEY && !!process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
}
