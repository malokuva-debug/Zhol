import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoom, saveRoom } from "@/lib/store";
import { applyDraw, applyDiscard, applyGin } from "@/lib/room-logic";
import { publishRoomUpdate } from "@/lib/pusher";

const Schema = z.discriminatedUnion("action", [
  // Zhol / Card actions
  z.object({ action: z.literal("draw"), clientId: z.string(), source: z.enum(["stock", "discard"]) }),
  z.object({ action: z.literal("discard"), clientId: z.string(), cardId: z.string() }),
  z.object({ action: z.literal("gin"), clientId: z.string(), cardId: z.string() }),
  
  // Pishpirik actions
  z.object({ action: z.literal("pishpirik_play"), clientId: z.string(), cardId: z.string() }),
  
  // Cicmic (Mills) actions
  z.object({ action: z.literal("cicmic_place"), clientId: z.string(), point: z.number() }),
  z.object({ action: z.literal("cicmic_move"), clientId: z.string(), from: z.number(), to: z.number() }),
  z.object({ action: z.literal("cicmic_remove"), clientId: z.string(), point: z.number() }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);

  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const room = await getRoom(code.toUpperCase());
  if (!room || room.status !== "playing" || !room.game) {
    return NextResponse.json({ error: "Game not active." }, { status: 400 });
  }

  const seatIdx = room.seats.findIndex((s) => s?.clientId === parsed.data.clientId);
  if (seatIdx === -1) return NextResponse.json({ error: "Not in room." }, { status: 403 });

  // Only allow moves if it's the player's turn (except for potential future out-of-turn actions)
  if (room.game.turnIdx !== seatIdx) {
    return NextResponse.json({ error: "Not your turn." }, { status: 400 });
  }

  // FIX: Initialize result with a default error so it is NEVER 'undefined'
  let result: { ok?: boolean; error?: string } = { error: "Action not processed." };

  switch (parsed.data.action) {
    case "draw":
      result = applyDraw(room, seatIdx, parsed.data.source);
      break;
    case "discard":
      result = applyDiscard(room, seatIdx, parsed.data.cardId);
      break;
    case "gin":
      result = applyGin(room, seatIdx, parsed.data.cardId);
      break;
      
    case "pishpirik_play":
      // Stub for Pishpirik engine integration
      result = { ok: true };
      break;
      
    case "cicmic_place":
      if (room.rules.gameMode === "cicmic" && room.game.board) {
        const pt = parsed.data.point;
        
        // Prevent placing if point is already taken
        if (!room.game.board[pt]) {
          const playerNum = seatIdx === 0 ? 1 : 2; // Assuming Host is P1, opponent is P2
          room.game.board[pt] = playerNum;
          
          // Switch Turn to the other active player
          const activeIndices = room.seats.map((s, idx) => s && !s.eliminated ? idx : -1).filter(idx => idx !== -1);
          let nextIdx = activeIndices.findIndex(i => i === seatIdx) + 1;
          if (nextIdx >= activeIndices.length) nextIdx = 0;
          
          room.game.turnIdx = activeIndices[nextIdx];
          result = { ok: true };
        } else {
          result = { error: "Point is already taken!" };
        }
      } else {
        result = { error: "Invalid game mode for Cicmic action." };
      }
      break;
      
    case "cicmic_move":
    case "cicmic_remove":
      result = { ok: true };
      break;
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await saveRoom(room);
  await publishRoomUpdate(room.code);

  return NextResponse.json({ ok: true });
}
