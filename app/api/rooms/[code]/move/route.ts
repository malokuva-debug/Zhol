import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoom, saveRoom } from "@/lib/store";
import { applyDraw, applyDiscard, applyGin } from "@/lib/room-logic";
import { publishRoomUpdate, publishLobbyUpdate } from "@/lib/pusher";
import { recordMatchHistory } from "@/lib/history";

const Schema = z.discriminatedUnion("action", [
  // Zhol / Card actions
  z.object({ action: z.literal("draw"), clientId: z.string(), source: z.enum(["stock", "discard"]) }),
  z.object({ action: z.literal("discard"), clientId: z.string(), cardId: z.string() }),
  z.object({ action: z.literal("gin"), clientId: z.string(), cardId: z.string() }),
  // Cicmic (Mills) actions
  z.object({ action: z.literal("cicmic_place"), clientId: z.string(), point: z.number() }),
  z.object({ action: z.literal("cicmic_move"), clientId: z.string(), from: z.number(), to: z.number() }),
  z.object({ action: z.literal("cicmic_remove"), clientId: z.string(), point: z.number() }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid move." }, { status: 400 });

  const room = await getRoom(code.toUpperCase());
  if (!room || !room.game) return NextResponse.json({ error: "Room or game not found." }, { status: 404 });

  const seatIdx = room.seats.findIndex((s) => s?.clientId === parsed.data.clientId);
  if (seatIdx === -1) return NextResponse.json({ error: "You're not seated in this room." }, { status: 403 });

  let result;
  switch (parsed.data.action) {
    case "draw":
      result = applyDraw(room, seatIdx, parsed.data.source);
      break;
    case "discard":
      result = applyDiscard(room, seatIdx, parsed.data.cardId);
      break;
    case "gin":
      case "gin":
      result = applyGin(room, seatIdx, parsed.data.cardId);
      break;
    // --- ADD CICMIC BRANCH ---
    case "cicmic_place":
    case "cicmic_move":
    case "cicmic_remove":
      // We will route these to your cicmic-logic engine here
      // result = applyCicmicAction(room, seatIdx, parsed.data);
      result = { ok: true }; 
      break;
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  await saveRoom(room);
  await publishRoomUpdate(room.code);
  if (room.status === "finished") {
    await publishLobbyUpdate();
    recordMatchHistory(room, room.createdAt).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
