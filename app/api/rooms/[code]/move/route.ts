import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoom, saveRoom } from "@/lib/store";
import { formsMill, hasNonMillPieces, hasLegalMoves, CICMIC_ADJACENCY } from "@/lib/cicmic-engine";
import { publishRoomUpdate } from "@/lib/pusher";

const Schema = z.discriminatedUnion("action", [
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

  if (room.game.turnIdx !== seatIdx) {
    return NextResponse.json({ error: "Not your turn." }, { status: 400 });
  }

  const board = room.game.board || {};
  const playerNum = seatIdx === 0 ? 1 : 2;
  const enemyNum = playerNum === 1 ? 2 : 1;
  const enemySeatIdx = room.seats.findIndex((_, i) => i !== seatIdx);

  let result: { ok?: boolean; error?: string } = { error: "Action failed." };

  switch (parsed.data.action) {
    case "cicmic_place": {
      const pt = parsed.data.point;
      if (board[pt] !== null && board[pt] !== undefined) {
        result = { error: "Point is already occupied!" };
        break;
      }

      board[pt] = playerNum as 1 | 2;

      if (formsMill(board, pt, playerNum as 1 | 2)) {
        room.game.pendingRemoval = true;
      } else {
        // Pass turn
        room.game.turnIdx = enemySeatIdx;
      }
      result = { ok: true };
      break;
    }

    case "cicmic_move": {
      const { from, to } = parsed.data;
      if (board[from] !== playerNum || board[to] !== null) {
        result = { error: "Invalid move selection." };
        break;
      }

      const playerPieceCount = Object.values(board).filter((v) => v === playerNum).length;
      const isFlying = playerPieceCount === 3;
      const isAdjacent = CICMIC_ADJACENCY[from]?.includes(to);

      if (!isAdjacent && !isFlying) {
        result = { error: "Movement must be to an adjacent connected point!" };
        break;
      }

      board[from] = null;
      board[to] = playerNum as 1 | 2;

      if (formsMill(board, to, playerNum as 1 | 2)) {
        room.game.pendingRemoval = true;
      } else {
        // Pass turn & check if opponent is blocked
        const enemyPieceCount = Object.values(board).filter((v) => v === enemyNum).length;
        const enemyIsFlying = enemyPieceCount === 3;

        if (!hasLegalMoves(board, enemyNum as 1 | 2, enemyIsFlying)) {
          room.game.matchOver = true;
          room.game.matchWinnerIdx = seatIdx;
        } else {
          room.game.turnIdx = enemySeatIdx;
        }
      }
      result = { ok: true };
      break;
    }

    case "cicmic_remove": {
      if (!room.game.pendingRemoval) {
        result = { error: "No pending removal active." };
        break;
      }

      const pt = parsed.data.point;
      if (board[pt] !== enemyNum) {
        result = { error: "You must click an opponent's piece!" };
        break;
      }

      const inMill = formsMill(board, pt, enemyNum as 1 | 2);
      const freePieces = hasNonMillPieces(board, enemyNum as 1 | 2);

      if (inMill && freePieces) {
        result = { error: "Cannot remove a piece from a Mill unless no other pieces are available!" };
        break;
      }

      board[pt] = null;
      room.game.pendingRemoval = false;

      // Win Condition Check (Enemy reduced to < 3 pieces)
      const enemyPiecesRemaining = Object.values(board).filter((v) => v === enemyNum).length;
      const totalPlacementsMade = Object.values(board).filter(Boolean).length;

      // Only evaluate piece count loss after placement phase finishes
      if (enemyPiecesRemaining < 3 && totalPlacementsMade >= 18) {
        room.game.matchOver = true;
        room.game.matchWinnerIdx = seatIdx;
      } else {
        room.game.turnIdx = enemySeatIdx;
      }

      result = { ok: true };
      break;
    }
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  room.game.board = board;
  await saveRoom(room);
  await publishRoomUpdate(room.code);

  return NextResponse.json({ ok: true });
}
