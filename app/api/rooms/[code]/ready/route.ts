import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoom, saveRoom } from "@/lib/store";
import { publishRoomUpdate } from "@/lib/pusher";

const Schema = z.object({ clientId: z.string().min(1), ready: z.boolean() });

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const room = await getRoom(code.toUpperCase());
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (room.status !== "waiting") return NextResponse.json({ error: "Game already started." }, { status: 400 });

  const seat = room.seats.find((s) => s?.clientId === parsed.data.clientId);
  if (!seat) return NextResponse.json({ error: "You're not seated in this room." }, { status: 400 });
  seat.ready = parsed.data.ready;

  await saveRoom(room);
  await publishRoomUpdate(room.code);
  return NextResponse.json({ ok: true });
}
