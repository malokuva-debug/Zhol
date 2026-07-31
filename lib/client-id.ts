"use client";

const NICKNAME_KEY = "zhol.nickname";
const CLIENT_ID_KEY = "zhol.clientId";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const RECENT_ROOMS_KEY = "zhol.recentRooms";

export function getRecentRooms(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_ROOMS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addRecentRoom(code: string): void {
  if (typeof window === "undefined") return;
  const rooms = getRecentRooms();
  // Keep the 3 most recent rooms, putting the newest at the front
  const updated = [code, ...rooms.filter((r) => r !== code)].slice(0, 3);
  localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(updated));
}

export function removeRecentRoom(code: string): void {
  if (typeof window === "undefined") return;
  const rooms = getRecentRooms();
  localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(rooms.filter((r) => r !== code)));
}

/** Stable per-device identifier. Not an account — just lets the server
 * recognize "this browser" for reconnect / seat ownership purposes. */
export function getClientId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function getNickname(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NICKNAME_KEY) || "";
}

export function setNickname(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(NICKNAME_KEY, name.trim().slice(0, 20));
}
