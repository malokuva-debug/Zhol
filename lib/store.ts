import { Redis } from "@upstash/redis";
import type { Room, RoomSummary } from "./types";

/**
 * Vercel serverless functions are stateless and don't share memory between
 * invocations, so authoritative room/game state must live in a shared store.
 * We use Upstash Redis (REST-based, works over fetch, no TCP sockets needed —
 * ideal for the Edge/serverless runtime on Vercel).
 *
 * For local development without an Upstash account, this falls back to a
 * process-local in-memory Map. That fallback is single-instance only and
 * will NOT work correctly once deployed to Vercel (each invocation may hit
 * a different lambda), so production deployments must set the two
 * UPSTASH_REDIS_REST_* env vars.
 */

const hasRedis = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = hasRedis
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// In-memory fallback (dev only)
const memStore = new Map<string, string>();
const memIndex = new Set<string>(); // room codes

const ROOM_KEY = (code: string) => `zhol:room:${code}`;
const INDEX_KEY = "zhol:room-index";
const ROOM_TTL_SECONDS = 60 * 60 * 6; // 6h — abandoned rooms self-expire

export async function saveRoom(room: Room): Promise<void> {
  const json = JSON.stringify(room);
  if (redis) {
    await redis.set(ROOM_KEY(room.code), json, { ex: ROOM_TTL_SECONDS });
    await redis.sadd(INDEX_KEY, room.code);
  } else {
    memStore.set(ROOM_KEY(room.code), json);
    memIndex.add(room.code);
  }
}

export async function getRoom(code: string): Promise<Room | null> {
  if (redis) {
    const data = await redis.get<Room | string>(ROOM_KEY(code));
    if (!data) return null;
    return typeof data === "string" ? JSON.parse(data) : data;
  }
  const raw = memStore.get(ROOM_KEY(code));
  return raw ? JSON.parse(raw) : null;
}

export async function deleteRoom(code: string): Promise<void> {
  if (redis) {
    await redis.del(ROOM_KEY(code));
    await redis.srem(INDEX_KEY, code);
  } else {
    memStore.delete(ROOM_KEY(code));
    memIndex.delete(code);
  }
}

export async function listRoomCodes(): Promise<string[]> {
  if (redis) {
    return (await redis.smembers(INDEX_KEY)) as string[];
  }
  return [...memIndex];
}

export async function listRoomSummaries(): Promise<RoomSummary[]> {
  const codes = await listRoomCodes();
  const rooms = await Promise.all(codes.map((c) => getRoom(c)));
  const summaries: RoomSummary[] = [];
  for (const room of rooms) {
    if (!room) continue;
    // prune rooms finished & idle for a long time from the lobby view
    const idleMs = Date.now() - room.createdAt;
    if (room.status === "finished" && idleMs > 1000 * 60 * 30) continue;
    summaries.push({
      code: room.code,
      name: room.name,
      visibility: room.visibility,
      hasPassword: !!room.passwordHash,
      hostNickname: room.seats.find((s) => s?.clientId === room.hostClientId)?.nickname ?? "?",
      playerCount: room.seats.filter(Boolean).length,
      maxPlayers: room.maxPlayers,
      status: room.status,
      rules: room.rules,
      createdAt: room.createdAt,
    });
  }
  return summaries.sort((a, b) => b.createdAt - a.createdAt);
}
