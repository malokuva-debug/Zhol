import { NextResponse } from "next/server";
import { z } from "zod";
import { newRoom } from "@/lib/room-logic";
import { saveRoom } from "@/lib/store";
import { publishLobbyUpdate } from "@/lib/pusher";

const CreateRoomSchema = z.object({
  name: z.string().min(1).max(40),
  gameMode: z.enum(["zhol", "pishpirik", "cicmic"]), // <-- Added this
  visibility: z.enum(["public", "private"]),
  password: z.string().max(40).optional(),
  maxPlayers: z.number().min(2).max(6),
  eliminationScore: z.number().min(21).max(500).optional(),
  hostNickname: z.string().min(1).max(20),
  hostClientId: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = CreateRoomSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid room settings." }, { status: 400 });
  }

  const d = parsed.data;
  
  const room = newRoom({
    name: d.name,
    visibility: d.visibility,
    password: d.password,
    maxPlayers: d.maxPlayers,
    hostNickname: d.hostNickname,
    hostClientId: d.hostClientId,
    rules: {
      gameMode: d.gameMode, // <-- Save the selected game mode
      turnTimerSeconds: 0, // no game mode uses a turn timer
      eliminationScore: d.gameMode === "zhol" ? (d.eliminationScore ?? 101) : 0,
    },
  });

  await saveRoom(room);
  await publishLobbyUpdate();

  return NextResponse.json({ code: room.code });
}
