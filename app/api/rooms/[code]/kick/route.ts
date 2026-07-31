import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoom, saveRoom } from "@/lib/store";
import { addSystemMessage } from "@/lib/room-logic";
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

  const targetIdx = room.seats.findIndex((s) => s?.clientId === parsed.data.targetClientId);
  
  if (targetIdx !== -1) {
    const nickname = room.seats[targetIdx]!.nickname;
    
    // 1. Physically empty the seat (Hard Kick)
    room.seats[targetIdx] = null;
    addSystemMessage(room, `${nickname} was kicked from the room.`);

    // 2. Count how many players are actually left at the table
    const remainingOccupied = room.seats.filter(Boolean);

    // 3. If a game is running and we are now down to 1 player (or 0), abort the game!
    if (room.status === "playing" && remainingOccupied.length < 2) {
      room.status = "waiting"; // Drops the host back to the lobby UI
      room.game = null;
      
      // Un-ready the host so the game doesn't instantly restart
      room.seats.forEach(s => {
        if (s) s.ready = false;
      });
      
      addSystemMessage(room, "Not enough players remain. Game aborted and returned to lobby.");
      
    } else if (room.status === "playing" && room.game) {
      // 4. If 3+ players and the game continues, check if it was the kicked player's turn.
      // If it was, pass the turn to the next clockwise active player so the game doesn't freeze.
      if (room.game.turnIdx === targetIdx) {
         const activeIndices = room.seats.map((s, i) => s && !s.eliminated ? i : -1).filter(i => i !== -1);
         if (activeIndices.length > 0) {
             let nextSeat = activeIndices.find(i => i > targetIdx);
             if (nextSeat === undefined) nextSeat = activeIndices[0];
             
             room.game.turnIdx = nextSeat;
             room.game.turnPhase = "draw";
             room.game.turnStartedAt = Date.now();
         }
      }
    }
  }

  await saveRoom(room);
  await publishRoomUpdate(room.code);
  await publishLobbyUpdate();

  return NextResponse.json({ ok: true });
}
