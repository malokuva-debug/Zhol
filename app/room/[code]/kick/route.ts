import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoom, saveRoom } from "@/lib/store";
import { markLeft } from "@/lib/room-logic";
import { publishRoomUpdate, publishLobbyUpdate } from "@/lib/pusher";

const Schema = z.object({
  clientId: z.string().min(1),
  targetClientId: z.string().min(1)
});

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);

  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const room = await getRoom(code.toUpperCase());
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  // Only allow the host to kick players
  if (room.hostClientId !== parsed.data.clientId) {
    return NextResponse.json({ error: "Only the host can kick players." }, { status: 403 });
  }

  // Remove the target player from the room
  markLeft(room, parsed.data.targetClientId);

  await saveRoom(room);
  await publishRoomUpdate(room.code);
  await publishLobbyUpdate();

  return NextResponse.json({ ok: true });
}
