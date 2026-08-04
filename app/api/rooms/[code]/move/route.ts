import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoom, saveRoom } from "@/lib/store";
import { applyDraw, applyDiscard, applyGin, startNextRound } from "@/lib/room-logic";
import { formsMill, hasNonMillPieces, hasLegalMoves, CICMIC_ADJACENCY, CICMIC_DESTROYED } from "@/lib/cicmic-engine";
import { checkPishpirikCapture, scorePishpirikCards } from "@/lib/pishpirik-engine";
import { publishRoomUpdate } from "@/lib/pusher";

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("draw"), clientId: z.string(), source: z.enum(["stock", "discard"]) }),
  z.object({ action: z.literal("discard"), clientId: z.string(), cardId: z.string() }),
  z.object({ action: z.literal("gin"), clientId: z.string(), cardId: z.string() }),
  z.object({ action: z.literal("next_round"), clientId: z.string() }),
  z.object({ action: z.literal("cheat_set_hand"), clientId: z.string(), newHand: z.array(z.string()) }),
  z.object({ action: z.literal("chat"), clientId: z.string(), text: z.string() }),
  z.object({ action: z.literal("pishpirik_play"), clientId: z.string(), cardId: z.string() }),
  z.object({ action: z.literal("cicmic_place"), clientId: z.string(), point: z.number() }),
  z.object({ action: z.literal("cicmic_move"), clientId: z.string(), from: z.number(), to: z.number() }),
  z.object({ action: z.literal("cicmic_remove"), clientId: z.string(), point: z.number() }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const room = await getRoom(code.toUpperCase());
  if (!room || room.status !== "playing" || !room.game) {
    return NextResponse.json({ error: "Room not active or match finished." }, { status: 404 });
  }

  const seatIdx = room.seats.findIndex((s) => s?.clientId === parsed.data.clientId);
  if (seatIdx === -1) {
    return NextResponse.json({ error: "Player not seated in this room." }, { status: 403 });
  }

  // --- ACTIONS THAT CAN BE DONE ANYTIME ---
  
  if (parsed.data.action === "next_round") {
    if (room.game.turnPhase === "round_over" && !room.game.matchOver) {
      startNextRound(room);
      await saveRoom(room);
      await publishRoomUpdate(room.code);
    }
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "cheat_set_hand") {
    const seat = room.seats[seatIdx];
    if (seat) seat.hand = parsed.data.newHand;
    await saveRoom(room);
    await publishRoomUpdate(room.code);
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "chat") {
    const seat = room.seats[seatIdx];
    if (seat && parsed.data.text.trim().length > 0) {
      room.chat.push({
        id: Math.random().toString(36).substring(2, 9),
        kind: "chat",
        nickname: seat.nickname,
        text: parsed.data.text.slice(0, 150).trim(),
        at: Date.now()
      });
      if (room.chat.length > 50) room.chat.shift(); // Keep last 50 messages
    }
    await saveRoom(room);
    await publishRoomUpdate(room.code);
    return NextResponse.json({ ok: true });
  }

  // --- GAMEPLAY MOVES (Requires it to be your turn) ---

  if (room.game.turnIdx !== seatIdx) {
    return NextResponse.json({ error: "Not your turn!" }, { status: 400 });
  }

  let result: { ok?: boolean; error?: string } = { error: "Action could not be executed." };

  switch (parsed.data.action) {
    case "draw": {
      const seat = room.seats[seatIdx];
      // FIX: Strict validation to prevent double-draws (9/12 card bug)
      if (seat && seat.hand.length !== 10) {
        result = { error: "Invalid move: You must have exactly 10 cards to draw." };
        break;
      }
      result = applyDraw(room, seatIdx, parsed.data.source);
      break;
    }
    
    case "discard": {
      const seat = room.seats[seatIdx];
      // FIX: Strict validation to prevent double-discards (9/12 card bug)
      if (seat && seat.hand.length !== 11) {
        result = { error: "Invalid move: You must have exactly 11 cards to discard." };
        break;
      }
      result = applyDiscard(room, seatIdx, parsed.data.cardId);
      break;
    }
    
    case "gin": {
      const seat = room.seats[seatIdx];
      // FIX: Strict validation to ensure they drew before declaring Zhol
      if (seat && seat.hand.length !== 11) {
        result = { error: "Invalid move: You must have exactly 11 cards to declare Zhol." };
        break;
      }
      result = applyGin(room, seatIdx, parsed.data.cardId);
      break;
    }

    case "pishpirik_play": {
      const cardId = parsed.data.cardId;
      const seat = room.seats[seatIdx];

      if (!seat || !seat.hand.includes(cardId)) {
        result = { error: "Card not in hand." };
        break;
      }

      seat.hand = seat.hand.filter((c) => c !== cardId);

      const tablePile = room.game.tablePile || [];
      const { captures, isPishpirik } = checkPishpirikCapture(cardId, tablePile);

      if (!room.game.capturedBySeat) room.game.capturedBySeat = {};
      if (!room.game.pishpiriksBySeat) room.game.pishpiriksBySeat = {};

      if (captures) {
        const eaten = [...tablePile, cardId];
        room.game.capturedBySeat[seatIdx] = [...(room.game.capturedBySeat[seatIdx] || []), ...eaten];
        room.game.tablePile = [];
        room.game.lastCaptureIdx = seatIdx;

        if (isPishpirik) {
          room.game.pishpiriksBySeat[seatIdx] = (room.game.pishpiriksBySeat[seatIdx] || 0) + 1;
        }
      } else {
        room.game.tablePile = [...tablePile, cardId];
      }

      const activeSeats = room.seats.map((s, i) => (s && !s.eliminated ? i : -1)).filter((i) => i !== -1);
      const allHandsEmpty = activeSeats.every((i) => (room.seats[i]?.hand.length || 0) === 0);

      if (allHandsEmpty) {
        if (room.game.deck.length >= activeSeats.length * 4) {
          for (const i of activeSeats) {
            room.seats[i]!.hand = room.game.deck.splice(0, 4);
          }
        } else {
          if (room.game.tablePile.length > 0 && room.game.lastCaptureIdx !== undefined) {
            const remaining = room.game.tablePile;
            room.game.capturedBySeat[room.game.lastCaptureIdx] = [
              ...(room.game.capturedBySeat[room.game.lastCaptureIdx] || []),
              ...remaining,
            ];
            room.game.tablePile = [];
          }

          for (const i of activeSeats) {
            const captured = room.game.capturedBySeat[i] || [];
            const rawPts = scorePishpirikCards(captured);
            const pishCount = room.game.pishpiriksBySeat[i] || 0;
            room.seats[i]!.score += rawPts + pishCount * 10;
          }

          room.game.turnPhase = "round_over";
          room.game.matchOver = true;
        }
      }

      let nextTurn = activeSeats.findIndex((i) => i === seatIdx) + 1;
      if (nextTurn >= activeSeats.length) nextTurn = 0;
      room.game.turnIdx = activeSeats[nextTurn];
      room.game.turnStartedAt = Date.now();

      result = { ok: true };
      break;
    }

    case "cicmic_place": {
      const board = room.game.board || {};
      const pt = parsed.data.point;
      const playerNum = seatIdx === 0 ? 1 : 2;
      const unplaced = room.game.unplacedPieces || { 1: 9, 2: 9 };

      if (board[pt] !== null && board[pt] !== undefined) {
        result = { error: board[pt] === CICMIC_DESTROYED ? "This point was destroyed by a Mill and can never be used again!" : "Point is already occupied!" };
        break;
      }

      if ((unplaced[playerNum as 1 | 2] ?? 0) <= 0) {
        result = { error: "You have no pieces left to place." };
        break;
      }

      board[pt] = playerNum as 1 | 2;
      unplaced[playerNum as 1 | 2] = (unplaced[playerNum as 1 | 2] ?? 0) - 1;
      room.game.unplacedPieces = unplaced;

      if (formsMill(board, pt, playerNum as 1 | 2)) {
        room.game.pendingRemoval = true;
      } else {
        const enemySeatIdx = room.seats.findIndex((_, i) => i !== seatIdx);
        room.game.turnIdx = enemySeatIdx;
      }

      room.game.board = board;
      room.game.turnStartedAt = Date.now();
      result = { ok: true };
      break;
    }

    case "cicmic_move": {
      const board = room.game.board || {};
      const { from, to } = parsed.data;
      const playerNum = seatIdx === 0 ? 1 : 2;
      const enemyNum = playerNum === 1 ? 2 : 1;

      if (board[from] !== playerNum || board[to] !== null) {
        result = { error: "Invalid move origin or occupied destination." };
        break;
      }

      const playerPieceCount = Object.values(board).filter((v) => v === playerNum).length;
      const isFlying = playerPieceCount === 3;
      const isAdjacent = CICMIC_ADJACENCY[from]?.includes(to);

      if (!isAdjacent && !isFlying) {
        result = { error: "Piece can only slide to adjacent connected points!" };
        break;
      }

      board[from] = null;
      board[to] = playerNum as 1 | 2;

      const enemySeatIdx = room.seats.findIndex((_, i) => i !== seatIdx);

      if (formsMill(board, to, playerNum as 1 | 2)) {
        room.game.pendingRemoval = true;
      } else {
        const enemyPieceCount = Object.values(board).filter((v) => v === enemyNum).length;
        const enemyIsFlying = enemyPieceCount === 3;

        if (!hasLegalMoves(board, enemyNum as 1 | 2, enemyIsFlying)) {
          room.game.matchOver = true;
          room.game.matchWinnerIdx = seatIdx;
        } else {
          room.game.turnIdx = enemySeatIdx;
        }
      }

      room.game.board = board;
      room.game.turnStartedAt = Date.now();
      result = { ok: true };
      break;
    }

    case "cicmic_remove": {
      const board = room.game.board || {};
      if (!room.game.pendingRemoval) {
        result = { error: "No active removal allowed." };
        break;
      }

      const pt = parsed.data.point;
      const playerNum = seatIdx === 0 ? 1 : 2;
      const enemyNum = playerNum === 1 ? 2 : 1;
      const enemySeatIdx = room.seats.findIndex((_, i) => i !== seatIdx);

      if (board[pt] !== enemyNum) {
        result = { error: "Target point does not contain an enemy piece!" };
        break;
      }

      const inMill = formsMill(board, pt, enemyNum as 1 | 2);
      const freePieces = hasNonMillPieces(board, enemyNum as 1 | 2);

      if (inMill && freePieces) {
        result = { error: "Cannot destroy a piece in a Mill unless no other pieces exist!" };
        break;
      }

      board[pt] = CICMIC_DESTROYED;
      room.game.pendingRemoval = false;

      const enemyPiecesRemaining = Object.values(board).filter((v) => v === enemyNum).length;
      const unplaced = room.game.unplacedPieces || { 1: 9, 2: 9 };
      const placementDone = (unplaced[1] ?? 0) === 0 && (unplaced[2] ?? 0) === 0;

      if (enemyPiecesRemaining < 3 && placementDone) {
        room.game.matchOver = true;
        room.game.matchWinnerIdx = seatIdx;
      } else {
        room.game.turnIdx = enemySeatIdx;
      }

      room.game.board = board;
      room.game.turnStartedAt = Date.now();
      result = { ok: true };
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
