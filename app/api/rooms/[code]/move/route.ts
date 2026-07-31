import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoom, saveRoom } from "@/lib/store";
import { applyDraw, applyDiscard, applyGin } from "@/lib/room-logic";
import { formsMill, hasNonMillPieces, CICMIC_ADJACENCY } from "@/lib/cicmic-engine";
import { checkPishpirikCapture, scorePishpirikCards } from "@/lib/pishpirik-engine";
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

  if (room.game.turnIdx !== seatIdx) {
    return NextResponse.json({ error: "Not your turn." }, { status: 400 });
  }

  let result: { ok?: boolean; error?: string } = { error: "Action not processed." };

  switch (parsed.data.action) {
    // ----------------------------------------------------------------------
    // ZHOL ACTIONS
    // ----------------------------------------------------------------------
    case "draw":
      result = applyDraw(room, seatIdx, parsed.data.source);
      break;

    case "discard":
      result = applyDiscard(room, seatIdx, parsed.data.cardId);
      break;

    case "gin":
      result = applyGin(room, seatIdx, parsed.data.cardId);
      break;

    // ----------------------------------------------------------------------
    // PISHPIRIK ACTIONS
    // ----------------------------------------------------------------------
    case "pishpirik_play": {
      const cardId = parsed.data.cardId;
      const seat = room.seats[seatIdx];

      if (!seat || !seat.hand.includes(cardId)) {
        result = { error: "Card not in hand." };
        break;
      }

      // Remove card from player hand
      seat.hand = seat.hand.filter((c) => c !== cardId);

      const tablePile = room.game.tablePile || [];
      const { captures, isPishpirik } = checkPishpirikCapture(cardId, tablePile);

      if (!room.game.capturedBySeat) room.game.capturedBySeat = {};
      if (!room.game.pishpiriksBySeat) room.game.pishpiriksBySeat = {};

      if (captures) {
        // Collect table pile + played card
        const eaten = [...tablePile, cardId];
        room.game.capturedBySeat[seatIdx] = [...(room.game.capturedBySeat[seatIdx] || []), ...eaten];
        room.game.tablePile = [];
        room.game.lastCaptureIdx = seatIdx;

        if (isPishpirik) {
          room.game.pishpiriksBySeat[seatIdx] = (room.game.pishpiriksBySeat[seatIdx] || 0) + 1;
        }
      } else {
        // Drop card onto middle pile
        room.game.tablePile = [...tablePile, cardId];
      }

      // Check if all players ran out of their 4 dealt cards
      const activeSeats = room.seats.map((s, i) => (s && !s.eliminated ? i : -1)).filter((i) => i !== -1);
      const allHandsEmpty = activeSeats.every((i) => (room.seats[i]?.hand.length || 0) === 0);

      if (allHandsEmpty) {
        if (room.game.deck.length >= activeSeats.length * 4) {
          // Deal next batch of 4 cards to each player
          for (const i of activeSeats) {
            room.seats[i]!.hand = room.game.deck.splice(0, 4);
          }
        } else {
          // Deck empty -> Round finished. Sweep remaining table pile to last capturer
          if (room.game.tablePile.length > 0 && room.game.lastCaptureIdx !== undefined) {
            const remaining = room.game.tablePile;
            room.game.capturedBySeat[room.game.lastCaptureIdx] = [
              ...(room.game.capturedBySeat[room.game.lastCaptureIdx] || []),
              ...remaining,
            ];
            room.game.tablePile = [];
          }

          // Calculate final round scores
          for (const i of activeSeats) {
            const captured = room.game.capturedBySeat[i] || [];
            const rawPts = scorePishpirikCards(captured);
            const pishCount = room.game.pishpiriksBySeat[i] || 0;
            const totalScore = rawPts + pishCount * 10;
            room.seats[i]!.score += totalScore;
          }

          room.game.turnPhase = "round_over";
        }
      }

      // Pass turn clockwise
      let nextTurn = activeSeats.findIndex((i) => i === seatIdx) + 1;
      if (nextTurn >= activeSeats.length) nextTurn = 0;
      room.game.turnIdx = activeSeats[nextTurn];

      result = { ok: true };
      break;
    }

    // ----------------------------------------------------------------------
    // CICMIC ACTIONS
    // ----------------------------------------------------------------------
    case "cicmic_place": {
      if (room.rules.gameMode === "cicmic" && room.game.board) {
        const pt = parsed.data.point;

        if (!room.game.board[pt]) {
          const playerNum = seatIdx === 0 ? 1 : 2;
          room.game.board[pt] = playerNum;

          const madeMill = formsMill(room.game.board, pt, playerNum as 1 | 2);

          if (madeMill) {
            room.game.pendingRemoval = true;
          } else {
            const activeIndices = room.seats.map((s, idx) => (s && !s.eliminated ? idx : -1)).filter((idx) => idx !== -1);
            let nextIdx = activeIndices.findIndex((i) => i === seatIdx) + 1;
            if (nextIdx >= activeIndices.length) nextIdx = 0;
            room.game.turnIdx = activeIndices[nextIdx];
          }

          result = { ok: true };
        } else {
          result = { error: "Point is already taken!" };
        }
      } else {
        result = { error: "Invalid game mode." };
      }
      break;
    }

    case "cicmic_move": {
      if (room.rules.gameMode === "cicmic" && room.game.board) {
        const { from, to } = parsed.data;
        const playerNum = seatIdx === 0 ? 1 : 2;

        if (room.game.board[from] === playerNum && !room.game.board[to]) {
          const playerPieceCount = Object.values(room.game.board).filter((v) => v === playerNum).length;
          const isFlying = playerPieceCount === 3;
          const isAdjacent = CICMIC_ADJACENCY[from]?.includes(to);

          if (!isAdjacent && !isFlying) {
            result = { error: "You can only move to adjacent connected points!" };
            break;
          }

          room.game.board[from] = null;
          room.game.board[to] = playerNum;

          const madeMill = formsMill(room.game.board, to, playerNum as 1 | 2);

          if (madeMill) {
            room.game.pendingRemoval = true;
          } else {
            const activeIndices = room.seats.map((s, idx) => (s && !s.eliminated ? idx : -1)).filter((idx) => idx !== -1);
            let nextIdx = activeIndices.findIndex((i) => i === seatIdx) + 1;
            if (nextIdx >= activeIndices.length) nextIdx = 0;
            room.game.turnIdx = activeIndices[nextIdx];
          }

          result = { ok: true };
        } else {
          result = { error: "Invalid move!" };
        }
      }
      break;
    }

    case "cicmic_remove": {
      if (room.rules.gameMode === "cicmic" && room.game.board && room.game.pendingRemoval) {
        const pt = parsed.data.point;
        const playerNum = seatIdx === 0 ? 1 : 2;
        const enemyNum = playerNum === 1 ? 2 : 1;

        if (room.game.board[pt] === enemyNum) {
          const enemyInMill = formsMill(room.game.board, pt, enemyNum as 1 | 2);
          const enemyHasFreePieces = hasNonMillPieces(room.game.board, enemyNum as 1 | 2);

          if (enemyInMill && enemyHasFreePieces) {
            result = { error: "Cannot remove a piece from a 3-in-a-row mill unless no other pieces are available!" };
          } else {
            room.game.board[pt] = null;
            room.game.pendingRemoval = false;

            const activeIndices = room.seats.map((s, idx) => (s && !s.eliminated ? idx : -1)).filter((idx) => idx !== -1);
            let nextIdx = activeIndices.findIndex((i) => i === seatIdx) + 1;
            if (nextIdx >= activeIndices.length) nextIdx = 0;
            room.game.turnIdx = activeIndices[nextIdx];

            result = { ok: true };
          }
        } else {
          result = { error: "You must click an opponent's piece to remove!" };
        }
      }
      break;
    }
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await saveRoom(room);
  await publishRoomUpdate(room.code);

  return NextResponse.json({ ok: true });
}
