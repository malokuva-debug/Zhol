import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoom, saveRoom } from "@/lib/store";
import { applyDraw, applyDiscard, applyGin, startNextRound, addChatMessage, restartMatch, enforceTeamAssignments } from "@/lib/room-logic";
import { formsMill, hasNonMillPieces, hasLegalMoves, CICMIC_ADJACENCY, CICMIC_DESTROYED } from "@/lib/cicmic-engine";
import { checkPishpirikCapture, scorePishpirikCards } from "@/lib/pishpirik-engine";
import { publishRoomUpdate } from "@/lib/pusher";

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("draw"), clientId: z.string(), source: z.enum(["stock", "discard"]) }),
  z.object({ action: z.literal("discard"), clientId: z.string(), cardId: z.string() }),
  z.object({ action: z.literal("gin"), clientId: z.string(), cardId: z.string() }),
  z.object({ action: z.literal("next_round"), clientId: z.string() }),
  z.object({ action: z.literal("restart_match"), clientId: z.string() }),
  z.object({ action: z.literal("swap_seats"), clientId: z.string(), from: z.number(), to: z.number() }),
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
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  const seatIdx = room.seats.findIndex((s) => s?.clientId === parsed.data.clientId);
  if (seatIdx === -1) {
    return NextResponse.json({ error: "Player not seated in this room." }, { status: 403 });
  }

  if (parsed.data.action === "chat") {
    if (!room.chat) room.chat = [];
    const result = addChatMessage(room, parsed.data.clientId, parsed.data.text);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    await saveRoom(room);
    await publishRoomUpdate(room.code);
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "swap_seats") {
    if (room.status !== "waiting") return NextResponse.json({ error: "Cannot swap seats after game started." }, { status: 400 });
    const { from, to } = parsed.data;
    if (from >= 0 && from < room.maxPlayers && to >= 0 && to < room.maxPlayers) {
      const temp = room.seats[from];
      room.seats[from] = room.seats[to];
      room.seats[to] = temp;
      enforceTeamAssignments(room);
      await saveRoom(room);
      await publishRoomUpdate(room.code);
    }
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "restart_match") {
    if (room.hostClientId !== parsed.data.clientId) return NextResponse.json({ error: "Only the host can restart the match." }, { status: 403 });
    restartMatch(room);
    await saveRoom(room);
    await publishRoomUpdate(room.code);
    return NextResponse.json({ ok: true });
  }

  if (!room.game || room.status === "waiting") {
    return NextResponse.json({ error: "Match not active." }, { status: 400 });
  }

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

  if (room.game.turnIdx !== seatIdx) {
    return NextResponse.json({ error: "Not your turn!" }, { status: 400 });
  }

  let result: { ok?: boolean; error?: string } = { error: "Action could not be executed." };

  switch (parsed.data.action) {
    case "draw": {
      const seat = room.seats[seatIdx];
      if (seat && seat.hand.length !== 10) { result = { error: "Invalid move: You must have exactly 10 cards to draw." }; break; }
      result = applyDraw(room, seatIdx, parsed.data.source);
      break;
    }
    
    case "discard": {
      const seat = room.seats[seatIdx];
      if (seat && seat.hand.length !== 11) { result = { error: "Invalid move: You must have exactly 11 cards to discard." }; break; }
      result = applyDiscard(room, seatIdx, parsed.data.cardId);
      break;
    }
    
    case "gin": {
      const seat = room.seats[seatIdx];
      if (seat && seat.hand.length !== 11) { result = { error: "Invalid move: You must have exactly 11 cards to declare Zhol." }; break; }
      result = applyGin(room, seatIdx, parsed.data.cardId);
      break;
    }

    // Inside app/api/rooms/[code]/move/route.ts under case "pishpirik_play":

    case "pishpirik_play": {
      enforceTeamAssignments(room);
      const cardId = parsed.data.cardId;
      const seat = room.seats[seatIdx];

      if (!seat || !seat.hand.includes(cardId)) { result = { error: "Card not in hand." }; break; }

      seat.hand = seat.hand.filter((c) => c !== cardId);

      const tablePile = room.game.tablePile || [];
      const activeSeats = room.seats.map((s, i) => (s && !s.eliminated ? i : -1)).filter((i) => i !== -1);
      
      const { captures } = checkPishpirikCapture(cardId, tablePile);

      // STRICT PISHPIRIK RULES: Must be exactly 1 card, and ranks MUST match exactly.
      // Wildcard Jacks sweeping a non-Jack do NOT count as a Pishpirik!
      let isPishpirik = false;
      let isJackPishpirik = false;
      
      if (captures && tablePile.length === 1) {
        const playedRank = cardId.split("_")[0].slice(0, -1);
        const tableRank = tablePile[0].split("_")[0].slice(0, -1);
        
        if (playedRank === tableRank) {
          isPishpirik = true;
          if (playedRank === "J") isJackPishpirik = true;
        }
      }

      const is2v2 = room.rules.gameMode === "pishpirik" && room.maxPlayers === 4;
      const myTeam = room.seats[seatIdx]?.team ?? (seatIdx % 2 === 0 ? 1 : 2);

      if (!room.game.capturedBySeat) room.game.capturedBySeat = {};
      if (!room.game.pishpiriksBySeat) room.game.pishpiriksBySeat = {};
      if (!room.game.pishpirikCardsBySeat) room.game.pishpirikCardsBySeat = {};

      const teamGraveyardKey = is2v2 ? (myTeam === 1 ? 0 : 1) : seatIdx;

      if (captures) {
        const eaten = [...tablePile, cardId];
        room.game.capturedBySeat[teamGraveyardKey] = [
          ...(room.game.capturedBySeat[teamGraveyardKey] || []),
          ...eaten
        ];
        room.game.tablePile = [];
        room.game.lastCaptureIdx = seatIdx;

        if (isPishpirik) {
          const pishPts = isJackPishpirik ? 20 : 10;
          const pishMap = room.game.pishpiriksBySeat;
          const enemyKey = is2v2 ? (myTeam === 1 ? 1 : 0) : activeSeats.find(i => i !== seatIdx && (pishMap[i] || 0) > 0);

          // Save the exact card to show under the graveyard!
          room.game.pishpirikCardsBySeat[teamGraveyardKey] = [
            ...(room.game.pishpirikCardsBySeat[teamGraveyardKey] || []),
            cardId
          ];
          room.game.recentPishpirik = { cardId, at: Date.now() };

          if (enemyKey !== undefined && (pishMap[enemyKey] || 0) > 0) {
            const enemyCurrent = pishMap[enemyKey];
            if (enemyCurrent > pishPts) {
              pishMap[enemyKey] -= pishPts;
            } else if (enemyCurrent < pishPts) {
              pishMap[enemyKey] = 0;
              pishMap[teamGraveyardKey] = (pishMap[teamGraveyardKey] || 0) + (pishPts - enemyCurrent);
            } else {
              pishMap[enemyKey] = 0;
            }
          } else {
            pishMap[teamGraveyardKey] = (pishMap[teamGraveyardKey] || 0) + pishPts;
          }
        }
      } else {
        room.game.tablePile = [...tablePile, cardId];
      }

      const allHandsEmpty = activeSeats.every((i) => (room.seats[i]?.hand.length || 0) === 0);

      if (allHandsEmpty) {
        if (room.game.deck.length >= activeSeats.length * 4) {
          for (const i of activeSeats) {
            room.seats[i]!.hand = room.game.deck.splice(0, 4);
          }
        } else {
          // SWEEP TABLE: Remaining cards go to the last person/team to capture
          if (room.game.tablePile.length > 0 && room.game.lastCaptureIdx !== undefined) {
            const lastTeam = room.seats[room.game.lastCaptureIdx]?.team ?? (room.game.lastCaptureIdx % 2 === 0 ? 1 : 2);
            const sweepKey = is2v2 ? (lastTeam === 1 ? 0 : 1) : room.game.lastCaptureIdx;
            room.game.capturedBySeat[sweepKey] = [
              ...(room.game.capturedBySeat[sweepKey] || []),
              ...room.game.tablePile,
            ];
            room.game.tablePile = [];
          }

          // MOST CARDS BONUS & SCORING
          if (is2v2) {
            const team1Captured = room.game.capturedBySeat[0] || [];
            const team2Captured = room.game.capturedBySeat[1] || [];

            let team1Pts = scorePishpirikCards(team1Captured) + (room.game.pishpiriksBySeat[0] || 0);
            let team2Pts = scorePishpirikCards(team2Captured) + (room.game.pishpiriksBySeat[1] || 0);

            // +3 Bonus for most cards!
            if (team1Captured.length > team2Captured.length) team1Pts += 3;
            else if (team2Captured.length > team1Captured.length) team2Pts += 3;

            room.seats.forEach((s, idx) => {
              if (s) s.score += (s.team === 1 ? team1Pts : team2Pts);
            });

            const pointsBySeat = room.seats.map((s, idx) => ({
              seatIdx: idx,
              deadwood: s ? (s.team === 1 ? team1Pts : team2Pts) : 0,
              deadCards: s ? (s.team === 1 ? team1Captured : team2Captured) : [],
              pishpirikCards: s ? (s.team === 1 ? (room.game?.pishpirikCardsBySeat?.[0] || []) : (room.game?.pishpirikCardsBySeat?.[1] || [])) : [],
              melds: [],
              eliminated: false,
              team: s?.team
            }));

            room.game.turnPhase = "round_over";
            room.game.lastRoundEnd = { type: "PISHPIRIK", winnerIdx: team1Pts >= team2Pts ? 0 : 1, winnerBonus: 0, pointsBySeat };
          } else {
             // Free for all Pishpirik Logic
             let maxCards = 0;
             let maxSeat = -1;
             activeSeats.forEach(i => {
                const count = (room.game.capturedBySeat[i] || []).length;
                if (count > maxCards) { maxCards = count; maxSeat = i; }
                else if (count === maxCards) { maxSeat = -1; }
             });

             const pointsBySeat = room.seats.map((s, idx) => {
                if (!activeSeats.includes(idx)) return { seatIdx: idx, deadwood: 0, deadCards: [], pishpirikCards: [], melds: [], eliminated: true, team: undefined };
                
                const captured = room.game.capturedBySeat[idx] || [];
                let pts = scorePishpirikCards(captured) + (room.game.pishpiriksBySeat[idx] || 0);
                if (idx === maxSeat) pts += 3;
                if (s) s.score += pts;

                return {
                   seatIdx: idx,
                   deadwood: pts,
                   deadCards: captured,
                   pishpirikCards: room.game.pishpirikCardsBySeat[idx] || [],
                   melds: [],
                   eliminated: false,
                   team: s?.team
                };
             });

             let highestScore = -1;
             let winnerIdx = seatIdx;
             activeSeats.forEach(i => {
                if (room.seats[i]!.score > highestScore) { highestScore = room.seats[i]!.score; winnerIdx = i; }
             });

             room.game.turnPhase = "round_over";
             room.game.lastRoundEnd = { type: "PISHPIRIK", winnerIdx, winnerBonus: 0, pointsBySeat };
          }
        }
      }

      let nextTurn = activeSeats.findIndex((i) => i === seatIdx) + 1;
      if (nextTurn >= activeSeats.length) nextTurn = 0;
      room.game.turnIdx = activeSeats[nextTurn];
      room.game.turnStartedAt = Date.now();
      result = { ok: true };
      break;
    }

    case "cicmic_place": { /* omitted for brevity, keeping original logic below */
      const board = room.game.board || {};
      const pt = parsed.data.point;
      const playerNum = seatIdx === 0 ? 1 : 2;
      const unplaced = room.game.unplacedPieces || { 1: 9, 2: 9 };
      if (board[pt] !== null && board[pt] !== undefined) { result = { error: board[pt] === CICMIC_DESTROYED ? "Destroyed by Mill" : "Occupied" }; break; }
      if ((unplaced[playerNum as 1 | 2] ?? 0) <= 0) { result = { error: "No pieces left." }; break; }
      board[pt] = playerNum as 1 | 2;
      unplaced[playerNum as 1 | 2] = (unplaced[playerNum as 1 | 2] ?? 0) - 1;
      room.game.unplacedPieces = unplaced;
      if (formsMill(board, pt, playerNum as 1 | 2)) room.game.pendingRemoval = true;
      else room.game.turnIdx = room.seats.findIndex((_, i) => i !== seatIdx);
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
      if (board[from] !== playerNum || board[to] !== null) { result = { error: "Invalid move." }; break; }
      const isFlying = Object.values(board).filter((v) => v === playerNum).length === 3;
      if (!CICMIC_ADJACENCY[from]?.includes(to) && !isFlying) { result = { error: "Must slide to adjacent." }; break; }
      board[from] = null;
      board[to] = playerNum as 1 | 2;
      if (formsMill(board, to, playerNum as 1 | 2)) room.game.pendingRemoval = true;
      else {
        if (!hasLegalMoves(board, enemyNum as 1 | 2, Object.values(board).filter((v) => v === enemyNum).length === 3)) {
          room.game.matchOver = true; room.game.matchWinnerIdx = seatIdx;
        } else room.game.turnIdx = room.seats.findIndex((_, i) => i !== seatIdx);
      }
      room.game.board = board;
      room.game.turnStartedAt = Date.now();
      result = { ok: true };
      break;
    }
    case "cicmic_remove": {
      const board = room.game.board || {};
      if (!room.game.pendingRemoval) { result = { error: "No active removal." }; break; }
      const pt = parsed.data.point;
      const enemyNum = seatIdx === 0 ? 2 : 1;
      if (board[pt] !== enemyNum) { result = { error: "Target is not enemy." }; break; }
      if (formsMill(board, pt, enemyNum as 1 | 2) && hasNonMillPieces(board, enemyNum as 1 | 2)) { result = { error: "Cannot destroy Mill." }; break; }
      board[pt] = CICMIC_DESTROYED;
      room.game.pendingRemoval = false;
      const unplaced = room.game.unplacedPieces || { 1: 9, 2: 9 };
      if (Object.values(board).filter((v) => v === enemyNum).length < 3 && (unplaced[1] ?? 0) === 0 && (unplaced[2] ?? 0) === 0) {
        room.game.matchOver = true; room.game.matchWinnerIdx = seatIdx;
      } else room.game.turnIdx = room.seats.findIndex((_, i) => i !== seatIdx);
      room.game.board = board;
      room.game.turnStartedAt = Date.now();
      result = { ok: true };
      break;
    }
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  await saveRoom(room);
  await publishRoomUpdate(room.code);
  return NextResponse.json({ ok: true });
}
