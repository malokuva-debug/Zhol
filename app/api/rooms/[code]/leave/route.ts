import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoom, saveRoom, deleteRoom } from "@/lib/store";
import { markLeft } from "@/lib/room-logic";
import { publishRoomUpdate, publishLobbyUpdate } from "@/lib/pusher";

const Schema = z.object({ clientId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const room = await getRoom(code.toUpperCase());
  if (!room) return NextResponse.json({ ok: true }); // already gone

  markLeft(room, parsed.data.clientId);

  const anyoneLeft = room.seats.some(Boolean);
  if (!anyoneLeft && room.status === "waiting") {
    await deleteRoom(room.code);
  } else {
    await saveRoom(room);
  }
  await publishRoomUpdate(room.code);
  await publishLobbyUpdate();
  return NextResponse.json({ ok: true });
}
