import PusherServer from "pusher";

/**
 * Managed real-time service (Pusher Channels) — chosen specifically because
 * it works from Vercel's serverless functions over plain HTTPS (no long-lived
 * socket needed on the server side), unlike a self-hosted `ws` server which
 * cannot run on Vercel's serverless runtime.
 */
let _server: PusherServer | null = null;

export function pusherServer(): PusherServer {
  if (!_server) {
    _server = new PusherServer({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER || "eu",
      useTLS: true,
    });
  }
  return _server;
}

export const roomChannel = (code: string) => `room-${code}`;
export const lobbyChannel = () => "lobby";

// Event names, centralized so client/server can't drift
export const EVENTS = {
  ROOM_UPDATED: "room-updated",
  GAME_UPDATED: "game-updated",
  CHAT_MESSAGE: "chat-message",
  LOBBY_UPDATED: "lobby-updated",
} as const;

export async function publishRoomUpdate(code: string) {
  await pusherServer().trigger(roomChannel(code), EVENTS.ROOM_UPDATED, { code, at: Date.now() });
}

export async function publishLobbyUpdate() {
  await pusherServer().trigger(lobbyChannel(), EVENTS.LOBBY_UPDATED, { at: Date.now() });
}
