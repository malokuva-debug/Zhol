import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoom, deleteRoom } from "@/lib/store";
import { publishRoomUpdate, publishLobbyUpdate } from "@/lib/pusher";

const Schema = z.object({ clientId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const room = await getRoom(code.toUpperCase());
  if (!room) return NextResponse.json({ ok: true }); // Already gone

  // Only allow the host to delete the room
  if (room.hostClientId !== parsed.data.clientId) {
    return NextResponse.json({ error: "Only the host can delete the room." }, { status: 403 });
  }

  // Completely remove the room from the store
  await deleteRoom(room.code);
  
  // Ping connected clients so they refetch (they will get a 404 and be prompted to leave)
  await publishRoomUpdate(room.code);
  // Ping the lobby so the room disappears from the list
  await publishLobbyUpdate();

  return NextResponse.json({ ok: true });
}
