import { NextResponse } from "next/server";
import { getRoom, saveRoom } from "@/lib/store";
import { toClientGameState, redactRoomForClient, isSeatExpired, addSystemMessage } from "@/lib/room-logic";
import { publishRoomUpdate, publishLobbyUpdate } from "@/lib/pusher";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId") || "";

  const room = await getRoom(code.toUpperCase());
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const seatIdx = room.seats.findIndex((s) => s?.clientId === clientId);
  let changed = false;

  // Reconnect: mark this viewer's seat as connected again
  if (seatIdx !== -1 && !room.seats[seatIdx]!.connected) {
    room.seats[seatIdx]!.connected = true;
    room.seats[seatIdx]!.lastSeenAt = Date.now();
    addSystemMessage(room, `${room.seats[seatIdx]!.nickname} reconnected.`);
    changed = true;
  }

  // Forfeit check: if any OTHER active seat has been disconnected past the
  // grace window during an active game, they're eliminated (score maxed out)
  // rather than the whole match ending — the game continues with whoever's left.
  if (room.status === "playing" && seatIdx !== -1 && room.game) {
    let changedElim = false;
    room.seats.forEach((s, i) => {
      if (!s || i === seatIdx || s.eliminated) return;
      if (isSeatExpired(s)) {
        s.eliminated = true;
        s.score = Math.max(s.score, room.rules.eliminationScore);
        addSystemMessage(room, `${s.nickname} did not reconnect in time and has been eliminated.`);
        changedElim = true;
      }
    });
    if (changedElim) {
      const remaining = room.seats
        .map((s, i) => (s && !s.eliminated ? i : -1))
        .filter((i) => i !== -1);
      if (remaining.length <= 1) {
        room.status = "finished";
        room.game.matchOver = true;
        room.game.matchWinnerIdx = remaining[0];
        addSystemMessage(room, `${room.seats[remaining[0]]?.nickname} wins the match!`);
      }
      changed = true;
    }
  }

  if (changed) {
    await saveRoom(room);
    await publishRoomUpdate(room.code);
    await publishLobbyUpdate();
  }

  const gameView = seatIdx !== -1 && room.game ? toClientGameState(room, seatIdx) : null;

  return NextResponse.json({
    room: redactRoomForClient(room),
    yourSeat: seatIdx === -1 ? null : seatIdx,
    game: gameView,
  });
}
