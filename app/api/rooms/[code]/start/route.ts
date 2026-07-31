import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoom, saveRoom } from "@/lib/store";
import { canStart, startGame } from "@/lib/room-logic";
import { publishRoomUpdate, publishLobbyUpdate } from "@/lib/pusher";

const Schema = z.object({ clientId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const room = await getRoom(code.toUpperCase());
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (room.hostClientId !== parsed.data.clientId) {
    return NextResponse.json({ error: "Only the host can start the game." }, { status: 403 });
  }
  if (!canStart(room)) {
    return NextResponse.json({ error: "Both players must be seated and ready." }, { status: 400 });
  }

  startGame(room);
  await saveRoom(room);
  await publishRoomUpdate(room.code);
  await publishLobbyUpdate();
  return NextResponse.json({ ok: true });
}
