import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoom, saveRoom } from "@/lib/store";
import { canStart, startGame } from "@/lib/room-logic";
import { publishRoomUpdate, publishLobbyUpdate } from "@/lib/pusher";

const StartSchema = z.object({
  clientId: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await req.json().catch(() => null);
  const parsed = StartSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const room = await getRoom(code.toUpperCase());
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  // Pass both room and clientId to canStart
  const check = canStart(room, parsed.data.clientId);
  if (!check.ok) {
    return NextResponse.json({ error: check.error || "Cannot start game." }, { status: 400 });
  }

  startGame(room);
  await saveRoom(room);

  await publishRoomUpdate(room.code);
  await publishLobbyUpdate();

  return NextResponse.json({ ok: true });
}
