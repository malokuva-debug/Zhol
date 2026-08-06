// Inside app/api/rooms/[code]/join/route.ts

import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoom, saveRoom } from "@/lib/store";
// 1. ADD enforceTeamAssignments TO YOUR IMPORTS
import { tryJoinRoom, enforceTeamAssignments } from "@/lib/room-logic";
import { publishRoomUpdate, publishLobbyUpdate } from "@/lib/pusher";

const JoinSchema = z.object({
  nickname: z.string().min(1).max(20),
  clientId: z.string().min(1),
  password: z.string().max(40).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await req.json().catch(() => null);
  const parsed = JoinSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const room = await getRoom(code.toUpperCase());
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const result = tryJoinRoom(room, parsed.data.nickname, parsed.data.clientId, parsed.data.password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // 2. NEW: ENFORCE TEAMS IMMEDIATELY AFTER SEATING THE PLAYER
  enforceTeamAssignments(room);

  await saveRoom(room);
  await publishRoomUpdate(room.code);
  await publishLobbyUpdate();

  return NextResponse.json({ ok: true, code: room.code });
}
